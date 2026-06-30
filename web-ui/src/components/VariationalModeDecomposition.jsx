import React, { useMemo, useState } from 'react'

// ─── Variational Mode Decomposition (VMD) ────────────────────────────────────
// VMD is a non-recursive signal decomposition method that adaptively
// decomposes a signal into a specified number of modes (VMFs) with
// compact spectral support. Unlike EMD, VMD is mathematically rigorous.
//
// Mathematical foundation:
//   Each mode u_k is compact around a center frequency ω_k.
//   The variational problem minimizes:
//   min Σ_k ||∂_t[(δ(t) + j/(πt)) * u_k(t)] * e^(-jω_k t)||²
//   subject to: Σ_k u_k = f(t)
//
//   ADMM (Alternating Direction Method of Multipliers) solution:
//   1. Mode update: û_k^{n+1}(ω) = (f̂(ω) - Σ_{i≠k} û_i + λ̂/2) /
//                   (1 + 2α(ω - ω_k)²)
//   2. Center frequency: ω_k^{n+1} = ∫₀∞ ω|û_k(ω)|² dω / ∫₀∞ |û_k(ω)|² dω
//   3. Lagrange multiplier: λ̂^{n+1}(ω) = λ̂(ω) + τ(f̂(ω) - Σ_k û_k(ω))
//
//   Convergence: Σ_k ||û_k^{n+1} - û_k^n||² / ||û_k^n||² < ε

// FFT (Cooley-Tukey radix-2)
const fft = (signal) => {
  const N = signal.length
  if (N <= 1) return signal.map(v => ({ re: v, im: 0 }))

  // Pad to power of 2
  const N2 = Math.pow(2, Math.ceil(Math.log2(N)))
  const padded = [...signal, ...new Array(N2 - N).fill(0)]

  // Bit-reversal permutation
  const x = padded.map(v => ({ re: v, im: 0 }))
  let j = 0
  for (let i = 1; i < N2; i++) {
    let bit = N2 >> 1
    while (j & bit) { j ^= bit; bit >>= 1 }
    j ^= bit
    if (i < j) { [x[i], x[j]] = [x[j], x[i]] }
  }

  // Butterfly
  for (let len = 2; len <= N2; len <<= 1) {
    const halfLen = len >> 1
    const angle = -2 * Math.PI / len
    const wRe = Math.cos(angle), wIm = Math.sin(angle)
    for (let i = 0; i < N2; i += len) {
      let curRe = 1, curIm = 0
      for (let k = 0; k < halfLen; k++) {
        const tRe = curRe * x[i + k + halfLen].re - curIm * x[i + k + halfLen].im
        const tIm = curRe * x[i + k + halfLen].im + curIm * x[i + k + halfLen].re
        x[i + k + halfLen] = { re: x[i + k].re - tRe, im: x[i + k].im - tIm }
        x[i + k] = { re: x[i + k].re + tRe, im: x[i + k].im + tIm }
        const newRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = newRe
      }
    }
  }

  return x
}

// Inverse FFT
const ifft = (spectrum) => {
  const N = spectrum.length
  // Conjugate
  const conj = spectrum.map(c => ({ re: c.re, im: -c.im }))
  // FFT of conjugate
  const result = fft(conj.map(c => c.re + c.im * 0)) // This won't work; need complex FFT
  // Simpler: direct IFFT via DFT for moderate sizes
  const time = new Array(N).fill(0)
  for (let n = 0; n < N; n++) {
    let re = 0, im = 0
    for (let k = 0; k < N; k++) {
      const angle = 2 * Math.PI * k * n / N
      re += spectrum[k].re * Math.cos(angle) - spectrum[k].im * Math.sin(angle)
      im += spectrum[k].re * Math.sin(angle) + spectrum[k].im * Math.cos(angle)
    }
    time[n] = re / N
  }
  return time
}

// VMD algorithm
const vmd = (signal, K, alpha = 2000, tau = 0, DC = false, tol = 1e-6, maxIter = 100) => {
  const N = signal.length
  const T = N
  const fs = 1 / T

  // Mirroring extension
  const f = [...signal.slice().reverse(), ...signal, ...signal.slice().reverse()]
  const TExt = f.length
  const NExt = TExt

  // FFT of signal
  const fHat = fft(f)

  // Frequency axis
  const freqs = new Array(NExt).fill(0)
  for (let i = 0; i < NExt; i++) {
    freqs[i] = i / NExt - 0.5
  }

  // Initialize
  const uHat = Array.from({ length: K }, () => new Array(NExt).fill(0).map(() => ({ re: 0, im: 0 })))
  const omega = new Array(K).fill(0)
  const lambdaHat = new Array(NExt).fill(0).map(() => ({ re: 0, im: 0 }))

  // Initialize center frequencies evenly
  for (let k = 0; k < K; k++) {
    omega[k] = 0.5 * (k + 1) / K
  }
  if (DC) omega[0] = 0

  // ADMM iterations
  let uHatPrev = uHat.map(u => u.map(c => ({ ...c })))
  const omegaHistory = [omega.slice()]

  for (let iter = 0; iter < maxIter; iter++) {
    // Mode update
    for (let k = 0; k < K; k++) {
      // Sum of other modes
      const sumOther = new Array(NExt).fill(0).map(() => ({ re: 0, im: 0 }))
      for (let l = 0; l < K; l++) {
        if (l === k) continue
        for (let i = 0; i < NExt; i++) {
          sumOther[i].re += uHat[l][i].re
          sumOther[i].im += uHat[l][i].im
        }
      }

      // Update u_k
      for (let i = 0; i < NExt; i++) {
        const freqIdx = i < NExt / 2 ? i : i - NExt
        const w = freqIdx / NExt
        const numerator = {
          re: fHat[i].re - sumOther[i].re + lambdaHat[i].re / 2,
          im: fHat[i].im - sumOther[i].im + lambdaHat[i].im / 2,
        }
        const denom = 1 + 2 * alpha * (w - omega[k]) ** 2
        uHat[k][i] = { re: numerator.re / denom, im: numerator.im / denom }
      }

      // Center frequency update
      if (!DC || k > 0) {
        let numRe = 0, numIm = 0, den = 0
        for (let i = 0; i < NExt; i++) {
          const w = i < NExt / 2 ? i / NExt : (i - NExt) / NExt
          const mag2 = uHat[k][i].re ** 2 + uHat[k][i].im ** 2
          numRe += w * mag2
          den += mag2
        }
        omega[k] = den > 0 ? numRe / den : omega[k]
      }
    }

    // Lagrange multiplier update
    for (let i = 0; i < NExt; i++) {
      let sumRe = 0, sumIm = 0
      for (let k = 0; k < K; k++) {
        sumRe += uHat[k][i].re
        sumIm += uHat[k][i].im
      }
      lambdaHat[i] = {
        re: lambdaHat[i].re + tau * (fHat[i].re - sumRe),
        im: lambdaHat[i].im + tau * (fHat[i].im - sumIm),
      }
    }

    // Convergence check
    let convergence = 0
    for (let k = 0; k < K; k++) {
      for (let i = 0; i < NExt; i++) {
        const diff = uHat[k][i].re - uHatPrev[k][i].re
        convergence += diff * diff
      }
    }
    convergence /= NExt

    omegaHistory.push(omega.slice())

    if (convergence < tol) break

    uHatPrev = uHat.map(u => u.map(c => ({ ...c })))
  }

  // Reconstruct modes in time domain
  const modes = []
  for (let k = 0; k < K; k++) {
    const timeSignal = ifft(uHat[k])
    // Extract the central part (remove mirror extension)
    const N2 = signal.length
    const start = N2
    modes.push({
      signal: timeSignal.slice(start, start + N2),
      centerFreq: omega[k],
      spectrum: uHat[k].slice(0, NExt / 2).map(c => Math.sqrt(c.re ** 2 + c.im ** 2)),
    })
  }

  // Residual
  const reconstructed = new Array(signal.length).fill(0)
  for (const mode of modes) {
    for (let i = 0; i < signal.length; i++) reconstructed[i] += mode.signal[i]
  }
  const residual = signal.map((s, i) => s - reconstructed[i])

  // Energy of each mode
  const energies = modes.map(m => {
    const mean = m.signal.reduce((a, b) => a + b, 0) / m.signal.length
    return m.signal.reduce((s, v) => s + (v - mean) ** 2, 0) / m.signal.length
  })
  const totalEnergy = energies.reduce((a, b) => a + b, 0) + 1e-10

  return {
    modes, residual, energies,
    energyPct: energies.map(e => (e / totalEnergy) * 100),
    centerFreqs: omega,
    omegaHistory,
    nIter: omegaHistory.length,
  }
}

export default function VariationalModeDecomposition({ candles, symbol, exchange }) {
  const [K, setK] = useState(4)
  const [alpha, setAlpha] = useState(2000)
  const [maxIter, setMaxIter] = useState(50)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 32) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)

    // Use last 128 prices (or available)
    const N = Math.min(128, prices.length)
    const signal = prices.slice(-N)

    // Detrend
    const mean = signal.reduce((a, b) => a + b, 0) / N
    const detrended = signal.map(s => s - mean)

    const result = vmd(detrended, K, alpha, 0, false, 1e-6, maxIter)

    // Signal from dominant mode
    const dominantMode = result.modes.reduce((best, m, i) =>
      result.energies[i] > result.energies[best] ? i : best, 0)

    const domSignal = result.modes[dominantMode].signal
    const domSlope = domSignal.length > 1 ? domSignal[domSignal.length - 1] - domSignal[domSignal.length - 2] : 0

    // Trend mode (lowest frequency)
    const trendIdx = result.centerFreqs.indexOf(Math.min(...result.centerFreqs))
    const trendSignal = result.modes[trendIdx].signal
    const trendSlope = trendSignal.length > 1 ? trendSignal[trendSignal.length - 1] - trendSignal[trendSignal.length - 2] : 0

    let sigDir = 'NEUTRAL'
    let reason = ''
    if (trendSlope > 0 && domSignal[domSignal.length - 1] > 0) {
      sigDir = 'BUY'
      reason = `Trend up + dominant mode positive (freq=${result.centerFreqs[dominantMode].toFixed(4)})`
    } else if (trendSlope < 0 && domSignal[domSignal.length - 1] < 0) {
      sigDir = 'SELL'
      reason = `Trend down + dominant mode negative (freq=${result.centerFreqs[dominantMode].toFixed(4)})`
    } else {
      reason = `Trend: ${trendSlope > 0 ? 'up' : 'down'}, dominant: ${domSignal[domSignal.length - 1] > 0 ? '+' : '-'}`
    }

    return {
      ...result, signal, mean,
      prices: signal,
      dominantMode, trendIdx,
      sigDir, reason,
      N,
    }
  }, [candles, exchange, symbol, K, alpha, maxIter])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 32 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 280, P = 30
  const colors = ['#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316']
  const sigColor = data.sigDir === 'BUY' ? '#22c55e' : data.sigDir === 'SELL' ? '#ef4444' : '#94a3b8'

  // Y-scale for all modes (shared)
  const allModeVals = data.modes.flatMap(m => m.signal)
  const maxAbs = Math.max(0.001, ...allModeVals.map(Math.abs))
  const sx = (i) => P + (i / data.N) * (W - 2 * P)
  const sy = (v) => H / 2 - (v / maxAbs) * (H / 2 - P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Variational Mode Decomposition (VMD) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.sigDir}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">K (modes):</span>
          <input type="number" value={K} onChange={e => setK(Math.max(2, Math.min(8, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">α (bandwidth):</span>
          <input type="number" value={alpha} onChange={e => setAlpha(Math.max(100, +e.target.value))} className="w-20 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max iter:</span>
          <input type="number" value={maxIter} onChange={e => setMaxIter(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Original signal */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Original Signal (detrended)</div>
        <svg width={W} height={100} className="bg-slate-900 rounded">
          <line x1={P} y1={50} x2={W - P} y2={50} stroke="#334155" strokeDasharray="3,2" />
          <path
            d={data.signal.map((v, i) => {
              const y = 50 - ((v - data.mean) / (Math.max(...data.signal) - Math.min(...data.signal) + 0.001)) * 35
              return `${i === 0 ? 'M' : 'L'} ${sx(i)} ${y}`
            }).join(' ')}
            fill="none" stroke="#64748b" strokeWidth={1.5}
          />
        </svg>
      </div>

      {/* Decomposed modes */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Decomposed Modes (VMF 1-{K})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" strokeDasharray="3,2" />
          {data.modes.map((mode, k) => {
            const path = mode.signal.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sy(v)}`).join(' ')
            return (
              <g key={k}>
                <path d={path} fill="none" stroke={colors[k % colors.length]} strokeWidth={1.5} opacity={0.8} />
                <text x={W - P} y={15 + k * 12} textAnchor="end" fill={colors[k % colors.length]} fontSize={9}>
                  VMF{k + 1}: f={mode.centerFreq.toFixed(4)}, E={data.energyPct[k].toFixed(1)}%
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Energy distribution */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Mode Energy Distribution</div>
        <div className="flex items-end gap-3 h-20">
          {data.modes.map((mode, k) => (
            <div key={k} className="flex flex-col items-center flex-1">
              <div className="text-[10px] text-slate-400 mb-1">{data.energyPct[k].toFixed(1)}%</div>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${Math.max(2, data.energyPct[k])}%`,
                  background: colors[k % colors.length]
                }}
              />
              <div className="text-[10px] text-slate-500 mt-1">VMF{k + 1}</div>
              <div className="text-[10px] text-slate-600">{mode.centerFreq.toFixed(3)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Center frequency convergence */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Center Frequency Convergence (ADMM)</div>
        <svg width={W} height={80} className="bg-slate-900 rounded">
          {data.centerFreqs.map((_, k) => {
            const history = data.omegaHistory.map(h => h[k] || 0)
            const maxF = Math.max(...history, 0.5)
            const path = history.map((f, i) => `${i === 0 ? 'M' : 'L'} ${P + (i / history.length) * (W - 2 * P)} ${70 - (f / maxF) * 60}`).join(' ')
            return <path key={k} d={path} fill="none" stroke={colors[k % colors.length]} strokeWidth={1.5} />
          })}
        </svg>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Iterations</div>
          <div className="text-cyan-400 font-mono">{data.nIter}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Dominant Mode</div>
          <div className="text-emerald-400 font-mono">VMF{data.dominantMode + 1}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Trend Mode</div>
          <div className="text-amber-400 font-mono">VMF{data.trendIdx + 1}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Residual Energy</div>
          <div className="text-slate-300 font-mono">{(data.residual.reduce((s, v) => s + v * v, 0) / data.N).toFixed(6)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason}
      </div>
    </div>
  )
}
