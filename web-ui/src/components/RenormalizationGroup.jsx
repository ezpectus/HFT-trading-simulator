import React, { useMemo, useState } from 'react'

// ─── Renormalization Group (Multi-Scale Market Dynamics) ────────────────────
// Applies renormalization group concepts from statistical physics to analyze
// market dynamics across multiple time scales, detecting scale-invariant
// behavior and phase transitions.
//
// Mathematical foundation:
//   Coarse-graining: aggregate n ticks → 1 super-tick
//   RG transformation: R_n[O] = O' where O' is measured at scale n
//
//   Scaling hypothesis: O(λ) = λ^κ · O(1)
//   where κ is the scaling exponent (critical exponent)
//
//   Correlation length: ξ ~ |T - T_c|^(-ν) (diverges near critical point)
//   For markets: ξ = time scale at which correlations decay
//
//   Beta function: β(g) = dg/dln(λ) (flow of coupling under RG)
//   Fixed points: β(g*) = 0 → scale-invariant behavior
//
//   Applications:
//   - Detect market "phase transitions" (calm → crisis)
//   - Identify scale-invariant regimes (power-law behavior)
//   - Multi-timeframe correlation structure

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Coarse-grain: aggregate n consecutive returns
const coarseGrain = (returns, n) => {
  const aggregated = []
  for (let i = 0; i + n <= returns.length; i += n) {
    const sum = returns.slice(i, i + n).reduce((a, b) => a + b, 0)
    aggregated.push(sum)
  }
  return aggregated
}

// Compute volatility at scale n
const volatilityAtScale = (returns, n) => {
  const cg = coarseGrain(returns, n)
  if (cg.length < 2) return 0
  const mean = cg.reduce((a, b) => a + b, 0) / cg.length
  return Math.sqrt(cg.reduce((s, r) => s + (r - mean) ** 2, 0) / cg.length)
}

// Compute kurtosis at scale n
const kurtosisAtScale = (returns, n) => {
  const cg = coarseGrain(returns, n)
  if (cg.length < 4) return 0
  const mean = cg.reduce((a, b) => a + b, 0) / cg.length
  const std = Math.sqrt(cg.reduce((s, r) => s + (r - mean) ** 2, 0) / cg.length)
  if (std === 0) return 0
  const kurt = cg.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / cg.length - 3
  return kurt
}

// Compute autocorrelation at lag k
const autocorrelation = (returns, lag) => {
  const n = returns.length
  if (n < lag + 2) return 0
  const mean = returns.reduce((a, b) => a + b, 0) / n
  let cov = 0, var0 = 0, varLag = 0
  for (let i = 0; i < n - lag; i++) {
    cov += (returns[i] - mean) * (returns[i + lag] - mean)
    var0 += (returns[i] - mean) ** 2
    varLag += (returns[i + lag] - mean) ** 2
  }
  return (var0 > 0 && varLag > 0) ? cov / Math.sqrt(var0 * varLag) : 0
}

// Scaling exponent via log-log regression
const scalingExponent = (scales, values) => {
  const logS = scales.map(s => Math.log(s))
  const logV = values.map(v => Math.log(Math.max(1e-10, v)))
  const n = logS.length
  const meanX = logS.reduce((a, b) => a + b, 0) / n
  const meanY = logV.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (logS[i] - meanX) * (logV[i] - meanY)
    den += (logS[i] - meanX) ** 2
  }
  return den > 0 ? num / den : 0
}

// Correlation length estimation
const correlationLength = (returns) => {
  for (let lag = 1; lag < 20; lag++) {
    const ac = Math.abs(autocorrelation(returns, lag))
    if (ac < 0.1) return lag // decay threshold
  }
  return 20
}

export default function RenormalizationGroup({ candles, symbol, exchange }) {
  const [maxScale, setMaxScale] = useState(20)
  const [lookback, setLookback] = useState(200)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Multi-scale analysis
    const scales = []
    for (let n = 1; n <= maxScale; n++) {
      const vol = volatilityAtScale(returns, n)
      const kurt = kurtosisAtScale(returns, n)
      const ac1 = autocorrelation(coarseGrain(returns, n), 1)
      scales.push({ n, vol, kurt, ac1 })
    }

    // Scaling exponents
    const volScaling = scalingExponent(
      scales.map(s => s.n),
      scales.map(s => s.vol)
    )
    const kurtScaling = scalingExponent(
      scales.filter(s => s.kurt > 0).map(s => s.n),
      scales.filter(s => s.kurt > 0).map(s => s.kurt)
    )

    // Correlation length at different scales
    const corrLengths = []
    for (let n = 1; n <= Math.min(10, maxScale); n++) {
      const cg = coarseGrain(returns, n)
      corrLengths.push({ n, xi: correlationLength(cg) })
    }

    // RG flow: coupling strength (volatility) vs scale
    const rgFlow = scales.map(s => ({
      scale: s.n,
      g: s.vol / Math.sqrt(s.n), // normalized coupling
    }))

    // Fixed point detection: where dg/dln(λ) ≈ 0
    const fixedPoints = []
    for (let i = 1; i < rgFlow.length - 1; i++) {
      const dgPrev = rgFlow[i].g - rgFlow[i - 1].g
      const dgNext = rgFlow[i + 1].g - rgFlow[i].g
      if (Math.abs(dgPrev) < 0.001 && Math.abs(dgNext) < 0.001) {
        fixedPoints.push(rgFlow[i])
      }
    }

    // Phase transition detection: sudden change in kurtosis
    const kurtChanges = []
    for (let i = 1; i < scales.length; i++) {
      const delta = Math.abs(scales[i].kurt - scales[i - 1].kurt)
      kurtChanges.push({ scale: scales[i].n, delta })
    }
    const maxKurtChange = kurtChanges.reduce((max, k) => k.delta > max.delta ? k : max, kurtChanges[0] || { scale: 0, delta: 0 })

    // Current correlation length
    const currentXi = corrLengths[0]?.xi || 0

    // Signal
    let signal = 'NORMAL'
    let reason = ''
    if (maxKurtChange.delta > 5) {
      signal = 'PHASE_TRANSITION'
      reason = `Large kurtosis change at scale ${maxKurtChange.scale} (Δκ=${maxKurtChange.delta.toFixed(2)}) — possible phase transition`
    } else if (volScaling < 0.45) {
      signal = 'SUBDIFFUSIVE'
      reason = `Vol scaling exponent κ = ${volScaling.toFixed(3)} < 0.5 (sub-diffusive, mean-reverting)`
    } else if (volScaling > 0.55) {
      signal = 'SUPERDIFFUSIVE'
      reason = `Vol scaling exponent κ = ${volScaling.toFixed(3)} > 0.5 (super-diffusive, trending)`
    } else {
      reason = `Vol scaling exponent κ = ${volScaling.toFixed(3)} ≈ 0.5 (diffusive, efficient market)`
    }

    // Scale-invariant regime check
    const isScaleInvariant = Math.abs(volScaling - 0.5) < 0.05 && fixedPoints.length > 0

    return {
      scales, volScaling, kurtScaling,
      corrLengths, rgFlow, fixedPoints,
      maxKurtChange, currentXi,
      signal, reason, isScaleInvariant,
    }
  }, [candles, exchange, symbol, maxScale, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'PHASE_TRANSITION' ? '#ef4444' : data.signal === 'SUBDIFFUSIVE' ? '#06b6d4' : data.signal === 'SUPERDIFFUSIVE' ? '#f59e0b' : '#22c55e'

  // Volatility scaling (log-log)
  const maxVol = Math.max(...data.scales.map(s => s.vol), 0.001)
  const sxScale = (n) => P + (Math.log(n) / Math.log(maxScale)) * (W - 2 * P)
  const syVol = (v) => H - P - (Math.log(Math.max(1e-10, v)) / Math.log(Math.max(1e-10, maxVol))) * (H - 2 * P)

  // RG flow
  const maxG = Math.max(...data.rgFlow.map(r => r.g), 0.001)
  const syG = (v) => H - P - (v / maxG) * (H - 2 * P)

  // Correlation length
  const maxXi = Math.max(...data.corrLengths.map(c => c.xi), 1)
  const syXi = (v) => H - P - (v / maxXi) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Renormalization Group (Multi-Scale) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
        {data.isScaleInvariant && (
          <span className="px-2 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">SCALE-INVARIANT</span>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max scale:</span>
          <input type="number" value={maxScale} onChange={e => setMaxScale(Math.max(5, Math.min(50, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Volatility scaling (log-log) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Volatility Scaling: log(σ_n) vs log(n) — exponent κ = {data.volScaling.toFixed(4)}</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Data points */}
          {data.scales.map((s, i) => (
            <circle key={i} cx={sxScale(s.n)} cy={syVol(s.vol)} r={3} fill="#06b6d4" opacity={0.7} />
          ))}

          {/* Power-law fit line */}
          {(() => {
            const n1 = 1, n2 = maxScale
            const v1 = data.scales[0].vol
            const v2 = v1 * Math.pow(n2 / n1, data.volScaling)
            return <line x1={sxScale(n1)} y1={syVol(v1)} x2={sxScale(n2)} y2={syVol(v2)} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5,3" />
          })()}

          {/* Reference: κ=0.5 (diffusive) */}
          {(() => {
            const n1 = 1, n2 = maxScale
            const v1 = data.scales[0].vol
            const v2 = v1 * Math.pow(n2 / n1, 0.5)
            return <line x1={sxScale(n1)} y1={syVol(v1)} x2={sxScale(n2)} y2={syVol(v2)} stroke="#22c55e" strokeWidth={1} strokeDasharray="2,2" opacity={0.5} />
          })()}

          <text x={W - P} y={20} textAnchor="end" fill="#f59e0b" fontSize={9}>Power-law fit (κ={data.volScaling.toFixed(3)})</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>Diffusive reference (κ=0.5)</text>
        </svg>
      </div>

      {/* RG flow */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">RG Flow: coupling g(n) = σ_n/√n vs scale n</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.rgFlow.map((r, i) => `${i === 0 ? 'M' : 'L'} ${sxScale(r.scale)} ${syG(r.g)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={2} />

          {/* Fixed points */}
          {data.fixedPoints.map((fp, i) => (
            <g key={i}>
              <circle cx={sxScale(fp.scale)} cy={syG(fp.g)} r={6} fill="#22c55e" stroke="#fbbf24" strokeWidth={2} />
              <text x={sxScale(fp.scale) + 8} y={syG(fp.g) - 8} fill="#22c55e" fontSize={9}>FP (n={fp.scale})</text>
            </g>
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>RG flow g(n)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>Fixed points: {data.fixedPoints.length}</text>
        </svg>
      </div>

      {/* Correlation length vs scale */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Correlation Length ξ vs Coarse-Graining Scale</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.corrLengths.map((c, i) => (
            <g key={i}>
              <rect x={sxScale(c.n) - 8} y={syXi(c.xi)} width={16} height={H - P - syXi(c.xi)} fill="#06b6d4" opacity={0.6} />
              <text x={sxScale(c.n)} y={H - P + 12} textAnchor="middle" fill="#94a3b8" fontSize={8}>n={c.n}</text>
            </g>
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>ξ(n) — correlation length</text>
        </svg>
      </div>

      {/* Multi-scale statistics table */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Multi-Scale Statistics</div>
        <div className="space-y-1 max-h-32 overflow-auto">
          {data.scales.map((s, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-12">n={s.n}</span>
              <span className="text-cyan-400 font-mono w-24">σ: {s.vol.toFixed(6)}</span>
              <span className="text-amber-400 font-mono w-20">κ: {s.kurt.toFixed(3)}</span>
              <span className="text-purple-400 font-mono w-20">AC1: {s.ac1.toFixed(4)}</span>
              <span className="text-slate-500 font-mono w-20">g: {(s.vol / Math.sqrt(s.n)).toFixed(6)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Vol scaling κ</div>
          <div className="text-cyan-400 font-mono">{data.volScaling.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Kurt scaling</div>
          <div className="text-amber-400 font-mono">{data.kurtScaling.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Corr. length ξ</div>
          <div className="text-purple-400 font-mono">{data.currentXi}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Fixed points</div>
          <div className="text-emerald-400 font-mono">{data.fixedPoints.length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Max Δκurt</div>
          <div className="text-red-400 font-mono">{data.maxKurtChange.delta.toFixed(2)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> RG:</strong> coarse-graining (n-tick aggregation) |
        <strong> Scaling:</strong> σ(λ) = λ^κ · σ(1) |
        <strong> Fixed points:</strong> β(g*) = 0 → scale-invariant |
        <strong> Phase transition:</strong> Δκurt at scale {data.maxKurtChange.scale}
      </div>
    </div>
  )
}
