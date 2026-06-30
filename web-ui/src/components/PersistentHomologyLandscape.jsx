import React, { useMemo, useState } from 'react'

// ─── Persistent Homology Landscape ──────────────────────────────────────────
// Computes persistence landscapes — a vectorized representation of persistence
// diagrams that enables statistical analysis of topological features over time.
//
// Mathematical foundation:
//   Persistence diagram → Persistence landscape:
//   For each point (b, d) in persistence diagram:
//   λ_k(t) = max(min(t - b, d - t), 0) for k-th layer
//
//   Landscape function: piecewise linear, can be integrated/L2-norm
//   Lp norm: ||λ||_p = (Σ_k ∫ |λ_k(t)|^p dt)^(1/p)
//
//   Statistical tests on landscapes: confidence intervals, hypothesis testing
//   Sliding window: track topology evolution over time
//
//   Applications: topological change detection, bubble/crash detection,
//   shape analysis of return distributions

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Union-Find for H0 persistence
class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i)
    this.rank = new Array(n).fill(0)
  }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]]
      x = this.parent[x]
    }
    return x
  }
  union(x, y) {
    const px = this.find(x), py = this.find(y)
    if (px === py) return false
    if (this.rank[px] < this.rank[py]) { this.parent[px] = py; return true }
    if (this.rank[px] > this.rank[py]) { this.parent[py] = px; return true }
    this.parent[py] = px; this.rank[px]++; return true
  }
}

// Compute H0 persistence diagram from point cloud
const computeH0Persistence = (points) => {
  const n = points.length
  if (n < 2) return []

  // Compute all pairwise distances
  const dists = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let d = 0
      for (let k = 0; k < points[i].length; k++) d += (points[i][k] - points[j][k]) ** 2
      dists.push({ i, j, d: Math.sqrt(d) })
    }
  }
  dists.sort((a, b) => a.d - b.d)

  // Union-Find with birth times
  const uf = new UnionFind(n)
  const birthTime = new Array(n).fill(0) // each point born at ε=0
  const alive = new Set(Array.from({ length: n }, (_, i) => i))
  const persistence = []

  for (const { i, j, d } of dists) {
    const ri = uf.find(i), rj = uf.find(j)
    if (ri === rj) continue

    // Younger component dies (higher birth time = younger)
    const bi = birthTime[ri], bj = birthTime[rj]
    const dyingRoot = bi >= bj ? ri : rj
    const survivingRoot = bi >= bj ? rj : ri
    const deathTime = d / 2 // ε at which they merge
    const birthT = birthTime[dyingRoot]

    if (deathTime > birthT) {
      persistence.push({ birth: birthT, death: deathTime, persistence: deathTime - birthT })
    }

    uf.union(ri, rj)
    // Update: surviving root keeps its birth time
    const newRoot = uf.find(i)
    birthTime[newRoot] = Math.min(birthTime[ri], birthTime[rj])
    alive.delete(dyingRoot)
  }

  // Last surviving component has infinite death
  if (alive.size > 0) {
    const lastRoot = uf.find([...alive][0])
    persistence.push({ birth: birthTime[lastRoot], death: Infinity, persistence: Infinity })
  }

  return persistence.sort((a, b) => b.persistence - a.persistence)
}

// Convert persistence diagram to landscape
const persistenceLandscape = (diagram, tValues) => {
  // For each point (b, d), landscape function:
  // λ(t) = max(min(t - b, d - t), 0)
  // Multiple layers: sort by decreasing value at each t

  const landscapes = [] // array of layers, each layer is array of {t, val}

  for (const t of tValues) {
    const values = []
    for (const point of diagram) {
      if (point.death === Infinity) continue
      const val = Math.max(Math.min(t - point.birth, point.death - t), 0)
      if (val > 0) values.push(val)
    }
    values.sort((a, b) => b - a)
    landscapes.push({ t, values })
  }

  // Extract layers
  const maxLayer = Math.max(...landscapes.map(l => l.values.length), 0)
  const layers = []
  for (let k = 0; k < Math.min(maxLayer, 5); k++) {
    layers.push(landscapes.map(l => ({ t: l.t, val: l.values[k] || 0 })))
  }

  return layers
}

// Lp norm of landscape
const landscapeNorm = (layers, p = 2) => {
  let sum = 0
  for (const layer of layers) {
    for (const point of layer) {
      sum += Math.abs(point.val) ** p
    }
  }
  return Math.pow(sum, 1 / p)
}

export default function PersistentHomologyLandscape({ candles, symbol, exchange }) {
  const [embedDim, setEmbedDim] = useState(3)
  const [lookback, setLookback] = useState(100)
  const [windowSize, setWindowSize] = useState(40)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Normalize
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length)
    const normR = returns.map(r => std > 0 ? (r - mean) / std : 0)

    // Takens embedding
    const pointCloud = []
    for (let i = embedDim - 1; i < normR.length; i++) {
      const point = []
      for (let j = 0; j < embedDim; j++) point.push(normR[i - j])
      pointCloud.push(point)
    }

    if (pointCloud.length < 5) return null

    // Full persistence diagram
    const fullDiagram = computeH0Persistence(pointCloud)

    // Landscape t values
    const maxDeath = Math.max(...fullDiagram.filter(d => d.death !== Infinity).map(d => d.death), 1)
    const tValues = []
    for (let i = 0; i <= 50; i++) tValues.push(maxDeath * i / 50)

    const fullLandscape = persistenceLandscape(fullDiagram, tValues)
    const fullNorm = landscapeNorm(fullLandscape, 2)

    // Sliding window landscapes
    const slidingLandscapes = []
    const slidingNorms = []
    for (let i = 0; i + windowSize <= normR.length; i += Math.max(5, Math.floor(windowSize / 4))) {
      const window = normR.slice(i, i + windowSize)
      const windowCloud = []
      for (let j = embedDim - 1; j < window.length; j++) {
        const point = []
        for (let k = 0; k < embedDim; k++) point.push(window[j - k])
        windowCloud.push(point)
      }
      if (windowCloud.length < 3) continue
      const diag = computeH0Persistence(windowCloud)
      const land = persistenceLandscape(diag, tValues)
      const norm = landscapeNorm(land, 2)

      // Betti numbers at different thresholds
      const bettis = { b0_0: 0, b0_q1: 0, b0_q2: 0, b0_q3: 0 }
      const maxD = Math.max(...diag.filter(d => d.death !== Infinity).map(d => d.death), 0.1)
      for (const d of diag) {
        if (d.birth <= 0 && d.death > 0) bettis.b0_0++
        if (d.birth <= maxD * 0.25 && d.death > maxD * 0.25) bettis.b0_q1++
        if (d.birth <= maxD * 0.5 && d.death > maxD * 0.5) bettis.b0_q2++
        if (d.birth <= maxD * 0.75 && d.death > maxD * 0.75) bettis.b0_q3++
      }

      slidingLandscapes.push({ idx: i, norm, bettis, nFeatures: diag.filter(d => d.death !== Infinity).length })
      slidingNorms.push(norm)
    }

    // Current landscape norm
    const currentNorm = slidingNorms[slidingNorms.length - 1] || fullNorm

    // Topological change detection
    const normMean = slidingNorms.reduce((a, b) => a + b, 0) / slidingNorms.length
    const normStd = Math.sqrt(slidingNorms.reduce((s, n) => s + (n - normMean) ** 2, 0) / slidingNorms.length)
    const isTopologicalChange = currentNorm > normMean + 2 * normStd

    // Signal
    let signal = 'STABLE_TOPOLOGY'
    let reason = ''
    if (isTopologicalChange) {
      signal = 'TOPOLOGICAL_CHANGE'
      reason = `Landscape L2 norm = ${currentNorm.toFixed(4)} > μ+2σ = ${(normMean + 2 * normStd).toFixed(4)} (topological shift)`
    } else {
      reason = `Landscape L2 norm = ${currentNorm.toFixed(4)} (normal, μ=${normMean.toFixed(4)})`
    }

    // Top persistent features
    const topFeatures = fullDiagram.filter(d => d.death !== Infinity).slice(0, 10)

    return {
      fullDiagram, fullLandscape, fullNorm,
      slidingLandscapes, slidingNorms,
      currentNorm, normMean, normStd,
      isTopologicalChange, signal, reason,
      topFeatures, tValues, maxDeath,
    }
  }, [candles, exchange, symbol, embedDim, lookback, windowSize])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'TOPOLOGICAL_CHANGE' ? '#ef4444' : '#22c55e'
  const layerColors = ['#06b6d4', '#f59e0b', '#a855f7', '#22c55e', '#ef4444']

  // Landscape plot
  const maxLandscapeVal = Math.max(...data.fullLandscape.flatMap(l => l.map(p => p.val)), 0.1)
  const sxLand = (i) => P + (i / data.tValues.length) * (W - 2 * P)
  const syLand = (v) => H - P - (v / maxLandscapeVal) * (H - 2 * P)

  // Sliding norms
  const maxNorm = Math.max(...data.slidingNorms, 0.1)
  const sxNorm = (i) => P + (i / data.slidingNorms.length) * (W - 2 * P)
  const syNorm = (v) => H - P - (v / maxNorm) * (H - 2 * P)

  // Persistence diagram
  const maxPD = data.maxDeath * 1.1
  const sxPD = (v) => P + (v / maxPD) * (W - 2 * P)
  const syPD = (v) => H - P - (v / maxPD) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Persistent Homology Landscape — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Embed dim:</span>
          <input type="number" value={embedDim} onChange={e => setEmbedDim(Math.max(2, Math.min(6, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
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

      {/* Persistence landscape */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Persistence Landscape λ_k(t) (vectorized topology)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.fullLandscape.map((layer, k) => (
            <path key={k} d={layer.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sxLand(i)} ${syLand(p.val)}`).join(' ')} fill="none" stroke={layerColors[k]} strokeWidth={1.5} opacity={0.8} />
          ))}

          {data.fullLandscape.map((_, k) => (
            <text key={k} x={W - P} y={20 + k * 14} textAnchor="end" fill={layerColors[k]} fontSize={9}>λ_{k + 1}</text>
          ))}
        </svg>
      </div>

      {/* Persistence diagram */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Persistence Diagram (birth vs death)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Diagonal */}
          <line x1={sxPD(0)} y1={syPD(0)} x2={sxPD(maxPD)} y2={syPD(maxPD)} stroke="#475569" strokeWidth={1} strokeDasharray="3,3" />

          {data.fullDiagram.filter(d => d.death !== Infinity).map((d, i) => (
            <circle key={i} cx={sxPD(d.birth)} cy={syPD(d.death)} r={3 + Math.min(5, d.persistence * 10)} fill="#06b6d4" opacity={0.6} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>H₀ features ({data.fullDiagram.filter(d => d.death !== Infinity).length})</text>
          <text x={W - P} y={34} textAnchor="end" fill="#475569" fontSize={9}>diagonal = noise</text>
        </svg>
      </div>

      {/* Sliding window L2 norm */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Sliding Window: Landscape L2 Norm (topological complexity)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Mean + 2σ threshold */}
          <line x1={P} y1={syNorm(data.normMean + 2 * data.normStd)} x2={W - P} y2={syNorm(data.normMean + 2 * data.normStd)} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4,3" />
          <line x1={P} y1={syNorm(data.normMean)} x2={W - P} y2={syNorm(data.normMean)} stroke="#475569" strokeWidth={1} strokeDasharray="2,2" />

          {data.slidingNorms.map((n, i) => (
            <line key={i} x1={sxNorm(i)} y1={H - P} x2={sxNorm(i)} y2={syNorm(n)} stroke={n > data.normMean + 2 * data.normStd ? '#ef4444' : '#a855f7'} strokeWidth={2} opacity={0.7} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>L2 norm (windowed)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>μ+2σ threshold</text>
        </svg>
      </div>

      {/* Top features */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Top Persistent Features (H₀)</div>
        <div className="space-y-1">
          {data.topFeatures.slice(0, 5).map((f, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-12">#{i + 1}</span>
              <span className="text-cyan-400 font-mono w-24">birth: {f.birth.toFixed(4)}</span>
              <span className="text-amber-400 font-mono w-24">death: {f.death.toFixed(4)}</span>
              <span className="text-emerald-400 font-mono w-24">persist: {f.persistence.toFixed(4)}</span>
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="h-full rounded" style={{ width: `${Math.min(100, f.persistence / data.topFeatures[0].persistence * 100)}%`, background: layerColors[i] }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">L2 norm</div>
          <div className="text-cyan-400 font-mono">{data.fullNorm.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">H₀ features</div>
          <div className="text-emerald-400 font-mono">{data.fullDiagram.filter(d => d.death !== Infinity).length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Max persist</div>
          <div className="text-amber-400 font-mono">{data.topFeatures[0]?.persistence.toFixed(4) || '0'}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Current norm</div>
          <div className="text-purple-400 font-mono">{data.currentNorm.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">μ + 2σ</div>
          <div className="text-red-400 font-mono">{(data.normMean + 2 * data.normStd).toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Landscape:</strong> λ_k(t) = max(min(t-b, d-t), 0) (piecewise linear) |
        <strong> L2 norm:</strong> ||λ||₂ = (Σ_k ∫|λ_k|²dt)^(1/2) |
        <strong> Diagram:</strong> (birth, death) pairs from H₀ persistence |
        <strong> Change:</strong> L2 norm {'>'} μ+2σ → topological shift
      </div>
    </div>
  )
}
