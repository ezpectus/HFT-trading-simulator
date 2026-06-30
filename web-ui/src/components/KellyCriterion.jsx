import React, { useMemo, useState } from 'react'

// ─── Kelly Criterion + Fractional Kelly Portfolio Sizing ─────────────────────
// Implements optimal position sizing based on the Kelly Criterion,
// including fractional Kelly, multiple-asset Kelly, and drawdown-adjusted Kelly.
//
// Mathematical foundation:
//   Single asset Kelly:
//   f* = (p·b - q) / b = (p·(b+1) - 1) / b
//   where p = win probability, q = 1-p, b = win/loss ratio
//
//   For continuous returns (approximation):
//   f* = μ / σ²  (mean return / variance)
//
//   Fractional Kelly: f = fraction · f*
//   - Reduces volatility at cost of lower growth rate
//   - Common: 1/2 Kelly, 1/4 Kelly
//
//   Multi-asset Kelly:
//   f* = Σ⁻¹ · μ  (vector form)
//   where Σ = covariance matrix, μ = expected returns vector
//
//   Drawdown-adjusted Kelly:
//   f = f* · (1 - current_drawdown / max_drawdown)
//
//   Growth rate: g = f·μ - (f²·σ²)/2
//   Optimal growth: g* = μ²/(2σ²)

const kellySingle = (winProb, winLossRatio) => {
  const p = winProb
  const q = 1 - p
  const b = winLossRatio
  const fStar = (p * b - q) / b
  const growthRate = fStar > 0 ? p * Math.log(1 + b * fStar) + q * Math.log(1 - fStar) : 0
  return { fStar, growthRate, edge: p * b - q }
}

const kellyContinuous = (meanReturn, volatility) => {
  const sigma2 = volatility * volatility
  const fStar = sigma2 > 0 ? meanReturn / sigma2 : 0
  const growthRate = fStar > 0 ? meanReturn * fStar / 2 : 0
  return { fStar, growthRate, sharpe: volatility > 0 ? meanReturn / volatility : 0 }
}

// Multi-asset Kelly (matrix form)
const jacobiEig = (A, maxIter = 100, tol = 1e-10) => {
  const n = A.length
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0))
  const D = A.map(row => row.slice())
  for (let iter = 0; iter < maxIter; iter++) {
    let maxVal = 0, p = 0, q = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (Math.abs(D[i][j]) > maxVal) { maxVal = Math.abs(D[i][j]); p = i; q = j }
    }
    if (maxVal < tol) break
    const theta = (D[q][q] - D[p][p]) / (2 * D[p][q])
    const t = Math.sign(theta) * (Math.abs(theta) + Math.sqrt(theta * theta + 1))
    const c = 1 / Math.sqrt(t * t + 1), s = t * c
    for (let i = 0; i < n; i++) {
      const dip = D[i][p], diq = D[i][q]
      D[i][p] = c * dip - s * diq; D[i][q] = s * dip + c * diq
    }
    for (let j = 0; j < n; j++) {
      const dpj = D[p][j], dqj = D[q][j]
      D[p][j] = c * dpj - s * dqj; D[q][j] = s * dpj + c * dqj
    }
    D[p][q] = 0; D[q][p] = 0
    for (let i = 0; i < n; i++) {
      const vip = V[i][p], viq = V[i][q]
      V[i][p] = c * vip - s * viq; V[i][q] = s * vip + c * viq
    }
  }
  return { eigenvalues: D.map((row, i) => row[i]), eigenvectors: V }
}

const matrixInverse = (A) => {
  const n = A.length
  const { eigenvalues, eigenvectors } = jacobiEig(A)
  const invD = eigenvalues.map(v => Math.abs(v) > 1e-10 ? 1 / v : 0)
  const result = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    result[i][j] += eigenvectors[i][k] * invD[k] * eigenvectors[j][k]
  }
  return result
}

const matVec = (A, v) => A.map(row => row.reduce((s, a, i) => s + a * v[i], 0))

const kellyMulti = (returns, symbols) => {
  const n = symbols.length
  const T = returns[0].length

  // Mean returns (annualized)
  const mu = returns.map(r => {
    const m = r.reduce((a, b) => a + b, 0) / T
    return m * 252
  })

  // Covariance matrix (annualized)
  const cov = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const mi = returns[i].reduce((a, b) => a + b, 0) / T
      const mj = returns[j].reduce((a, b) => a + b, 0) / T
      let s = 0
      for (let t = 0; t < T; t++) s += (returns[i][t] - mi) * (returns[j][t] - mj)
      cov[i][j] = (s / (T - 1)) * 252
    }
  }

  // f* = Σ⁻¹ · μ
  const invCov = matrixInverse(cov)
  const fStar = matVec(invCov, mu)

  // Growth rate: g = fᵀμ - ½fᵀΣf
  const fMu = fStar.reduce((s, f, i) => s + f * mu[i], 0)
  let fSigmaF = 0
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) fSigmaF += fStar[i] * cov[i][j] * fStar[j]
  const growthRate = fMu - fSigmaF / 2

  // Individual volatilities
  const vols = cov.map((row, i) => Math.sqrt(Math.abs(row[i])))

  // Sharpe ratios
  const sharpes = mu.map((m, i) => vols[i] > 0 ? m / vols[i] : 0)

  return { fStar, mu, cov, vols, sharpes, growthRate, invCov }
}

// Monte Carlo simulation of Kelly strategy
const simulateKelly = (fStar, meanReturn, volatility, nSims = 1000, nSteps = 252) => {
  const finalWealths = []
  const samplePath = new Array(nSteps).fill(1)

  for (let sim = 0; sim < nSims; sim++) {
    let wealth = 1
    for (let t = 0; t < nSteps; t++) {
      const z = randomNormal()
      const ret = meanReturn + volatility * z
      wealth *= (1 + fStar * ret)
      if (sim === 0) samplePath[t] = wealth
    }
    finalWealths.push(wealth)
  }

  finalWealths.sort((a, b) => a - b)
  const median = finalWealths[Math.floor(nSims / 2)]
  const p5 = finalWealths[Math.floor(nSims * 0.05)]
  const p95 = finalWealths[Math.floor(nSims * 0.95)]
  const mean = finalWealths.reduce((a, b) => a + b, 0) / nSims

  // Max drawdown from sample path
  let maxDD = 0, peak = samplePath[0]
  for (const w of samplePath) {
    if (w > peak) peak = w
    const dd = (peak - w) / peak
    if (dd > maxDD) maxDD = dd
  }

  return { median, p5, p95, mean, samplePath, maxDD }
}

const randomNormal = () => {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export default function KellyCriterion({ candles, symbols, exchange }) {
  const [fraction, setFraction] = useState(0.5)
  const [lookback, setLookback] = useState(50)
  const [maxLeverage, setMaxLeverage] = useState(3)
  const [winProb, setWinProb] = useState(0.55)
  const [winLossRatio, setWinLossRatio] = useState(1.5)

  const singleAsset = useMemo(() => {
    const k = kellySingle(winProb, winLossRatio)
    const fk = k.fStar * fraction
    return { ...k, fractional: fk, clamped: Math.min(fk, maxLeverage) }
  }, [winProb, winLossRatio, fraction, maxLeverage])

  const multiAsset = useMemo(() => {
    if (!candles?.[exchange] || !symbols || symbols.length < 2) return null

    const allReturns = []
    const validSymbols = []
    for (const sym of symbols) {
      const cds = candles[exchange]?.[sym]
      if (!cds || cds.length < lookback + 1) continue
      const prices = cds.slice(-lookback - 1).map(c => c.close)
      const rets = []
      for (let i = 1; i < prices.length; i++) rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
      allReturns.push(rets)
      validSymbols.push(sym)
    }
    if (validSymbols.length < 2) return null

    const k = kellyMulti(allReturns, validSymbols)
    const fractional = k.fStar.map(f => f * fraction)
    const clamped = fractional.map(f => Math.max(-maxLeverage, Math.min(maxLeverage, f)))
    const grossExposure = clamped.reduce((a, b) => a + Math.abs(b), 0)

    // Per-asset simulation
    const simulations = validSymbols.map((sym, i) => {
      const f = clamped[i]
      const mu = k.mu[i] / 252 // daily
      const vol = k.vols[i] / Math.sqrt(252) // daily
      return simulateKelly(f, mu, vol, 500, 252)
    })

    return {
      ...k, validSymbols, fractional, clamped, grossExposure,
      simulations,
    }
  }, [candles, exchange, symbols, lookback, fraction, maxLeverage])

  const W = 800, H = 250, P = 30

  // Growth rate vs fraction curve
  const growthCurve = useMemo(() => {
    if (!multiAsset) return []
    const points = []
    for (let f = 0; f <= 2; f += 0.05) {
      const weights = multiAsset.fStar.map(w => w * f)
      const fMu = weights.reduce((s, w, i) => s + w * multiAsset.mu[i], 0)
      let fSigmaF = 0
      for (let i = 0; i < multiAsset.validSymbols.length; i++)
        for (let j = 0; j < multiAsset.validSymbols.length; j++)
          fSigmaF += weights[i] * multiAsset.cov[i][j] * weights[j]
      points.push({ fraction: f, growth: fMu - fSigmaF / 2 })
    }
    return points
  }, [multiAsset])

  if (!multiAsset) {
    return <div className="p-4 text-sm text-slate-400">Need at least 2 symbols with {lookback + 1}+ candles on {exchange}</div>
  }

  const maxGrowth = Math.max(...growthCurve.map(p => p.growth))
  const minGrowth = Math.min(...growthCurve.map(p => p.growth))
  const sx = (f) => P + (f / 2) * (W - 2 * P)
  const sy = (g) => H - P - ((g - minGrowth) / (maxGrowth - minGrowth + 0.001)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Kelly Criterion Portfolio Sizing — {exchange}</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Fraction:</span>
          <input type="number" step="0.1" value={fraction} onChange={e => setFraction(Math.max(0.01, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max leverage:</span>
          <input type="number" step="0.5" value={maxLeverage} onChange={e => setMaxLeverage(Math.max(0.1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(20, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Single asset Kelly */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Single Asset Kelly (binary outcome model)</div>
        <div className="flex items-center gap-3 flex-wrap text-xs mb-2">
          <label className="flex items-center gap-1">
            <span className="text-slate-400">Win prob:</span>
            <input type="number" step="0.01" value={winProb} onChange={e => setWinProb(Math.max(0.01, Math.min(0.99, +e.target.value)))} className="w-12 px-1 bg-slate-900 border border-slate-700 rounded text-slate-200" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-slate-400">Win/loss ratio:</span>
            <input type="number" step="0.1" value={winLossRatio} onChange={e => setWinLossRatio(Math.max(0.1, +e.target.value))} className="w-12 px-1 bg-slate-900 border border-slate-700 rounded text-slate-200" />
          </label>
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="bg-slate-900 rounded p-2">
            <div className="text-slate-400">f* (full Kelly)</div>
            <div className="text-cyan-400 font-mono">{(singleAsset.fStar * 100).toFixed(2)}%</div>
          </div>
          <div className="bg-slate-900 rounded p-2">
            <div className="text-slate-400">f (fractional)</div>
            <div className="text-amber-400 font-mono">{(singleAsset.fractional * 100).toFixed(2)}%</div>
          </div>
          <div className="bg-slate-900 rounded p-2">
            <div className="text-slate-400">Edge (p·b - q)</div>
            <div className="text-emerald-400 font-mono">{singleAsset.edge.toFixed(4)}</div>
          </div>
          <div className="bg-slate-900 rounded p-2">
            <div className="text-slate-400">Growth rate</div>
            <div className="text-purple-400 font-mono">{(singleAsset.growthRate * 100).toFixed(4)}%</div>
          </div>
        </div>
      </div>

      {/* Growth rate vs fraction */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Growth Rate vs Kelly Fraction (multi-asset)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={sy(0)} x2={W - P} y2={sy(0)} stroke="#475569" strokeDasharray="3,3" />
          <path d={growthCurve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.fraction)} ${sy(p.growth)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />
          {/* Current fraction marker */}
          <line x1={sx(fraction)} y1={P} x2={sx(fraction)} y2={H - P} stroke="#f59e0b" strokeDasharray="4,3" />
          <circle cx={sx(fraction)} cy={sy(growthCurve.find(p => Math.abs(p.fraction - fraction) < 0.03)?.growth || 0)} r={5} fill="#f59e0b" />
          <text x={sx(fraction)} y={P + 10} textAnchor="middle" fill="#f59e0b" fontSize={9}>f={fraction}</text>
          <text x={sx(1)} y={H - 5} textAnchor="middle" fill="#475569" fontSize={10}>f=1.0 (full Kelly)</text>
          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>Growth rate (annualized)</text>
        </svg>
      </div>

      {/* Multi-asset weights */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Multi-Asset Kelly Weights (f* = Σ⁻¹·μ)</div>
        <div className="space-y-1">
          {multiAsset.validSymbols.map((sym, i) => (
            <div key={sym} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-20">{sym}</span>
              <span className="text-cyan-400 font-mono w-20">f*={multiAsset.fStar[i].toFixed(4)}</span>
              <span className="text-amber-400 font-mono w-20">f={multiAsset.fractional[i].toFixed(4)}</span>
              <span className="font-mono w-20" style={{ color: multiAsset.clamped[i] >= 0 ? '#22c55e' : '#ef4444' }}>
                clamped={multiAsset.clamped[i].toFixed(4)}
              </span>
              <span className="text-slate-500 font-mono w-20">μ={multiAsset.mu[i].toFixed(4)}</span>
              <span className="text-slate-500 font-mono w-20">σ={multiAsset.vols[i].toFixed(4)}</span>
              <span className="text-slate-500 font-mono w-20">Sh={multiAsset.sharpes[i].toFixed(3)}</span>
              {/* Weight bar */}
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
                <div
                  className="h-full rounded absolute"
                  style={{
                    width: `${Math.min(50, Math.abs(multiAsset.clamped[i]) * 20)}%`,
                    background: multiAsset.clamped[i] >= 0 ? '#22c55e' : '#ef4444',
                    left: multiAsset.clamped[i] >= 0 ? '50%' : `${50 - Math.min(50, Math.abs(multiAsset.clamped[i]) * 20)}%`
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Monte Carlo simulation */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Monte Carlo Simulation (1 year, 500 paths per asset)</div>
        <svg width={W} height={120} className="bg-slate-900 rounded">
          {multiAsset.simulations.map((sim, i) => {
            const colors = ['#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899']
            const path = sim.samplePath.map((w, t) => `${t === 0 ? 'M' : 'L'} ${P + (t / 252) * (W - 2 * P)} ${110 - Math.min(100, w * 30)}`).join(' ')
            return (
              <g key={i}>
                <path d={path} fill="none" stroke={colors[i % colors.length]} strokeWidth={1} opacity={0.7} />
                <text x={W - P} y={15 + i * 12} textAnchor="end" fill={colors[i % colors.length]} fontSize={9}>
                  {multiAsset.validSymbols[i]}: median={sim.median.toFixed(3)}, maxDD={(sim.maxDD * 100).toFixed(1)}%
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Gross Exposure</div>
          <div className="text-amber-400 font-mono">{(multiAsset.grossExposure * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Portfolio Growth</div>
          <div className="text-emerald-400 font-mono">{(multiAsset.growthRate * 100).toFixed(2)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Long Positions</div>
          <div className="text-cyan-400 font-mono">{multiAsset.clamped.filter(w => w > 0).length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Short Positions</div>
          <div className="text-red-400 font-mono">{multiAsset.clamped.filter(w => w < 0).length}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Model:</strong> f* = Σ⁻¹·μ (multi-asset Kelly) |
        <strong> Fraction:</strong> {fraction}× Kelly |
        <strong> Max leverage:</strong> {maxLeverage}× |
        <strong> Annualized:</strong> μ and Σ scaled by 252
      </div>
    </div>
  )
}
