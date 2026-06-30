import React, { useMemo, useState } from 'react'

// ─── Rényi Entropy Dynamics (Order-α Entropy Tracking) ──────────────────────
// Tracks Rényi entropy at various orders α to probe different aspects of
// the return distribution: tail behavior, concentration, and diversity.
//
// Mathematical foundation:
//   Rényi entropy: H_α(X) = (1/(1-α)) · log Σ p_i^α
//   α → 0: H_0 = log |support| (Hartley entropy)
//   α → 1: H_1 = Shannon entropy
//   α → ∞: H_∞ = -log max(p_i) (min-entropy, most conservative)
//   α = 2: H_2 = -log Σ p_i² (collision entropy)
//
//   Tsallis entropy: S_q = (1 - Σ p_i^q) / (q - 1)
//   Relationship: H_α = (1/(1-α)) · log(1 + (1-α)·S_α)
//
//   Generalized dimensions: D_α = lim_{r→0} H_α / log(1/r)
//   D_0 = box-counting, D_1 = information, D_2 = correlation dimension
//
//   Applications: market efficiency across scales, tail risk assessment,
//   distribution concentration, regime diversity

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Compute histogram probabilities
const histogram = (data, nBins) => {
  const min = Math.min(...data), max = Math.max(...data)
  const binW = (max - min) / nBins || 1
  const counts = new Array(nBins).fill(0)
  for (const v of data) {
    const idx = Math.min(nBins - 1, Math.max(0, Math.floor((v - min) / binW)))
    counts[idx]++
  }
  const total = data.length
  return { probs: counts.map(c => c / total), min, max, binW }
}

// Rényi entropy at order α
const renyiEntropy = (probs, alpha) => {
  if (alpha <= 0) {
    // Hartley entropy: log of support size
    const support = probs.filter(p => p > 0).length
    return Math.log2(support)
  }
  if (Math.abs(alpha - 1) < 1e-6) {
    // Shannon entropy
    return -probs.filter(p => p > 0).reduce((s, p) => s + p * Math.log2(p), 0)
  }
  if (alpha === Infinity) {
    // Min-entropy
    return -Math.log2(Math.max(...probs))
  }
  // General: (1/(1-α)) · log Σ p_i^α
  const sum = probs.filter(p => p > 0).reduce((s, p) => s + Math.pow(p, alpha), 0)
  return Math.log2(sum) / (1 - alpha)
}

// Tsallis entropy at order q
const tsallisEntropy = (probs, q) => {
  if (Math.abs(q - 1) < 1e-6) {
    return -probs.filter(p => p > 0).reduce((s, p) => s + p * Math.log(p), 0)
  }
  return (1 - probs.filter(p => p > 0).reduce((s, p) => s + Math.pow(p, q), 0)) / (q - 1)
}

// Generalized dimensions (fractal spectrum)
const generalizedDimensions = (returns, nBinsList, alpha) => {
  const results = []
  for (const nBins of nBinsList) {
    const { probs } = histogram(returns, nBins)
    const h = renyiEntropy(probs, alpha)
    results.push({ nBins, logR: Math.log2(nBins), entropy: h, dim: h / Math.log2(nBins) })
  }
  return results
}

export default function RenyiEntropyDynamics({ candles, symbol, exchange }) {
  const [nBins, setNBins] = useState(20)
  const [lookback, setLookback] = useState(150)
  const [windowSize, setWindowSize] = useState(40)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Full distribution Rényi entropies at various α
    const { probs } = histogram(returns, nBins)
    const alphas = [0, 0.5, 1, 2, 3, 5, 10, Infinity]
    const renyiSpectrum = alphas.map(alpha => ({
      alpha,
      entropy: renyiEntropy(probs, alpha),
      tsallis: tsallisEntropy(probs, alpha === 0 ? 0.01 : alpha),
    }))

    // Generalized dimensions D_α
    const nBinsList = [5, 10, 15, 20, 25, 30, 40, 50]
    const dims = alphas.filter(a => a > 0 && a !== Infinity).map(alpha => {
      const gd = generalizedDimensions(returns, nBinsList, alpha)
      // Linear regression: H_α vs log(1/r) → slope = D_α
      const xs = gd.map(g => g.logR)
      const ys = gd.map(g => g.entropy)
      const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
      const meanY = ys.reduce((a, b) => a + b, 0) / ys.length
      let num = 0, den = 0
      for (let i = 0; i < xs.length; i++) {
        num += (xs[i] - meanX) * (ys[i] - meanY)
        den += (xs[i] - meanX) ** 2
      }
      const D = den > 0 ? num / den : 0
      return { alpha, D, gd }
    })

    // Sliding window Rényi entropy at α=2 (collision entropy)
    const slidingRenyi = []
    for (let i = 0; i + windowSize <= returns.length; i += Math.max(3, Math.floor(windowSize / 4))) {
      const window = returns.slice(i, i + windowSize)
      const { probs: wp } = histogram(window, nBins)
      slidingRenyi.push({
        idx: i,
        h0: renyiEntropy(wp, 0),
        h1: renyiEntropy(wp, 1),
        h2: renyiEntropy(wp, 2),
        hInf: renyiEntropy(wp, Infinity),
      })
    }

    // Current entropies
    const current = slidingRenyi[slidingRenyi.length - 1] || { h0: 0, h1: 0, h2: 0, hInf: 0 }

    // Signal: compare H_0 (diversity) vs H_∞ (concentration)
    const concentrationRatio = current.hInf / (current.h0 + 1e-10)
    let signal = 'BALANCED'
    let reason = ''
    if (concentrationRatio < 0.3) {
      signal = 'DIVERSE'
      reason = `H_∞/H_0 = ${concentrationRatio.toFixed(4)} (diverse distribution, low concentration)`
    } else if (concentrationRatio > 0.7) {
      signal = 'CONCENTRATED'
      reason = `H_∞/H_0 = ${concentrationRatio.toFixed(4)} (concentrated distribution, high tail risk)`
    } else {
      reason = `H_∞/H_0 = ${concentrationRatio.toFixed(4)} (balanced distribution)`
    }

    // Efficiency: H_1 / H_0 (Shannon / Hartley)
    const efficiency = current.h1 / (current.h0 + 1e-10)

    return {
      renyiSpectrum, dims, slidingRenyi, current,
      concentrationRatio, efficiency, signal, reason,
      probs, nBins,
    }
  }, [candles, exchange, symbol, nBins, lookback, windowSize])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'DIVERSE' ? '#22c55e' : data.signal === 'CONCENTRATED' ? '#ef4444' : '#f59e0b'

  // Rényi spectrum H(α)
  const alphas = data.renyiSpectrum.map(r => r.alpha)
  const maxH = Math.max(...data.renyiSpectrum.map(r => r.entropy), 0.1)
  const sxAlpha = (a) => {
    if (a === Infinity) return W - P
    return P + (a / 10) * (W - 2 * P) * 0.9
  }
  const syH = (v) => H - P - (v / maxH) * (H - 2 * P)

  // Generalized dimensions D_α
  const maxD = Math.max(...data.dims.map(d => d.D), 0.1)
  const minD = Math.min(...data.dims.map(d => d.D), 0)
  const sxD = (a) => P + (a / 5) * (W - 2 * P)
  const syD = (v) => H - P - ((v - minD) / (maxD - minD + 0.001)) * (H - 2 * P)

  // Sliding window entropies
  const maxSW = Math.max(...data.slidingRenyi.map(s => Math.max(s.h0, s.h1, s.h2, s.hInf)), 0.1)
  const sxSW = (i) => P + (i / data.slidingRenyi.length) * (W - 2 * P)
  const sySW = (v) => H - P - (v / maxSW) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Rényi Entropy Dynamics — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Bins:</span>
          <input type="number" value={nBins} onChange={e => setNBins(Math.max(5, Math.min(50, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(20, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(60, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Rényi spectrum */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Rényi Entropy Spectrum H_α (α: 0→Hartley, 1→Shannon, ∞→min-entropy)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.renyiSpectrum.map((r, i) => (
            <g key={i}>
              <line x1={sxAlpha(r.alpha)} y1={H - P} x2={sxAlpha(r.alpha)} y2={syH(r.entropy)} stroke="#06b6d4" strokeWidth={2} opacity={0.7} />
              <circle cx={sxAlpha(r.alpha)} cy={syH(r.entropy)} r={4} fill="#06b6d4" />
              <text x={sxAlpha(r.alpha)} y={H - P + 12} textAnchor="middle" fill="#475569" fontSize={8}>{r.alpha === Infinity ? '∞' : r.alpha}</text>
            </g>
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>H_α (Rényi entropy)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>H_∞/H_0 = {data.concentrationRatio.toFixed(4)}</text>
        </svg>
      </div>

      {/* Generalized dimensions */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Generalized (Fractal) Dimensions D_α (multifractal spectrum)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.dims.map((d, i) => (
            <g key={i}>
              <line x1={sxD(d.alpha)} y1={H - P} x2={sxD(d.alpha)} y2={syD(d.D)} stroke="#f59e0b" strokeWidth={2} opacity={0.7} />
              <circle cx={sxD(d.alpha)} cy={syD(d.D)} r={4} fill="#f59e0b" />
              <text x={sxD(d.alpha)} y={H - P + 12} textAnchor="middle" fill="#475569" fontSize={8}>α={d.alpha}</text>
            </g>
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#f59e0b" fontSize={9}>D_α (generalized dimension)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#a855f7" fontSize={9}>D_0=box, D_1=info, D_2=correlation</text>
        </svg>
      </div>

      {/* Sliding window entropies */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Sliding Window: H_0, H_1, H_2, H_∞ Over Time</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.slidingRenyi.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxSW(i)} ${sySW(s.h0)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={1.5} />
          <path d={data.slidingRenyi.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxSW(i)} ${sySW(s.h1)}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth={1.5} />
          <path d={data.slidingRenyi.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxSW(i)} ${sySW(s.h2)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={1.5} />
          <path d={data.slidingRenyi.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxSW(i)} ${sySW(s.hInf)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={1.5} />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>H_0 (Hartley)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>H_1 (Shannon)</text>
          <text x={W - P} y={48} textAnchor="end" fill="#f59e0b" fontSize={9}>H_2 (collision)</text>
          <text x={W - P} y={62} textAnchor="end" fill="#ef4444" fontSize={9}>H_∞ (min-entropy)</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">H_0 (diversity)</div>
          <div className="text-cyan-400 font-mono">{data.current.h0.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">H_1 (Shannon)</div>
          <div className="text-emerald-400 font-mono">{data.current.h1.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">H_2 (collision)</div>
          <div className="text-amber-400 font-mono">{data.current.h2.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">H_∞ (min-ent)</div>
          <div className="text-red-400 font-mono">{data.current.hInf.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Efficiency</div>
          <div className="text-purple-400 font-mono">{(data.efficiency * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Rényi:</strong> H_α = (1/(1-α))·log₂ Σ p_i^α |
        <strong> α→0:</strong> Hartley (support size) |
        <strong> α=1:</strong> Shannon (information) |
        <strong> α→∞:</strong> min-entropy (max concentration) |
        <strong> D_α:</strong> generalized fractal dimensions (multifractal spectrum)
      </div>
    </div>
  )
}
