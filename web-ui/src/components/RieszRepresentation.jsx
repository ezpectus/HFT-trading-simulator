import React, { useMemo, useState } from 'react'

// --- Riesz Representation (Linear Functional as Integral) ---
// Uses the Riesz representation theorem to represent linear functionals
// on Hilbert spaces as inner products, enabling optimal signal extraction.
//
// Mathematical foundation:
//   Riesz (Hilbert): For every bounded linear functional L on H,
//   there exists unique u in H such that L(f) = <f, u> for all f in H
//   and ||L|| = ||u||
//
//   Riesz (Lp): For every bounded linear functional L on Lp,
//   there exists unique g in Lq (1/p + 1/q = 1) such that
//   L(f) = integral f(x) g(x) dx
//
//   Riesz-Markov: For every positive linear functional L on C(X),
//   there exists unique measure mu such that L(f) = integral f d(mu)
//
//   Applications: optimal signal extraction, representer theorem,
//   dual space analysis, feature importance via Riesz representer

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

export default function RieszRepresentation({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(120)
  const [nFeatures, setNFeatures] = useState(8)
  const [lambda, setLambda] = useState(0.1)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    const n = returns.length
    if (n < nFeatures * 3) return null

    // Build feature matrix: lagged returns as features
    const X = []
    const y = []
    for (let i = nFeatures; i < n; i++) {
      const features = []
      for (let j = 1; j <= nFeatures; j++) {
        features.push(returns[i - j])
      }
      X.push(features)
      y.push(returns[i])
    }

    const N = X.length

    // Linear functional: L(f) = E[f(X) * Y] (correlation with future return)
    // Riesz representer: u = (K + lambda*I)^{-1} * L
    // where K = X^T X / N (Gram matrix), L = X^T y / N

    // Compute Gram matrix K
    const K = Array.from({ length: nFeatures }, () => new Array(nFeatures).fill(0))
    for (let i = 0; i < nFeatures; i++) {
      for (let j = 0; j < nFeatures; j++) {
        let sum = 0
        for (let k = 0; k < N; k++) sum += X[k][i] * X[k][j]
        K[i][j] = sum / N
      }
    }

    // Compute L = X^T y / N
    const L = new Array(nFeatures).fill(0)
    for (let i = 0; i < nFeatures; i++) {
      let sum = 0
      for (let k = 0; k < N; k++) sum += X[k][i] * y[k]
      L[i] = sum / N
    }

    // Solve (K + lambda*I) u = L using Gaussian elimination
    const A = K.map((row, i) => row.map((v, j) => v + (i === j ? lambda : 0)))
    const b = L.slice()

    // Gaussian elimination
    for (let i = 0; i < nFeatures; i++) {
      let maxRow = i
      for (let k = i + 1; k < nFeatures; k++) {
        if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k
      }
      [A[i], A[maxRow]] = [A[maxRow], A[i]]
      ;[b[i], b[maxRow]] = [b[maxRow], b[i]]

      if (Math.abs(A[i][i]) < 1e-12) continue

      for (let k = i + 1; k < nFeatures; k++) {
        const factor = A[k][i] / A[i][i]
        for (let j = i; j < nFeatures; j++) A[k][j] -= factor * A[i][j]
        b[k] -= factor * b[i]
      }
    }

    // Back substitution
    const u = new Array(nFeatures).fill(0)
    for (let i = nFeatures - 1; i >= 0; i--) {
      let sum = b[i]
      for (let j = i + 1; j < nFeatures; j++) sum -= A[i][j] * u[j]
      u[i] = Math.abs(A[i][i]) > 1e-12 ? sum / A[i][i] : 0
    }

    // Riesz representer u: L(f) = <f, u> for all f in H
    // Feature importance = |u_i| (Riesz weights)
    const featureImportance = u.map((v, i) => ({ lag: i + 1, weight: v, absWeight: Math.abs(v) }))
    const totalWeight = featureImportance.reduce((s, f) => s + f.absWeight, 0)
    const normalizedImportance = featureImportance.map(f => ({ ...f, norm: f.absWeight / (totalWeight + 1e-10) }))

    // ||L|| = ||u|| (Riesz norm equality)
    const rieszNorm = Math.sqrt(u.reduce((s, v) => s + v * v, 0))

    // Compute L(f) for each historical point
    const lValues = []
    for (let k = 0; k < N; k++) {
      let innerProd = 0
      for (let i = 0; i < nFeatures; i++) innerProd += X[k][i] * u[i]
      lValues.push({ idx: k + nFeatures, lf: innerProd, actual: y[k] })
    }

    // Prediction: L(f) = <f, u> should correlate with y
    const meanL = lValues.reduce((s, v) => s + v.lf, 0) / lValues.length
    const meanY = lValues.reduce((s, v) => s + v.actual, 0) / lValues.length
    let cov = 0, varL = 0, varY = 0
    for (const v of lValues) {
      cov += (v.lf - meanL) * (v.actual - meanY)
      varL += (v.lf - meanL) ** 2
      varY += (v.actual - meanY) ** 2
    }
    const correlation = cov / (Math.sqrt(varL * varY) + 1e-10)

    // Current signal
    const currentFeatures = []
    for (let j = 1; j <= nFeatures; j++) currentFeatures.push(returns[n - j])
    let currentL = 0
    for (let i = 0; i < nFeatures; i++) currentL += currentFeatures[i] * u[i]

    let signal = 'NEUTRAL'
    let reason = ''
    if (currentL > 0.002) {
      signal = 'RIESZ_LONG'
      reason = `Riesz functional L(f) = ${currentL.toFixed(6)} > 0 (bullish signal)`
    } else if (currentL < -0.002) {
      signal = 'RIESZ_SHORT'
      reason = `Riesz functional L(f) = ${currentL.toFixed(6)} < 0 (bearish signal)`
    } else {
      reason = `Riesz functional L(f) = ${currentL.toFixed(6)} (neutral)`
    }

    // Dominant feature
    const dominant = normalizedImportance.reduce((a, b) => a.absWeight > b.absWeight ? a : b)

    return {
      u, featureImportance: normalizedImportance,
      rieszNorm, lValues, correlation,
      currentL, signal, reason, dominant,
      nFeatures,
    }
  }, [candles, exchange, symbol, lookback, nFeatures, lambda])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'RIESZ_LONG' ? '#22c55e' : data.signal === 'RIESZ_SHORT' ? '#ef4444' : '#94a3b8'

  // Feature importance
  const maxImportance = Math.max(...data.featureImportance.map(f => f.norm), 0.01)
  const sxFI = (i) => P + (i / data.featureImportance.length) * (W - 2 * P)
  const syFI = (v) => H - P - (v / maxImportance) * (H - 2 * P)

  // L(f) vs actual
  const allLF = data.lValues.map(v => v.lf)
  const allY = data.lValues.map(v => v.actual)
  const maxLF = Math.max(...allLF.map(Math.abs), 0.01)
  const sxLF = (i) => P + (i / data.lValues.length) * (W - 2 * P)
  const syLF = (v) => H - P - ((v + maxLF) / (2 * maxLF)) * (H - 2 * P)
  const syY = (v) => H - P - ((v + maxLF) / (2 * maxLF)) * (H - 2 * P)

  // Riesz weights
  const maxW = Math.max(...data.u.map(Math.abs), 0.01)
  const sxW = (i) => P + (i / data.u.length) * (W - 2 * P)
  const syW = (v) => H - P - ((v + maxW) / (2 * maxW)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Riesz Representation (Linear Functional) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Features (lags):</span>
          <input type="number" value={nFeatures} onChange={e => setNFeatures(Math.max(3, Math.min(20, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lambda (reg):</span>
          <input type="number" step="0.01" value={lambda} onChange={e => setLambda(Math.max(0.001, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(60, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Feature importance */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Riesz Representer Feature Importance: |u_i| (lag weights for signal extraction)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.featureImportance.map((f, i) => (
            <g key={i}>
              <rect x={sxFI(i) + 5} y={syFI(f.norm)} width={(W - 2 * P) / data.featureImportance.length - 10} height={H - P - syFI(f.norm)} fill={data.dominant.lag === f.lag ? '#f59e0b' : '#06b6d4'} opacity={0.7} rx={3} />
              <text x={sxFI(i) + (W - 2 * P) / data.featureImportance.length / 2} y={H - P + 14} textAnchor="middle" fill="#475569" fontSize={8}>lag{f.lag}</text>
            </g>
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>|u_i| normalized</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>dominant: lag{data.dominant.lag} ({(data.dominant.norm * 100).toFixed(1)}%)</text>
        </svg>
      </div>

      {/* L(f) vs actual returns */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Riesz Functional L(f) = {'<f, u>'} vs Actual Returns (correlation={data.correlation.toFixed(4)})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.lValues.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxLF(i)} ${syLF(v.lf)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />
          <path d={data.lValues.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxLF(i)} ${syY(v.actual)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={1} opacity={0.5} />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>L(f) = {'<f, u>'} (Riesz)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>actual return</text>
        </svg>
      </div>

      {/* Riesz weights */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Riesz Representer u (signed weights: positive=momentum, negative=reversal)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.u.map((v, i) => (
            <line key={i} x1={sxW(i) + (W - 2 * P) / data.u.length / 2} y1={H / 2} x2={sxW(i) + (W - 2 * P) / data.u.length / 2} y2={syW(v)} stroke={v > 0 ? '#22c55e' : '#ef4444'} strokeWidth={4} opacity={0.7} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>u_i {'>'} 0 (momentum)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>u_i {'<'} 0 (reversal)</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">L(f) current</div>
          <div className="text-cyan-400 font-mono">{data.currentL.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">||u|| (Riesz)</div>
          <div className="text-purple-400 font-mono">{data.rieszNorm.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Correlation</div>
          <div className="text-emerald-400 font-mono">{data.correlation.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Dominant lag</div>
          <div className="text-amber-400 font-mono">lag{data.dominant.lag}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Dominant w</div>
          <div className="text-slate-300 font-mono">{(data.dominant.norm * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Riesz (Hilbert):</strong> L(f) = {'<f, u>'} for unique u in H, ||L|| = ||u|| |
        <strong> Representer:</strong> u = (K + lambda*I)^{-1} * L (regularized) |
        <strong> Feature importance:</strong> |u_i| = Riesz weight for lag i |
        <strong> Sign:</strong> u_i {'>'} 0 = momentum, u_i {'<'} 0 = reversal
      </div>
    </div>
  )
}
