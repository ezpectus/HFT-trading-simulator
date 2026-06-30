import React, { useMemo, useState } from 'react'

// --- Hahn Decomposition (Signed Measure Splitting for Signal/Noise) ---
// Applies the Hahn decomposition theorem to split the return distribution
// into positive (signal) and negative (noise) sets based on a signed
// measure derived from expected value.
//
// Mathematical foundation:
//   Hahn decomposition: X = P union N, P intersect N = empty
//   where mu(A) >= 0 for all A subset P (positive set)
//   and mu(A) <= 0 for all A subset N (negative set)
//
//   Jordan decomposition: mu = mu+ - mu-
//   mu+(A) = mu(A intersect P), mu-(A) = -mu(A intersect N)
//   Total variation: |mu| = mu+ + mu-
//
//   For trading: signed measure = E[return * indicator]
//   P = set where expected return > 0 (signal)
//   N = set where expected return < 0 (noise/anti-signal)
//
//   Applications: signal/noise separation, trade region identification,
//   signed volume analysis, directional bias detection

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

export default function HahnDecomposition({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(150)
  const [nBins, setNBins] = useState(30)
  const [threshold, setThreshold] = useState(0)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    const n = returns.length
    if (n < 20) return null

    // Create histogram bins
    const minR = Math.min(...returns)
    const maxR = Math.max(...returns)
    const binWidth = (maxR - minR) / nBins
    const bins = []
    for (let i = 0; i < nBins; i++) {
      const lo = minR + i * binWidth
      const hi = lo + binWidth
      const mid = (lo + hi) / 2
      const count = returns.filter(r => r >= lo && (i === nBins - 1 ? r <= hi : r < hi)).length
      const freq = count / n
      // Signed measure: mu(bin) = E[return * 1_{bin}] = mid * freq
      const signedMeasure = mid * freq
      bins.push({ lo, hi, mid, count, freq, signedMeasure, isPositive: signedMeasure > threshold })
    }

    // Hahn decomposition: P (positive set) and N (negative set)
    const positiveBins = bins.filter(b => b.isPositive)
    const negativeBins = bins.filter(b => !b.isPositive)

    // Jordan decomposition
    const muPlus = positiveBins.reduce((s, b) => s + b.signedMeasure, 0)
    const muMinus = Math.abs(negativeBins.reduce((s, b) => s + b.signedMeasure, 0))
    const totalVariation = muPlus + muMinus

    // Signal-to-noise ratio
    const snr = muPlus / (muMinus + 1e-10)

    // Cumulative signed measure
    let cumMu = 0
    const cumulative = bins.map(b => {
      cumMu += b.signedMeasure
      return { mid: b.mid, cumMu }
    })

    // Rolling Hahn decomposition over time
    const windowSize = 30
    const rollingDecomp = []
    for (let i = 0; i + windowSize <= n; i += Math.max(3, Math.floor(windowSize / 4))) {
      const window = returns.slice(i, i + windowSize)
      const wMean = window.reduce((a, b) => a + b, 0) / window.length
      const posCount = window.filter(r => r > 0).length
      const negCount = window.filter(r => r < 0).length
      const posSum = window.filter(r => r > 0).reduce((s, r) => s + r, 0)
      const negSum = Math.abs(window.filter(r => r < 0).reduce((s, r) => s + r, 0))
      rollingDecomp.push({
        idx: i,
        muPlus: posSum / windowSize,
        muMinus: negSum / windowSize,
        totalVar: (posSum + negSum) / windowSize,
        snr: posSum / (negSum + 1e-10),
        bias: wMean,
      })
    }

    // Current signal
    const currentSNR = rollingDecomp[rollingDecomp.length - 1]?.snr || snr
    const currentBias = rollingDecomp[rollingDecomp.length - 1]?.bias || 0
    let signal = 'BALANCED'
    let reason = ''
    if (currentSNR > 2 && currentBias > 0) {
      signal = 'STRONG_SIGNAL_LONG'
      reason = `Positive set dominates (SNR=${currentSNR.toFixed(2)}, bias=${currentBias.toFixed(6)})`
    } else if (currentSNR > 2 && currentBias < 0) {
      signal = 'STRONG_SIGNAL_SHORT'
      reason = `Negative set dominates (SNR=${currentSNR.toFixed(2)}, bias=${currentBias.toFixed(6)})`
    } else if (currentSNR > 1.2) {
      signal = 'WEAK_SIGNAL'
      reason = `Mild directional bias (SNR=${currentSNR.toFixed(2)}, bias=${currentBias.toFixed(6)})`
    } else {
      reason = `Signal/noise balanced (SNR=${currentSNR.toFixed(2)}, TV=${totalVariation.toFixed(6)})`
    }

    return {
      bins, positiveBins, negativeBins,
      muPlus, muMinus, totalVariation, snr,
      cumulative, rollingDecomp,
      signal, reason, currentSNR, currentBias,
      minR, maxR,
    }
  }, [candles, exchange, symbol, lookback, nBins, threshold])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'STRONG_SIGNAL_LONG' ? '#22c55e' : data.signal === 'STRONG_SIGNAL_SHORT' ? '#ef4444' : data.signal === 'WEAK_SIGNAL' ? '#f59e0b' : '#94a3b8'

  // Histogram with Hahn coloring
  const maxFreq = Math.max(...data.bins.map(b => b.freq), 0.01)
  const maxAbsMu = Math.max(...data.bins.map(b => Math.abs(b.signedMeasure)), 0.001)
  const sxBin = (i) => P + (i / data.bins.length) * (W - 2 * P)
  const barWidth = (W - 2 * P) / data.bins.length - 2
  const syFreq = (v) => H - P - (v / maxFreq) * (H - 2 * P)
  const syMu = (v) => H - P - ((v + maxAbsMu) / (2 * maxAbsMu)) * (H - 2 * P)

  // Rolling decomposition
  const maxTV = Math.max(...data.rollingDecomp.map(d => d.totalVar), 0.001)
  const maxSNR = Math.max(...data.rollingDecomp.map(d => d.snr), 0.1)
  const sxR = (i) => P + (i / data.rollingDecomp.length) * (W - 2 * P)
  const syTV = (v) => H - P - (v / maxTV) * (H - 2 * P)
  const sySNR = (v) => H - P - (Math.min(v, 5) / 5) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Hahn Decomposition (Signal/Noise Split) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Bins:</span>
          <input type="number" value={nBins} onChange={e => setNBins(Math.max(10, Math.min(60, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Threshold:</span>
          <input type="number" step="0.0001" value={threshold} onChange={e => setThreshold(+e.target.value)} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(60, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Hahn decomposition histogram */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Hahn Decomposition: Return Histogram colored by signed measure (green=P+ signal, red=N- noise)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.bins.map((b, i) => (
            <rect key={i} x={sxBin(i) + 1} y={syFreq(b.freq)} width={barWidth} height={H - P - syFreq(b.freq)} fill={b.isPositive ? '#22c55e' : '#ef4444'} opacity={0.6} rx={2} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>P+ (positive set, signal)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>N- (negative set, noise)</text>
        </svg>
      </div>

      {/* Signed measure */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Signed Measure mu(bin) = mid * freq (Jordan decomposition: mu = mu+ - mu-)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.bins.map((b, i) => (
            <line key={i} x1={sxBin(i) + barWidth / 2 + 1} y1={H / 2} x2={sxBin(i) + barWidth / 2 + 1} y2={syMu(b.signedMeasure)} stroke={b.isPositive ? '#22c55e' : '#ef4444'} strokeWidth={barWidth / 2} opacity={0.7} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>mu+ = {data.muPlus.toFixed(6)}</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>mu- = {data.muMinus.toFixed(6)}</text>
          <text x={W - P} y={48} textAnchor="end" fill="#a855f7" fontSize={9}>|mu| = {data.totalVariation.toFixed(6)}</text>
        </svg>
      </div>

      {/* Rolling decomposition */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Rolling Hahn Decomposition: Total Variation |mu| and SNR over time</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.rollingDecomp.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sxR(i)} ${syTV(d.totalVar)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={2} />
          <path d={data.rollingDecomp.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sxR(i)} ${sySNR(d.snr)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={1.5} opacity={0.7} />

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>|mu| total variation</text>
          <text x={W - P} y={34} textAnchor="end" fill="#06b6d4" fontSize={9}>SNR (mu+/mu-)</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">mu+ (signal)</div>
          <div className="text-emerald-400 font-mono">{data.muPlus.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">mu- (noise)</div>
          <div className="text-red-400 font-mono">{data.muMinus.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">|mu| total</div>
          <div className="text-purple-400 font-mono">{data.totalVariation.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">SNR</div>
          <div className="text-cyan-400 font-mono">{data.currentSNR.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Bias</div>
          <div className="text-amber-400 font-mono">{data.currentBias.toFixed(6)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Hahn:</strong> X = P union N, mu(P) {'>='} 0, mu(N) {'<='} 0 |
        <strong> Jordan:</strong> mu = mu+ - mu-, |mu| = mu+ + mu- |
        <strong> SNR:</strong> mu+ / mu- (signal-to-noise ratio) |
        <strong> Trading:</strong> P = signal region (long), N = noise region (avoid)
      </div>
    </div>
  )
}
