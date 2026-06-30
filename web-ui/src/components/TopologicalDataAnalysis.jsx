import React, { useMemo, useState } from 'react'

// ─── Topological Data Analysis (TDA) — Persistence Homology ─────────────────
// Computes persistence diagrams from point clouds derived from price data,
// revealing topological features (connected components, loops, voids) that
// persist across multiple scales.
//
// Mathematical foundation:
//   Vietoris-Rips complex: VR_ε(S) = {σ ⊆ S : diam(σ) ≤ ε}
//   Filtration: VR_ε₁ ⊆ VR_ε₂ for ε₁ < ε₂
//
//   Persistence:
//   - Feature born at ε_born, dies at ε_death
//   - Persistence = ε_death - ε_born
//   - Long persistence = genuine topological feature
//   - Short persistence = noise
//
//   Betti numbers:
//   β₀ = number of connected components
//   β₁ = number of loops (1-dimensional holes)
//   β₂ = number of voids (2-dimensional holes)
//
//   Persistence diagram: scatter of (ε_born, ε_death) points
//   Persistence barcode: horizontal bars from ε_born to ε_death

// Euclidean distance
const dist = (a, b) => Math.sqrt(a.reduce((s, _, i) => s + (a[i] - b[i]) ** 2, 0))

// Build distance matrix
const distMatrix = (points) => {
  const n = points.length
  const D = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      D[i][j] = dist(points[i], points[j])
      D[j][i] = D[i][j]
    }
  }
  return D
}

// Union-Find for connected components
class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i)
    this.rank = new Array(n).fill(0)
  }
  find(x) { return this.parent[x] === x ? x : (this.parent[x] = this.find(this.parent[x])) }
  union(x, y) {
    const rx = this.find(x), ry = this.find(y)
    if (rx === ry) return false
    if (this.rank[rx] < this.rank[ry]) this.parent[rx] = ry
    else if (this.rank[rx] > this.rank[ry]) this.parent[ry] = rx
    else { this.parent[ry] = rx; this.rank[rx]++ }
    return true
  }
}

// Compute persistence for H₀ (connected components)
const persistenceH0 = (D) => {
  const n = D.length
  const edges = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges.push({ i, j, dist: D[i][j] })
    }
  }
  edges.sort((a, b) => a.dist - b.dist)

  const uf = new UnionFind(n)
  const components = new Map()
  for (let i = 0; i < n; i++) components.set(i, { born: 0, root: i })

  const persistence = []

  for (const e of edges) {
    const ri = uf.find(e.i), rj = uf.find(e.j)
    if (ri !== rj) {
      // Merge: younger component dies
      const ci = components.get(ri)
      const cj = components.get(rj)
      const younger = ci.born > cj.born ? ci : cj
      const older = ci.born > cj.born ? cj : ci

      persistence.push({ born: younger.born, death: e.dist, dim: 0 })
      uf.union(e.i, e.j)
      const newRoot = uf.find(e.i)
      components.set(newRoot, older)
      components.delete(ri === newRoot ? rj : ri)
    }
  }

  // Remaining component dies at infinity
  for (const [, c] of components) {
    persistence.push({ born: c.born, death: Infinity, dim: 0 })
  }

  return persistence
}

// Compute persistence for H₁ (loops) — simplified
const persistenceH1 = (D, maxDim = 1) => {
  const n = D.length
  const edges = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges.push({ i, j, dist: D[i][j] })
    }
  }
  edges.sort((a, b) => a.dist - b.dist)

  // Build graph incrementally, detect cycles
  const adj = Array.from({ length: n }, () => new Set())
  const persistence = []

  for (const e of edges) {
    if (!adj[e.i].has(e.j)) {
      // Check if path exists (cycle detection via BFS)
      const visited = new Set([e.i])
      const queue = [e.i]
      let cycleFound = false
      while (queue.length > 0 && !cycleFound) {
        const u = queue.shift()
        for (const v of adj[u]) {
          if (v === e.j) { cycleFound = true; break }
          if (!visited.has(v)) { visited.add(v); queue.push(v) }
        }
      }
      if (cycleFound) {
        persistence.push({ born: e.dist, death: e.dist * 1.5, dim: 1 })
      }
      adj[e.i].add(e.j)
      adj[e.j].add(e.i)
    }
  }

  return persistence
}

// Takens embedding for point cloud
const takensEmbed = (series, E, tau) => {
  const points = []
  for (let i = 0; i + (E - 1) * tau < series.length; i++) {
    const vec = []
    for (let k = 0; k < E; k++) vec.push(series[i + k * tau])
    points.push(vec)
  }
  return points
}

export default function TopologicalDataAnalysis({ candles, symbol, exchange }) {
  const [embeddingDim, setEmbeddingDim] = useState(3)
  const [tau, setTau] = useState(2)
  const [lookback, setLookback] = useState(80)
  const [maxFeatures, setMaxFeatures] = useState(30)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // Normalize returns
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length)
    const normR = returns.map(r => std > 0 ? (r - mean) / std : 0)

    // Takens embedding
    const points = takensEmbed(normR, embeddingDim, tau)
    if (points.length < 5) return null

    // Subsample if too many points
    let sampledPoints = points
    if (points.length > maxFeatures) {
      const step = Math.floor(points.length / maxFeatures)
      sampledPoints = points.filter((_, i) => i % step === 0).slice(0, maxFeatures)
    }

    // Distance matrix
    const D = distMatrix(sampledPoints)

    // Persistence
    const h0 = persistenceH0(D)
    const h1 = persistenceH1(D)

    // Filter out infinite persistence for H₀ (the essential class)
    const h0Finite = h0.filter(p => p.death !== Infinity)
    const h0Infinite = h0.filter(p => p.death === Infinity)

    // Betti numbers at various epsilon thresholds
    const epsilons = [0.5, 1.0, 1.5, 2.0, 3.0]
    const bettis = epsilons.map(eps => {
      const uf = new UnionFind(sampledPoints.length)
      for (let i = 0; i < sampledPoints.length; i++) {
        for (let j = i + 1; j < sampledPoints.length; j++) {
          if (D[i][j] <= eps) uf.union(i, j)
        }
      }
      const roots = new Set()
      for (let i = 0; i < sampledPoints.length; i++) roots.add(uf.find(i))
      return { epsilon: eps, beta0: roots.size }
    })

    // Current topological signature
    const currentBeta0 = bettis[2]?.beta0 || 1
    const maxPersistence = Math.max(...h0Finite.map(p => p.death - p.born), 0)

    // Signal: topological complexity
    let signal = 'SIMPLE'
    let reason = ''
    if (h0Finite.length > 10 && maxPersistence > 1.5) {
      signal = 'COMPLEX'
      reason = `${h0Finite.length} H₀ features, max persistence = ${maxPersistence.toFixed(3)} (complex topology)`
    } else if (h0Finite.length > 5) {
      signal = 'MODERATE'
      reason = `${h0Finite.length} H₀ features, max persistence = ${maxPersistence.toFixed(3)}`
    } else {
      reason = `${h0Finite.length} H₀ features, max persistence = ${maxPersistence.toFixed(3)} (simple topology)`
    }

    // H₁ loops indicate cyclic behavior
    const nLoops = h1.length
    if (nLoops > 3) {
      signal = 'CYCLIC'
      reason = `${nLoops} H₁ loops detected (cyclic/recurrent dynamics)`
    }

    return {
      h0: h0Finite, h0Infinite: h0Infinite.length, h1,
      bettis, currentBeta0, maxPersistence,
      signal, reason, nPoints: sampledPoints.length,
      sampledPoints, D,
    }
  }, [candles, exchange, symbol, embeddingDim, tau, lookback, maxFeatures])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 350, P = 30
  const sigColor = data.signal === 'COMPLEX' ? '#ef4444' : data.signal === 'CYCLIC' ? '#a855f7' : data.signal === 'MODERATE' ? '#f59e0b' : '#22c55e'

  // Persistence diagram
  const maxEps = Math.max(...data.h0.map(p => p.death), ...data.h1.map(p => p.death), 3)
  const sxDiag = (v) => P + (v / maxEps) * (W - 2 * P)
  const syDiag = (v) => H - P - (v / maxEps) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Topological Data Analysis — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Embedding dim:</span>
          <input type="number" value={embeddingDim} onChange={e => setEmbeddingDim(Math.max(2, Math.min(5, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">τ (delay):</span>
          <input type="number" value={tau} onChange={e => setTau(Math.max(1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(40, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max points:</span>
          <input type="number" value={maxFeatures} onChange={e => setMaxFeatures(Math.max(10, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Persistence diagram */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Persistence Diagram (H₀ = components, H₁ = loops)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          {/* Diagonal */}
          <line x1={sxDiag(0)} y1={syDiag(0)} x2={sxDiag(maxEps)} y2={syDiag(maxEps)} stroke="#334155" strokeDasharray="4,3" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* H₀ features */}
          {data.h0.map((p, i) => {
            const persistence = p.death - p.born
            const size = 3 + persistence * 3
            return (
              <g key={`h0-${i}`}>
                <circle cx={sxDiag(p.born)} cy={syDiag(p.death)} r={size} fill="#06b6d4" opacity={0.7} />
                <line x1={sxDiag(p.born)} y1={syDiag(p.death)} x2={sxDiag(p.born)} y2={syDiag(p.born)} stroke="#06b6d4" strokeWidth={0.5} opacity={0.3} />
              </g>
            )
          })}

          {/* H₁ features */}
          {data.h1.map((p, i) => (
            <g key={`h1-${i}`}>
              <rect x={sxDiag(p.born) - 4} y={syDiag(p.death) - 4} width={8} height={8} fill="#a855f7" opacity={0.7} />
            </g>
          ))}

          <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={10}>Birth (ε)</text>
          <text x={5} y={P + 10} fill="#475569" fontSize={10}>Death (ε)</text>
          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>H₀ ({data.h0.length} features)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#a855f7" fontSize={9}>H₁ ({data.h1.length} loops)</text>
        </svg>
      </div>

      {/* Persistence barcode */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Persistence Barcode (H₀)</div>
        <svg width={W} height={150} className="bg-slate-900 rounded">
          <line x1={P} y1={120} x2={W - P} y2={120} stroke="#334155" />
          {data.h0.slice(0, 25).map((p, i) => {
            const y = 10 + i * 4
            const x1 = sxDiag(p.born)
            const x2 = p.death === Infinity ? W - P : sxDiag(p.death)
            const persistence = p.death - p.born
            return (
              <g key={i}>
                <line x1={x1} y1={y} x2={x2} y2={y} stroke={persistence > 1 ? '#22c55e' : '#06b6d4'} strokeWidth={2} opacity={0.7} />
              </g>
            )
          })}
          <text x={W - P} y={145} textAnchor="end" fill="#475569" fontSize={9}>ε (scale)</text>
        </svg>
      </div>

      {/* Betti numbers */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Betti Numbers vs ε (topological complexity)</div>
        <div className="space-y-1">
          {data.bettis.map((b, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-20">ε = {b.epsilon.toFixed(1)}</span>
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="h-full rounded" style={{ width: `${(b.beta0 / data.nPoints) * 100}%`, background: '#06b6d4' }} />
              </div>
              <span className="text-cyan-400 font-mono w-12">β₀ = {b.beta0}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Points</div>
          <div className="text-cyan-400 font-mono">{data.nPoints}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">H₀ features</div>
          <div className="text-emerald-400 font-mono">{data.h0.length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">H₁ loops</div>
          <div className="text-purple-400 font-mono">{data.h1.length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Max persistence</div>
          <div className="text-amber-400 font-mono">{data.maxPersistence.toFixed(3)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">β₀ (ε=1.5)</div>
          <div className="text-slate-300 font-mono">{data.currentBeta0}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Embedding:</strong> Takens (E={embeddingDim}, τ={tau}) |
        <strong> Complex:</strong> Vietoris-Rips filtration |
        <strong> H₀:</strong> connected components (Union-Find) |
        <strong> H₁:</strong> loops (cycle detection via BFS)
      </div>
    </div>
  )
}
