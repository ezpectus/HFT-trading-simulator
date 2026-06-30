import React, { useMemo, useState } from 'react'

// ─── Information Bottleneck (Rate-Distortion Optimization) ──────────────────
// Finds optimal compression of return signals by trading off information
// preservation (I(X;T)) against complexity (I(T;Y)).
//
// Mathematical foundation:
//   Information Bottleneck objective:
//   L = I(X;T) - β·I(T;Y)
//   where T is compressed representation, X is input, Y is target
//
//   Minimize over p(t|x):
//   I(X;T) = Σ_{x,t} p(x,t)·log[p(t|x)/p(t)]
//   I(T;Y) = Σ_{t,y} p(t,y)·log[p(y|t)/p(y)]
//
//   Self-consistent equations:
//   p(t|x) = p(t)·exp(-β·D_KL[p(y|x)||p(y|t)]) / Z(x,β)
//   p(y|t) = Σ_x p(y|x)·p(x|t)
//   p(t) = Σ_x p(x)·p(t|x)
//
//   Blahut-Arimoto iterative algorithm:
//   1. Initialize p(t|x) randomly
//   2. Update p(y|t) and p(t)
//   3. Update p(t|x) using KL divergence
//   4. Iterate until convergence
//
//   Applications: feature compression, optimal discretization, signal clustering

// Quantize continuous values
const quantize = (values, nBins) => {
  const min = Math.min(...values), max = Math.max(...values)
  const binW = (max - min) / nBins || 1
  return values.map(v => Math.min(nBins - 1, Math.max(0, Math.floor((v - min) / binW))))
}

// KL divergence D(p || q)
const klDivergence = (p, q) => {
  let kl = 0
  for (let i = 0; i < p.length; i++) {
    if (p[i] > 0 && q[i] > 0) kl += p[i] * Math.log2(p[i] / q[i])
  }
  return kl
}

// Information Bottleneck via Blahut-Arimoto
const informationBottleneck = (X, Y, nClusters, beta, maxIter = 100) => {
  const n = X.length
  const nXStates = Math.max(...X) + 1
  const nYStates = Math.max(...Y) + 1

  // Compute p(x), p(y|x)
  const px = new Array(nXStates).fill(0)
  const pyx = Array.from({ length: nXStates }, () => new Array(nYStates).fill(0))
  const xCounts = new Array(nXStates).fill(0)

  for (let i = 0; i < n; i++) {
    px[X[i]]++
    pyx[X[i]][Y[i]]++
    xCounts[X[i]]++
  }
  for (let x = 0; x < nXStates; x++) {
    px[x] /= n
    for (let y = 0; y < nYStates; y++) {
      pyx[x][y] = xCounts[x] > 0 ? pyx[x][y] / xCounts[x] : 0
    }
  }

  // Compute p(y)
  const py = new Array(nYStates).fill(0)
  for (let x = 0; x < nXStates; x++) {
    for (let y = 0; y < nYStates; y++) {
      py[y] += px[x] * pyx[x][y]
    }
  }

  // Initialize p(t|x) uniformly
  let ptx = Array.from({ length: nXStates }, () => {
    const row = Array.from({ length: nClusters }, () => Math.random() + 0.1)
    const sum = row.reduce((a, b) => a + b, 0)
    return row.map(v => v / sum)
  })

  let I_XT = 0, I_TY = 0
  const history = []

  for (let iter = 0; iter < maxIter; iter++) {
    // Update p(t) = Σ_x p(x)·p(t|x)
    const pt = new Array(nClusters).fill(0)
    for (let t = 0; t < nClusters; t++) {
      for (let x = 0; x < nXStates; x++) {
        pt[t] += px[x] * ptx[x][t]
      }
    }

    // Update p(y|t) = Σ_x p(y|x)·p(x|t) = Σ_x p(y|x)·p(x,t)/p(t)
    const pyt = Array.from({ length: nClusters }, () => new Array(nYStates).fill(0))
    for (let t = 0; t < nClusters; t++) {
      if (pt[t] <= 0) continue
      for (let x = 0; x < nXStates; x++) {
        const pxt = ptx[x][t] * px[x] / pt[t]
        for (let y = 0; y < nYStates; y++) {
          pyt[t][y] += pyx[x][y] * pxt
        }
      }
      // Normalize
      const sum = pyt[t].reduce((a, b) => a + b, 0)
      if (sum > 0) for (let y = 0; y < nYStates; y++) pyt[t][y] /= sum
    }

    // Update p(t|x) = p(t)·exp(-β·D_KL[p(y|x)||p(y|t)]) / Z(x,β)
    for (let x = 0; x < nXStates; x++) {
      const newRow = new Array(nClusters).fill(0)
      let Z = 0
      for (let t = 0; t < nClusters; t++) {
        const kl = klDivergence(pyx[x], pyt[t])
        newRow[t] = pt[t] * Math.exp(-beta * kl)
        Z += newRow[t]
      }
      if (Z > 0) for (let t = 0; t < nClusters; t++) ptx[x][t] = newRow[t] / Z
    }

    // Compute I(X;T) and I(T;Y)
    I_XT = 0
    for (let x = 0; x < nXStates; x++) {
      for (let t = 0; t < nClusters; t++) {
        const pxt = px[x] * ptx[x][t]
        if (pxt > 0 && pt[t] > 0) I_XT += pxt * Math.log2(ptx[x][t] / pt[t])
      }
    }

    I_TY = 0
    for (let t = 0; t < nClusters; t++) {
      for (let y = 0; y < nYStates; y++) {
        const pty = pt[t] * pyt[t][y]
        if (pty > 0 && py[y] > 0) I_TY += pty * Math.log2(pyt[t][y] / py[y])
      }
    }

    history.push({ iter, I_XT: Math.max(0, I_XT), I_TY: Math.max(0, I_TY) })
  }

  // Assign clusters
  const assignments = X.map(x => {
    let maxP = 0, idx = 0
    for (let t = 0; t < nClusters; t++) {
      if (ptx[x][t] > maxP) { maxP = ptx[x][t]; idx = t }
    }
    return idx
  })

  // Cluster statistics
  const clusters = Array.from({ length: nClusters }, (_, t) => {
    const members = X.filter((x, i) => assignments[i] === t)
    if (members.length === 0) return { t, size: 0, meanX: 0, meanY: 0 }
    const meanX = members.reduce((a, b) => a + b, 0) / members.length
    const yMembers = Y.filter((_, i) => assignments[i] === t)
    const meanY = yMembers.reduce((a, b) => a + b, 0) / yMembers.length
    return { t, size: members.length, meanX, meanY }
  })

  return {
    I_XT: Math.max(0, I_XT), I_TY: Math.max(0, I_TY),
    assignments, clusters, history,
    ptx, nClusters, beta,
  }
}

export default function InformationBottleneck({ candles, symbol, exchange }) {
  const [nClusters, setNClusters] = useState(4)
  const [beta, setBeta] = useState(5)
  const [nBins, setNBins] = useState(10)
  const [lookback, setLookback] = useState(100)
  const [lag, setLag] = useState(1)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + lag + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback - lag).map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // X = current return, Y = future return (lag steps ahead)
    const X = returns.slice(0, returns.length - lag)
    const Y = returns.slice(lag)

    // Quantize
    const Xq = quantize(X, nBins)
    const Yq = quantize(Y, nBins)

    // Run IB for multiple beta values (rate-distortion curve)
    const betaValues = [0.1, 0.5, 1, 2, 5, 10, 20, 50]
    const rdCurve = betaValues.map(b => {
      const result = informationBottleneck(Xq, Yq, nClusters, b, 50)
      return { beta: b, I_XT: result.I_XT, I_TY: result.I_TY }
    })

    // Main result with selected beta
    const result = informationBottleneck(Xq, Yq, nClusters, beta, 100)

    // Signal: which cluster does current return belong to?
    const currentReturn = returns[returns.length - 1]
    const currentX = quantize([currentReturn], nBins)[0]
    let currentCluster = 0, maxP = 0
    for (let t = 0; t < nClusters; t++) {
      if (result.ptx[currentX]?.[t] > maxP) { maxP = result.ptx[currentX][t]; currentCluster = t }
    }

    const clusterInfo = result.clusters[currentCluster]
    let signal = 'NEUTRAL'
    let reason = ''
    if (clusterInfo && clusterInfo.size > 0) {
      if (clusterInfo.meanY > nBins / 2) {
        signal = 'BUY'
        reason = `Cluster ${currentCluster}: mean future return = ${(clusterInfo.meanY / nBins).toFixed(2)} (positive)`
      } else if (clusterInfo.meanY < nBins / 2) {
        signal = 'SELL'
        reason = `Cluster ${currentCluster}: mean future return = ${(clusterInfo.meanY / nBins).toFixed(2)} (negative)`
      } else {
        reason = `Cluster ${currentCluster}: neutral future return`
      }
    }

    return {
      ...result, rdCurve,
      currentReturn, currentCluster, clusterInfo,
      signal, reason, returns, Xq, Yq,
    }
  }, [candles, exchange, symbol, nClusters, beta, nBins, lookback, lag])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + lag + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'
  const clusterColors = ['#22c55e', '#ef4444', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#14b8a6', '#f97316']

  // Rate-distortion curve
  const maxIXT = Math.max(...data.rdCurve.map(d => d.I_XT), 0.1)
  const maxITY = Math.max(...data.rdCurve.map(d => d.I_TY), 0.1)
  const sxRD = (v) => P + (v / maxIXT) * (W - 2 * P)
  const syRD = (v) => H - P - (v / maxITY) * (H - 2 * P)

  // Convergence history
  const maxIter = data.history.length
  const sxIter = (i) => P + (i / maxIter) * (W - 2 * P)
  const syInfo = (v) => H - P - (v / Math.max(maxIXT, maxITY, 0.1)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Information Bottleneck — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Clusters:</span>
          <input type="number" value={nClusters} onChange={e => setNClusters(Math.max(2, Math.min(8, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">β (trade-off):</span>
          <input type="number" step="0.5" value={beta} onChange={e => setBeta(Math.max(0.1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Bins:</span>
          <input type="number" value={nBins} onChange={e => setNBins(Math.max(3, Math.min(20, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lag:</span>
          <input type="number" value={lag} onChange={e => setLag(Math.max(1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Rate-distortion curve */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Rate-Distortion Curve: I(X;T) vs I(T;Y) (varying β)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* RD curve */}
          <path d={data.rdCurve.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sxRD(d.I_XT)} ${syRD(d.I_TY)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {/* Points */}
          {data.rdCurve.map((d, i) => (
            <g key={i}>
              <circle cx={sxRD(d.I_XT)} cy={syRD(d.I_TY)} r={Math.abs(d.beta - beta) < 0.01 ? 6 : 3} fill={Math.abs(d.beta - beta) < 0.01 ? '#f59e0b' : '#06b6d4'} />
              <text x={sxRD(d.I_XT) + 5} y={syRD(d.I_TY) - 5} fill="#64748b" fontSize={7}>β={d.beta}</text>
            </g>
          ))}

          <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={9}>I(X;T) — Rate (complexity)</text>
          <text x={5} y={P + 10} fill="#475569" fontSize={9}>I(T;Y) — Distortion (relevance)</text>
        </svg>
      </div>

      {/* Convergence */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Blahut-Arimoto Convergence (β={beta})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${sxIter(i)} ${syInfo(h.I_XT)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />
          <path d={data.history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${sxIter(i)} ${syInfo(h.I_TY)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>I(X;T) = {data.I_XT.toFixed(4)} bits</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>I(T;Y) = {data.I_TY.toFixed(4)} bits</text>
        </svg>
      </div>

      {/* Cluster assignments */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Cluster Assignments (last 60 bars)</div>
        <svg width={W} height={80} className="bg-slate-900 rounded">
          {data.assignments.slice(-60).map((a, i) => {
            const x = P + (i / 60) * (W - 2 * P)
            return <rect key={i} x={x} y={10} width={Math.max(1, (W - 2 * P) / 60 - 0.5)} height={60} fill={clusterColors[a]} opacity={0.6} />
          })}
        </svg>
      </div>

      {/* Cluster details */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Cluster Statistics</div>
        <div className="space-y-1">
          {data.clusters.map((c, t) => (
            <div key={t} className="flex items-center gap-3 text-xs">
              <span className="w-3 h-3 rounded" style={{ background: clusterColors[t] }} />
              <span className="text-slate-400 w-16">Cluster {t}</span>
              <span className="text-cyan-400 font-mono w-20">Size: {c.size}</span>
              <span className="text-amber-400 font-mono w-24">Mean X: {c.meanX.toFixed(2)}</span>
              <span className="text-purple-400 font-mono w-24">Mean Y: {c.meanY.toFixed(2)}</span>
              {t === data.currentCluster && <span className="text-emerald-400 font-bold">← CURRENT</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">I(X;T)</div>
          <div className="text-cyan-400 font-mono">{data.I_XT.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">I(T;Y)</div>
          <div className="text-amber-400 font-mono">{data.I_TY.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">β trade-off</div>
          <div className="text-purple-400 font-mono">{beta}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Current cluster</div>
          <div className="font-mono" style={{ color: clusterColors[data.currentCluster] }}>{data.currentCluster}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Compression</div>
          <div className="text-emerald-400 font-mono">{data.nClusters}←{nBins}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Objective:</strong> L = I(X;T) - β·I(T;Y) |
        <strong> Algorithm:</strong> Blahut-Arimoto (self-consistent equations) |
        <strong> Lag:</strong> {lag} steps ahead
      </div>
    </div>
  )
}
