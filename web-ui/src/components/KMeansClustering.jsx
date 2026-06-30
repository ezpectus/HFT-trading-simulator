import React, { useMemo, useState } from 'react'

// ─── K-Means Market Clustering ───────────────────────────────────────────────
// Unsupervised ML for market regime detection using K-Means clustering.
// Extracts multi-dimensional features from price series and clusters them
// into distinct market regimes (e.g., calm trending, volatile ranging, etc.)
//
// Features per window:
//   - Return (mean)
//   - Volatility (std dev of returns)
//   - Skewness
//   - Kurtosis
//   - Volume ratio (current vs average)
//   - Trend strength (linear regression R²)
//   - Mean absolute return
//   - Autocorrelation (lag-1)
//
// Algorithms:
//   - K-Means++ initialization (smart centroid seeding)
//   - Lloyd's algorithm iterations
//   - Silhouette score for optimal K selection
//   - Elbow method (within-cluster sum of squares)

const extractFeatures = (returns, windowSize = 20) => {
  const features = []
  for (let i = windowSize; i < returns.length; i++) {
    const window = returns.slice(i - windowSize, i)
    const n = window.length

    // Mean return
    const mean = window.reduce((a, b) => a + b, 0) / n

    // Volatility
    const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / n
    const vol = Math.sqrt(variance)

    // Skewness
    const skew = vol > 0 ? window.reduce((s, r) => s + ((r - mean) / vol) ** 3, 0) / n : 0

    // Kurtosis
    const kurt = vol > 0 ? window.reduce((s, r) => s + ((r - mean) / vol) ** 4, 0) / n - 3 : 0

    // Mean absolute return
    const mar = window.reduce((s, r) => s + Math.abs(r), 0) / n

    // Autocorrelation (lag-1)
    let ac1Num = 0, ac1Den = 0
    for (let j = 1; j < n; j++) {
      ac1Num += (window[j] - mean) * (window[j - 1] - mean)
    }
    for (let j = 0; j < n; j++) {
      ac1Den += (window[j] - mean) ** 2
    }
    const ac1 = ac1Den > 0 ? ac1Num / ac1Den : 0

    // Trend strength (R² of linear regression)
    const x = Array.from({ length: n }, (_, i) => i)
    const xMean = (n - 1) / 2
    let sxy = 0, sxx = 0, syy = 0
    for (let j = 0; j < n; j++) {
      sxy += (x[j] - xMean) * (window[j] - mean)
      sxx += (x[j] - xMean) ** 2
      syy += (window[j] - mean) ** 2
    }
    const r2 = sxx > 0 && syy > 0 ? (sxy / Math.sqrt(sxx * syy)) ** 2 : 0

    features.push({ mean, vol, skew, kurt, mar, ac1, r2, index: i })
  }
  return features
}

// K-Means++ initialization
const kmeansPlusPlus = (data, k) => {
  const n = data.length
  if (n < k) return data.slice()

  const centroids = []
  // First centroid: random
  centroids.push(data[Math.floor(Math.random() * n)].slice())

  for (let c = 1; c < k; c++) {
    // Compute distances to nearest centroid
    const dists = data.map(p => {
      let minDist = Infinity
      for (const cent of centroids) {
        let d = 0
        for (let i = 0; i < p.length; i++) d += (p[i] - cent[i]) ** 2
        if (d < minDist) minDist = d
      }
      return minDist
    })

    // Weighted random selection
    const total = dists.reduce((a, b) => a + b, 0)
    if (total === 0) {
      centroids.push(data[Math.floor(Math.random() * n)].slice())
      continue
    }
    let r = Math.random() * total
    let selected = 0
    for (let i = 0; i < n; i++) {
      r -= dists[i]
      if (r <= 0) { selected = i; break }
    }
    centroids.push(data[selected].slice())
  }

  return centroids
}

// K-Means clustering (Lloyd's algorithm)
const kmeans = (data, k, maxIter = 100) => {
  if (data.length < k) return { labels: data.map((_, i) => i % k), centroids: data, wcss: 0 }

  let centroids = kmeansPlusPlus(data, k)
  let labels = new Array(data.length).fill(0)

  for (let iter = 0; iter < maxIter; iter++) {
    // Assignment step
    let changed = false
    for (let i = 0; i < data.length; i++) {
      let minDist = Infinity
      let bestCluster = 0
      for (let c = 0; c < k; c++) {
        let d = 0
        for (let j = 0; j < data[i].length; j++) d += (data[i][j] - centroids[c][j]) ** 2
        if (d < minDist) {
          minDist = d
          bestCluster = c
        }
      }
      if (labels[i] !== bestCluster) {
        labels[i] = bestCluster
        changed = true
      }
    }

    if (!changed) break

    // Update step
    for (let c = 0; c < k; c++) {
      const cluster = data.filter((_, i) => labels[i] === c)
      if (cluster.length === 0) continue
      centroids[c] = cluster[0].map((_, j) => cluster.reduce((s, p) => s + p[j], 0) / cluster.length)
    }
  }

  // WCSS (within-cluster sum of squares)
  let wcss = 0
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data[i].length; j++) {
      wcss += (data[i][j] - centroids[labels[i]][j]) ** 2
    }
  }

  return { labels, centroids, wcss }
}

// Silhouette score
const silhouetteScore = (data, labels, k) => {
  if (k < 2) return 0
  const n = data.length
  let totalScore = 0

  for (let i = 0; i < n; i++) {
    const ci = labels[i]
    // a(i): mean distance to same cluster
    let aSum = 0, aCount = 0
    for (let j = 0; j < n; j++) {
      if (i === j || labels[j] !== ci) continue
      let d = 0
      for (let f = 0; f < data[i].length; f++) d += (data[i][f] - data[j][f]) ** 2
      aSum += Math.sqrt(d)
      aCount++
    }
    const a = aCount > 0 ? aSum / aCount : 0

    // b(i): min mean distance to other clusters
    let b = Infinity
    for (let c = 0; c < k; c++) {
      if (c === ci) continue
      let bSum = 0, bCount = 0
      for (let j = 0; j < n; j++) {
        if (labels[j] !== c) continue
        let d = 0
        for (let f = 0; f < data[i].length; f++) d += (data[i][f] - data[j][f]) ** 2
        bSum += Math.sqrt(d)
        bCount++
      }
      if (bCount > 0) b = Math.min(b, bSum / bCount)
    }

    if (b === Infinity) continue
    const s = (b - a) / Math.max(a, b)
    totalScore += s
  }

  return n > 0 ? totalScore / n : 0
}

// Normalize features to [0, 1]
const normalize = (features, keys) => {
  const stats = keys.map(k => {
    const vals = features.map(f => f[k])
    return { key: k, min: Math.min(...vals), max: Math.max(...vals) }
  })

  const normalized = features.map(f =>
    stats.map(s => (s.max - s.min) > 0 ? (f[s.key] - s.min) / (s.max - s.min) : 0)
  )

  return { normalized, stats }
}

export default function KMeansClustering({ candles, symbol, exchange }) {
  const [k, setK] = useState(4)
  const [windowSize, setWindowSize] = useState(20)
  const [autoK, setAutoK] = useState(true)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 50) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)
    const volumes = cds.map(c => c.volume || 1)

    // Returns
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // Extract features
    const features = extractFeatures(returns, windowSize)
    if (features.length < k + 1) return null

    // Add volume ratio
    for (const f of features) {
      const vols = volumes.slice(f.index - windowSize, f.index)
      const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length
      f.volRatio = avgVol > 0 ? volumes[f.index] / avgVol : 1
    }

    const featureKeys = ['mean', 'vol', 'skew', 'kurt', 'mar', 'ac1', 'r2', 'volRatio']
    const { normalized, stats } = normalize(features, featureKeys)

    // Find optimal K if autoK
    let bestK = k
    let bestSilhouette = -1
    const elbowData = []

    if (autoK) {
      for (let tryK = 2; tryK <= 8; tryK++) {
        if (normalized.length < tryK + 1) break
        const { labels, wcss } = kmeans(normalized, tryK, 50)
        const sil = silhouetteScore(normalized, labels, tryK)
        elbowData.push({ k: tryK, wcss, silhouette: sil })
        if (sil > bestSilhouette) {
          bestSilhouette = sil
          bestK = tryK
        }
      }
    } else {
      const { wcss } = kmeans(normalized, k, 50)
      const { labels } = kmeans(normalized, k, 50)
      const sil = silhouetteScore(normalized, labels, k)
      elbowData.push({ k, wcss, silhouette: sil })
    }

    // Final clustering with best K
    const { labels, centroids, wcss } = kmeans(normalized, bestK, 100)
    const sil = silhouetteScore(normalized, labels, bestK)

    // Analyze clusters
    const clusterStats = []
    for (let c = 0; c < bestK; c++) {
      const clusterFeatures = features.filter((_, i) => labels[i] === c)
      if (clusterFeatures.length === 0) {
        clusterStats.push({ count: 0, mean: 0, vol: 0, r2: 0, label: 'Empty' })
        continue
      }
      const mean = clusterFeatures.reduce((s, f) => s + f.mean, 0) / clusterFeatures.length
      const vol = clusterFeatures.reduce((s, f) => s + f.vol, 0) / clusterFeatures.length
      const r2 = clusterFeatures.reduce((s, f) => s + f.r2, 0) / clusterFeatures.length
      const skew = clusterFeatures.reduce((s, f) => s + f.skew, 0) / clusterFeatures.length

      let label = ''
      if (vol < 0.005 && r2 > 0.3) label = 'Calm Trend'
      else if (vol < 0.005 && r2 < 0.1) label = 'Calm Range'
      else if (vol > 0.02 && r2 > 0.3) label = 'Volatile Trend'
      else if (vol > 0.02 && r2 < 0.1) label = 'Volatile Range'
      else if (vol > 0.03) label = 'Extreme Vol'
      else if (r2 > 0.4) label = 'Strong Trend'
      else if (Math.abs(skew) > 1) label = 'Skewed'
      else label = 'Normal'

      clusterStats.push({
        count: clusterFeatures.length,
        mean: mean * 100,
        vol: vol * 100,
        r2,
        skew,
        label,
        centroid: centroids[c]
      })
    }

    // Current regime (last data point)
    const currentCluster = labels[labels.length - 1]
    const currentRegime = clusterStats[currentCluster]

    // Regime transitions
    const transitions = []
    for (let i = 1; i < labels.length; i++) {
      if (labels[i] !== labels[i - 1]) {
        transitions.push({ index: features[i].index, from: labels[i - 1], to: labels[i] })
      }
    }

    return {
      prices, returns: returns.slice(-100), features: features.slice(-100),
      labels: labels.slice(-100), clusterStats, currentCluster, currentRegime,
      transitions: transitions.slice(-10), bestK, bestSilhouette, wcss, sil,
      elbowData, featureKeys, stats,
      normalized: normalized.slice(-100),
    }
  }, [candles, exchange, symbol, k, windowSize, autoK])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 50 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 300, P = 40
  const colors = ['#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316']

  // Scatter plot: volatility vs return (colored by cluster)
  const allVols = data.features.map(f => f.vol)
  const allMeans = data.features.map(f => f.mean)
  const maxVol = Math.max(...allVols) * 1.1
  const minMean = Math.min(...allMeans) * 1.1
  const maxMean = Math.max(...allMeans) * 1.1
  const sx = (vol) => P + (vol / maxVol) * (W - 2 * P)
  const sy = (mean) => H - P - ((mean - minMean) / (maxMean - minMean + 0.001)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">K-Means Market Clustering — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: colors[data.currentCluster] + '22', color: colors[data.currentCluster] }}>
          {data.currentRegime?.label || 'Unknown'}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">K:</span>
          <input type="number" value={k} onChange={e => setK(Math.max(2, Math.min(8, +e.target.value)))} disabled={autoK} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200 disabled:opacity-40" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(5, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={autoK} onChange={e => setAutoK(e.target.checked)} />
          <span className="text-slate-400">Auto K (silhouette)</span>
        </label>
      </div>

      {/* Scatter: volatility vs return */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Feature Space: Volatility vs Return (colored by cluster)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#475569" strokeDasharray="3,3" />

          {data.features.map((f, i) => (
            <circle
              key={i}
              cx={sx(f.vol)}
              cy={sy(f.mean)}
              r={i === data.features.length - 1 ? 5 : 3}
              fill={colors[data.labels[i] % colors.length]}
              opacity={i === data.features.length - 1 ? 1 : 0.6}
            />
          ))}

          {/* Centroids */}
          {data.clusterStats.map((cs, ci) => {
            if (!cs.centroid) return null
            const volDenorm = cs.vol / 100
            const meanDenorm = cs.mean / 100
            return (
              <g key={ci}>
                <rect x={sx(volDenorm) - 6} y={sy(meanDenorm) - 6} width={12} height={12} fill="none" stroke={colors[ci]} strokeWidth={2} />
                <text x={sx(volDenorm) + 10} y={sy(meanDenorm) + 4} fill={colors[ci]} fontSize={9}>{cs.label}</text>
              </g>
            )
          })}

          <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={10}>Volatility →</text>
          <text x={5} y={P + 10} fill="#475569" fontSize={10}>Return ↑</text>
        </svg>
      </div>

      {/* Cluster stats */}
      <div className="grid grid-cols-2 gap-2">
        {data.clusterStats.map((cs, ci) => (
          <div key={ci} className="bg-slate-800 rounded p-2 text-xs" style={{ borderLeft: `3px solid ${colors[ci]}` }}>
            <div className="flex justify-between">
              <span className="font-bold" style={{ color: colors[ci] }}>{cs.label}</span>
              <span className="text-slate-400">{cs.count} pts</span>
            </div>
            <div className="text-slate-400 text-[10px] mt-1">
              μ={cs.mean?.toFixed(4)}% | σ={cs.vol?.toFixed(4)}% | R²={cs.r2?.toFixed(2)} | skew={cs.skew?.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Elbow / silhouette */}
      {data.elbowData.length > 1 && (
        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">Optimal K Selection (Silhouette Score)</div>
          <div className="flex items-end gap-3 h-20">
            {data.elbowData.map((e, i) => (
              <div key={i} className="flex flex-col items-center flex-1">
                <div className="text-[10px] text-slate-400 mb-1">{e.silhouette.toFixed(3)}</div>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.max(2, e.silhouette * 200)}%`,
                    background: e.k === data.bestK ? '#22c55e' : '#475569'
                  }}
                />
                <div className="text-[10px] text-slate-500 mt-1">K={e.k}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Best K</div>
          <div className="text-cyan-400 font-mono">{data.bestK}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Silhouette</div>
          <div className="text-emerald-400 font-mono">{data.bestSilhouette.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">WCSS</div>
          <div className="text-amber-400 font-mono">{data.wcss.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Transitions</div>
          <div className="text-purple-400 font-mono">{data.transitions.length}</div>
        </div>
      </div>

      {/* Recent transitions */}
      {data.transitions.length > 0 && (
        <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
          <strong>Recent regime transitions:</strong>{' '}
          {data.transitions.slice(-3).map((t, i) => (
            <span key={i}>
              {i > 0 && ' → '}
              <span style={{ color: colors[t.from] }}>{data.clusterStats[t.from]?.label}</span>
              {' → '}
              <span style={{ color: colors[t.to] }}>{data.clusterStats[t.to]?.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
