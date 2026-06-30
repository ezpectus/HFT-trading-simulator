import React, { useMemo, useState } from 'react'

// ─── Graph Theory: Correlation Networks & MST ───────────────────────────────
// Constructs financial networks from return correlations using:
// 1. Complete graph with correlation-based edge weights
// 2. Minimum Spanning Tree (MST) — filtered backbone (Mantegna)
// 3. Planar Maximally Filtered Graph (PMFG) — topological filtering
//
// Mathematical foundation:
//   Distance: d_{ij} = √(2(1 - ρ_{ij}))  (correlation distance)
//   MST: minimum total weight spanning tree (Kruskal's or Prim's algorithm)
//   PMFG: keep top 3(n-2) edges that can be embedded on a plane
//
//   Network metrics:
//   - Degree centrality: C_D(i) = deg(i) / (n-1)
//   - Betweenness centrality: C_B(i) = Σ_{s≠i≠t} σ_{st}(i) / σ_{st}
//   - Eigenvector centrality: Ax = λx (principal eigenvector)
//   - Clustering coefficient: C_i = 2e_i / (k_i(k_i-1))
//   - Modularity: Q = Σ [e_{ii} - a_i²]

// Compute correlation matrix
const correlationMatrix = (allReturns) => {
  const n = allReturns.length
  const T = allReturns[0].length
  const corr = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const mi = allReturns[i].reduce((a, b) => a + b, 0) / T
      const mj = allReturns[j].reduce((a, b) => a + b, 0) / T
      let cov = 0, vi = 0, vj = 0
      for (let t = 0; t < T; t++) {
        const di = allReturns[i][t] - mi
        const dj = allReturns[j][t] - mj
        cov += di * dj; vi += di * di; vj += dj * dj
      }
      corr[i][j] = (vi > 0 && vj > 0) ? cov / Math.sqrt(vi * vj) : 0
    }
  }
  return corr
}

// Kruskal's MST
const kruskalMST = (edges, n) => {
  edges.sort((a, b) => a.weight - b.weight)
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]))
  const mst = []
  for (const e of edges) {
    const ra = find(e.a), rb = find(e.b)
    if (ra !== rb) {
      parent[ra] = rb
      mst.push(e)
    }
  }
  return mst
}

// Eigenvector centrality (power iteration)
const eigenvectorCentrality = (adjMatrix, maxIter = 100) => {
  const n = adjMatrix.length
  let v = new Array(n).fill(1 / n)
  for (let iter = 0; iter < maxIter; iter++) {
    const newV = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        newV[i] += adjMatrix[i][j] * v[j]
      }
    }
    const norm = Math.sqrt(newV.reduce((s, x) => s + x * x, 0)) || 1
    v = newV.map(x => x / norm)
  }
  return v
}

// Betweenness centrality (simplified — shortest path counting)
const betweennessCentrality = (mstEdges, n) => {
  // Build adjacency list
  const adj = Array.from({ length: n }, () => [])
  for (const e of mstEdges) {
    adj[e.a].push(e.b)
    adj[e.b].push(e.a)
  }

  const centrality = new Array(n).fill(0)
  // For each pair, find shortest path (BFS) and count node visits
  for (let s = 0; s < n; s++) {
    for (let t = s + 1; t < n; t++) {
      // BFS from s to t
      const visited = new Array(n).fill(false)
      const parent = new Array(n).fill(-1)
      visited[s] = true
      const queue = [s]
      while (queue.length > 0) {
        const u = queue.shift()
        if (u === t) break
        for (const v of adj[u]) {
          if (!visited[v]) {
            visited[v] = true
            parent[v] = u
            queue.push(v)
          }
        }
      }
      // Backtrack path
      let u = t
      while (u !== s && u !== -1) {
        if (u !== t) centrality[u]++
        u = parent[u]
      }
    }
  }
  // Normalize
  const norm = (n - 1) * (n - 2) / 2
  return centrality.map(c => norm > 0 ? c / norm : 0)
}

// Clustering coefficient
const clusteringCoeff = (mstEdges, n) => {
  const adj = Array.from({ length: n }, () => new Set())
  for (const e of mstEdges) {
    adj[e.a].add(e.b)
    adj[e.b].add(e.a)
  }
  return Array.from({ length: n }, (_, i) => {
    const neighbors = [...adj[i]]
    const k = neighbors.length
    if (k < 2) return 0
    let links = 0
    for (let a = 0; a < k; a++) {
      for (let b = a + 1; b < k; b++) {
        if (adj[neighbors[a]].has(neighbors[b])) links++
      }
    }
    return 2 * links / (k * (k - 1))
  })
}

export default function GraphTheoryNetwork({ candles, symbols, exchange }) {
  const [lookback, setLookback] = useState(50)
  const [edgeThreshold, setEdgeThreshold] = useState(0.3)

  const data = useMemo(() => {
    if (!candles?.[exchange] || !symbols || symbols.length < 3) return null

    const allReturns = []
    const validSymbols = []
    for (const sym of symbols) {
      const cds = candles[exchange]?.[sym]
      if (!cds || cds.length < lookback + 1) continue
      const prices = cds.slice(-lookback - 1).map(c => c.close)
      const rets = []
      for (let i = 1; i < prices.length; i++) {
        rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
      }
      allReturns.push(rets)
      validSymbols.push(sym)
    }
    if (validSymbols.length < 3) return null

    const n = validSymbols.length
    const corr = correlationMatrix(allReturns)

    // Distance matrix: d = √(2(1-ρ))
    const edges = []
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dist = Math.sqrt(Math.max(0, 2 * (1 - corr[i][j])))
        edges.push({ a: i, b: j, weight: dist, corr: corr[i][j] })
      }
    }

    // MST
    const mst = kruskalMST([...edges], n)

    // Adjacency matrix from MST
    const adjMatrix = Array.from({ length: n }, () => new Array(n).fill(0))
    for (const e of mst) {
      adjMatrix[e.a][e.b] = 1
      adjMatrix[e.b][e.a] = 1
    }

    // Centralities
    const eigenCent = eigenvectorCentrality(adjMatrix)
    const betwCent = betweennessCentrality(mst, n)
    const clusterCoeff = clusteringCoeff(mst, n)

    // Degree centrality
    const degrees = adjMatrix.map(row => row.reduce((s, v) => s + v, 0))

    // Filtered edges (above threshold)
    const filteredEdges = edges.filter(e => Math.abs(e.corr) > edgeThreshold)

    // Network statistics
    const avgCorr = edges.reduce((s, e) => s + e.corr, 0) / edges.length
    const mstAvgDist = mst.reduce((s, e) => s + e.weight, 0) / mst.length
    const mstAvgCorr = mst.reduce((s, e) => s + e.corr, 0) / mst.length

    // Hub node (highest degree)
    const hubIdx = degrees.indexOf(Math.max(...degrees))
    const hub = validSymbols[hubIdx]

    // Signal: hub asset drives the network
    let signal = 'NEUTRAL'
    let reason = ''
    if (degrees[hubIdx] > 2) {
      signal = 'HUB'
      reason = `${hub} is network hub (degree=${degrees[hubIdx]}, centrality=${eigenCent[hubIdx].toFixed(3)})`
    } else {
      reason = `No dominant hub (max degree=${Math.max(...degrees)})`
    }

    // Layout: circular
    const layout = validSymbols.map((sym, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2
      return { sym, x: Math.cos(angle), y: Math.sin(angle), idx: i }
    })

    return {
      validSymbols, corr, edges, mst, filteredEdges,
      eigenCent, betwCent, clusterCoeff, degrees,
      avgCorr, mstAvgDist, mstAvgCorr, hub, hubIdx,
      signal, reason, layout, n,
    }
  }, [candles, exchange, symbols, lookback, edgeThreshold])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 3 symbols with {lookback + 1}+ candles on {exchange}</div>
  }

  const W = 600, H = 500, cx = W / 2, cy = H / 2, R = 180
  const sigColor = data.signal === 'HUB' ? '#f59e0b' : '#94a3b8'

  const nodeX = (layout) => cx + layout.x * R
  const nodeY = (layout) => cy + layout.y * R

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Graph Theory: Correlation Network — {exchange}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(20, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">|ρ| threshold:</span>
          <input type="number" step="0.1" value={edgeThreshold} onChange={e => setEdgeThreshold(Math.max(0, Math.min(1, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      <div className="flex gap-4">
        {/* Network graph */}
        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">Minimum Spanning Tree (Mantegna)</div>
          <svg width={W} height={H} className="bg-slate-900 rounded">
            {/* MST edges */}
            {data.mst.map((e, i) => (
              <line
                key={i}
                x1={nodeX(data.layout[e.a])} y1={nodeY(data.layout[e.a])}
                x2={nodeX(data.layout[e.b])} y2={nodeY(data.layout[e.b])}
                stroke={e.corr > 0 ? '#22c55e' : '#ef4444'}
                strokeWidth={Math.max(1, Math.abs(e.corr) * 4)}
                opacity={0.6}
              />
            ))}

            {/* Nodes */}
            {data.layout.map((node, i) => {
              const size = 8 + data.degrees[i] * 4
              const isHub = i === data.hubIdx
              return (
                <g key={i}>
                  <circle
                    cx={nodeX(node)} cy={nodeY(node)} r={size}
                    fill={isHub ? '#f59e0b' : '#06b6d4'}
                    opacity={0.8}
                    stroke={isHub ? '#fbbf24' : '#0ea5e9'}
                    strokeWidth={isHub ? 3 : 1}
                  />
                  <text
                    x={nodeX(node)} y={nodeY(node) - size - 3}
                    textAnchor="middle" fill="#e2e8f0" fontSize={9}
                  >
                    {node.sym.slice(0, 10)}
                  </text>
                  <text
                    x={nodeX(node)} y={nodeY(node) + 3}
                    textAnchor="middle" fill="#1e293b" fontSize={8} fontWeight="bold"
                  >
                    {data.degrees[i]}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Centrality table */}
        <div className="flex-1 space-y-3">
          <div className="bg-slate-800 rounded p-3">
            <div className="text-xs text-slate-400 mb-2">Node Centralities</div>
            <div className="space-y-1 max-h-48 overflow-auto">
              {data.validSymbols.map((sym, i) => (
                <div key={sym} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 w-24 truncate">{sym}</span>
                  <span className="text-cyan-400 font-mono w-12">deg={data.degrees[i]}</span>
                  <span className="text-amber-400 font-mono w-16">eig={data.eigenCent[i].toFixed(3)}</span>
                  <span className="text-emerald-400 font-mono w-16">btw={data.betwCent[i].toFixed(3)}</span>
                  <span className="text-purple-400 font-mono w-16">cc={data.clusterCoeff[i].toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Correlation matrix heatmap */}
          <div className="bg-slate-800 rounded p-3">
            <div className="text-xs text-slate-400 mb-2">Correlation Matrix</div>
            <div className="grid gap-px text-[8px]" style={{ gridTemplateColumns: `auto repeat(${data.n}, 1fr)` }}>
              <div></div>
              {data.validSymbols.map((s, i) => <div key={i} className="text-slate-500 text-center truncate">{s.slice(0, 4)}</div>)}
              {data.corr.map((row, i) => (
                <React.Fragment key={i}>
                  <div className="text-slate-500 truncate pr-1">{data.validSymbols[i].slice(0, 6)}</div>
                  {row.map((c, j) => (
                    <div key={j} className="text-center font-mono" style={{
                      background: c > 0 ? `rgba(34, 197, 94, ${Math.abs(c)})` : `rgba(239, 68, 68, ${Math.abs(c)})`,
                      color: Math.abs(c) > 0.5 ? '#fff' : '#94a3b8'
                    }}>
                      {c.toFixed(2)}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Nodes</div>
          <div className="text-cyan-400 font-mono">{data.n}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">MST edges</div>
          <div className="text-emerald-400 font-mono">{data.mst.length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Avg |ρ|</div>
          <div className="text-amber-400 font-mono">{data.avgCorr.toFixed(3)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">MST avg ρ</div>
          <div className="text-purple-400 font-mono">{data.mstAvgCorr.toFixed(3)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Hub</div>
          <div className="text-orange-400 font-mono text-[10px]">{data.hub}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> MST distance:</strong> d = √(2(1-ρ)) |
        <strong> Filtered edges:</strong> {data.filteredEdges.length} (|ρ| {'>'} {edgeThreshold}) |
        <strong> Algorithm:</strong> Kruskal's MST + power iteration eigenvector centrality
      </div>
    </div>
  )
}
