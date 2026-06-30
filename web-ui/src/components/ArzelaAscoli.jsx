import React, { useMemo, useState } from 'react'

// --- Arzela-Ascoli Theorem (Equicontinuity for Function Families) ---
// Applies the Arzela-Ascoli theorem to analyze families of trading
// indicator functions, detecting convergence and compactness properties.
//
// Mathematical foundation:
//   Arzela-Ascoli: A family F of continuous functions on [a,b] is
//   relatively compact in C([a,b]) iff F is:
//   1. Pointwise bounded: |f(x)| <= M for all f in F, x in [a,b]
//   2. Equicontinuous: for all eps > 0, exists delta > 0 such that
//      |x-y| < delta implies |f(x)-f(y)| < eps for all f in F
//
//   Modulus of continuity: omega_f(delta) = sup{|f(x)-f(y)| : |x-y|<delta}
//   Family is equicontinuous iff sup_{f in F} omega_f(delta) -> 0 as delta -> 0
//
//   Applications: indicator convergence analysis, compactness of
//   strategy families, overfitting detection (non-equicontinuous = overfit)

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Compute indicator function values
const computeIndicator = (returns, type, param) => {
  const n = returns.length
  const result = new Array(n).fill(0)
  if (type === 'sma') {
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - param + 1)
      const window = returns.slice(start, i + 1)
      result[i] = window.reduce((a, b) => a + b, 0) / window.length
    }
  } else if (type === 'ema') {
    const alpha = 2 / (param + 1)
    result[0] = returns[0]
    for (let i = 1; i < n; i++) {
      result[i] = alpha * returns[i] + (1 - alpha) * result[i - 1]
    }
  } else if (type === 'wma') {
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - param + 1)
      let sum = 0, wsum = 0
      for (let j = start; j <= i; j++) {
        const w = j - start + 1
        sum += returns[j] * w
        wsum += w
      }
      result[i] = sum / wsum
    }
  } else if (type === 'rsi') {
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - param + 1)
      const window = returns.slice(start, i + 1)
      let gains = 0, losses = 0
      for (let j = 1; j < window.length; j++) {
        if (window[j] > 0) gains += window[j]
        else losses -= window[j]
      }
      const rs = losses === 0 ? 100 : gains / (losses + 1e-10)
      result[i] = 100 - 100 / (1 + rs)
    }
  }
  return result
}

// Modulus of continuity
const modulusOfContinuity = (func, deltas) => {
  const n = func.length
  return deltas.map(delta => {
    let maxDiff = 0
    for (let i = 0; i < n; i++) {
      for (let j = Math.max(0, i - delta); j < Math.min(n, i + delta + 1); j++) {
        if (i !== j) {
          const diff = Math.abs(func[i] - func[j])
          if (diff > maxDiff) maxDiff = diff
        }
      }
    }
    return { delta, omega: maxDiff }
  })
}

export default function ArzelaAscoli({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(120)
  const [indicatorType, setIndicatorType] = useState('sma')
  const [maxParam, setMaxParam] = useState(20)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    const n = returns.length
    if (n < maxParam * 3) return null

    // Generate family of indicator functions with varying parameters
    const params = []
    for (let p = 2; p <= maxParam; p += 2) {
      params.push(p)
    }

    const family = params.map(p => ({
      param: p,
      values: computeIndicator(returns, indicatorType, p),
    }))

    // Pointwise boundedness check
    const allVals = family.flatMap(f => f.values)
    const M = Math.max(...allVals.map(Math.abs))
    const pointwiseBounded = M < 1000 // reasonable bound

    // Equicontinuity: compute modulus of continuity for each function
    const deltas = [1, 2, 3, 5, 8, 13, 21]
    const moduli = family.map(f => ({
      param: f.param,
      modulus: modulusOfContinuity(f.values, deltas),
    }))

    // Family modulus: sup over all functions
    const familyModulus = deltas.map(delta => {
      let maxOmega = 0
      for (const m of moduli) {
        const om = m.modulus.find(d => d.delta === delta)
        if (om && om.omega > maxOmega) maxOmega = om.omega
      }
      return { delta, omega: maxOmega }
    })

    // Check equicontinuity: omega(delta) -> 0 as delta -> 0
    const smallDeltaOmega = familyModulus[0].omega
    const equicontinuous = smallDeltaOmega < 0.1

    // Compactness score: ratio of family modulus at delta=1 to delta=max
    const compactnessRatio = familyModulus[0].omega / (familyModulus[familyModulus.length - 1].omega + 1e-10)

    // Overfitting detection: high-frequency indicators (small param) that are
    // not equicontinuous with the family suggest overfitting
    const individualModuli = moduli.map(m => ({
      param: m.param,
      omega1: m.modulus[0].omega,
      omegaMax: m.modulus[m.modulus.length - 1].omega,
      ratio: m.modulus[0].omega / (m.modulus[m.modulus.length - 1].omega + 1e-10),
    }))

    // Find outliers (non-equicontinuous members)
    const avgOmega1 = individualModuli.reduce((s, m) => s + m.omega1, 0) / individualModuli.length
    const outliers = individualModuli.filter(m => m.omega1 > 2 * avgOmega1)

    // Signal
    let signal = 'COMPACT_FAMILY'
    let reason = ''
    if (!pointwiseBounded) {
      signal = 'NOT_BOUNDED'
      reason = `Family not pointwise bounded (M=${M.toFixed(4)}), Arzela-Ascoli fails`
    } else if (!equicontinuous) {
      signal = 'NOT_EQUICONTINUOUS'
      reason = `Family not equicontinuous (omega(1)=${smallDeltaOmega.toFixed(6)}), possible overfitting`
    } else if (outliers.length > 0) {
      signal = 'OUTLIERS_DETECTED'
      reason = `${outliers.length} indicator(s) break equicontinuity (params: ${outliers.map(o => o.param).join(', ')})`
    } else {
      reason = `Family is relatively compact (bounded M=${M.toFixed(4)}, equicontinuous omega(1)=${smallDeltaOmega.toFixed(6)})`
    }

    return {
      family, moduli, familyModulus,
      M, pointwiseBounded, equicontinuous,
      compactnessRatio, individualModuli, outliers,
      signal, reason, params,
    }
  }, [candles, exchange, symbol, lookback, indicatorType, maxParam])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'COMPACT_FAMILY' ? '#22c55e' : data.signal === 'OUTLIERS_DETECTED' ? '#f59e0b' : '#ef4444'

  // Indicator family
  const allVals = data.family.flatMap(f => f.values)
  const maxY = Math.max(...allVals, 0.1)
  const minY = Math.min(...allVals, -0.1)
  const sxI = (i) => P + (i / data.family[0].values.length) * (W - 2 * P)
  const syI = (v) => H - P - ((v - minY) / (maxY - minY + 0.001)) * (H - 2 * P)

  // Modulus of continuity
  const maxOmega = Math.max(...data.familyModulus.map(m => m.omega), 0.001)
  const sxM = (i) => P + (i / data.familyModulus.length) * (W - 2 * P)
  const syM = (v) => H - P - (v / maxOmega) * (H - 2 * P)

  // Individual moduli
  const maxIndOmega = Math.max(...data.individualModuli.map(m => m.omega1), 0.001)
  const sxP = (i) => P + (i / data.individualModuli.length) * (W - 2 * P)
  const syP = (v) => H - P - (v / maxIndOmega) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Arzela-Ascoli Theorem (Equicontinuity) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Indicator:</span>
          <select value={indicatorType} onChange={e => setIndicatorType(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="sma">SMA</option>
            <option value="ema">EMA</option>
            <option value="wma">WMA</option>
            <option value="rsi">RSI</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max param:</span>
          <input type="number" value={maxParam} onChange={e => setMaxParam(Math.max(6, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(60, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Indicator family */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Indicator Family F = {'{f_p : p=2,4,...,' + maxParam + '}'} (varying parameter)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.family.map((f, i) => (
            <path key={i} d={f.values.map((v, j) => `${j === 0 ? 'M' : 'L'} ${sxI(j)} ${syI(v)}`).join(' ')} fill="none" stroke={`hsl(${200 + i * 20}, 70%, 60%)`} strokeWidth={1} opacity={0.6} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#475569" fontSize={9}>{data.family.length} indicator functions</text>
        </svg>
      </div>

      {/* Family modulus of continuity */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Family Modulus of Continuity: omega_F(delta) = sup_f omega_f(delta) (equicontinuity check)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.familyModulus.map((m, i) => `${i === 0 ? 'M' : 'L'} ${sxM(i)} ${syM(m.omega)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={2.5} />

          {data.familyModulus.map((m, i) => (
            <circle key={i} cx={sxM(i)} cy={syM(m.omega)} r={3} fill="#a855f7" />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>omega_F(delta) family modulus</text>
          <text x={W - P} y={34} textAnchor="end" fill={data.equicontinuous ? '#22c55e' : '#ef4444'} fontSize={9}>{data.equicontinuous ? 'equicontinuous (omega->0)' : 'NOT equicontinuous'}</text>
        </svg>
      </div>

      {/* Individual moduli */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Individual omega(1) per parameter (outliers = overfitting candidates)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Average line */}
          <line x1={P} y1={syP(data.individualModuli.reduce((s, m) => s + m.omega1, 0) / data.individualModuli.length)} x2={W - P} y2={syP(data.individualModuli.reduce((s, m) => s + m.omega1, 0) / data.individualModuli.length)} stroke="#475569" strokeWidth={1} strokeDasharray="3,3" />

          {data.individualModuli.map((m, i) => (
            <line key={i} x1={sxP(i) + 10} y1={H - P} x2={sxP(i) + 10} y2={syP(m.omega1)} stroke={m.omega1 > 2 * data.individualModuli.reduce((s, x) => s + x.omega1, 0) / data.individualModuli.length ? '#ef4444' : '#06b6d4'} strokeWidth={3} opacity={0.7} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>omega(1) per param</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>outlier (overfitting)</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Bound M</div>
          <div className="text-cyan-400 font-mono">{data.M.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">omega_F(1)</div>
          <div className="text-purple-400 font-mono">{data.familyModulus[0].omega.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Bounded</div>
          <div className="font-mono" style={{ color: data.pointwiseBounded ? '#22c55e' : '#ef4444' }}>{data.pointwiseBounded ? 'YES' : 'NO'}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Equicont.</div>
          <div className="font-mono" style={{ color: data.equicontinuous ? '#22c55e' : '#ef4444' }}>{data.equicontinuous ? 'YES' : 'NO'}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Outliers</div>
          <div className="text-amber-400 font-mono">{data.outliers.length}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Arzela-Ascoli:</strong> F relatively compact iff bounded + equicontinuous |
        <strong> Modulus:</strong> omega_f(delta) = sup|f(x)-f(y)| for |x-y|{'<'}delta |
        <strong> Equicontinuity:</strong> sup_f omega_f(delta) -{'>'} 0 as delta -{'>'} 0 |
        <strong> Overfitting:</strong> non-equicontinuous indicators = overfitting candidates
      </div>
    </div>
  )
}
