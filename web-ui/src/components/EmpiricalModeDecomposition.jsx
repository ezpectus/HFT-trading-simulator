import React, { useMemo, useState } from 'react'

// ─── Empirical Mode Decomposition (EMD) + Hilbert-Huang Transform ────────────
// EMD adaptively decomposes a signal into Intrinsic Mode Functions (IMFs)
// via the sifting process. The Hilbert-Huang Transform then computes
// instantaneous frequency and amplitude for each IMF.
//
// Mathematical foundation:
//   IMF criteria:
//   1. Number of extrema = number of zero crossings (±1)
//   2. Mean of upper and lower envelopes = 0 at every point
//
//   Sifting process:
//   1. Find all local maxima → upper envelope (cubic spline)
//   2. Find all local minima → lower envelope (cubic spline)
//   3. Compute mean = (upper + lower) / 2
//   4. h = signal - mean
//   5. Repeat until IMF criteria met (SD < threshold)
//   6. Residue = signal - IMF
//   7. Repeat on residue
//
//   Hilbert Transform: H[x(t)] = (1/π) ∫ x(τ)/(t-τ) dτ
//   Analytic signal: z(t) = x(t) + j·H[x(t)] = a(t)·e^(jφ(t))
//   Instantaneous frequency: ω(t) = dφ/dt

// Cubic spline interpolation
const cubicSpline = (xPoints, yPoints, xQuery) => {
  const n = xPoints.length
  if (n < 2) return yPoints[0]

  // Sort by x
  const sorted = xPoints.map((x, i) => ({ x, y: yPoints[i] })).sort((a, b) => a.x - b.x)
  const xs = sorted.map(s => s.x)
  const ys = sorted.map(s => s.y)

  if (n === 2) {
    // Linear interpolation
    const t = (xQuery - xs[0]) / (xs[1] - xs[0])
    return ys[0] + t * (ys[1] - ys[0])
  }

  // Natural cubic spline
  const h = new Array(n - 1)
  for (let i = 0; i < n - 1; i++) h[i] = xs[i + 1] - xs[i]

  // Tridiagonal system for second derivatives
  const alpha = new Array(n - 2)
  const l = new Array(n).fill(1)
  const mu = new Array(n).fill(0)
  const z = new Array(n).fill(0)
  const c = new Array(n).fill(0)
  const b = new Array(n - 1)
  const d = new Array(n - 1)

  for (let i = 1; i < n - 1; i++) {
    alpha[i - 1] = 3 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1])
  }

  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1]
    mu[i] = h[i] / l[i]
    z[i] = (alpha[i - 1] - h[i - 1] * z[i - 1]) / l[i]
  }

  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1]
    b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3
    d[j] = (c[j + 1] - c[j]) / (3 * h[j])
  }

  // Find interval and evaluate
  let idx = 0
  for (let i = 0; i < n - 1; i++) {
    if (xQuery >= xs[i] && xQuery <= xs[i + 1]) { idx = i; break }
    if (i === n - 2) idx = n - 2
  }

  const dx = xQuery - xs[idx]
  return ys[idx] + b[idx] * dx + c[idx] * dx * dx + d[idx] * dx * dx * dx
}

// Find local maxima
const findMaxima = (signal) => {
  const maxima = []
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] >= signal[i + 1]) {
      maxima.push({ index: i, value: signal[i] })
    }
  }
  // Add endpoints
  if (signal[0] > signal[1]) maxima.unshift({ index: 0, value: signal[0] })
  if (signal[signal.length - 1] > signal[signal.length - 2]) {
    maxima.push({ index: signal.length - 1, value: signal[signal.length - 1] })
  }
  return maxima
}

// Find local minima
const findMinima = (signal) => {
  const minima = []
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] < signal[i - 1] && signal[i] <= signal[i + 1]) {
      minima.push({ index: i, value: signal[i] })
    }
  }
  if (signal[0] < signal[1]) minima.unshift({ index: 0, value: signal[0] })
  if (signal[signal.length - 1] < signal[signal.length - 2]) {
    minima.push({ index: signal.length - 1, value: signal[signal.length - 1] })
  }
  return minima
}

// Sifting process for one IMF
const sift = (signal, maxIter = 30, sdThreshold = 0.05) => {
  let h = signal.slice()
  let prevH = signal.slice()

  for (let iter = 0; iter < maxIter; iter++) {
    const maxima = findMaxima(h)
    const minima = findMinima(h)

    if (maxima.length < 2 || minima.length < 2) break

    // Upper and lower envelopes via cubic spline
    const maxX = maxima.map(m => m.index)
    const maxY = maxima.map(m => m.value)
    const minX = minima.map(m => m.index)
    const minY = minima.map(m => m.value)

    const upper = h.map((_, i) => cubicSpline(maxX, maxY, i))
    const lower = h.map((_, i) => cubicSpline(minX, minY, i))
    const mean = upper.map((u, i) => (u + lower[i]) / 2)

    h = h.map((v, i) => v - mean[i])

    // Sifting criterion: standard deviation
    let sd = 0
    for (let i = 0; i < h.length; i++) {
      sd += ((prevH[i] - h[i]) ** 2) / (prevH[i] ** 2 + 1e-10)
    }
    sd /= h.length

    if (sd < sdThreshold) break
    prevH = h.slice()
  }

  return h
}

// Full EMD decomposition
const emd = (signal, maxIMFs = 8, maxIter = 30) => {
  const imfs = []
  let residue = signal.slice()

  for (let k = 0; k < maxIMFs; k++) {
    const imf = sift(residue, maxIter)
    imfs.push(imf)
    residue = residue.map((r, i) => r - imf[i])

    // Check if residue is monotonic
    const maxima = findMaxima(residue)
    const minima = findMinima(residue)
    if (maxima.length < 2 && minima.length < 2) break
  }

  return { imfs, residue }
}

// Hilbert Transform (via FFT-based analytic signal)
const hilbertTransform = (signal) => {
  const N = signal.length
  const N2 = Math.pow(2, Math.ceil(Math.log2(N)))
  const padded = [...signal, ...new Array(N2 - N).fill(0)]

  // FFT
  const spectrum = fft(padded)

  // Apply Hilbert filter: H(f) = -j·sign(f)
  for (let i = 0; i < N2; i++) {
    if (i === 0 || i === N2 / 2) {
      // DC and Nyquist: zero
    } else if (i < N2 / 2) {
      // Positive frequencies: multiply by -j (rotate -90°)
      const re = spectrum[i].re, im = spectrum[i].im
      spectrum[i].re = im
      spectrum[i].im = -re
    } else {
      // Negative frequencies: multiply by +j (rotate +90°)
      const re = spectrum[i].re, im = spectrum[i].im
      spectrum[i].re = -im
      spectrum[i].im = re
    }
  }

  // IFFT
  const hilbert = ifftDirect(spectrum, N2)

  // Analytic signal: z = signal + j·H[signal]
  const amplitude = new Array(N)
  const phase = new Array(N)
  const frequency = new Array(N)

  for (let i = 0; i < N; i++) {
    const real = signal[i]
    const imag = hilbert[i]
    amplitude[i] = Math.sqrt(real * real + imag * imag)
    phase[i] = Math.atan2(imag, real)
  }

  // Instantaneous frequency: dφ/dt
  for (let i = 1; i < N; i++) {
    let dPhase = phase[i] - phase[i - 1]
    // Unwrap phase
    if (dPhase > Math.PI) dPhase -= 2 * Math.PI
    if (dPhase < -Math.PI) dPhase += 2 * Math.PI
    frequency[i] = dPhase / (2 * Math.PI)
  }
  frequency[0] = frequency[1] || 0

  return { amplitude, phase, frequency }
}

// Simplified FFT (Cooley-Tukey)
const fft = (signal) => {
  const N = signal.length
  if (N <= 1) return [{ re: signal[0] || 0, im: 0 }]

  const x = signal.map(v => ({ re: v, im: 0 }))
  let j = 0
  for (let i = 1; i < N; i++) {
    let bit = N >> 1
    while (j & bit) { j ^= bit; bit >>= 1 }
    j ^= bit
    if (i < j) { [x[i], x[j]] = [x[j], x[i]] }
  }

  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1
    const angle = -2 * Math.PI / len
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < halfLen; k++) {
        const wRe = Math.cos(angle * k), wIm = Math.sin(angle * k)
        const tRe = wRe * x[i + k + halfLen].re - wIm * x[i + k + halfLen].im
        const tIm = wRe * x[i + k + halfLen].im + wIm * x[i + k + halfLen].re
        x[i + k + halfLen] = { re: x[i + k].re - tRe, im: x[i + k].im - tIm }
        x[i + k] = { re: x[i + k].re + tRe, im: x[i + k].im + tIm }
      }
    }
  }

  return x
}

// Direct IFFT (DFT-based, for moderate sizes)
const ifftDirect = (spectrum, N) => {
  const result = new Array(N).fill(0)
  for (let n = 0; n < N; n++) {
    let re = 0
    for (let k = 0; k < N; k++) {
      const angle = 2 * Math.PI * k * n / N
      re += spectrum[k].re * Math.cos(angle) - spectrum[k].im * Math.sin(angle)
    }
    result[n] = re / N
  }
  return result
}

export default function EmpiricalModeDecomposition({ candles, symbol, exchange }) {
  const [maxIMFs, setMaxIMFs] = useState(5)
  const [maxIter, setMaxIter] = useState(30)
  const [showHilbert, setShowHilbert] = useState(true)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 32) return null
    const cds = candles[exchange][symbol]
    const N = Math.min(128, cds.length)
    const prices = cds.slice(-N).map(c => c.close)

    // Detrend
    const mean = prices.reduce((a, b) => a + b, 0) / N
    const signal = prices.map(p => p - mean)

    const { imfs, residue } = emd(signal, maxIMFs, maxIter)

    // Hilbert-Huang Transform for each IMF
    const hht = imfs.map(imf => {
      if (imf.every(v => Math.abs(v) < 1e-10)) {
        return { amplitude: new Array(N).fill(0), frequency: new Array(N).fill(0), phase: new Array(N).fill(0) }
      }
      return hilbertTransform(imf)
    })

    // Energy of each IMF
    const energies = imfs.map(imf => {
      const m = imf.reduce((a, b) => a + b, 0) / imf.length
      return imf.reduce((s, v) => s + (v - m) ** 2, 0) / imf.length
    })
    const totalEnergy = energies.reduce((a, b) => a + b, 0) + 1e-10

    // Mean instantaneous frequency per IMF
    const meanFreqs = hht.map(h => {
      const validFreqs = h.frequency.filter(f => f > 0 && isFinite(f))
      return validFreqs.length > 0 ? validFreqs.reduce((a, b) => a + b, 0) / validFreqs.length : 0
    })

    // Dominant IMF (highest energy)
    const dominantIdx = energies.indexOf(Math.max(...energies))

    // Signal from dominant IMF + trend (residue)
    const domImf = imfs[dominantIdx]
    const domSlope = domImf.length > 1 ? domImf[domImf.length - 1] - domImf[domImf.length - 2] : 0
    const trendSlope = residue.length > 1 ? residue[residue.length - 1] - residue[residue.length - 2] : 0

    let sigDir = 'NEUTRAL'
    let reason = ''
    if (trendSlope > 0 && domSlope > 0) {
      sigDir = 'BUY'
      reason = `Trend up + dominant IMF${dominantIdx + 1} positive`
    } else if (trendSlope < 0 && domSlope < 0) {
      sigDir = 'SELL'
      reason = `Trend down + dominant IMF${dominantIdx + 1} negative`
    } else {
      reason = `Trend: ${trendSlope > 0 ? 'up' : 'down'}, IMF${dominantIdx + 1}: ${domSlope > 0 ? '+' : '-'}`
    }

    return {
      imfs, residue, hht, energies, meanFreqs,
      energyPct: energies.map(e => (e / totalEnergy) * 100),
      dominantIdx, sigDir, reason,
      signal, prices, N,
    }
  }, [candles, exchange, symbol, maxIMFs, maxIter])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 32 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 300, P = 30
  const colors = ['#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316']
  const sigColor = data.sigDir === 'BUY' ? '#22c55e' : data.sigDir === 'SELL' ? '#ef4444' : '#94a3b8'

  const allVals = [...data.imfs.flat(), ...data.residue]
  const maxAbs = Math.max(0.001, ...allVals.map(Math.abs))
  const sx = (i) => P + (i / data.N) * (W - 2 * P)
  const sy = (v) => H / 2 - (v / maxAbs) * (H / 2 - P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Empirical Mode Decomposition (EMD) + HHT — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.sigDir}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max IMFs:</span>
          <input type="number" value={maxIMFs} onChange={e => setMaxIMFs(Math.max(2, Math.min(8, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Sift Iter:</span>
          <input type="number" value={maxIter} onChange={e => setMaxIter(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showHilbert} onChange={e => setShowHilbert(e.target.checked)} />
          <span className="text-slate-400">Hilbert-Huang</span>
        </label>
      </div>

      {/* IMFs */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Intrinsic Mode Functions (IMF 1-{data.imfs.length}) + Residue</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" strokeDasharray="3,2" />
          {data.imfs.map((imf, k) => {
            const yOffset = H / 2  // All share center
            const path = imf.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${yOffset - (v / maxAbs) * (H / 2 - P) * 0.7}`).join(' ')
            return (
              <g key={k}>
                <path d={path} fill="none" stroke={colors[k % colors.length]} strokeWidth={1.5} opacity={0.8} />
                <text x={W - P} y={15 + k * 12} textAnchor="end" fill={colors[k % colors.length]} fontSize={9}>
                  IMF{k + 1}: E={data.energyPct[k].toFixed(1)}%, f̄={data.meanFreqs[k].toFixed(4)}
                </text>
              </g>
            )
          })}
          {/* Residue */}
          <path
            d={data.residue.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sy(v) * 0.5 + H / 4}`).join(' ')}
            fill="none" stroke="#64748b" strokeWidth={2} strokeDasharray="4,3"
          />
          <text x={W - P} y={15 + data.imfs.length * 12} textAnchor="end" fill="#64748b" fontSize={9}>Residue (trend)</text>
        </svg>
      </div>

      {/* Hilbert-Huang: instantaneous frequency + amplitude */}
      {showHilbert && (
        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">Hilbert-Huang: Instantaneous Amplitude × Frequency (dominant IMF)</div>
          <svg width={W} height={180} className="bg-slate-900 rounded">
            <line x1={P} y1={160} x2={W - P} y2={160} stroke="#334155" />
            {(() => {
              const dom = data.hht[data.dominantIdx]
              const maxAmp = Math.max(0.001, ...dom.amplitude)
              const maxFreq = Math.max(0.001, ...dom.frequency.filter(f => f > 0 && isFinite(f)))
              return dom.amplitude.map((a, i) => {
                const freq = dom.frequency[i]
                const x = sx(i)
                const h = (a / maxAmp) * 120
                const colorFreq = freq > 0 ? `hsl(${Math.min(240, freq * 2000)}, 70%, 50%)` : '#334155'
                return <rect key={i} x={x} y={160 - h} width={Math.max(1, (W - 2 * P) / data.N - 1)} height={h} fill={colorFreq} opacity={0.7} />
              })
            })()}
            <text x={W - P} y={15} textAnchor="end" fill={colors[data.dominantIdx]} fontSize={9}>
              IMF{data.dominantIdx + 1} (dominant)
            </text>
          </svg>
        </div>
      )}

      {/* Energy distribution */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">IMF Energy Distribution</div>
        <div className="flex items-end gap-3 h-20">
          {data.imfs.map((_, k) => (
            <div key={k} className="flex flex-col items-center flex-1">
              <div className="text-[10px] text-slate-400 mb-1">{data.energyPct[k].toFixed(1)}%</div>
              <div className="w-full rounded-t" style={{ height: `${Math.max(2, data.energyPct[k])}%`, background: colors[k % colors.length] }} />
              <div className="text-[10px] text-slate-500 mt-1">IMF{k + 1}</div>
              <div className="text-[10px] text-slate-600">f={data.meanFreqs[k].toFixed(3)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">IMFs</div>
          <div className="text-cyan-400 font-mono">{data.imfs.length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Dominant</div>
          <div className="text-emerald-400 font-mono">IMF{data.dominantIdx + 1}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Dom. Frequency</div>
          <div className="text-amber-400 font-mono">{data.meanFreqs[data.dominantIdx].toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Residual Energy</div>
          <div className="text-slate-300 font-mono">{(data.residue.reduce((s, v) => s + v * v, 0) / data.N).toFixed(6)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason}
      </div>
    </div>
  )
}
