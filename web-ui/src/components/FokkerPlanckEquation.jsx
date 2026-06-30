import React, { useMemo, useState } from 'react'

// ─── Fokker-Planck Equation (Probability Density Evolution) ────────────────
// Solves the Fokker-Planck (forward Kolmogorov) equation to track how the
// probability density of returns evolves over time under drift and diffusion.
//
// Mathematical foundation:
//   Fokker-Planck PDE:
//   ∂p/∂t = -∂/∂x[μ(x,t)·p] + (1/2)·∂²/∂x²[σ²(x,t)·p]
//
//   For GBM: μ(x) = μ₀·x, σ(x) = σ₀·x
//   ∂p/∂t = -μ₀·∂/∂x[x·p] + (σ₀²/2)·∂²/∂x²[x²·p]
//
//   Numerical solution: finite difference (explicit scheme)
//   p_i^{n+1} = p_i^n + Δt·[-D⁻(F_{i+½}) + D⁻(F_{i-½})] / Δx
//   where F = μ·p - (1/2)·∂/∂x[σ²·p] (probability flux)
//
//   Stationary distribution (Ornstein-Uhlenbeck):
//   p_∞(x) ∝ exp(-(x-θ)²/(2σ²/(2κ)))  (Gaussian)
//
//   Applications: density forecasting, transition probabilities,
//   tail evolution, risk horizon analysis

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Solve Fokker-Planck via finite differences
const solveFokkerPlanck = (xGrid, p0, muFn, sigmaFn, dt, nSteps) => {
  const n = xGrid.length
  const dx = xGrid[1] - xGrid[0]
  let p = p0.slice()
  const history = [p.slice()]

  for (let step = 0; step < nSteps; step++) {
    const newP = new Array(n).fill(0)

    for (let i = 1; i < n - 1; i++) {
      const x = xGrid[i]
      const mu = muFn(x)
      const sigma2 = sigmaFn(x) ** 2

      // Drift flux: F_drift = μ·p
      const FdriftL = muFn(xGrid[i - 1]) * p[i - 1]
      const FdriftR = muFn(xGrid[i + 1]) * p[i + 1]

      // Diffusion flux: F_diff = -(1/2)·∂/∂x[σ²·p]
      const sigma2L = sigmaFn(xGrid[i - 1]) ** 2
      const sigma2R = sigmaFn(xGrid[i + 1]) ** 2
      const sigma2C = sigma2
      const FdiffL = -0.5 * (sigma2C * p[i] - sigma2L * p[i - 1]) / dx
      const FdiffR = -0.5 * (sigma2R * p[i + 1] - sigma2C * p[i]) / dx

      // Total flux
      const FL = FdriftL + FdiffL
      const FR = FdriftR + FdiffR

      // Update: ∂p/∂t = -∂F/∂x
      newP[i] = p[i] - dt * (FR - FL) / (2 * dx)
      newP[i] = Math.max(0, newP[i]) // ensure non-negative
    }

    // Boundary conditions (absorbing)
    newP[0] = 0
    newP[n - 1] = 0

    // Normalize
    const sum = newP.reduce((a, b) => a + b, 0) * dx
    if (sum > 0) for (let i = 0; i < n; i++) newP[i] /= sum

    p = newP
    if (step % Math.max(1, Math.floor(nSteps / 20)) === 0) {
      history.push(p.slice())
    }
  }

  return { finalP: p, history }
}

export default function FokkerPlanckEquation({ candles, symbol, exchange }) {
  const [modelType, setModelType] = useState('ou')
  const [nSteps, setNSteps] = useState(200)
  const [dt, setDt] = useState(0.01)
  const [lookback, setLookback] = useState(100)
  const [horizon, setHorizon] = useState(10)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Estimate parameters
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length
    const varR = returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length
    const stdR = Math.sqrt(varR)

    // OU parameters: dX = κ(θ-X)dt + σdW
    // Estimate κ from ACF(1)
    let acf1 = 0
    for (let i = 0; i < returns.length - 1; i++) {
      acf1 += (returns[i] - meanR) * (returns[i + 1] - meanR)
    }
    acf1 /= (returns.length - 1) * varR
    const kappa = acf1 < 1 ? -Math.log(Math.max(0.01, acf1)) : 1.0
    const theta = meanR
    const sigmaOU = stdR * Math.sqrt(2 * kappa)

    // GBM parameters (for returns, treated as drift-diffusion)
    const muGBM = meanR
    const sigmaGBM = stdR

    // Set up grid
    const xMin = meanR - 4 * stdR
    const xMax = meanR + 4 * stdR
    const nGrid = 80
    const dx = (xMax - xMin) / (nGrid - 1)
    const xGrid = Array.from({ length: nGrid }, (_, i) => xMin + i * dx)

    // Initial density: Gaussian centered at current return
    const currentReturn = returns[returns.length - 1]
    const p0 = xGrid.map(x => {
      const sigmaInit = stdR * 0.5 // tighter initial distribution
      return Math.exp(-((x - currentReturn) ** 2) / (2 * sigmaInit ** 2)) / (sigmaInit * Math.sqrt(2 * Math.PI))
    })
    // Normalize
    const p0Sum = p0.reduce((a, b) => a + b, 0) * dx
    p0.forEach((_, i) => p0[i] /= p0Sum)

    // Model functions
    let muFn, sigmaFn
    if (modelType === 'ou') {
      muFn = (x) => kappa * (theta - x)
      sigmaFn = () => sigmaOU
    } else if (modelType === 'gbm') {
      muFn = (x) => muGBM * x
      sigmaFn = (x) => sigmaGBM * Math.abs(x)
    } else {
      // Constant drift-diffusion
      muFn = () => muGBM
      sigmaFn = () => sigmaGBM
    }

    // Solve
    const result = solveFokkerPlanck(xGrid, p0, muFn, sigmaFn, dt, nSteps)

    // Forecast density at horizon steps
    const forecastIdx = Math.min(result.history.length - 1, Math.floor(horizon * nSteps / 20))
    const forecastP = result.history[forecastIdx]

    // Stationary distribution (OU): N(θ, σ²/(2κ))
    const stationaryP = xGrid.map(x => {
      const statVar = sigmaOU ** 2 / (2 * kappa)
      return Math.exp(-((x - theta) ** 2) / (2 * statVar)) / Math.sqrt(2 * Math.PI * statVar)
    })

    // Tail probabilities (VaR-like)
    const cdf = []
    let cumSum = 0
    for (let i = 0; i < forecastP.length; i++) {
      cumSum += forecastP[i] * dx
      cdf.push(cumSum)
    }
    const var5Idx = cdf.findIndex(c => c >= 0.05)
    const var5 = var5Idx >= 0 ? xGrid[var5Idx] : xMin
    const medianIdx = cdf.findIndex(c => c >= 0.5)
    const median = medianIdx >= 0 ? xGrid[medianIdx] : meanR

    // Signal
    let signal = 'NEUTRAL'
    let reason = ''
    if (median > currentReturn * 1.1) {
      signal = 'BULLISH_DENSITY'
      reason = `Forecast median = ${median.toFixed(6)} > current = ${currentReturn.toFixed(6)} (density shifting up)`
    } else if (median < currentReturn * 0.9) {
      signal = 'BEARISH_DENSITY'
      reason = `Forecast median = ${median.toFixed(6)} < current = ${currentReturn.toFixed(6)} (density shifting down)`
    } else {
      reason = `Forecast median = ${median.toFixed(6)} ≈ current = ${currentReturn.toFixed(6)} (stable)`
    }

    // KL divergence between initial and forecast
    let klDiv = 0
    for (let i = 0; i < p0.length; i++) {
      if (p0[i] > 0 && forecastP[i] > 0) {
        klDiv += forecastP[i] * Math.log(forecastP[i] / p0[i]) * dx
      }
    }

    return {
      xGrid, p0, result, forecastP, stationaryP,
      var5, median, currentReturn,
      signal, reason, klDiv,
      params: { kappa, theta, sigmaOU, muGBM, sigmaGBM },
      dx,
    }
  }, [candles, exchange, symbol, modelType, nSteps, dt, lookback, horizon])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'BULLISH_DENSITY' ? '#22c55e' : data.signal === 'BEARISH_DENSITY' ? '#ef4444' : '#94a3b8'

  // Density plot
  const maxP = Math.max(...data.p0, ...data.forecastP, ...data.stationaryP, 0.001)
  const sxD = (x) => P + ((x - data.xGrid[0]) / (data.xGrid[data.xGrid.length - 1] - data.xGrid[0])) * (W - 2 * P)
  const syD = (p) => H - P - (p / maxP) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Fokker-Planck Equation (Density Evolution) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Model:</span>
          <select value={modelType} onChange={e => setModelType(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="ou">Ornstein-Uhlenbeck</option>
            <option value="gbm">Geometric Brownian Motion</option>
            <option value="const">Constant Drift-Diffusion</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Steps:</span>
          <input type="number" value={nSteps} onChange={e => setNSteps(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Δt:</span>
          <input type="number" step="0.005" value={dt} onChange={e => setDt(Math.max(0.001, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Horizon:</span>
          <input type="number" value={horizon} onChange={e => setHorizon(Math.max(1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Density evolution */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Probability Density Evolution: p(x, t) — Initial → Forecast → Stationary</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Initial density */}
          <path d={data.p0.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sxD(data.xGrid[i])} ${syD(p)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {/* Forecast density */}
          <path d={data.forecastP.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sxD(data.xGrid[i])} ${syD(p)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2} />

          {/* Stationary density (OU only) */}
          {modelType === 'ou' && (
            <path d={data.stationaryP.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sxD(data.xGrid[i])} ${syD(p)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4,3" />
          )}

          {/* VaR 5% line */}
          <line x1={sxD(data.var5)} y1={P} x2={sxD(data.var5)} y2={H - P} stroke="#ef4444" strokeWidth={1} strokeDasharray="2,2" />
          <text x={sxD(data.var5)} y={P + 10} textAnchor="middle" fill="#ef4444" fontSize={8}>VaR 5%</text>

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>Initial p(x,0)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>Forecast p(x,T)</text>
          {modelType === 'ou' && <text x={W - P} y={48} textAnchor="end" fill="#a855f7" fontSize={9}>Stationary p_∞(x)</text>}
        </svg>
      </div>

      {/* Density evolution heatmap */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Density Evolution Over Time (time → x)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          {data.result.history.map((p, t) => {
            const cellW = (W - 2 * P) / data.result.history.length
            return p.map((val, i) => {
              if (val < 0.001) return null
              const cellH = (H - 2 * P) / data.xGrid.length
              const intensity = val / maxP
              return <rect key={`${t}-${i}`} x={P + t * cellW} y={P + i * cellH} width={cellW} height={cellH} fill={`hsl(${240 - intensity * 240}, 80%, ${20 + intensity * 40}%)`} opacity={0.6} />
            })
          })}
          <text x={W - P} y={20} textAnchor="end" fill="#475569" fontSize={9}>time →</text>
          <text x={5} y={P + 10} fill="#475569" fontSize={9}>x ↑</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">κ (mean rev)</div>
          <div className="text-cyan-400 font-mono">{data.params.kappa.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">θ (long-term)</div>
          <div className="text-emerald-400 font-mono">{data.params.theta.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">σ (diffusion)</div>
          <div className="text-amber-400 font-mono">{data.params.sigmaOU.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">VaR 5%</div>
          <div className="text-red-400 font-mono">{data.var5.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">KL divergence</div>
          <div className="text-purple-400 font-mono">{data.klDiv.toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> PDE:</strong> ∂p/∂t = -∂/∂x[μ·p] + (1/2)·∂²/∂x²[σ²·p] |
        <strong> Scheme:</strong> finite difference (explicit, {nSteps} steps, Δt={dt}) |
        <strong> Model:</strong> {modelType === 'ou' ? 'OU: dX=κ(θ-X)dt+σdW' : modelType === 'gbm' ? 'GBM: dX=μXdt+σXdW' : 'Const: dX=μdt+σdW'} |
        <strong> KL:</strong> D_KL(p_T || p_0) = {data.klDiv.toFixed(4)}
      </div>
    </div>
  )
}
