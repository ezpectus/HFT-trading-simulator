import React, { useMemo, useState } from 'react'

// ─── Sobolev Space Regularization (Smoothness-Constrained Estimation) ───────
// Uses Sobolev space norms to regularize estimates, enforcing smoothness
// constraints on functions estimated from noisy financial data.
//
// Mathematical foundation:
//   Sobolev space W^{k,p}: functions with k weak derivatives in L^p
//   Norm: ||f||_{W^{k,2}}² = Σ_{|α|≤k} ∫ |D^α f|² dx
//
//   Tikhonov regularization in H^s (Sobolev Hilbert space):
//   min_f ||y - f||²_{L²} + λ·||f||²_{H^s}
//   = min_f Σ(y_i - f(x_i))² + λ·∫|f^(s)(x)|²dx
//
//   Representer theorem: f* = Σ_i α_i·K_s(x_i, ·)
//   where K_s is the Sobolev kernel (Matérn kernel of order s)
//
//   Matérn kernel: K_s(x,y) = (2^{1-s}/Γ(s))·(√(2s)|x-y|)^s·K_s(√(2s)|x-y|)
//
//   Applications: smooth volatility estimation, noise removal,
//   derivative pricing with smoothness constraints, trend extraction

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Matérn kernel (simplified for s=1, s=2)
const maternKernel = (x, y, s, sigma = 1, lengthScale = 1) => {
  const r = Math.abs(x - y) / lengthScale
  if (r < 1e-10) return sigma * sigma
  if (s === 1) {
    return sigma * sigma * Math.exp(-r)
  } else if (s === 2) {
    const arg = Math.sqrt(3) * r
    return sigma * sigma * (1 + arg) * Math.exp(-arg)
  } else {
    // General approximation
    return sigma * sigma * Math.exp(-r * r / 2)
  }
}

// Solve Tikhonov in Sobolev space via kernel ridge regression
const sobolevRegression = (xData, yData, s, lambda, sigma, lengthScale) => {
  const n = xData.length
  // Build kernel matrix
  const K = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      K[i][j] = maternKernel(xData[i], xData[j], s, sigma, lengthScale)
    }
  }

  // Solve (K + λI)α = y
  const A = K.map((row, i) => row.map((v, j) => v + (i === j ? lambda : 0)))

  // Gaussian elimination
  const aug = A.map((row, i) => [...row, yData[i]])
  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]
    if (Math.abs(aug[col][col]) < 1e-12) continue
    for (let r = col + 1; r < n; r++) {
      const factor = aug[r][col] / aug[col][col]
      for (let c = col; c <= n; c++) aug[r][c] -= factor * aug[col][c]
    }
  }

  const alpha = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    alpha[i] = aug[i][n]
    for (let j = i + 1; j < n; j++) alpha[i] -= aug[i][j] * alpha[j]
    alpha[i] /= (Math.abs(aug[i][i]) > 1e-12 ? aug[i][i] : 1)
  }

  // Predict function
  const predict = (x) => {
    let sum = 0
    for (let i = 0; i < n; i++) {
      sum += alpha[i] * maternKernel(xData[i], x, s, sigma, lengthScale)
    }
    return sum
  }

  // Compute Sobolev norm of solution (approximate: L² + derivative penalty)
  const predictions = xData.map(predict)
  let l2Norm = 0
  for (let i = 0; i < n; i++) l2Norm += predictions[i] ** 2
  l2Norm = Math.sqrt(l2Norm / n)

  // First derivative (finite difference)
  let h1Semi = 0
  for (let i = 1; i < n; i++) {
    h1Semi += ((predictions[i] - predictions[i - 1]) / (xData[i] - xData[i - 1] + 1e-10)) ** 2
  }
  h1Semi = Math.sqrt(h1Semi / (n - 1))

  // Residual
  let residual = 0
  for (let i = 0; i < n; i++) residual += (yData[i] - predictions[i]) ** 2
  residual = Math.sqrt(residual / n)

  return { predict, alpha, predictions, l2Norm, h1Semi, residual }
}

export default function SobolevSpaceRegularization({ candles, symbol, exchange }) {
  const [s, setS] = useState(2)
  const [lambda, setLambda] = useState(0.1)
  const [lookback, setLookback] = useState(80)
  const [noiseLevel, setNoiseLevel] = useState(0.5)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Use rolling volatility as signal
    const window = 10
    const rollingVol = []
    for (let i = window; i < returns.length; i++) {
      const slice = returns.slice(i - window, i)
      const m = slice.reduce((a, b) => a + b, 0) / slice.length
      const v = Math.sqrt(slice.reduce((s, r) => s + (r - m) ** 2, 0) / slice.length)
      rollingVol.push(v)
    }

    if (rollingVol.length < 10) return null

    // Normalize
    const meanV = rollingVol.reduce((a, b) => a + b, 0) / rollingVol.length
    const stdV = Math.sqrt(rollingVol.reduce((s, v) => s + (v - meanV) ** 2, 0) / rollingVol.length)
    const normV = rollingVol.map(v => stdV > 0 ? (v - meanV) / stdV : 0)

    // Add synthetic noise
    const noisy = normV.map(v => v + (Math.random() - 0.5) * noiseLevel)

    // x-axis: normalized time
    const n = noisy.length
    const xData = normV.map((_, i) => i / n)
    const yData = noisy

    // Sobolev regression
    const sigma = 1.0
    const lengthScale = 0.1
    const result = sobolevRegression(xData, yData, s, lambda, sigma, lengthScale)

    // Compare with different regularization levels
    const lambdaSweep = [0.001, 0.01, 0.1, 1.0, 10.0]
    const sweepResults = lambdaSweep.map(l => {
      const r = sobolevRegression(xData, yData, s, l, sigma, lengthScale)
      return { lambda: l, residual: r.residual, h1Semi: r.h1Semi, l2Norm: r.l2Norm }
    })

    // L-curve: log(residual) vs log(smoothness)
    const lCurve = sweepResults.map(r => ({
      logRes: Math.log(r.residual + 1e-10),
      logSmooth: Math.log(r.h1Semi + 1e-10),
      lambda: r.lambda,
    }))

    // Predictions on grid
    const xGrid = Array.from({ length: 100 }, (_, i) => i / 100)
    const smoothPredictions = xGrid.map(x => result.predict(x))

    // Signal
    const smoothnessRatio = result.residual / (result.h1Semi + 1e-10)
    let signal = 'BALANCED'
    let reason = ''
    if (lambda < 0.01) {
      signal = 'OVERFIT'
      reason = `λ=${lambda} (low regularization, overfitting noise, H¹ semi=${result.h1Semi.toFixed(4)})`
    } else if (lambda > 5) {
      signal = 'OVERSMOOTH'
      reason = `λ=${lambda} (high regularization, oversmoothing signal, residual=${result.residual.toFixed(4)})`
    } else {
      reason = `λ=${lambda} (balanced, residual=${result.residual.toFixed(4)}, H¹ semi=${result.h1Semi.toFixed(4)})`
    }

    return {
      xData, yData, normV, result, smoothPredictions, xGrid,
      sweepResults, lCurve, signal, reason,
      l2Norm: result.l2Norm, h1Semi: result.h1Semi, residual: result.residual,
    }
  }, [candles, exchange, symbol, s, lambda, lookback, noiseLevel])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'OVERFIT' ? '#ef4444' : data.signal === 'OVERSMOOTH' ? '#f59e0b' : '#22c55e'

  // Smoothed vs noisy
  const allY = [...data.yData, ...data.normV, ...data.smoothPredictions]
  const maxY = Math.max(...allY, 0.1)
  const minY = Math.min(...allY, -0.1)
  const sxX = (x) => P + x * (W - 2 * P)
  const syY = (v) => H - P - ((v - minY) / (maxY - minY + 0.001)) * (H - 2 * P)

  // L-curve
  const maxLR = Math.max(...data.lCurve.map(p => p.logRes))
  const minLR = Math.min(...data.lCurve.map(p => p.logRes))
  const maxLS = Math.max(...data.lCurve.map(p => p.logSmooth))
  const minLS = Math.min(...data.lCurve.map(p => p.logSmooth))
  const sxLR = (v) => P + ((v - minLR) / (maxLR - minLR + 0.1)) * (W - 2 * P)
  const syLS = (v) => H - P - ((v - minLS) / (maxLS - minLS + 0.1)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Sobolev Space Regularization — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">s (Sobolev order):</span>
          <select value={s} onChange={e => setS(+e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value={1}>s=1 (Matérn 3/2)</option>
            <option value={2}>s=2 (Matérn 5/2)</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">λ (regularization):</span>
          <input type="number" step="0.01" value={lambda} onChange={e => setLambda(Math.max(0.001, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Noise:</span>
          <input type="number" step="0.1" value={noiseLevel} onChange={e => setNoiseLevel(Math.max(0, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Smoothed signal */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Sobolev-Regularized Signal: Noisy Data vs Smooth Estimate (H^s, λ={lambda})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* True signal */}
          <path d={data.normV.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxX(data.xData[i])} ${syY(v)}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth={1.5} opacity={0.5} />

          {/* Noisy data */}
          {data.yData.map((v, i) => (
            <circle key={i} cx={sxX(data.xData[i])} cy={syY(v)} r={2} fill="#ef4444" opacity={0.4} />
          ))}

          {/* Sobolev smoothed */}
          <path d={data.smoothPredictions.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxX(data.xGrid[i])} ${syY(v)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2.5} />

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>True signal</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>Noisy data</text>
          <text x={W - P} y={48} textAnchor="end" fill="#06b6d4" fontSize={9}>Sobolev estimate (H^{s})</text>
        </svg>
      </div>

      {/* L-curve */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">L-Curve: log(||residual||) vs log(||smoothness||) (optimal λ at corner)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.lCurve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sxLR(p.logRes)} ${syLS(p.logSmooth)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={2} />

          {data.lCurve.map((p, i) => (
            <g key={i}>
              <circle cx={sxLR(p.logRes)} cy={syLS(p.logSmooth)} r={5} fill={p.lambda === lambda ? '#fbbf24' : '#a855f7'} stroke={p.lambda === lambda ? '#ef4444' : 'none'} strokeWidth={2} />
              <text x={sxLR(p.logRes)} y={syLS(p.logSmooth) - 8} textAnchor="middle" fill="#94a3b8" fontSize={8}>λ={p.lambda}</text>
            </g>
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>L-curve</text>
          <text x={W - P} y={34} textAnchor="end" fill="#fbbf24" fontSize={9}>current λ (corner = optimal)</text>
        </svg>
      </div>

      {/* Regularization sweep */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Regularization Sweep: Residual vs Smoothness (bias-variance trade-off)</div>
        <div className="space-y-1">
          {data.sweepResults.map((r, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-16">λ={r.lambda}</span>
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="h-full rounded" style={{ width: `${Math.min(100, r.residual * 200)}%`, background: '#ef4444' }} />
              </div>
              <span className="text-red-400 font-mono w-20">res: {r.residual.toFixed(4)}</span>
              <span className="text-cyan-400 font-mono w-20">H¹: {r.h1Semi.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">||f||_L²</div>
          <div className="text-cyan-400 font-mono">{data.l2Norm.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">|f|_H¹</div>
          <div className="text-emerald-400 font-mono">{data.h1Semi.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Residual</div>
          <div className="text-amber-400 font-mono">{data.residual.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">s (order)</div>
          <div className="text-purple-400 font-mono">{s}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">λ (reg.)</div>
          <div className="text-slate-300 font-mono">{lambda}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Sobolev:</strong> W^{'{k,p}'} = k weak derivatives in L^p |
        <strong> Tikhonov:</strong> min ||y-f||² + λ||f||²_{'{H^s}'} |
        <strong> Kernel:</strong> Matérn (s={s}) — representer theorem |
        <strong> L-curve:</strong> corner = optimal λ (bias-variance) |
        <strong> H¹ semi:</strong> ∫|f'|²dx (smoothness penalty)
      </div>
    </div>
  )
}
