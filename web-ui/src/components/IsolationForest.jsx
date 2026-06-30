import React, { useMemo, useState } from 'react'

// ─── Isolation Forest Anomaly Detection ──────────────────────────────────────
// Implements the Isolation Forest algorithm for unsupervised anomaly detection.
// Isolation Forest isolates anomalies by randomly selecting a feature and
// randomly selecting a split value between min/max of that feature.
//
// Mathematical foundation:
//   - Anomalies are "few and different" → easier to isolate
//   - Path length h(x) in isolation tree ∝ anomaly score
//   - Anomaly score: s(x, n) = 2^(-E[h(x)] / c(n))
//     where c(n) = 2H(n-1) - 2(n-1)/n, H(i) ≈ ln(i) + 0.5772156649
//   - s → 1: anomaly, s → 0.5: normal
//
//   Algorithm:
//   1. Build N trees, each from a random sub-sample of ψ points
//   2. Each tree: recursively split on random feature + random value
//   3. Path length = depth + adjustment for unreached nodes
//   4. Average path length across all trees → anomaly score

const H_CONST = 0.5772156649

const harmonicApprox = (n) => {
  if (n <= 1) return 0
  return Math.log(n - 1) + H_CONST
}

const cFactor = (n) => {
  if (n <= 1) return 0
  if (n === 2) return 1
  return 2 * harmonicApprox(n) - 2 * (n - 1) / n
}

// Build a single isolation tree
const buildITree = (data, maxDepth, depth = 0) => {
  const n = data.length
  if (depth >= maxDepth || n <= 1) {
    return { type: 'leaf', size: n, depth }
  }

  // Random feature
  const nFeatures = data[0].length
  const featureIdx = Math.floor(Math.random() * nFeatures)

  // Min/max of selected feature
  let min = Infinity, max = -Infinity
  for (const point of data) {
    if (point[featureIdx] < min) min = point[featureIdx]
    if (point[featureIdx] > max) max = point[featureIdx]
  }

  if (min === max) {
    return { type: 'leaf', size: n, depth }
  }

  // Random split
  const split = min + Math.random() * (max - min)

  // Partition
  const left = data.filter(p => p[featureIdx] < split)
  const right = data.filter(p => p[featureIdx] >= split)

  return {
    type: 'node',
    feature: featureIdx,
    split,
    left: buildITree(left, maxDepth, depth + 1),
    right: buildITree(right, maxDepth, depth + 1),
    depth,
  }
}

// Path length for a point in a tree
const pathLength = (point, tree, depth = 0) => {
  if (tree.type === 'leaf') {
    return depth + cFactor(tree.size)
  }
  if (point[tree.feature] < tree.split) {
    return pathLength(point, tree.left, depth + 1)
  } else {
    return pathLength(point, tree.right, depth + 1)
  }
}

// Anomaly score
const anomalyScore = (point, trees, subSampleSize) => {
  const cN = cFactor(subSampleSize)
  let totalPath = 0
  for (const tree of trees) {
    totalPath += pathLength(point, tree)
  }
  const avgPath = totalPath / trees.length
  return Math.pow(2, -avgPath / cN)
}

// Build isolation forest
const buildIsolationForest = (data, nTrees = 100, subSampleSize = 256) => {
  const maxDepth = Math.ceil(Math.log2(subSampleSize))
  const trees = []

  for (let t = 0; t < nTrees; t++) {
    // Random sub-sample
    const subSample = []
    const indices = new Set()
    while (indices.size < Math.min(subSampleSize, data.length)) {
      indices.add(Math.floor(Math.random() * data.length))
    }
    for (const idx of indices) subSample.push(data[idx])
    trees.push(buildITree(subSample, maxDepth))
  }

  return { trees, subSampleSize, nTrees }
}

// Extract multi-dimensional features from candles
const extractAnomalyFeatures = (candles) => {
  const features = []
  for (let i = 20; i < candles.length; i++) {
    const window = candles.slice(i - 20, i)
    const prices = window.map(c => c.close)
    const volumes = window.map(c => c.volume || 1)

    // Return
    const ret = (prices[19] - prices[18]) / prices[18]

    // Volatility (20-period)
    const rets = []
    for (let j = 1; j < 20; j++) rets.push((prices[j] - prices[j - 1]) / prices[j - 1])
    const meanR = rets.reduce((a, b) => a + b, 0) / rets.length
    const vol = Math.sqrt(rets.reduce((s, r) => s + (r - meanR) ** 2, 0) / rets.length)

    // Volume z-score
    const meanV = volumes.reduce((a, b) => a + b, 0) / volumes.length
    const stdV = Math.sqrt(volumes.reduce((s, v) => s + (v - meanV) ** 2, 0) / volumes.length)
    const volZ = stdV > 0 ? (volumes[19] - meanV) / stdV : 0

    // Range (high - low) / close
    const range = (window[19].high - window[19].low) / window[19].close

    // RSI
    let gains = 0, losses = 0
    for (let j = 1; j < 20; j++) {
      const change = prices[j] - prices[j - 1]
      if (change > 0) gains += change
      else losses -= change
    }
    const rs = losses > 0 ? (gains / 19) / (losses / 19) : 100
    const rsi = 100 - 100 / (1 + rs)

    // Skewness
    const skew = vol > 0 ? rets.reduce((s, r) => s + ((r - meanR) / vol) ** 3, 0) / rets.length : 0

    // Price vs SMA20
    const sma = prices.reduce((a, b) => a + b, 0) / prices.length
    const priceDev = (prices[19] - sma) / sma

    features.push({
      features: [ret * 100, vol * 100, volZ, range * 100, rsi, skew, priceDev * 100],
      timestamp: candles[i].timestamp,
      price: prices[19],
      index: i,
    })
  }

  return features
}

export default function IsolationForest({ candles, symbol, exchange }) {
  const [nTrees, setNTrees] = useState(100)
  const [subSampleSize, setSubSampleSize] = useState(64)
  const [threshold, setThreshold] = useState(0.65)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 40) return null
    const cds = candles[exchange][symbol]

    const featureData = extractAnomalyFeatures(cds)
    if (featureData.length < 10) return null

    const matrix = featureData.map(f => f.features)

    // Build forest
    const forest = buildIsolationForest(matrix, nTrees, Math.min(subSampleSize, matrix.length))

    // Compute anomaly scores
    const scores = matrix.map(point => anomalyScore(point, forest.trees, forest.subSampleSize))

    // Identify anomalies
    const anomalies = []
    const normal = []
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] >= threshold) {
        anomalies.push({ ...featureData[i], score: scores[i] })
      } else {
        normal.push({ ...featureData[i], score: scores[i] })
      }
    }

    // Sort by score descending
    anomalies.sort((a, b) => b.score - a.score)

    // Current anomaly score
    const currentScore = scores[scores.length - 1]
    const isAnomaly = currentScore >= threshold

    // Feature importance (approximation: how often each feature is used for splitting)
    const featureNames = ['Return', 'Volatility', 'Volume Z', 'Range', 'RSI', 'Skewness', 'Price Dev']
    const featureUsage = new Array(7).fill(0)
    const countFeatureUsage = (tree) => {
      if (tree.type === 'node') {
        featureUsage[tree.feature]++
        countFeatureUsage(tree.left)
        countFeatureUsage(tree.right)
      }
    }
    forest.trees.forEach(countFeatureUsage)
    const totalUsage = featureUsage.reduce((a, b) => a + b, 0)
    const featureImportance = featureUsage.map(u => totalUsage > 0 ? u / totalUsage : 0)

    return {
      scores, anomalies, normal,
      currentScore, isAnomaly,
      featureImportance, featureNames,
      featureData: featureData.slice(-60),
      scoresRecent: scores.slice(-60),
      prices: cds.slice(-60).map(c => c.close),
    }
  }, [candles, exchange, symbol, nTrees, subSampleSize, threshold])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 40 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 40
  const maxScore = Math.max(...data.scoresRecent, 1)
  const sx = (i) => P + (i / data.scoresRecent.length) * (W - 2 * P)
  const syScore = (s) => H - P - (s / maxScore) * (H - 2 * P)

  // Price y-scale
  const minP = Math.min(...data.prices)
  const maxP = Math.max(...data.prices)
  const syPrice = (p) => H - P - ((p - minP) / (maxP - minP + 0.001)) * (H - 2 * P)

  const sigColor = data.isAnomaly ? '#ef4444' : '#22c55e'

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Isolation Forest Anomaly Detection — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.isAnomaly ? 'ANOMALY' : 'NORMAL'}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Trees:</span>
          <input type="number" value={nTrees} onChange={e => setNTrees(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Sub-sample:</span>
          <input type="number" value={subSampleSize} onChange={e => setSubSampleSize(Math.max(16, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Threshold:</span>
          <input type="number" step="0.01" value={threshold} onChange={e => setThreshold(Math.max(0.5, Math.min(0.95, +e.target.value)))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Anomaly score chart */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Anomaly Score (s → 1 = anomaly, s → 0.5 = normal)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Threshold line */}
          <line x1={P} y1={syScore(threshold)} x2={W - P} y2={syScore(threshold)} stroke="#ef4444" strokeDasharray="4,3" strokeWidth={1.5} />
          <text x={W - P} y={syScore(threshold) - 5} textAnchor="end" fill="#ef4444" fontSize={9}>threshold={threshold}</text>

          {/* Score bars */}
          {data.scoresRecent.map((s, i) => {
            const x = sx(i)
            const w = (W - 2 * P) / data.scoresRecent.length
            const isAnom = s >= threshold
            return (
              <rect
                key={i}
                x={x}
                y={syScore(s)}
                width={Math.max(1, w - 1)}
                height={H - P - syScore(s)}
                fill={isAnom ? '#ef4444' : '#06b6d4'}
                opacity={isAnom ? 0.8 : 0.4}
              />
            )
          })}

          {/* Price overlay */}
          <path
            d={data.prices.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${syPrice(p)}`).join(' ')}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.5}
            opacity={0.6}
          />

          <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={10}>Time</text>
          <text x={5} y={P + 10} fill="#475569" fontSize={10}>Score</text>
        </svg>
      </div>

      {/* Feature importance */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Feature Importance (split frequency)</div>
        <div className="space-y-1">
          {data.featureNames.map((name, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 w-24">{name}</span>
              <div className="flex-1 bg-slate-900 rounded h-4">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${data.featureImportance[i] * 100}%`,
                    background: `hsl(${i * 40}, 70%, 50%)`
                  }}
                />
              </div>
              <span className="text-slate-500 font-mono w-12">{(data.featureImportance[i] * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top anomalies */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Top Anomalies Detected ({data.anomalies.length} total)</div>
        <div className="space-y-1 max-h-32 overflow-auto">
          {data.anomalies.slice(0, 8).map((a, i) => (
            <div key={i} className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">#{a.index}</span>
              <span className="text-red-400">score={a.score.toFixed(4)}</span>
              <span className="text-slate-300">${a.price.toFixed(2)}</span>
              <span className="text-slate-500">ret={a.features[0].toFixed(3)}%</span>
              <span className="text-slate-500">vol={a.features[1].toFixed(3)}%</span>
            </div>
          ))}
          {data.anomalies.length === 0 && <div className="text-slate-500 text-xs">No anomalies detected at threshold {threshold}</div>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Current Score</div>
          <div className="font-mono" style={{ color: sigColor }}>{data.currentScore.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Anomalies</div>
          <div className="text-red-400 font-mono">{data.anomalies.length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Normal</div>
          <div className="text-emerald-400 font-mono">{data.normal.length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Anomaly Rate</div>
          <div className="text-amber-400 font-mono">{((data.anomalies.length / (data.anomalies.length + data.normal.length)) * 100).toFixed(1)}%</div>
        </div>
      </div>
    </div>
  )
}
