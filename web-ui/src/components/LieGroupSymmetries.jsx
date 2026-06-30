import React, { useMemo, useState } from 'react'

// ─── Lie Group Symmetries (Symmetry-Based Market Analysis) ──────────────────
// Analyzes financial time series through the lens of Lie group symmetries,
// detecting invariant structures and symmetry-breaking events that signal
// regime changes.
//
// Mathematical foundation:
//   Lie group: continuous group of transformations G acting on data space
//   Lie algebra: tangent space at identity, generators X_i
//
//   Key symmetries for financial data:
//   1. Translation: T_a: x → x + a (price level invariance)
//   2. Scaling: D_λ: x → λx (volatility scaling)
//   3. Time translation: τ_s: t → t + s (stationarity)
//   4. Galilean: x → x + v·t (trend invariance)
//
//   Noether's theorem: each continuous symmetry → conserved quantity
//   Translation → momentum (mean)
//   Scaling → renormalized variance
//   Time → energy (volatility)
//
//   Symmetry breaking: when conserved quantities change → regime shift
//
//   Infinitesimal generator: X = ξ(x)·∂/∂x
//   Invariant: X·f = 0 (f is invariant under group action)

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Check translation symmetry: mean should be conserved
const translationSymmetry = (returns, windowSize) => {
  const results = []
  for (let i = 0; i + windowSize <= returns.length; i += Math.max(1, Math.floor(windowSize / 2))) {
    const window = returns.slice(i, i + windowSize)
    const mean = window.reduce((a, b) => a + b, 0) / window.length
    results.push({ idx: i, mean, conserved: mean })
  }
  // Measure symmetry breaking: variance of means
  const means = results.map(r => r.mean)
  const overallMean = means.reduce((a, b) => a + b, 0) / means.length
  const breaking = Math.sqrt(means.reduce((s, m) => s + (m - overallMean) ** 2, 0) / means.length)
  return { results, breaking, conserved: overallMean }
}

// Check scaling symmetry: std/mean ratio should be conserved
const scalingSymmetry = (returns, windowSize) => {
  const results = []
  for (let i = 0; i + windowSize <= returns.length; i += Math.max(1, Math.floor(windowSize / 2))) {
    const window = returns.slice(i, i + windowSize)
    const mean = window.reduce((a, b) => a + b, 0) / window.length
    const std = Math.sqrt(window.reduce((s, r) => s + (r - mean) ** 2, 0) / window.length)
    const ratio = std / (Math.abs(mean) + 1e-10)
    results.push({ idx: i, std, mean, ratio })
  }
  const ratios = results.map(r => r.ratio)
  const meanRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length
  const breaking = Math.sqrt(ratios.reduce((s, r) => s + (r - meanRatio) ** 2, 0) / ratios.length)
  return { results, breaking, conserved: meanRatio }
}

// Check time translation symmetry: autocorrelation structure
const timeTranslationSymmetry = (returns, windowSize, lag = 1) => {
  const results = []
  for (let i = 0; i + windowSize + lag <= returns.length; i += Math.max(1, Math.floor(windowSize / 2))) {
    const window = returns.slice(i, i + windowSize)
    const n = window.length
    const mean = window.reduce((a, b) => a + b, 0) / n
    let cov = 0, var0 = 0
    for (let j = 0; j < n - lag; j++) {
      cov += (window[j] - mean) * (window[j + lag] - mean)
      var0 += (window[j] - mean) ** 2
    }
    const acf = var0 > 0 ? cov / var0 : 0
    results.push({ idx: i, acf })
  }
  const acfs = results.map(r => r.acf)
  const meanAcf = acfs.reduce((a, b) => a + b, 0) / acfs.length
  const breaking = Math.sqrt(acfs.reduce((s, a) => s + (a - meanAcf) ** 2, 0) / acfs.length)
  return { results, breaking, conserved: meanAcf }
}

// Check Galilean symmetry (trend invariance): detrended variance
const galileanSymmetry = (returns, windowSize) => {
  const results = []
  for (let i = 0; i + windowSize <= returns.length; i += Math.max(1, Math.floor(windowSize / 2))) {
    const window = returns.slice(i, i + windowSize)
    const n = window.length
    // Linear regression: r = a + b*t
    const tMean = (n - 1) / 2
    const rMean = window.reduce((a, b) => a + b, 0) / n
    let num = 0, den = 0
    for (let j = 0; j < n; j++) {
      num += (j - tMean) * (window[j] - rMean)
      den += (j - tMean) ** 2
    }
    const slope = den > 0 ? num / den : 0
    // Detrended residuals
    const residuals = window.map((r, j) => r - rMean - slope * (j - tMean))
    const detrendedVar = residuals.reduce((s, r) => s + r * r, 0) / n
    results.push({ idx: i, slope, detrendedVar })
  }
  const vars = results.map(r => r.detrendedVar)
  const meanVar = vars.reduce((a, b) => a + b, 0) / vars.length
  const breaking = Math.sqrt(vars.reduce((s, v) => s + (v - meanVar) ** 2, 0) / vars.length)
  return { results, breaking, conserved: meanVar }
}

// Lie algebra generator coefficients (infinitesimal)
const lieAlgebraCoeffs = (returns, windowSize) => {
  const results = []
  for (let i = 0; i + windowSize <= returns.length; i += Math.max(1, Math.floor(windowSize / 2))) {
    const window = returns.slice(i, i + windowSize)
    const n = window.length
    const mean = window.reduce((a, b) => a + b, 0) / n
    const std = Math.sqrt(window.reduce((s, r) => s + (r - mean) ** 2, 0) / n)

    // Generator coefficients (simplified)
    const e1 = mean // translation generator
    const e2 = std // scaling generator
    const e3 = mean / (std + 1e-10) // Sharpe-like (combined)

    results.push({ idx: i, e1, e2, e3 })
  }
  return results
}

export default function LieGroupSymmetries({ candles, symbol, exchange }) {
  const [windowSize, setWindowSize] = useState(20)
  const [lookback, setLookback] = useState(100)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Compute all symmetries
    const trans = translationSymmetry(returns, windowSize)
    const scaling = scalingSymmetry(returns, windowSize)
    const timeTrans = timeTranslationSymmetry(returns, windowSize, 1)
    const galilean = galileanSymmetry(returns, windowSize)
    const lieCoeffs = lieAlgebraCoeffs(returns, windowSize)

    // Overall symmetry breaking score
    const totalBreaking = (trans.breaking + scaling.breaking + timeTrans.breaking + galilean.breaking) / 4

    // Current Lie algebra coefficients
    const current = lieCoeffs[lieCoeffs.length - 1]

    // Signal: symmetry breaking → regime change
    let signal = 'SYMMETRIC'
    let reason = ''
    if (totalBreaking > 0.01) {
      signal = 'SYMMETRY_BROKEN'
      reason = `High symmetry breaking (score=${totalBreaking.toFixed(6)}) — regime change likely`
    } else if (totalBreaking > 0.005) {
      signal = 'WEAK_BREAKING'
      reason = `Moderate symmetry breaking (score=${totalBreaking.toFixed(6)})`
    } else {
      reason = `Low symmetry breaking (score=${totalBreaking.toFixed(6)}) — stable regime`
    }

    // Noether conserved quantities
    const noether = {
      momentum: trans.conserved, // translation → momentum
      scalingRatio: scaling.conserved, // scaling → normalized variance
      correlation: timeTrans.conserved, // time → ACF
      detrendedVar: galilean.conserved, // Galilean → residual variance
    }

    // Identify which symmetry is most broken
    const breakingScores = [
      { name: 'Translation', value: trans.breaking, color: '#06b6d4' },
      { name: 'Scaling', value: scaling.breaking, color: '#f59e0b' },
      { name: 'Time Trans.', value: timeTrans.breaking, color: '#a855f7' },
      { name: 'Galilean', value: galilean.breaking, color: '#22c55e' },
    ]
    breakingScores.sort((a, b) => b.value - a.value)

    return {
      trans, scaling, timeTrans, galilean, lieCoeffs,
      totalBreaking, current, signal, reason, noether,
      breakingScores, returns,
    }
  }, [candles, exchange, symbol, windowSize, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'SYMMETRY_BROKEN' ? '#ef4444' : data.signal === 'WEAK_BREAKING' ? '#f59e0b' : '#22c55e'

  // Lie algebra coefficients over time
  const allE1 = data.lieCoeffs.map(c => c.e1)
  const allE2 = data.lieCoeffs.map(c => c.e2)
  const allE3 = data.lieCoeffs.map(c => c.e3)
  const maxE = Math.max(...allE1.map(Math.abs), ...allE2, ...allE3.map(Math.abs), 0.1)
  const sxLC = (i) => P + (i / data.lieCoeffs.length) * (W - 2 * P)
  const syLC = (v) => H - P - ((v + maxE) / (2 * maxE)) * (H - 2 * P)

  // Symmetry breaking bars
  const maxBreak = Math.max(...data.breakingScores.map(s => s.value), 0.001)
  const sxBreak = (i) => P + (i / data.breakingScores.length) * (W - 2 * P)
  const syBreak = (v) => H - P - (v / maxBreak) * (H - 2 * P)

  // Conserved quantities over time (translation)
  const transMeans = data.trans.results.map(r => r.mean)
  const maxMean = Math.max(...transMeans.map(Math.abs), 0.001)
  const sxT = (i) => P + (i / transMeans.length) * (W - 2 * P)
  const syT = (v) => H - P - ((v + maxMean) / (2 * maxMean)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Lie Group Symmetries — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(10, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(40, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Symmetry breaking comparison */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Symmetry Breaking Scores (most broken → least)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.breakingScores.map((s, i) => (
            <g key={i}>
              <rect x={sxBreak(i) + 20} y={syBreak(s.value)} width={80} height={H - P - syBreak(s.value)} fill={s.color} opacity={0.7} />
              <text x={sxBreak(i) + 60} y={H - P + 12} textAnchor="middle" fill={s.color} fontSize={9}>{s.name}</text>
              <text x={sxBreak(i) + 60} y={syBreak(s.value) - 5} textAnchor="middle" fill={s.color} fontSize={8}>{s.value.toFixed(6)}</text>
            </g>
          ))}
        </svg>
      </div>

      {/* Lie algebra coefficients */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Lie Algebra Generator Coefficients Over Time</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.lieCoeffs.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxLC(i)} ${syLC(c.e1)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={1.5} />
          <path d={data.lieCoeffs.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxLC(i)} ${syLC(c.e2)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={1.5} />
          <path d={data.lieCoeffs.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxLC(i)} ${syLC(c.e3)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={1.5} />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>e₁ (translation: mean)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>e₂ (scaling: std)</text>
          <text x={W - P} y={48} textAnchor="end" fill="#a855f7" fontSize={9}>e₃ (Sharpe-like)</text>
        </svg>
      </div>

      {/* Conserved quantities (Noether) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Noether Conserved Quantities (symmetry → conservation law)</div>
        <div className="space-y-1">
          {[
            { label: 'Translation → Momentum (mean)', value: data.noether.momentum, color: '#06b6d4' },
            { label: 'Scaling → Normalized Variance', value: data.noether.scalingRatio, color: '#f59e0b' },
            { label: 'Time Trans. → Autocorrelation', value: data.noether.correlation, color: '#a855f7' },
            { label: 'Galilean → Detrended Variance', value: data.noether.detrendedVar, color: '#22c55e' },
          ].map((n, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-48">{n.label}</span>
              <span className="font-mono w-24" style={{ color: n.color }}>{n.value.toFixed(6)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Translation symmetry (conserved mean over time) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Translation Symmetry: Conserved Mean (momentum) Over Time</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.trans.results.map((r, i) => (
            <line key={i} x1={sxT(i)} y1={H / 2} x2={sxT(i)} y2={syT(r.mean)} stroke={r.mean > 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} opacity={0.7} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>Positive momentum</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>Negative momentum</text>
          <text x={W - P} y={48} textAnchor="end" fill="#06b6d4" fontSize={9}>Breaking: {data.trans.breaking.toFixed(6)}</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Total breaking</div>
          <div className="text-cyan-400 font-mono">{data.totalBreaking.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Most broken</div>
          <div className="text-amber-400 font-mono text-[10px]">{data.breakingScores[0].name}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">e₁ (mean)</div>
          <div className="text-purple-400 font-mono">{data.current.e1.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">e₂ (std)</div>
          <div className="text-emerald-400 font-mono">{data.current.e2.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">e₃ (Sharpe)</div>
          <div className="text-slate-300 font-mono">{data.current.e3.toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Symmetries:</strong> Translation (T_a), Scaling (D_λ), Time (τ_s), Galilean |
        <strong> Noether:</strong> each symmetry → conserved quantity |
        <strong> Breaking:</strong> variance of conserved quantities across windows |
        <strong> Lie algebra:</strong> generators e₁=mean, e₂=std, e₃=mean/std
      </div>
    </div>
  )
}
