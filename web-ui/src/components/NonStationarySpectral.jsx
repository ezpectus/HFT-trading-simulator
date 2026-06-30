import React, { useMemo, useState } from 'react'

// ─── Non-Stationary Spectral Analysis (STFT + CWT) ──────────────────────────
// Short-Time Fourier Transform (STFT) and Continuous Wavelet Transform (CWT)
// for analyzing non-stationary signals where frequency content changes over time.
//
// Mathematical foundation:
//   STFT: X(t, f) = ∫ x(τ)·w(τ-t)·e^(-2πifτ) dτ
//   Spectrogram: |X(t, f)|²
//   Time resolution: Δt = window_size / fs
//   Frequency resolution: Δf = fs / window_size
//   Uncertainty: Δt · Δf ≥ 1/(4π) (Heisenberg)
//
//   CWT: W(t, s) = (1/√s) · ∫ x(τ)·ψ*((τ-t)/s) dτ
//   Morlet wavelet: ψ(t) = e^(iω₀t)·e^(-t²/2)
//   Scale → frequency: f = ω₀ / (2π·s)
//
//   Applications: detect changing market cycles, dominant frequency drift

// DFT for a window
const dft = (signal) => {
  const N = signal.length
  const real = new Array(N).fill(0)
  const imag = new Array(N).fill(0)
  for (let k = 0; k < N; k++) {
    for (let n = 0; n < N; n++) {
      const angle = -2 * Math.PI * k * n / N
      real[k] += signal[n] * Math.cos(angle)
      imag[k] += signal[n] * Math.sin(angle)
    }
  }
  return real.map((r, i) => ({ mag: Math.sqrt(r * r + imag[i] * imag[i]), phase: Math.atan2(imag[i], r) }))
}

// STFT with Hann window
const stft = (signal, windowSize = 16, hopSize = 4) => {
  const N = signal.length
  const frames = []
  for (let start = 0; start + windowSize <= N; start += hopSize) {
    const frame = []
    for (let i = 0; i < windowSize; i++) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (windowSize - 1)) // Hann window
      frame.push(signal[start + i] * w)
    }
    const spectrum = dft(frame)
    frames.push({
      time: start,
      mags: spectrum.slice(0, Math.floor(windowSize / 2)).map(s => s.mag),
    })
  }
  return frames
}

// Morlet wavelet CWT
const morletCWT = (signal, scales, omega0 = 6) => {
  const N = signal.length
  const cwt = []

  for (const s of scales) {
    const coeffs = new Array(N).fill(0)
    const halfSize = Math.min(N, Math.ceil(5 * s))

    for (let t = 0; t < N; t++) {
      let sum = 0
      for (let n = -halfSize; n <= halfSize; n++) {
        const idx = t + n
        if (idx < 0 || idx >= N) continue
        const norm = 1 / Math.sqrt(s)
        const arg = n / s
        const wavelet = norm * Math.exp(-arg * arg / 2) * Math.cos(omega0 * arg)
        sum += signal[idx] * wavelet
      }
      coeffs[t] = Math.abs(sum)
    }

    const freq = omega0 / (2 * Math.PI * s)
    cwt.push({ scale: s, freq, coeffs })
  }

  return cwt
}

// Dominant frequency over time
const dominantFreqOverTime = (stftFrames, fs = 1) => {
  return stftFrames.map(frame => {
    let maxMag = 0, maxIdx = 0
    for (let i = 0; i < frame.mags.length; i++) {
      if (frame.mags[i] > maxMag) { maxMag = frame.mags[i]; maxIdx = i }
    }
    return { time: frame.time, freq: maxIdx * fs / (frame.mags.length * 2), mag: maxMag }
  })
}

export default function NonStationarySpectral({ candles, symbol, exchange }) {
  const [windowSize, setWindowSize] = useState(16)
  const [hopSize, setHopSize] = useState(4)
  const [nScales, setNScales] = useState(20)
  const [lookback, setLookback] = useState(100)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // Normalize
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length)
    const normR = returns.map(r => std > 0 ? (r - mean) / std : 0)

    // STFT
    const stftResult = stft(normR, windowSize, hopSize)

    // Dominant frequency over time
    const domFreq = dominantFreqOverTime(stftResult, 1)

    // CWT
    const scales = Array.from({ length: nScales }, (_, i) => 1 + i * 0.5)
    const cwtResult = morletCWT(normR, scales, 6)

    // Spectral entropy over time
    const spectralEntropy = stftResult.map(frame => {
      const total = frame.mags.reduce((a, b) => a + b, 0) || 1
      const probs = frame.mags.map(m => m / total)
      const entropy = -probs.reduce((s, p) => p > 0 ? s + p * Math.log2(p) : s, 0)
      return { time: frame.time, entropy }
    })

    // Current dominant frequency
    const currentDom = domFreq[domFreq.length - 1]
    const currentEntropy = spectralEntropy[spectralEntropy.length - 1]

    // Signal: cycle detection
    let signal = 'NEUTRAL'
    let reason = ''
    if (currentDom && currentDom.freq > 0.3) {
      signal = 'HIGH_FREQ'
      reason = `Dominant frequency = ${currentDom.freq.toFixed(3)} (short cycles, mean-reverting)`
    } else if (currentDom && currentDom.freq < 0.1) {
      signal = 'LOW_FREQ'
      reason = `Dominant frequency = ${currentDom.freq.toFixed(3)} (long cycles, trending)`
    } else {
      reason = `Dominant frequency = ${currentDom?.freq.toFixed(3) || 'N/A'}`
    }

    return {
      stftResult, domFreq, cwtResult, spectralEntropy,
      currentDom, currentEntropy, signal, reason,
      returns: normR, nFrames: stftResult.length,
    }
  }, [candles, exchange, symbol, windowSize, hopSize, nScales, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'HIGH_FREQ' ? '#06b6d4' : data.signal === 'LOW_FREQ' ? '#f59e0b' : '#94a3b8'

  // Spectrogram (STFT)
  const nFrames = data.stftResult.length
  const nBins = data.stftResult[0]?.mags.length || 1
  const maxMag = Math.max(...data.stftResult.flatMap(f => f.mags), 0.001)
  const sxSpec = (t) => P + (t / nFrames) * (W - 2 * P)
  const sySpec = (f) => H - P - (f / nBins) * (H - 2 * P)

  // CWT scalogram
  const maxCWT = Math.max(...data.cwtResult.flatMap(c => c.coeffs), 0.001)
  const sxCWT = (t) => P + (t / data.returns.length) * (W - 2 * P)
  const syCWT = (s) => P + (s / data.cwtResult.length) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Non-Stationary Spectral Analysis — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(4, Math.min(64, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Hop:</span>
          <input type="number" value={hopSize} onChange={e => setHopSize(Math.max(1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Scales:</span>
          <input type="number" value={nScales} onChange={e => setNScales(Math.max(5, Math.min(40, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* STFT Spectrogram */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">STFT Spectrogram (Hann window, |X(t,f)|²)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          {data.stftResult.map((frame, t) =>
            frame.mags.map((mag, f) => {
              const intensity = mag / maxMag
              const hue = 240 - intensity * 240 // blue to red
              return (
                <rect
                  key={`${t}-${f}`}
                  x={sxSpec(t)} y={sySpec(f)}
                  width={Math.max(1, (W - 2 * P) / nFrames)} height={Math.max(1, (H - 2 * P) / nBins)}
                  fill={`hsl(${hue}, 80%, ${20 + intensity * 40}%)`}
                  opacity={0.8}
                />
              )
            })
          )}
          <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={10}>Time</text>
          <text x={5} y={P + 10} fill="#475569" fontSize={10}>Freq</text>
        </svg>
      </div>

      {/* CWT Scalogram */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">CWT Scalogram (Morlet wavelet, |W(t,s)|)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          {data.cwtResult.map((scale, s) =>
            scale.coeffs.map((c, t) => {
              const intensity = c / maxCWT
              const hue = 240 - intensity * 240
              return (
                <rect
                  key={`${s}-${t}`}
                  x={sxCWT(t)} y={syCWT(s)}
                  width={Math.max(1, (W - 2 * P) / data.returns.length)} height={Math.max(1, (H - 2 * P) / data.cwtResult.length)}
                  fill={`hsl(${hue}, 80%, ${20 + intensity * 40}%)`}
                  opacity={0.8}
                />
              )
            })
          )}
          <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={10}>Time</text>
          <text x={5} y={P + 10} fill="#475569" fontSize={10}>Scale</text>
        </svg>
      </div>

      {/* Dominant frequency + entropy over time */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Dominant Frequency & Spectral Entropy over Time</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Dominant frequency */}
          <path d={data.domFreq.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sxSpec(i)} ${H - P - d.freq * (H - 2 * P) * 2}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {/* Spectral entropy */}
          <path d={data.spectralEntropy.map((e, i) => `${i === 0 ? 'M' : 'L'} ${sxSpec(i)} ${H - P - (e.entropy / Math.log2(nBins)) * (H - 2 * P)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>Dominant freq</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>Spectral entropy</text>
        </svg>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Dom. freq</div>
          <div className="text-cyan-400 font-mono">{data.currentDom?.freq.toFixed(4) || 'N/A'}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Spectral entropy</div>
          <div className="text-amber-400 font-mono">{data.currentEntropy?.entropy.toFixed(4) || 'N/A'}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">STFT frames</div>
          <div className="text-emerald-400 font-mono">{data.nFrames}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">CWT scales</div>
          <div className="text-purple-400 font-mono">{data.cwtResult.length}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> STFT:</strong> Hann window {windowSize}, hop {hopSize} |
        <strong> CWT:</strong> Morlet ω₀=6, {nScales} scales |
        <strong> Uncertainty:</strong> Δt·Δf ≥ 1/(4π)
      </div>
    </div>
  )
}
