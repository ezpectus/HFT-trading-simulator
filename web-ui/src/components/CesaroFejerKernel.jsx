import React, { useMemo, useState } from 'react'

// --- Cesaro Summability & Fejer Kernel (Averaging for Trend Extraction) ---
// Uses Cesaro means and Fejer kernels to extract smooth trends from
// oscillatory financial time series via trigonometric approximation.
//
// Mathematical foundation:
//   Fourier series: f(x) ~ sum_{k=0}^{N} (a_k cos(kx) + b_k sin(kx))
//   Partial sums: S_N(x) = sum_{k=0}^{N} ...
//
//   Cesaro mean: sigma_N(x) = (1/(N+1)) sum_{n=0}^{N} S_n(x)
//   = sum_{k=0}^{N} (1 - k/(N+1)) * (a_k cos(kx) + b_k sin(kx))
//
//   Fejer kernel: F_N(x) = (1/(N+1)) * (sin((N+1)x/2) / sin(x/2))^2
//   sigma_N = F_N * f (convolution)
//
//   Properties:
//   - sigma_N -> f uniformly (Fejer's theorem)
//   - No Gibbs phenomenon (unlike partial sums)
//   - Positive kernel: F_N >= 0
//   - sigma_N is always between min(f) and max(f)
//
//   Applications: trend extraction, noise filtering, cycle detection,
//   smooth interpolation of irregular data

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Compute DFT coefficients
const computeFourierCoeffs = (data, N) => {
  const n = data.length
  const coeffs = { a: [], b: [] }
  for (let k = 0; k <= N; k++) {
    let ak = 0, bk = 0
    for (let j = 0; j < n; j++) {
      const angle = (2 * Math.PI * k * j) / n
      ak += data[j] * Math.cos(angle)
      bk += data[j] * Math.sin(angle)
    }
    coeffs.a.push((2 / n) * ak)
    coeffs.b.push((2 / n) * bk)
  }
  return coeffs
}

// Partial Fourier sum S_N(x)
const partialSum = (x, coeffs, N, n) => {
  let sum = coeffs.a[0] / 2
  for (let k = 1; k <= N; k++) {
    const angle = (2 * Math.PI * k * x) / n
    sum += coeffs.a[k] * Math.cos(angle) + coeffs.b[k] * Math.sin(angle)
  }
  return sum
}

// Cesaro mean sigma_N(x)
const cesaroMean = (x, coeffs, N, n) => {
  let sum = coeffs.a[0] / 2
  for (let k = 1; k <= N; k++) {
    const weight = 1 - k / (N + 1)
    const angle = (2 * Math.PI * k * x) / n
    sum += weight * (coeffs.a[k] * Math.cos(angle) + coeffs.b[k] * Math.sin(angle))
  }
  return sum
}

// Fejer kernel F_N(x)
const fejerKernel = (x, N) => {
  if (Math.abs(Math.sin(x / 2)) < 1e-10) return N + 1
  const num = Math.sin((N + 1) * x / 2)
  const den = Math.sin(x / 2)
  return (1 / (N + 1)) * (num / den) ** 2
}

export default function CesaroFejerKernel({ candles, symbol, exchange }) {
  const [N, setN] = useState(10)
  const [lookback, setLookback] = useState(100)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Use cumulative returns as signal
    const cumRets = [0]
    for (let i = 0; i < returns.length; i++) {
      cumRets.push(cumRets[i] + returns[i])
    }

    const n = cumRets.length
    const Nmax = Math.min(N, Math.floor(n / 2) - 1)
    const coeffs = computeFourierCoeffs(cumRets, Nmax)

    // Compute partial sums and Cesaro means on grid
    const gridPoints = Math.min(n, 100)
    const partialSums = []
    const cesaroSums = []
    for (let i = 0; i < gridPoints; i++) {
      const x = (i * n) / gridPoints
      partialSums.push({ x: i, value: partialSum(x, coeffs, Nmax, n) })
      cesaroSums.push({ x: i, value: cesaroMean(x, coeffs, Nmax, n) })
    }

    // Fejer kernel values
    const fejerValues = []
    for (let i = 0; i <= 100; i++) {
      const x = (i / 100) * 2 * Math.PI
      fejerValues.push({ x: i, value: fejerKernel(x, Nmax) })
    }

    // Gibbs phenomenon: check overshoot of partial sum
    const maxPartial = Math.max(...partialSums.map(p => p.value))
    const minPartial = Math.min(...partialSums.map(p => p.value))
    const maxCesaro = Math.max(...cesaroSums.map(p => p.value))
    const minCesaro = Math.min(...cesaroSums.map(p => p.value))
    const maxData = Math.max(...cumRets)
    const minData = Math.min(...cumRets)

    const gibbsOvershoot = Math.max(0, (maxPartial - maxData) / (maxData - minData + 1e-10))
    const cesaroOvershoot = Math.max(0, (maxCesaro - maxData) / (maxData - minData + 1e-10))

    // Dominant frequency
    let maxAmp = 0, dominantK = 0
    for (let k = 1; k <= Nmax; k++) {
      const amp = Math.sqrt(coeffs.a[k] ** 2 + coeffs.b[k] ** 2)
      if (amp > maxAmp) { maxAmp = amp; dominantK = k }
    }
    const dominantPeriod = dominantK > 0 ? n / dominantK : 0

    // Smoothness: L2 norm of second derivative
    let roughPartial = 0, roughCesaro = 0
    for (let i = 1; i < gridPoints - 1; i++) {
      const d2p = partialSums[i + 1].value - 2 * partialSums[i].value + partialSums[i - 1].value
      const d2c = cesaroSums[i + 1].value - 2 * cesaroSums[i].value + cesaroSums[i - 1].value
      roughPartial += d2p * d2p
      roughCesaro += d2c * d2c
    }

    // Signal
    let signal = 'SMOOTH_TREND'
    let reason = ''
    if (gibbsOvershoot > 0.05) {
      signal = 'GIBBS_DETECTED'
      reason = `Partial sum has ${(gibbsOvershoot * 100).toFixed(1)}% Gibbs overshoot, Cesaro eliminates it (${(cesaroOvershoot * 100).toFixed(1)}%)`
    } else if (dominantPeriod > 0) {
      signal = 'CYCLE_DETECTED'
      reason = `Dominant cycle: period=${dominantPeriod.toFixed(1)} bars (k=${dominantK}), Cesaro smooth trend extracted`
    } else {
      reason = `Cesaro mean provides smooth trend (N=${Nmax}), no significant cycles`
    }

    // Residual (trend removed)
    const residual = cumRets.map((v, i) => {
      const ci = Math.floor((i * gridPoints) / n)
      return v - (cesaroSums[ci] ? cesaroSums[ci].value : 0)
    })

    return {
      cumRets, partialSums, cesaroSums, fejerValues,
      gibbsOvershoot, cesaroOvershoot,
      dominantK, dominantPeriod, maxAmp,
      roughPartial, roughCesaro,
      signal, reason, residual, n, Nmax,
    }
  }, [candles, exchange, symbol, N, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'GIBBS_DETECTED' ? '#ef4444' : data.signal === 'CYCLE_DETECTED' ? '#f59e0b' : '#22c55e'

  // Data + approximations
  const allVals = [...data.cumRets, ...data.partialSums.map(p => p.value), ...data.cesaroSums.map(p => p.value)]
  const maxY = Math.max(...allVals, 0.1)
  const minY = Math.min(...allVals, -0.1)
  const sxX = (i) => P + (i / data.n) * (W - 2 * P)
  const sxG = (i) => P + (i / data.partialSums.length) * (W - 2 * P)
  const syY = (v) => H - P - ((v - minY) / (maxY - minY + 0.001)) * (H - 2 * P)

  // Fejer kernel
  const maxF = Math.max(...data.fejerValues.map(f => f.value), 0.1)
  const sxF = (i) => P + (i / data.fejerValues.length) * (W - 2 * P)
  const syF = (v) => H - P - (v / maxF) * (H - 2 * P)

  // Residual
  const maxR = Math.max(...data.residual.map(Math.abs), 0.01)
  const sxR = (i) => P + (i / data.residual.length) * (W - 2 * P)
  const syR = (v) => H - P - ((v + maxR) / (2 * maxR)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Cesaro Summability &amp; Fejer Kernel — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">N (harmonics):</span>
          <input type="number" value={N} onChange={e => setN(Math.max(1, Math.min(40, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Data + Fourier approximations */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Fourier Approximation: Raw Data vs S_N (partial sum) vs sigma_N (Cesaro mean)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Raw data */}
          {data.cumRets.map((v, i) => (
            <circle key={i} cx={sxX(i)} cy={syY(v)} r={1.5} fill="#475569" opacity={0.5} />
          ))}

          {/* Partial sum S_N */}
          <path d={data.partialSums.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sxG(i)} ${syY(p.value)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={1.5} opacity={0.7} />

          {/* Cesaro mean sigma_N */}
          <path d={data.cesaroSums.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sxG(i)} ${syY(p.value)}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth={2.5} />

          <text x={W - P} y={20} textAnchor="end" fill="#475569" fontSize={9}>raw data</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>S_N (partial sum, Gibbs)</text>
          <text x={W - P} y={48} textAnchor="end" fill="#22c55e" fontSize={9}>sigma_N (Cesaro, no Gibbs)</text>
        </svg>
      </div>

      {/* Fejer kernel */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Fejer Kernel F_N(x) = (1/(N+1)) * (sin((N+1)x/2) / sin(x/2))^2 (positive, no ringing)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.fejerValues.map((f, i) => `${i === 0 ? 'M' : 'L'} ${sxF(i)} ${syF(f.value)}`).join(' ')} fill="rgba(168,85,247,0.15)" stroke="#a855f7" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>F_N(x) Fejer kernel (N={data.Nmax})</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>F_N {'>='} 0 (non-negative)</text>
        </svg>
      </div>

      {/* Residual (detrended) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Residual: data - sigma_N (detrended signal for cycle analysis)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.residual.map((v, i) => (
            <line key={i} x1={sxR(i)} y1={H / 2} x2={sxR(i)} y2={syR(v)} stroke={v > 0 ? '#22c55e' : '#ef4444'} strokeWidth={1.5} opacity={0.6} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>residual (detrended)</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Gibbs overshoot</div>
          <div className="text-red-400 font-mono">{(data.gibbsOvershoot * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Cesaro overshoot</div>
          <div className="text-emerald-400 font-mono">{(data.cesaroOvershoot * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Dominant k</div>
          <div className="text-amber-400 font-mono">{data.dominantK}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Cycle period</div>
          <div className="text-purple-400 font-mono">{data.dominantPeriod.toFixed(1)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Smoothness ratio</div>
          <div className="text-cyan-400 font-mono">{(data.roughCesaro / (data.roughPartial + 1e-10)).toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Cesaro:</strong> sigma_N = (1/(N+1)) * sum S_n (averaged partial sums) |
        <strong> Fejer:</strong> F_N {'>='} 0, no Gibbs phenomenon |
        <strong> Theorem:</strong> sigma_N -{'>'} f uniformly (Fejer's theorem) |
        <strong> Convolution:</strong> sigma_N = F_N * f (smoothing) |
        <strong> Weights:</strong> (1 - k/(N+1)) triangular (reduces high-freq noise)
      </div>
    </div>
  )
}
