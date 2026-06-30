import React, { useMemo, useState } from 'react'

// ─── Itô Calculus Generator (Infinitesimal Generator of Diffusions) ─────────
// Computes the infinitesimal generator A of an Itô diffusion, which
// characterizes the expected rate of change of functions of the process.
//
// Mathematical foundation:
//   Itô diffusion: dX_t = μ(X_t)dt + σ(X_t)dW_t
//   Generator: A·f = μ(x)·f'(x) + (1/2)·σ²(x)·f''(x)
//
//   Dynkin's formula: E[f(X_τ)] = f(x) + E[∫₀ᵀ A·f(X_s) ds]
//
//   Feynman-Kac: u(x,t) = E[exp(-∫r ds)·g(X_T)]
//   solves ∂u/∂t = A·u - r·u with u(x,T) = g(x)
//
//   Applications: option pricing via PDE, expected hitting times,
//   stationary distribution analysis, sensitivity to model parameters

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Generator applied to f: A·f(x) = μ(x)f'(x) + (1/2)σ²(x)f''(x)
const applyGenerator = (x, mu, sigma, f, fPrime, fDoublePrime) => {
  return mu(x) * fPrime(x) + 0.5 * sigma(x) ** 2 * fDoublePrime(x)
}

// Numerical derivatives
const numPrime = (f, x, h = 1e-5) => (f(x + h) - f(x - h)) / (2 * h)
const numDoublePrime = (f, x, h = 1e-4) => (f(x + h) - 2 * f(x) + f(x - h)) / (h * h)

// Expected hitting time via generator (solving A·T = -1)
const expectedHittingTime = (xGrid, mu, sigma, targetIdx) => {
  const n = xGrid.length
  const dx = xGrid[1] - xGrid[0]
  // Discretize A·T = -1 with T(target) = 0
  // μ(x)·T'(x) + (1/2)σ²(x)·T''(x) = -1
  // Finite differences:
  // μ·(T_{i+1}-T_{i-1})/(2dx) + (1/2)σ²·(T_{i+1}-2T_i+T_{i-1})/dx² = -1

  const T = new Array(n).fill(0)
  const dt = 0.001
  for (let iter = 0; iter < 5000; iter++) {
    const newT = T.slice()
    for (let i = 1; i < n - 1; i++) {
      if (i === targetIdx) { newT[i] = 0; continue }
      const x = xGrid[i]
      const m = mu(x), s2 = sigma(x) ** 2
      const drift = m * (T[i + 1] - T[i - 1]) / (2 * dx)
      const diff = 0.5 * s2 * (T[i + 1] - 2 * T[i] + T[i - 1]) / (dx * dx)
      newT[i] = T[i] + dt * (-1 - drift - diff)
      newT[i] = Math.max(0, newT[i])
    }
    newT[0] = newT[1]
    newT[n - 1] = newT[n - 2]
    T.splice(0, T.length, ...newT)
  }
  return T
}

export default function ItoCalculusGenerator({ candles, symbol, exchange }) {
  const [modelType, setModelType] = useState('ou')
  const [lookback, setLookback] = useState(100)
  const [funcType, setFuncType] = useState('identity')

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Estimate parameters
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length
    const varR = returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length
    const stdR = Math.sqrt(varR)

    // ACF(1) for OU kappa
    let acf1 = 0
    for (let i = 0; i < returns.length - 1; i++) {
      acf1 += (returns[i] - meanR) * (returns[i + 1] - meanR)
    }
    acf1 /= (returns.length - 1) * varR
    const kappa = acf1 < 1 && acf1 > 0 ? -Math.log(acf1) : 1.0
    const theta = meanR
    const sigmaOU = stdR * Math.sqrt(2 * Math.max(0.01, kappa))

    // Model functions
    let mu, sigma
    if (modelType === 'ou') {
      mu = (x) => kappa * (theta - x)
      sigma = () => sigmaOU
    } else if (modelType === 'gbm') {
      mu = (x) => meanR * x
      sigma = (x) => stdR * Math.abs(x)
    } else {
      mu = () => meanR
      sigma = () => stdR
    }

    // Test functions
    const testFunctions = {
      identity: { f: (x) => x, fPrime: (x) => 1, fDoublePrime: () => 0, name: 'f(x) = x' },
      square: { f: (x) => x * x, fPrime: (x) => 2 * x, fDoublePrime: () => 2, name: 'f(x) = x\u00B2' },
      exp: { f: (x) => Math.exp(x), fPrime: (x) => Math.exp(x), fDoublePrime: (x) => Math.exp(x), name: 'f(x) = e\u02E3' },
      log: { f: (x) => Math.log(Math.abs(x) + 0.01), fPrime: (x) => 1 / (x + 0.01), fDoublePrime: (x) => -1 / ((x + 0.01) ** 2), name: 'f(x) = ln|x|' },
      cosh: { f: (x) => Math.cosh(x), fPrime: (x) => Math.sinh(x), fDoublePrime: (x) => Math.cosh(x), name: 'f(x) = cosh(x)' },
    }
    const tf = testFunctions[funcType]

    // Grid
    const xMin = meanR - 4 * stdR
    const xMax = meanR + 4 * stdR
    const nGrid = 60
    const dx = (xMax - xMin) / (nGrid - 1)
    const xGrid = Array.from({ length: nGrid }, (_, i) => xMin + i * dx)

    // Compute A·f on grid
    const Af = xGrid.map(x => applyGenerator(x, mu, sigma, tf.f, tf.fPrime, tf.fDoublePrime))
    const fValues = xGrid.map(tf.f)

    // Dynkin's formula verification: E[f(X_t)] ≈ f(x) + A·f(x)·t
    const currentX = returns[returns.length - 1]
    const afCurrent = applyGenerator(currentX, mu, sigma, tf.f, tf.fPrime, tf.fDoublePrime)
    const dynkinPredictions = []
    for (let t = 0; t <= 20; t++) {
      dynkinPredictions.push({
        t: t * 0.1,
        predicted: tf.f(currentX) + afCurrent * t * 0.1,
        actual: tf.f(currentX), // simplified
      })
    }

    // Expected hitting time to mean
    const targetIdx = Math.floor((theta - xMin) / dx)
    const hittingTimes = expectedHittingTime(xGrid, mu, sigma, Math.min(nGrid - 2, Math.max(1, targetIdx)))
    const currentIdx = Math.min(nGrid - 2, Math.max(1, Math.floor((currentX - xMin) / dx)))
    const currentHittingTime = hittingTimes[currentIdx]

    // Stationary distribution (OU): N(θ, σ²/(2κ))
    const statVar = sigmaOU ** 2 / (2 * Math.max(0.01, kappa))
    const stationary = xGrid.map(x => Math.exp(-((x - theta) ** 2) / (2 * statVar)) / Math.sqrt(2 * Math.PI * statVar))

    // Signal
    let signal = 'NEUTRAL'
    let reason = ''
    if (afCurrent > 0.0001) {
      signal = 'GENERATOR_POSITIVE'
      reason = `A\u00B7f(x) = ${afCurrent.toFixed(6)} > 0 (expected increase in f(X_t))`
    } else if (afCurrent < -0.0001) {
      signal = 'GENERATOR_NEGATIVE'
      reason = `A\u00B7f(x) = ${afCurrent.toFixed(6)} < 0 (expected decrease in f(X_t))`
    } else {
      reason = `A\u00B7f(x) = ${afCurrent.toFixed(6)} \u2248 0 (f is harmonic, no drift)`
    }

    return {
      xGrid, Af, fValues, dynkinPredictions,
      hittingTimes, currentHittingTime, stationary,
      signal, reason, afCurrent, currentX,
      params: { kappa, theta, sigmaOU, meanR, stdR },
      tf, dx,
    }
  }, [candles, exchange, symbol, modelType, lookback, funcType])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'GENERATOR_POSITIVE' ? '#22c55e' : data.signal === 'GENERATOR_NEGATIVE' ? '#ef4444' : '#94a3b8'

  // Precompute max f value to avoid spread operator in JSX
  const maxFVal = Math.max(data.fValues.map(Math.abs).reduce((a, b) => Math.max(a, b), 0), 0.001)

  // A·f plot
  const maxAf = data.Af.map(Math.abs).reduce((a, b) => Math.max(a, b), 0.001)
  const sxAf = (i) => P + (i / data.xGrid.length) * (W - 2 * P)
  const syAf = (v) => H - P - ((v + maxAf) / (2 * maxAf)) * (H - 2 * P)

  // Hitting time
  const maxHT = data.hittingTimes.reduce((a, b) => Math.max(a, b), 0.1)
  const sxHT = (i) => P + (i / data.xGrid.length) * (W - 2 * P)
  const syHT = (v) => H - P - (v / maxHT) * (H - 2 * P)

  // Stationary distribution
  const maxStat = data.stationary.reduce((a, b) => Math.max(a, b), 0.001)
  const syStat = (v) => H - P - (v / maxStat) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">{'It\u00f4 Calculus Generator \u2014'} {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Model:</span>
          <select value={modelType} onChange={e => setModelType(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="ou">Ornstein-Uhlenbeck</option>
            <option value="gbm">Geometric BM</option>
            <option value="const">Constant Drift-Diffusion</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Test function:</span>
          <select value={funcType} onChange={e => setFuncType(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="identity">f(x) = x</option>
            <option value="square">{'f(x) = x\u00b2'}</option>
            <option value="exp">{'f(x) = e\u02e3'}</option>
            <option value="log">{'f(x) = ln|x|'}</option>
            <option value="cosh">f(x) = cosh(x)</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Generator A.f */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">{'Infinitesimal Generator A\u00b7f(x) = \u03bc(x)f\u2032(x) + (1/2)\u03c3\u00b2(x)f\u2033(x) \u2014'} {data.tf.name}</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* f(x) */}
          <path d={data.fValues.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxAf(i)} ${syAf(v * maxAf / maxFVal)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={1.5} opacity={0.5} />

          {/* A.f */}
          <path d={data.Af.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxAf(i)} ${syAf(v)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2.5} />

          {/* Zero line for A.f */}
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#475569" strokeWidth={1} strokeDasharray="3,3" />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>f(x) (scaled)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>{'A\u00b7f(x) (generator)'}</text>
        </svg>
      </div>

      {/* Expected hitting time */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">{'Expected Hitting Time E[\u03c4] to Mean (solving A\u00b7T = -1)'}</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.hittingTimes.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxHT(i)} ${syHT(v)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={2} />

          {/* Current position */}
          <line x1={sxHT(Math.floor((data.currentX - data.xGrid[0]) / data.dx))} y1={P} x2={sxHT(Math.floor((data.currentX - data.xGrid[0]) / data.dx))} y2={H - P} stroke="#fbbf24" strokeWidth={1} strokeDasharray="3,3" />

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>{'E[\u03c4] (hitting time)'}</text>
          <text x={W - P} y={34} textAnchor="end" fill="#fbbf24" fontSize={9}>{'current: ' + data.currentHittingTime.toFixed(2)}</text>
        </svg>
      </div>

      {/* Stationary distribution */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">{'Stationary Distribution \u03c0(x) (invariant measure of generator)'}</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.stationary.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxAf(i)} ${syStat(v)}`).join(' ')} fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>{'\u03c0(x) stationary (A\u00b7\u03c0 = 0)'}</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">{'A\u00b7f(current)'}</div>
          <div className="text-cyan-400 font-mono">{data.afCurrent.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">{'\u03ba (mean rev)'}</div>
          <div className="text-emerald-400 font-mono">{data.params.kappa.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">{'\u03b8 (target)'}</div>
          <div className="text-amber-400 font-mono">{data.params.theta.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">{'\u03c3 (diffusion)'}</div>
          <div className="text-purple-400 font-mono">{data.params.sigmaOU.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">{'E[\u03c4] to mean'}</div>
          <div className="text-slate-300 font-mono">{data.currentHittingTime.toFixed(2)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Generator:</strong> {'A\u00b7f = \u03bc\u00b7f\u2032 + (1/2)\u03c3\u00b2\u00b7f\u2033 (infinitesimal)'} |
        <strong> Dynkin:</strong> {'E[f(X_t)] = f(x) + E[\u222bA\u00b7f ds]'} |
        <strong> Hitting:</strong> {'A\u00b7T = -1, T(target) = 0'} |
        <strong> Stationary:</strong> {'A\u00b7\u03c0 = 0 (invariant measure)'} |
        <strong> Feynman-Kac:</strong> {'\u2202u/\u2202t = A\u00b7u - r\u00b7u'}
      </div>
    </div>
  )
}