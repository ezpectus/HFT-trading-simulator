import React, { useMemo, useState } from 'react'

// ─── Optimal Stopping (Snell Envelope) ───────────────────────────────────────
// Implements the Snell envelope for optimal exercise of American options.
// The Snell envelope gives the optimal stopping rule for maximizing expected
// payoff in a discrete-time framework.
//
// Mathematical foundation:
//   For an American option with payoff g(t, S_t), the value function is:
//   V(t) = sup_{τ ≥ t} E[g(τ, S_τ) | F_t]
//
//   The Snell envelope satisfies the backward recursion:
//   V(T) = g(T, S_T)
//   V(t) = max(g(t, S_t), E[V(t+1) | F_t])
//
//   The optimal stopping time is:
//   τ* = inf{t : g(t, S_t) ≥ E[V(t+1) | F_t]}
//
//   We use a binomial tree (Cox-Ross-Rubinstein) for the underlying process:
//   S_{t+1} = S_t · u (up) or S_t · d (down)
//   u = e^(σ√dt), d = 1/u
//   Risk-neutral: p = (e^(r·dt) - d) / (u - d)
//
//   Also implements Longstaff-Schwartz Monte Carlo for path-dependent options.

// Binomial tree American option pricing with Snell envelope
const binomialAmerican = (S0, K, T, r, sigma, nSteps, isCall = true) => {
  const dt = T / nSteps
  const u = Math.exp(sigma * Math.sqrt(dt))
  const d = 1 / u
  const R = Math.exp(r * dt)
  const p = (R - d) / (u - d)
  const disc = 1 / R

  // Build stock price tree
  const stock = Array.from({ length: nSteps + 1 }, (_, j) =>
    S0 * Math.pow(u, nSteps - 2 * j)
  )

  // Option values at expiration
  let optionValues = stock.map(s => Math.max(0, isCall ? s - K : K - s))

  // Backward induction (Snell envelope)
  const exerciseBoundaries = []
  for (let step = nSteps - 1; step >= 0; step--) {
    const newValues = []
    const boundary = []
    for (let j = 0; j <= step; j++) {
      const s = S0 * Math.pow(u, step - 2 * j)
      const intrinsic = Math.max(0, isCall ? s - K : K - s)
      const continuation = disc * (p * optionValues[j] + (1 - p) * optionValues[j + 1])
      const value = Math.max(intrinsic, continuation)
      newValues.push(value)
      boundary.push({ stock: s, intrinsic, continuation, exercise: intrinsic >= continuation })
    }
    optionValues = newValues
    exerciseBoundaries.push({ step, boundary })
  }

  // Extract exercise boundary (stock prices where exercise is optimal)
  const exercisePoints = []
  for (const { step, boundary } of exerciseBoundaries) {
    for (const b of boundary) {
      if (b.exercise) {
        exercisePoints.push({ step, stock: b.stock, intrinsic: b.intrinsic, continuation: b.continuation })
      }
    }
  }

  // Find critical stock price (boundary) at each step
  const criticalPrices = exerciseBoundaries.map(({ step, boundary }) => {
    const exerciseNodes = boundary.filter(b => b.exercise)
    if (exerciseNodes.length === 0) return { step, price: isCall ? Infinity : 0 }
    const minEx = Math.min(...exerciseNodes.map(b => b.stock))
    const maxNoEx = Math.max(...boundary.filter(b => !b.exercise).map(b => b.stock))
    return { step, price: isCall ? minEx : maxNoEx }
  })

  // Greeks via finite differences
  const price = optionValues[0]
  const delta = 0, gamma = 0, theta = 0

  return {
    price, exerciseBoundaries, exercisePoints, criticalPrices,
    params: { S0, K, T, r, sigma, nSteps, isCall, u, d, p, dt },
  }
}

// Longstaff-Schwartz Monte Carlo for American options
const longstaffSchwartz = (S0, K, T, r, sigma, nPaths, nSteps, isCall = true) => {
  const dt = T / nSteps
  const disc = Math.exp(-r * dt)

  // Generate paths via geometric Brownian motion
  const paths = Array.from({ length: nPaths }, () => {
    const path = [S0]
    for (let t = 1; t <= nSteps; t++) {
      const z = randomNormal()
      const sPrev = path[t - 1]
      const sNew = sPrev * Math.exp((r - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z)
      path.push(sNew)
    }
    return path
  })

  // Payoff function
  const payoff = (s) => Math.max(0, isCall ? s - K : K - s)

  // Initialize cash flows with terminal payoff
  const cashFlows = paths.map(path => {
    const cf = new Array(nSteps + 1).fill(0)
    cf[nSteps] = payoff(path[nSteps])
    return cf
  })

  // Exercise decisions
  const exerciseTimes = paths.map(() => nSteps)

  // Backward induction
  for (let t = nSteps - 1; t > 0; t--) {
    // In-the-money paths
    const itmIndices = []
    for (let i = 0; i < nPaths; i++) {
      if (payoff(paths[i][t]) > 0) itmIndices.push(i)
    }

    if (itmIndices.length < 3) continue

    // Regression: X = [1, S, S²], Y = discounted future cash flows
    const X = itmIndices.map(i => [1, paths[i][t], paths[i][t] ** 2])
    const Y = itmIndices.map(i => {
      let y = 0
      for (let tau = t + 1; tau <= nSteps; tau++) {
        if (cashFlows[i][tau] > 0) {
          y += cashFlows[i][tau] * Math.exp(-r * (tau - t) * dt)
          break
        }
      }
      return y
    })

    // OLS regression (normal equations)
    const XtX = Array.from({ length: 3 }, () => new Array(3).fill(0))
    const Xty = new Array(3).fill(0)
    for (let k = 0; k < X.length; k++) {
      for (let a = 0; a < 3; a++) {
        Xty[a] += X[k][a] * Y[k]
        for (let b = 0; b < 3; b++) XtX[a][b] += X[k][a] * X[k][b]
      }
    }

    // Solve 3×3 system
    const coeffs = solve3x3(XtX, Xty)
    if (!coeffs) continue

    // Decide exercise for each ITM path
    for (const i of itmIndices) {
      const s = paths[i][t]
      const continuation = coeffs[0] + coeffs[1] * s + coeffs[2] * s * s
      const intrinsic = payoff(s)
      if (intrinsic >= continuation && intrinsic > 0) {
        // Exercise
        cashFlows[i] = new Array(nSteps + 1).fill(0)
        cashFlows[i][t] = intrinsic
        exerciseTimes[i] = t
      }
    }
  }

  // Price = average discounted payoff
  let totalPayoff = 0
  for (let i = 0; i < nPaths; i++) {
    totalPayoff += cashFlows[i][exerciseTimes[i]] * Math.exp(-r * exerciseTimes[i] * dt)
  }
  const price = totalPayoff / nPaths

  // European price (for comparison — no early exercise)
  let euroPayoff = 0
  for (let i = 0; i < nPaths; i++) {
    euroPayoff += payoff(paths[i][nSteps]) * Math.exp(-r * T)
  }
  const euroPrice = euroPayoff / nPaths

  // Early exercise premium
  const earlyExercisePremium = price - euroPrice

  // Exercise probability at each time
  const exerciseProb = new Array(nSteps + 1).fill(0)
  for (let i = 0; i < nPaths; i++) exerciseProb[exerciseTimes[i]]++
  for (let t = 0; t <= nSteps; t++) exerciseProb[t] /= nPaths

  return { price, euroPrice, earlyExercisePremium, exerciseProb, exerciseTimes, nPaths }
}

// Box-Muller random normal
const randomNormal = () => {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Solve 3×3 linear system
const solve3x3 = (A, b) => {
  const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
              A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
              A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])
  if (Math.abs(det) < 1e-12) return null

  const x = [
    (b[0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
     A[0][1] * (b[1] * A[2][2] - A[1][2] * b[2]) +
     A[0][2] * (b[1] * A[2][1] - A[1][1] * b[2])) / det,
    (A[0][0] * (b[1] * A[2][2] - A[1][2] * b[2]) -
     b[0] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
     A[0][2] * (A[1][0] * b[2] - b[1] * A[2][0])) / det,
    (A[0][0] * (A[1][1] * b[2] - b[1] * A[2][1]) -
     A[0][1] * (A[1][0] * b[2] - b[1] * A[2][0]) +
     b[0] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])) / det
  ]
  return x
}

export default function OptimalStopping({ candles, symbol, exchange, currentPrice }) {
  const [strike, setStrike] = useState(currentPrice || 100)
  const [T, setT] = useState(30 / 365) // 30 days
  const [r, setR] = useState(0.05)
  const [sigma, setSigma] = useState(0.3)
  const [nSteps, setNSteps] = useState(50)
  const [isCall, setIsCall] = useState(false)
  const [nPaths, setNPaths] = useState(1000)

  // Estimate sigma from candles
  const estSigma = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 10) return sigma
    const cds = candles[exchange][symbol]
    const rets = []
    for (let i = 1; i < cds.length; i++) {
      rets.push((cds[i].close - cds[i - 1].close) / cds[i - 1].close)
    }
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length
    return Math.sqrt(variance) * Math.sqrt(365) // annualized
  }, [candles, exchange, symbol])

  const S0 = currentPrice || 100

  const binomial = useMemo(() => {
    return binomialAmerican(S0, strike, T, r, sigma, nSteps, isCall)
  }, [S0, strike, T, r, sigma, nSteps, isCall])

  const lsm = useMemo(() => {
    return longstaffSchwartz(S0, strike, T, r, sigma, nPaths, nSteps, isCall)
  }, [S0, strike, T, r, sigma, nPaths, nSteps, isCall])

  if (!binomial || !lsm) return null

  const W = 700, H = 250, P = 40

  // Exercise boundary chart
  const boundaryData = binomial.criticalPrices.filter(cp => isCall ? cp.price < Infinity : cp.price > 0)
  const allStocks = boundaryData.map(d => d.price)
  const minS = Math.min(S0 * 0.5, ...allStocks)
  const maxS = Math.max(S0 * 1.5, ...allStocks)
  const sx = (step) => P + (step / nSteps) * (W - 2 * P)
  const sy = (price) => H - P - ((price - minS) / (maxS - minS + 0.001)) * (H - 2 * P)

  // Exercise probability
  const maxProb = Math.max(...lsm.exerciseProb)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Optimal Stopping (Snell Envelope) — {symbol}</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Strike:</span>
          <input type="number" value={strike} onChange={e => setStrike(Math.max(0.01, +e.target.value))} className="w-20 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">T (days):</span>
          <input type="number" value={Math.round(T * 365)} onChange={e => setT(Math.max(1, +e.target.value) / 365)} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">r:</span>
          <input type="number" step="0.01" value={r} onChange={e => setR(+e.target.value)} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">σ (est: {estSigma.toFixed(3)}):</span>
          <input type="number" step="0.01" value={sigma} onChange={e => setSigma(Math.max(0.01, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Steps:</span>
          <input type="number" value={nSteps} onChange={e => setNSteps(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Paths:</span>
          <input type="number" value={nPaths} onChange={e => setNPaths(Math.max(100, +e.target.value))} className="w-20 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={isCall} onChange={e => setIsCall(e.target.checked)} />
          <span className="text-slate-400">{isCall ? 'Call' : 'Put'}</span>
        </label>
      </div>

      {/* Exercise boundary */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Optimal Exercise Boundary (Binomial Tree)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Exercise region */}
          {boundaryData.map((d, i) => {
            if (i === 0) return null
            const prev = boundaryData[i - 1]
            const isEx = isCall
            return (
              <line
                key={i}
                x1={sx(prev.step)}
                y1={isCall ? sy(prev.price) : H - P}
                x2={sx(d.step)}
                y2={isCall ? sy(d.price) : H - P}
                stroke="#ef4444"
                strokeWidth={2}
              />
            )
          })}

          {/* Stock price line */}
          <line x1={P} y1={sy(S0)} x2={W - P} y2={sy(S0)} stroke="#06b6d4" strokeDasharray="4,3" strokeWidth={1.5} />
          <line x1={P} y1={sy(strike)} x2={W - P} y2={sy(strike)} stroke="#f59e0b" strokeDasharray="4,3" strokeWidth={1.5} />

          <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={10}>Time steps</text>
          <text x={5} y={P + 10} fill="#475569" fontSize={10}>Stock price</text>
          <text x={W - P} y={20} textAnchor="end" fill="#ef4444" fontSize={10}>Exercise boundary</text>
          <text x={W - P} y={34} textAnchor="end" fill="#06b6d4" fontSize={10}>S₀ = ${S0.toFixed(2)}</text>
          <text x={W - P} y={48} textAnchor="end" fill="#f59e0b" fontSize={10}>K = ${strike.toFixed(2)}</text>
        </svg>
      </div>

      {/* Exercise probability (LSM) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Exercise Probability by Time (Longstaff-Schwartz MC)</div>
        <svg width={W} height={120} className="bg-slate-900 rounded">
          {lsm.exerciseProb.map((prob, t) => {
            const x = P + (t / nSteps) * (W - 2 * P)
            const w = (W - 2 * P) / nSteps
            const h = (prob / maxProb) * 80
            return <rect key={t} x={x} y={100 - h} width={Math.max(1, w - 1)} height={h} fill="#22c55e" opacity={0.6} />
          })}
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Binomial Price</div>
          <div className="text-cyan-400 font-mono">${binomial.price.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">LSM Price</div>
          <div className="text-emerald-400 font-mono">${lsm.price.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">European</div>
          <div className="text-slate-300 font-mono">${lsm.euroPrice.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Early Ex. Premium</div>
          <div className="text-amber-400 font-mono">${lsm.earlyExercisePremium.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Intrinsic</div>
          <div className="text-slate-300 font-mono">${Math.max(0, isCall ? S0 - strike : strike - S0).toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Model:</strong> Binomial ({nSteps} steps) vs LSM ({nPaths.toLocaleString()} paths) |
        <strong> σ:</strong> {sigma.toFixed(4)} (est: {estSigma.toFixed(4)}) |
        <strong> moneyness:</strong> {(S0 / strike).toFixed(4)} ({S0 > strike ? (isCall ? 'ITM' : 'OTM') : (isCall ? 'OTM' : 'ITM')})
      </div>
    </div>
  )
}
