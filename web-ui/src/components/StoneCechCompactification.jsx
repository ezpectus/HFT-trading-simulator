import React, { useMemo, useState } from 'react'

// --- Stone-Cech Compactification (Universal Embedding for Regime Space) ---
// Uses the Stone-Cech compactification to embed the regime space into
// a compact Hausdorff space, enabling analysis of limit points and
// asymptotic behavior of market regimes.
//
// Mathematical foundation:
//   Stone-Cech: beta(X) = maximal compactification of X
//   Every bounded continuous f: X -> R extends uniquely to beta(X)
//   beta(X) = closure of embedding e: X -> [0,1]^C(X,R)
//   e(x) = (f(x))_{f in C_b(X)}
//
//   For finite X: beta(X) = X (already compact)
//   For discrete N: beta(N) = ultrafilters on N
//
//   Applications: regime limit point analysis, asymptotic regime
//   detection, compactification of unbounded price/return spaces,
//   universal property for feature maps

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Compute bounded continuous functions (feature maps to [0,1])
const featureMaps = (x, features) => {
  return features.map(f => {
    // Sigmoid normalization to [0,1]
    return 1 / (1 + Math.exp(-f(x)))
  })
}

export default function StoneCechCompactification({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(120)
  const [nFeatures, setNFeatures] = useState(5)
  const [windowSize, setWindowSize] = useState(20)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    const n = returns.length
    if (n < windowSize * 3) return null

    // Define feature functions (bounded continuous on return space)
    const features = [
      (x) => x * 50,                                    // scaled return
      (x) => Math.abs(x) * 100,                          // absolute return
      (x) => x > 0 ? x * 30 : 0,                         // positive part
      (x) => x < 0 ? -x * 30 : 0,                        // negative part
      (x) => x * x * 500,                                // squared return
      (x) => Math.tanh(x * 20),                          // tanh nonlinearity
      (x) => x > 0.01 ? 1 : x < -0.01 ? -1 : 0,          // sign with threshold
      (x) => Math.sin(x * 30),                           // oscillatory
    ].slice(0, nFeatures)

    // Compute embedding: e(x) = (sigmoid(f(x))) for each window
    const embedding = []
    for (let i = 0; i + windowSize <= n; i += Math.max(3, Math.floor(windowSize / 3))) {
      const window = returns.slice(i, i + windowSize)
      const mean = window.reduce((a, b) => a + b, 0) / window.length
      const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / window.length
      const std = Math.sqrt(variance)
      const skew = std > 0 ? window.reduce((s, r) => s + ((r - mean) / std) ** 3, 0) / window.length : 0
      const kurt = std > 0 ? window.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / window.length - 3 : 0

      // Regime vector: [mean, std, skew, kurt, ...]
      const regimeVec = [mean * 100, std * 100, skew, kurt, mean / (std + 0.001)]
      const point = featureMaps(regimeVec[0], features.slice(0, Math.min(nFeatures, regimeVec.length)))
      // Pad if needed
      while (point.length < nFeatures) point.push(0.5)

      embedding.push({
        idx: i,
        point,
        mean, std, skew, kurt,
        regime: mean > 0.001 ? 'BULL' : mean < -0.001 ? 'BEAR' : 'FLAT',
      })
    }

    // Compute limit points (cluster centers via simple k-means-like)
    const k = 3 // number of limit points
    let centers = [
      Array.from({ length: nFeatures }, () => 0.3), // bear-like
      Array.from({ length: nFeatures }, () => 0.5), // neutral
      Array.from({ length: nFeatures }, () => 0.7), // bull-like
    ]

    for (let iter = 0; iter < 20; iter++) {
      const assignments = embedding.map(e => {
        let minDist = Infinity, bestK = 0
        for (let j = 0; j < k; j++) {
          let dist = 0
          for (let d = 0; d < nFeatures; d++) dist += (e.point[d] - centers[j][d]) ** 2
          if (dist < minDist) { minDist = dist; bestK = j }
        }
        return bestK
      })

      const newCenters = Array.from({ length: k }, () => new Array(nFeatures).fill(0))
      const counts = new Array(k).fill(0)
      for (let i = 0; i < embedding.length; i++) {
        const a = assignments[i]
        for (let d = 0; d < nFeatures; d++) newCenters[a][d] += embedding[i].point[d]
        counts[a]++
      }
      for (let j = 0; j < k; j++) {
        if (counts[j] > 0) for (let d = 0; d < nFeatures; d++) newCenters[j][d] /= counts[j]
        else newCenters[j] = centers[j].slice()
      }
      centers = newCenters
    }

    // Assign final clusters
    const assignments = embedding.map(e => {
      let minDist = Infinity, bestK = 0
      for (let j = 0; j < k; j++) {
        let dist = 0
        for (let d = 0; d < nFeatures; d++) dist += (e.point[d] - centers[j][d]) ** 2
        if (dist < minDist) { minDist = dist; bestK = j }
      }
      return bestK
    })

    // Current regime (nearest limit point)
    const currentIdx = embedding.length - 1
    const currentCluster = assignments[currentIdx]
    const currentPoint = embedding[currentIdx].point
    const distToCenter = Math.sqrt(centers[currentCluster].reduce((s, c, d) => s + (c - currentPoint[d]) ** 2, 0))

    // Compactification: map to [0,1]^n via sigmoid (already done)
    // Check if current point is near boundary (limit point)
    const boundaryDist = Math.min(...currentPoint.map(p => Math.min(p, 1 - p)))
    const isNearBoundary = boundaryDist < 0.1

    // Signal
    const clusterNames = ['BEARISH_LIMIT', 'NEUTRAL_LIMIT', 'BULLISH_LIMIT']
    let signal = clusterNames[currentCluster]
    let reason = `Regime near ${clusterNames[currentCluster]} (dist=${distToCenter.toFixed(4)}, boundary=${boundaryDist.toFixed(4)})`

    if (isNearBoundary) {
      signal += '_BOUNDARY'
      reason += ' [near compactification boundary - regime transition]'
    }

    // Cluster distribution
    const clusterCounts = new Array(k).fill(0)
    assignments.forEach(a => clusterCounts[a]++)
    const clusterProbs = clusterCounts.map(c => c / assignments.length)

    return {
      embedding, centers, assignments,
      currentCluster, currentPoint, distToCenter, boundaryDist,
      signal, reason, clusterProbs, clusterNames,
      nFeatures,
    }
  }, [candles, exchange, symbol, lookback, nFeatures, windowSize])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const clusterColors = ['#ef4444', '#94a3b8', '#22c55e']
  const sigColor = clusterColors[data.currentCluster]

  // 2D projection of embedding (first 2 features)
  const sx2D = (v) => P + v * (W - 2 * P)
  const sy2D = (v) => H - P - v * (H - 2 * P)

  // Cluster probability bar chart
  const sxBar = (i) => P + (i / 3) * (W - 2 * P) + 20
  const syBar = (v) => H - P - v * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Stone-Cech Compactification (Regime Space) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Features:</span>
          <input type="number" value={nFeatures} onChange={e => setNFeatures(Math.max(2, Math.min(8, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(10, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(60, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* 2D embedding projection */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Stone-Cech Embedding: beta(X) projection onto [0,1]^2 (first 2 features)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          {/* Unit square boundary */}
          <rect x={P} y={P} width={W - 2 * P} height={H - 2 * P} fill="none" stroke="#334155" strokeWidth={1} />

          {/* Limit points (cluster centers) */}
          {data.centers.map((c, i) => (
            <g key={i}>
              <circle cx={sx2D(c[0])} cy={sy2D(c[1])} r={12} fill="none" stroke={clusterColors[i]} strokeWidth={2} strokeDasharray="3,2" />
              <text x={sx2D(c[0])} y={sy2D(c[1]) - 16} textAnchor="middle" fill={clusterColors[i]} fontSize={9}>{data.clusterNames[i]}</text>
            </g>
          ))}

          {/* Embedded points */}
          {data.embedding.map((e, i) => (
            <circle key={i} cx={sx2D(e.point[0])} cy={sy2D(e.point[1])} r={3} fill={clusterColors[data.assignments[i]]} opacity={0.6} />
          ))}

          {/* Current point */}
          <circle cx={sx2D(data.currentPoint[0])} cy={sy2D(data.currentPoint[1])} r={6} fill="#fbbf24" stroke="#ef4444" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#fbbf24" fontSize={9}>current regime</text>
          <text x={W - P} y={34} textAnchor="end" fill="#475569" fontSize={9}>limit points (dashed)</text>
        </svg>
      </div>

      {/* Cluster probabilities */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Limit Point Occupation Probabilities (regime distribution in beta(X))</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.clusterProbs.map((prob, i) => (
            <g key={i}>
              <rect x={sxBar(i) - 30} y={syBar(prob)} width={60} height={H - P - syBar(prob)} fill={clusterColors[i]} opacity={0.6} rx={4} />
              <text x={sxBar(i)} y={H - P + 14} textAnchor="middle" fill={clusterColors[i]} fontSize={9}>{data.clusterNames[i]}</text>
              <text x={sxBar(i)} y={syBar(prob) - 4} textAnchor="middle" fill={clusterColors[i]} fontSize={9}>{(prob * 100).toFixed(1)}%</text>
            </g>
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#475569" fontSize={9}>P(regime = limit point k)</text>
        </svg>
      </div>

      {/* Feature trajectory */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Feature Embedding Trajectory: e(x)_1, e(x)_2 over time</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {Array.from({ length: Math.min(3, data.nFeatures) }, (_, f) => (
            <path key={f} d={data.embedding.map((e, i) => `${i === 0 ? 'M' : 'L'} ${P + (i / data.embedding.length) * (W - 2 * P)} ${H - P - e.point[f] * (H - 2 * P)}`).join(' ')} fill="none" stroke={['#06b6d4', '#f59e0b', '#a855f7'][f]} strokeWidth={1.5} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>e(x)_1</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>e(x)_2</text>
          {data.nFeatures > 2 && <text x={W - P} y={48} textAnchor="end" fill="#a855f7" fontSize={9}>e(x)_3</text>}
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Current cluster</div>
          <div className="font-mono" style={{ color: sigColor }}>{data.clusterNames[data.currentCluster]}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Dist to center</div>
          <div className="text-cyan-400 font-mono">{data.distToCenter.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Boundary dist</div>
          <div className="text-amber-400 font-mono">{data.boundaryDist.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Bearish P</div>
          <div className="text-red-400 font-mono">{(data.clusterProbs[0] * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Bullish P</div>
          <div className="text-emerald-400 font-mono">{(data.clusterProbs[2] * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Stone-Cech:</strong> beta(X) = maximal compactification, e: X -{'>'} [0,1]^C(X) |
        <strong> Universal:</strong> every bounded f: X-{'>'}R extends to beta(X) |
        <strong> Limit points:</strong> cluster centers in compactified regime space |
        <strong> Boundary:</strong> near-boundary = regime transition |
        <strong> Features:</strong> sigmoid(f(x)) for bounded continuous f (mean, vol, skew, kurt)
      </div>
    </div>
  )
}
