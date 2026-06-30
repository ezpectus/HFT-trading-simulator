import React, { useMemo, useState } from 'react'

// ─── Malliavin Calculus (Sensitivity Estimation via Monte Carlo) ────────────
// Uses Malliavin calculus to compute Greeks (sensitivities) of financial
// instruments via Monte Carlo simulation, avoiding finite differences.
//
// Mathematical foundation:
//   Malliavin derivative D_t W_s = 1_{t≤s} (derivative of Brownian motion)
//
//   Integration by parts (key formula):
//   E[φ(F)·G] = E[φ'(F)·H]  where H is the Malliavin weight
//
//   Delta (dC/dS): Δ = E[φ(F)·π^Δ]
//   where π^Δ = (1/S₀σ²T) · ∫_0^T W_t dW_t  (Malliavin weight)
//
//   Vega (dC/dσ): ν = E[φ(F)·π^ν]
//   where π^ν involves the derivative w.r.t. volatility
//
//   Advantage: pathwise sensitivities without bumping (no bias from finite diff)
//   Weight function: H = (F - E[F]) / Var[F]  (simplified)

const randomNormal = () => {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Simulate GBM paths and compute Malliavin weights
const simulatePaths = (S0, mu, sigma, T, nSteps, nPaths) => {
  const dt = T / nSteps
  const paths = []
  const brownianPaths = []

  for (let p = 0; p < nPaths; p++) {
    const path = [S0]
    const brownian = [0]
    let S = S0, W = 0
    for (let i = 1; i < nSteps; i++) {
      const dW = randomNormal() * Math.sqrt(dt)
      W += dW
      S = S * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * dW)
      path.push(S)
      brownian.push(W)
    }
    paths.push(path)
    brownianPaths.push(brownian)
  }

  return { paths, brownianPaths }
}

// Normal CDF approximation
const normCdf = (x) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-x * x / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

// Black-Scholes call price (analytical)
const bsCall = (S, K, T, r, sigma) => {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)
  return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2)
}

// Black-Scholes Greeks (analytical)
const bsGreeks = (S, K, T, r, sigma) => {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)
  const pdf = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)
  return {
    delta: normCdf(d1),
    gamma: pdf(d1) / (S * sigma * Math.sqrt(T)),
    vega: S * pdf(d1) * Math.sqrt(T),
    theta: (-S * pdf(d1) * sigma / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normCdf(d2)),
    rho: K * T * Math.exp(-r * T) * normCdf(d2),
  }
}

// Malliavin Greeks estimation
const malliavinGreeks = (paths, brownianPaths, S0, K, T, r, sigma, nSteps) => {
  const nPaths = paths.length
  const dt = T / nSteps

  // Payoff: max(S_T - K, 0) for call
  const payoffs = paths.map(p => Math.max(p[p.length - 1] - K, 0))
  const meanPayoff = payoffs.reduce((a, b) => a + b, 0) / nPaths
  const price = Math.exp(-r * T) * meanPayoff

  // Malliavin Delta weight:
  // π^Δ = (1/(S₀σT)) · W_T · 1_{S_T > K}
  // Using integration by parts: Δ = E[e^{-rT} · 1_{S_T>K} · (W_T / (S₀σT))]
  let deltaSum = 0
  for (let p = 0; p < nPaths; p++) {
    const WT = brownianPaths[p][nSteps - 1]
    const inMoney = paths[p][nSteps - 1] > K ? 1 : 0
    const weight = WT / (S0 * sigma * T)
    deltaSum += Math.exp(-r * T) * inMoney * weight
  }
  const delta = deltaSum / nPaths

  // Malliavin Vega weight:
  // π^ν involves ∫ W_t dW_t = (W_T² - T)/2
  // ν = E[e^{-rT} · (S_T - K)⁺ · π^ν]
  let vegaSum = 0
  for (let p = 0; p < nPaths; p++) {
    const WT = brownianPaths[p][nSteps - 1]
    const payoff = payoffs[p]
    // Malliavin weight for vega: (W_T² - T) / (2σT) - W_T/σ
    const weight = (WT * WT - T) / (2 * sigma * T) - WT / sigma
    vegaSum += Math.exp(-r * T) * payoff * weight
  }
  const vega = vegaSum / nPaths

  // Malliavin Gamma:
  // More complex weight involving second-order Malliavin derivatives
  let gammaSum = 0
  const varST = S0 * S0 * Math.exp(2 * r * T) * (Math.exp(sigma * sigma * T) - 1)
  for (let p = 0; p < nPaths; p++) {
    const WT = brownianPaths[p][nSteps - 1]
    const ST = paths[p][nSteps - 1]
    const inMoney = ST > K ? 1 : 0
    // Simplified gamma weight
    const weight = (WT * WT - T) / (S0 * S0 * sigma * sigma * T * T) - 1 / (S0 * sigma * T)
    gammaSum += Math.exp(-r * T) * inMoney * weight / S0
  }
  const gamma = gammaSum / nPaths

  // Finite difference comparison
  const dS = S0 * 0.01
  const priceUp = bsCall(S0 + dS, K, T, r, sigma)
  const priceDown = bsCall(S0 - dS, K, T, r, sigma)
  const fdDelta = (priceUp - priceDown) / (2 * dS)
  const fdGamma = (priceUp - 2 * price + priceDown) / (dS * dS)

  const dSig = 0.01
  const fdVega = (bsCall(S0, K, T, r, sigma + dSig) - bsCall(S0, K, T, r, sigma - dSig)) / (2 * dSig)

  // Standard errors
  const deltaValues = []
  for (let p = 0; p < nPaths; p++) {
    const WT = brownianPaths[p][nSteps - 1]
    const inMoney = paths[p][nSteps - 1] > K ? 1 : 0
    deltaValues.push(Math.exp(-r * T) * inMoney * WT / (S0 * sigma * T))
  }
  const deltaSE = Math.sqrt(deltaValues.reduce((s, v) => s + (v - delta) ** 2, 0) / nPaths) / Math.sqrt(nPaths)

  return {
    price, delta, vega, gamma,
    fdDelta, fdGamma, fdVega,
    deltaSE,
    meanPayoff,
  }
}

export default function MalliavinCalculus({ candles, symbol, exchange }) {
  const [nPaths, setNPaths] = useState(1000)
  const [nSteps, setNSteps] = useState(50)
  const [strikePct, setStrikePct] = useState(1.0)
  const [T_days, setT_days] = useState(30)
  const [riskFreeRate, setRiskFreeRate] = useState(0.05)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 30) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-50).map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    const S0 = prices[prices.length - 1]
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length
    const stdR = Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length)
    const sigma = stdR * Math.sqrt(252)
    const mu = meanR * 252
    const K = S0 * strikePct
    const T = T_days / 365

    // Simulate
    const { paths, brownianPaths } = simulatePaths(S0, mu, sigma, T, nSteps, nPaths)

    // Malliavin Greeks
    const malliavin = malliavinGreeks(paths, brownianPaths, S0, K, T, riskFreeRate, sigma, nSteps)

    // Analytical Greeks
    const analytical = bsGreeks(S0, K, T, riskFreeRate, sigma)
    const analyticalPrice = bsCall(S0, K, T, riskFreeRate, sigma)

    // Error comparison
    const deltaError = Math.abs(malliavin.delta - analytical.delta)
    const vegaError = Math.abs(malliavin.vega - analytical.vega)
    const gammaError = Math.abs(malliavin.gamma - analytical.gamma)
    const priceError = Math.abs(malliavin.price - analyticalPrice)

    // Signal
    let signal = 'NEUTRAL'
    let reason = ''
    if (malliavin.delta > 0.5) {
      signal = 'BUY'
      reason = `Delta = ${malliavin.delta.toFixed(4)} > 0.5 (ITM call)`
    } else if (malliavin.delta < 0.1) {
      signal = 'SELL'
      reason = `Delta = ${malliavin.delta.toFixed(4)} < 0.1 (OTM call)`
    } else {
      reason = `Delta = ${malliavin.delta.toFixed(4)} (near ATM)`
    }

    // Convergence: run with different path counts
    const convergence = []
    for (let np = 100; np <= nPaths; np += Math.max(50, Math.floor(nPaths / 10))) {
      const subPaths = paths.slice(0, np)
      const subBrown = brownianPaths.slice(0, np)
      const subResult = malliavinGreeks(subPaths, subBrown, S0, K, T, riskFreeRate, sigma, nSteps)
      convergence.push({ nPaths: np, delta: subResult.delta, price: subResult.price })
    }

    return {
      S0, K, T, sigma, mu,
      malliavin, analytical, analyticalPrice,
      deltaError, vegaError, gammaError, priceError,
      signal, reason, convergence,
    }
  }, [candles, exchange, symbol, nPaths, nSteps, strikePct, T_days, riskFreeRate])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 30 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'

  // Convergence chart
  const maxConvPaths = Math.max(...data.convergence.map(c => c.nPaths))
  const sxConv = (np) => P + (np / maxConvPaths) * (W - 2 * P)
  const deltaRange = data.convergence.map(c => c.delta)
  const minD = Math.min(...deltaRange, data.analytical.delta - 0.05)
  const maxD = Math.max(...deltaRange, data.analytical.delta + 0.05)
  const syConv = (v) => H - P - ((v - minD) / (maxD - minD + 0.001)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Malliavin Calculus (Sensitivity Estimation) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Paths:</span>
          <input type="number" value={nPaths} onChange={e => setNPaths(Math.max(100, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Steps:</span>
          <input type="number" value={nSteps} onChange={e => setNSteps(Math.max(10, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Strike (%):</span>
          <input type="number" step="0.05" value={strikePct} onChange={e => setStrikePct(Math.max(0.5, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">T (days):</span>
          <input type="number" value={T_days} onChange={e => setT_days(Math.max(1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">r:</span>
          <input type="number" step="0.01" value={riskFreeRate} onChange={e => setRiskFreeRate(+e.target.value)} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Delta convergence */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Malliavin Delta Convergence (vs Analytical)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Analytical reference */}
          <line x1={P} y1={syConv(data.analytical.delta)} x2={W - P} y2={syConv(data.analytical.delta)} stroke="#22c55e" strokeWidth={1.5} strokeDasharray="5,3" />

          {/* Malliavin estimates */}
          <path d={data.convergence.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxConv(c.nPaths)} ${syConv(c.delta)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />
          {data.convergence.map((c, i) => (
            <circle key={i} cx={sxConv(c.nPaths)} cy={syConv(c.delta)} r={3} fill="#06b6d4" />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>Malliavin Δ (MC)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>Analytical Δ = {data.analytical.delta.toFixed(4)}</text>
        </svg>
      </div>

      {/* Greeks comparison table */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Greeks Comparison: Malliavin vs Analytical vs Finite Difference</div>
        <div className="space-y-1">
          {[
            { label: 'Price', malliavin: data.malliavin.price, analytical: data.analyticalPrice, fd: null, error: data.priceError },
            { label: 'Delta (Δ)', malliavin: data.malliavin.delta, analytical: data.analytical.delta, fd: data.malliavin.fdDelta, error: data.deltaError },
            { label: 'Gamma (Γ)', malliavin: data.malliavin.gamma, analytical: data.analytical.gamma, fd: data.malliavin.fdGamma, error: data.gammaError },
            { label: 'Vega (ν)', malliavin: data.malliavin.vega, analytical: data.analytical.vega, fd: data.malliavin.fdVega, error: data.vegaError },
          ].map((g, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-20">{g.label}</span>
              <span className="text-cyan-400 font-mono w-24">M: {g.malliavin.toFixed(6)}</span>
              <span className="text-emerald-400 font-mono w-24">A: {g.analytical.toFixed(6)}</span>
              {g.fd !== null && <span className="text-amber-400 font-mono w-24">FD: {g.fd.toFixed(6)}</span>}
              <span className="text-red-400 font-mono w-20">err: {g.error.toFixed(6)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Malliavin weights explanation */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Malliavin Weights (Integration by Parts)</div>
        <div className="space-y-1 text-xs text-slate-400">
          <div><span className="text-cyan-400">Δ weight:</span> π^Δ = W_T / (S₀σT) · 1{'{S_T > K}'}</div>
          <div><span className="text-amber-400">ν weight:</span> π^ν = (W_T² - T) / (2σT) - W_T/σ</div>
          <div><span className="text-purple-400">Γ weight:</span> π^Γ = [(W_T² - T) / (S₀σ²T²)] - 1/(S₀σT)</div>
          <div className="text-slate-500 mt-2">Key: E[φ(F)·G] = E[φ'(F)·H] (integration by parts avoids finite differences)</div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">S₀</div>
          <div className="text-cyan-400 font-mono">${data.S0.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">K (strike)</div>
          <div className="text-amber-400 font-mono">${data.K.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">σ (vol)</div>
          <div className="text-purple-400 font-mono">{(data.sigma * 100).toFixed(2)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Δ SE</div>
          <div className="text-emerald-400 font-mono">{data.malliavin.deltaSE.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Δ error</div>
          <div className="text-red-400 font-mono">{data.deltaError.toFixed(6)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Method:</strong> Malliavin integration by parts (E[φ(F)·G] = E[φ'(F)·H]) |
        <strong> Advantage:</strong> unbiased pathwise sensitivities (no bumping) |
        <strong> MC paths:</strong> {nPaths} × {nSteps} steps |
        <strong> Greeks:</strong> Δ, Γ, ν via Malliavin weights
      </div>
    </div>
  )
}
