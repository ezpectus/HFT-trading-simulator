import React, { useMemo, useState } from 'react'

// ─── Hopf Bifurcation Analysis (Oscillatory Regime Detection) ───────────────
// Detects Hopf bifurcations in financial time series — points where a
// stable fixed point loses stability and a limit cycle emerges (or vice versa),
// signaling transition between calm and oscillatory (cyclical) regimes.
//
// Mathematical foundation:
//   Normal form: ż = (μ + iω)z - β|z|²z
//   where z ∈ ℂ, μ is bifurcation parameter
//
//   μ < 0: stable fixed point (calm regime)
//   μ = 0: Hopf bifurcation (transition)
//   μ > 0: stable limit cycle (oscillatory regime)
//
//   Detection via dynamical system analysis:
//   1. Fit AR(2) model: x_t = a₁x_{t-1} + a₂x_{t-2} + ε
//   2. Characteristic equation: λ² - a₁λ - a₂ = 0
//   3. Eigenvalues: λ = (a₁ ± √(a₁² + 4a₂)) / 2
//   4. Hopf when eigenvalues cross unit circle (|λ| = 1)
//
//   Bifurcation parameter μ ≈ |λ| - 1
//   Frequency: ω = arg(λ) (oscillation frequency)
//   Amplitude: A ∝ √μ (for μ > 0)
//
//   Applications: cycle detection, regime transition prediction,
//   volatility clustering onset

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Fit AR(2) model via least squares
const fitAR2 = (series) => {
  const n = series.length
  if (n < 5) return { a1: 0, a2: 0, residual: 1 }

  const X = [], y = []
  for (let i = 2; i < n; i++) {
    X.push([series[i - 1], series[i - 2]])
    y.push(series[i])
  }

  // Normal equations
  const m = X.length
  let s11 = 0, s12 = 0, s22 = 0, s1y = 0, s2y = 0
  for (let i = 0; i < m; i++) {
    s11 += X[i][0] * X[i][0]
    s12 += X[i][0] * X[i][1]
    s22 += X[i][1] * X[i][1]
    s1y += X[i][0] * y[i]
    s2y += X[i][1] * y[i]
  }

  const det = s11 * s22 - s12 * s12
  if (Math.abs(det) < 1e-10) return { a1: 0, a2: 0, residual: 1 }

  const a1 = (s22 * s1y - s12 * s2y) / det
  const a2 = (s11 * s2y - s12 * s1y) / det

  // Residual variance
  let ssRes = 0, ssTot = 0
  const yMean = y.reduce((a, b) => a + b, 0) / m
  for (let i = 0; i < m; i++) {
    const pred = a1 * X[i][0] + a2 * X[i][1]
    ssRes += (y[i] - pred) ** 2
    ssTot += (y[i] - yMean) ** 2
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

  return { a1, a2, residual: ssRes / m, r2 }
}

// Compute eigenvalues of AR(2) characteristic equation
// λ² - a₁λ - a₂ = 0
const ar2Eigenvalues = (a1, a2) => {
  const disc = a1 * a1 + 4 * a2
  if (disc >= 0) {
    const sd = Math.sqrt(disc)
    return [
      { re: (a1 + sd) / 2, im: 0, modulus: Math.abs((a1 + sd) / 2) },
      { re: (a1 - sd) / 2, im: 0, modulus: Math.abs((a1 - sd) / 2) },
    ]
  } else {
    const sd = Math.sqrt(-disc)
    const re = a1 / 2
    const im = sd / 2
    const mod = Math.sqrt(re * re + im * im)
    return [
      { re, im, modulus: mod },
      { re, im: -im, modulus: mod },
    ]
  }
}

// Sliding window Hopf analysis
const slidingHopf = (returns, windowSize) => {
  const results = []
  for (let i = 0; i + windowSize <= returns.length; i += Math.max(3, Math.floor(windowSize / 4))) {
    const window = returns.slice(i, i + windowSize)
    const ar2 = fitAR2(window)
    const eigs = ar2Eigenvalues(ar2.a1, ar2.a2)
    const maxMod = Math.max(...eigs.map(e => e.modulus))
    const mu = maxMod - 1 // bifurcation parameter
    const isComplex = eigs[0].im !== 0
    const omega = isComplex ? Math.abs(Math.atan2(eigs[0].im, eigs[0].re)) : 0
    const amplitude = mu > 0 ? Math.sqrt(mu) : 0

    results.push({
      idx: i,
      a1: ar2.a1, a2: ar2.a2,
      maxMod, mu, isComplex, omega, amplitude,
      r2: ar2.r2,
      regime: mu < -0.05 ? 'STABLE' : mu > 0.05 ? 'LIMIT_CYCLE' : 'BIFURCATION',
    })
  }
  return results
}

export default function HopfBifurcation({ candles, symbol, exchange }) {
  const [windowSize, setWindowSize] = useState(30)
  const [lookback, setLookback] = useState(150)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Normalize
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length)
    const normR = returns.map(r => std > 0 ? (r - mean) / std : 0)

    // Full AR(2) fit
    const fullAR2 = fitAR2(normR)
    const fullEigs = ar2Eigenvalues(fullAR2.a1, fullAR2.a2)
    const fullMaxMod = Math.max(...fullEigs.map(e => e.modulus))
    const fullMu = fullMaxMod - 1

    // Sliding window
    const sliding = slidingHopf(normR, windowSize)
    const current = sliding[sliding.length - 1] || { regime: 'STABLE', mu: 0, omega: 0, amplitude: 0 }

    // Signal
    let signal = 'STABLE'
    let reason = ''
    if (current.regime === 'LIMIT_CYCLE') {
      signal = 'OSCILLATORY'
      reason = `Limit cycle detected (μ=${current.mu.toFixed(4)} > 0, ω=${current.omega.toFixed(4)}, A=${current.amplitude.toFixed(4)})`
    } else if (current.regime === 'BIFURCATION') {
      signal = 'BIFURCATION'
      reason = `Near Hopf bifurcation (μ=${current.mu.toFixed(4)} ≈ 0, regime transition)`
    } else {
      reason = `Stable fixed point (μ=${current.mu.toFixed(4)} < 0, calm regime)`
    }

    // Count regime transitions
    let transitions = 0
    for (let i = 1; i < sliding.length; i++) {
      if (sliding[i].regime !== sliding[i - 1].regime) transitions++
    }

    return {
      fullAR2, fullEigs, fullMaxMod, fullMu,
      sliding, current, signal, reason, transitions,
    }
  }, [candles, exchange, symbol, windowSize, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'OSCILLATORY' ? '#f59e0b' : data.signal === 'BIFURCATION' ? '#ef4444' : '#22c55e'
  const regimeColors = { STABLE: '#22c55e', BIFURCATION: '#ef4444', LIMIT_CYCLE: '#f59e0b' }

  // Bifurcation parameter over time
  const maxMu = Math.max(...data.sliding.map(s => Math.abs(s.mu)), 0.1)
  const sxMu = (i) => P + (i / data.sliding.length) * (W - 2 * P)
  const syMu = (v) => H - P - ((v + maxMu) / (2 * maxMu)) * (H - 2 * P)

  // Eigenvalue trajectory (complex plane)
  const maxEig = Math.max(...data.sliding.map(s => s.maxMod), 1.2)
  const sxEig = (v) => P + ((v + maxEig) / (2 * maxEig)) * (W - 2 * P)
  const syEig = (v) => H - P - ((v + maxEig) / (2 * maxEig)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Hopf Bifurcation Analysis — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(15, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(60, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Bifurcation parameter μ over time */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Bifurcation Parameter μ = |λ|_max - 1 (μ {'>'} 0 → limit cycle)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#475569" strokeWidth={1.5} strokeDasharray="4,3" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.sliding.map((s, i) => (
            <line key={i} x1={sxMu(i)} y1={H / 2} x2={sxMu(i)} y2={syMu(s.mu)} stroke={regimeColors[s.regime]} strokeWidth={2} opacity={0.7} />
          ))}

          <text x={W - P} y={H / 2 - 5} textAnchor="end" fill="#475569" fontSize={9}>μ = 0 (Hopf bifurcation)</text>
          <text x={W - P} y={20} textAnchor="end" fill="#f59e0b" fontSize={9}>μ {'>'} 0 (limit cycle)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>μ {'<'} 0 (stable)</text>
        </svg>
      </div>

      {/* Eigenvalue trajectory in complex plane */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Eigenvalue Trajectory (AR(2) characteristic roots in complex plane)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          {/* Unit circle */}
          <circle cx={sxEig(0)} cy={syEig(0)} r={(W - 2 * P) / (2 * maxEig) * 1.0} fill="none" stroke="#475569" strokeWidth={1.5} strokeDasharray="3,3" />

          <line x1={sxEig(-maxEig)} y1={syEig(0)} x2={sxEig(maxEig)} y2={syEig(0)} stroke="#334155" />
          <line x1={sxEig(0)} y1={syEig(-maxEig)} x2={sxEig(0)} y2={syEig(maxEig)} stroke="#334155" />

          {/* Eigenvalue points */}
          {data.sliding.map((s, i) => {
            const ar2 = { a1: s.a1, a2: s.a2 }
            const eigs = ar2Eigenvalues(ar2.a1, ar2.a2)
            return eigs.map((e, j) => (
              <circle key={`${i}-${j}`} cx={sxEig(e.re)} cy={syEig(e.im)} r={3} fill={regimeColors[s.regime]} opacity={0.5} />
            ))
          })}

          {/* Current eigenvalues */}
          {data.fullEigs.map((e, i) => (
            <circle key={`cur-${i}`} cx={sxEig(e.re)} cy={syEig(e.im)} r={6} fill="#fbbf24" stroke="#ef4444" strokeWidth={2} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#475569" fontSize={9}>unit circle |λ|=1</text>
          <text x={W - P} y={34} textAnchor="end" fill="#fbbf24" fontSize={9}>current eigenvalues</text>
        </svg>
      </div>

      {/* Regime classification */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Regime Classification Over Time</div>
        <svg width={W} height={60} className="bg-slate-900 rounded">
          {data.sliding.map((s, i) => {
            const x = sxMu(i)
            const w = Math.max(1, (W - 2 * P) / data.sliding.length - 0.5)
            return <rect key={i} x={x} y={10} width={w} height={40} fill={regimeColors[s.regime]} opacity={0.6} />
          })}
        </svg>
        <div className="flex items-center gap-4 mt-2 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: regimeColors.STABLE }} /><span className="text-slate-400">Stable (calm)</span></span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: regimeColors.BIFURCATION }} /><span className="text-slate-400">Bifurcation (transition)</span></span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: regimeColors.LIMIT_CYCLE }} /><span className="text-slate-400">Limit cycle (oscillatory)</span></span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">AR(2) a₁</div>
          <div className="text-cyan-400 font-mono">{data.fullAR2.a1.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">AR(2) a₂</div>
          <div className="text-emerald-400 font-mono">{data.fullAR2.a2.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">|λ|_max</div>
          <div className="text-amber-400 font-mono">{data.fullMaxMod.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">μ (bif. param)</div>
          <div className="text-purple-400 font-mono">{data.fullMu.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Transitions</div>
          <div className="text-red-400 font-mono">{data.transitions}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> AR(2):</strong> x_t = a₁x_{'{t-1}'} + a₂x_{'{t-2}'} + ε |
        <strong> Eigenvalues:</strong> λ² - a₁λ - a₂ = 0 |
        <strong> Hopf:</strong> |λ| crosses unit circle (μ = |λ| - 1) |
        <strong> Cycle:</strong> ω = arg(λ), A ∝ √μ |
        <strong> R²:</strong> {data.fullAR2.r2.toFixed(4)}
      </div>
    </div>
  )
}
