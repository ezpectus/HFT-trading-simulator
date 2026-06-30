import React, { useMemo, useState } from 'react'

// ─── Wasserstein Barycenters (Fréchet Mean in OT Space) ─────────────────────
// Computes Wasserstein barycenters — the "average" of multiple distributions
// in the optimal transport geometry, preserving shape and tail structure
// that Euclidean averaging destroys.
//
// Mathematical foundation:
//   Wasserstein barycenter: μ* = argmin Σ_i λ_i · W₂²(μ, μ_i)
//   where W₂ is the 2-Wasserstein distance, λ_i are weights
//
//   Fixed-point iteration (1D case):
//   For 1D distributions, W₂²(μ, ν) = ∫₀¹ (F_μ⁻¹(u) - F_ν⁻¹(u))² du
//   Barycenter quantile function: Q*(u) = Σ_i λ_i · Q_i(u)
//   (quantile averaging = Wasserstein barycenter in 1D)
//
//   Applications: multi-timeframe distribution averaging,
//   consensus distribution from multiple assets, robust regime centroid

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Empirical quantile function
const quantileFunction = (data, nPoints = 100) => {
  const sorted = [...data].sort((a, b) => a - b)
  const n = sorted.length
  const quantiles = []
  for (let i = 0; i < nPoints; i++) {
    const u = (i + 0.5) / nPoints
    const idx = u * (n - 1)
    const lo = Math.floor(idx), hi = Math.ceil(idx)
    const frac = idx - lo
    quantiles.push(sorted[lo] * (1 - frac) + sorted[hi] * frac)
  }
  return quantiles
}

// Wasserstein-2 distance between two 1D distributions (via quantiles)
const wasserstein2 = (q1, q2) => {
  const n = Math.min(q1.length, q2.length)
  let sum = 0
  for (let i = 0; i < n; i++) {
    sum += (q1[i] - q2[i]) ** 2
  }
  return Math.sqrt(sum / n)
}

// Wasserstein barycenter via quantile averaging
const wassersteinBarycenter = (distributions, weights, nPoints = 100) => {
  const nDist = distributions.length
  const quantiles = distributions.map(d => quantileFunction(d, nPoints))

  // Weighted average of quantile functions
  const barycenter = []
  for (let i = 0; i < nPoints; i++) {
    let sum = 0
    for (let j = 0; j < nDist; j++) {
      sum += weights[j] * quantiles[j][i]
    }
    barycenter.push(sum)
  }

  return { barycenter, quantiles }
}

// Euclidean mean (for comparison)
const euclideanMean = (distributions) => {
  const n = distributions[0].length
  const mean = new Array(n).fill(0)
  for (const dist of distributions) {
    for (let i = 0; i < n; i++) mean[i] += dist[i]
  }
  return mean.map(v => v / distributions.length)
}

export default function WassersteinBarycenters({ candles, symbols, exchange }) {
  const [nWindows, setNWindows] = useState(4)
  const [lookback, setLookback] = useState(200)
  const [nPoints, setNPoints] = useState(80)

  const data = useMemo(() => {
    if (!candles?.[exchange] || !symbols || symbols.length < 1) return null
    const sym = symbols[0]
    const cds = candles[exchange]?.[sym]
    if (!cds || cds.length < lookback + 1) return null

    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)
    const n = returns.length

    // Split into nWindows segments
    const windowLen = Math.floor(n / nWindows)
    const distributions = []
    const labels = []
    for (let w = 0; w < nWindows; w++) {
      const segment = returns.slice(w * windowLen, (w + 1) * windowLen)
      if (segment.length > 5) {
        distributions.push(segment)
        labels.push(`W${w + 1}`)
      }
    }

    if (distributions.length < 2) return null

    // Equal weights
    const weights = distributions.map(() => 1 / distributions.length)

    // Wasserstein barycenter
    const { barycenter, quantiles } = wassersteinBarycenter(distributions, weights, nPoints)

    // Euclidean mean of all returns (for comparison)
    const allReturns = distributions.flat()
    const euclideanQuantiles = quantileFunction(allReturns, nPoints)

    // Wasserstein distances from barycenter
    const distances = quantiles.map(q => ({
      label: labels[quantiles.indexOf(q)],
      dist: wasserstein2(q, barycenter),
    }))

    // Also compute pairwise distances
    const pairwiseDistances = []
    for (let i = 0; i < quantiles.length; i++) {
      for (let j = i + 1; j < quantiles.length; j++) {
        pairwiseDistances.push({
          pair: `${labels[i]}-${labels[j]}`,
          dist: wasserstein2(quantiles[i], quantiles[j]),
        })
      }
    }

    // Barycenter statistics
    const baryStats = {
      mean: barycenter.reduce((a, b) => a + b, 0) / barycenter.length,
      std: Math.sqrt(barycenter.reduce((s, v) => s + v * v, 0) / barycenter.length),
      min: Math.min(...barycenter),
      max: Math.max(...barycenter),
    }

    // Fréchet variance: Σ λ_i · W₂²(μ*, μ_i)
    const frechetVar = distances.reduce((s, d) => s + d.dist ** 2, 0) / distances.length

    // Signal: compare barycenter vs Euclidean
    const wassersteinMean = baryStats.mean
    const euclideanMeanVal = euclideanQuantiles.reduce((a, b) => a + b, 0) / euclideanQuantiles.length
    const divergence = wassersteinMean - euclideanMeanVal

    let signal = 'CONSENSUS'
    let reason = ''
    if (Math.abs(divergence) > 0.0005) {
      signal = divergence > 0 ? 'WASSERSTEIN_BULLISH' : 'WASSERSTEIN_BEARISH'
      reason = `Wasserstein barycenter diverges from Euclidean mean by ${divergence.toFixed(6)} (tail-aware)`
    } else {
      reason = `Wasserstein and Euclidean means aligned (Δ=${divergence.toFixed(6)})`
    }

    // Multi-asset barycenter if multiple symbols available
    let multiAssetBary = null
    if (symbols.length >= 2) {
      const multiDists = []
      const multiLabels = []
      for (const s of symbols.slice(0, 5)) {
        const cds2 = candles[exchange]?.[s]
        if (cds2 && cds2.length > lookback) {
          const p2 = cds2.slice(-lookback).map(c => c.close)
          const r2 = computeReturns(p2)
          multiDists.push(r2)
          multiLabels.push(s)
        }
      }
      if (multiDists.length >= 2) {
        const mw = multiDists.map(() => 1 / multiDists.length)
        multiAssetBary = wassersteinBarycenter(multiDists, mw, nPoints)
        multiAssetBary.labels = multiLabels
      }
    }

    return {
      barycenter, quantiles, labels, distributions,
      euclideanQuantiles, distances, pairwiseDistances,
      baryStats, frechetVar, signal, reason,
      wassersteinMean, euclideanMeanVal, divergence,
      multiAssetBary,
    }
  }, [candles, exchange, symbols, nWindows, lookback, nPoints])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'WASSERSTEIN_BULLISH' ? '#22c55e' : data.signal === 'WASSERSTEIN_BEARISH' ? '#ef4444' : '#06b6d4'
  const distColors = ['#06b6d4', '#f59e0b', '#a855f7', '#22c55e', '#ef4444', '#ec4899']

  // Quantile functions plot
  const allQ = [...data.quantiles.flat(), ...data.barycenter, ...data.euclideanQuantiles]
  const minQ = Math.min(...allQ), maxQ = Math.max(...allQ)
  const sxQ = (i) => P + (i / nPoints) * (W - 2 * P)
  const syQ = (v) => H - P - ((v - minQ) / (maxQ - minQ + 0.001)) * (H - 2 * P)

  // Distance bars
  const maxDist = Math.max(...data.distances.map(d => d.dist), 0.001)
  const sxD = (i) => P + (i / data.distances.length) * (W - 2 * P)
  const syD = (v) => H - P - (v / maxDist) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Wasserstein Barycenters (OT Fréchet Mean) — {exchange}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Windows:</span>
          <input type="number" value={nWindows} onChange={e => setNWindows(Math.max(2, Math.min(8, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(100, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Quantile pts:</span>
          <input type="number" value={nPoints} onChange={e => setNPoints(Math.max(20, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Quantile functions */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Quantile Functions Q(u): Distributions, Barycenter, Euclidean Mean</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Individual distributions */}
          {data.quantiles.map((q, i) => (
            <path key={i} d={q.map((v, j) => `${j === 0 ? 'M' : 'L'} ${sxQ(j)} ${syQ(v)}`).join(' ')} fill="none" stroke={distColors[i]} strokeWidth={1} opacity={0.4} />
          ))}

          {/* Wasserstein barycenter */}
          <path d={data.barycenter.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxQ(i)} ${syQ(v)}`).join(' ')} fill="none" stroke="#fbbf24" strokeWidth={2.5} />

          {/* Euclidean mean */}
          <path d={data.euclideanQuantiles.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxQ(i)} ${syQ(v)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="5,3" />

          {data.labels.map((l, i) => (
            <text key={i} x={W - P} y={20 + i * 14} textAnchor="end" fill={distColors[i]} fontSize={9} opacity={0.6}>{l}</text>
          ))}
          <text x={W - P} y={20 + data.labels.length * 14} textAnchor="end" fill="#fbbf24" fontSize={9}>Wasserstein barycenter</text>
          <text x={W - P} y={20 + (data.labels.length + 1) * 14} textAnchor="end" fill="#ef4444" fontSize={9}>Euclidean mean</text>
        </svg>
      </div>

      {/* Wasserstein distances from barycenter */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">W₂ Distance from Barycenter (Fréchet variance decomposition)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.distances.map((d, i) => (
            <g key={i}>
              <rect x={sxD(i) + 20} y={syD(d.dist)} width={60} height={H - P - syD(d.dist)} fill={distColors[i]} opacity={0.7} />
              <text x={sxD(i) + 50} y={H - P + 12} textAnchor="middle" fill={distColors[i]} fontSize={9}>{d.label}</text>
              <text x={sxD(i) + 50} y={syD(d.dist) - 5} textAnchor="middle" fill={distColors[i]} fontSize={8}>{d.dist.toFixed(6)}</text>
            </g>
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#fbbf24" fontSize={9}>Fréchet var: {data.frechetVar.toFixed(8)}</text>
        </svg>
      </div>

      {/* Pairwise distance matrix */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Pairwise W₂ Distances</div>
        <div className="space-y-1">
          {data.pairwiseDistances.map((pd, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-20">{pd.pair}</span>
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="h-full rounded" style={{ width: `${(pd.dist / maxDist) * 100}%`, background: '#a855f7' }} />
              </div>
              <span className="text-purple-400 font-mono w-20">{pd.dist.toFixed(6)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-asset barycenter */}
      {data.multiAssetBary && (
        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">Multi-Asset Wasserstein Barycenter (cross-asset consensus)</div>
          <svg width={W} height={H} className="bg-slate-900 rounded">
            <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
            <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

            {data.multiAssetBary.quantiles.map((q, i) => (
              <path key={i} d={q.map((v, j) => `${j === 0 ? 'M' : 'L'} ${sxQ(j)} ${syQ(v)}`).join(' ')} fill="none" stroke={distColors[i]} strokeWidth={1} opacity={0.4} />
            ))}

            <path d={data.multiAssetBary.barycenter.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxQ(i)} ${syQ(v)}`).join(' ')} fill="none" stroke="#fbbf24" strokeWidth={2.5} />

            {data.multiAssetBary.labels.map((l, i) => (
              <text key={i} x={W - P} y={20 + i * 14} textAnchor="end" fill={distColors[i]} fontSize={9} opacity={0.6}>{l}</text>
            ))}
            <text x={W - P} y={20 + data.multiAssetBary.labels.length * 14} textAnchor="end" fill="#fbbf24" fontSize={9}>Barycenter</text>
          </svg>
        </div>
      )}

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Bary. mean</div>
          <div className="text-cyan-400 font-mono">{data.baryStats.mean.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Bary. std</div>
          <div className="text-emerald-400 font-mono">{data.baryStats.std.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Fréchet var</div>
          <div className="text-amber-400 font-mono">{data.frechetVar.toFixed(8)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">W₂ vs Euc.</div>
          <div className="text-purple-400 font-mono">{data.divergence.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Windows</div>
          <div className="text-slate-300 font-mono">{data.distributions.length}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Barycenter:</strong> μ* = argmin Σ λ_i·W₂²(μ, μ_i) |
        <strong> 1D:</strong> Q*(u) = Σ λ_i·Q_i(u) (quantile averaging) |
        <strong> W₂:</strong> ∫₀¹(Q_μ(u) - Q_ν(u))² du |
        <strong> Advantage:</strong> preserves tail structure (vs Euclidean mean)
      </div>
    </div>
  )
}
