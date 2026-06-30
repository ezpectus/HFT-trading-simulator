import React, { useMemo, useState } from 'react'

// ─── Schrödinger Bridge (Optimal Transport Between Distributions) ───────────
// Computes the Schrödinger bridge: the most probable path between two
// distributions over time, generalizing optimal transport to stochastic
// settings with entropy regularization.
//
// Mathematical foundation:
//   Schrödinger bridge: find π* minimizing
//   KL(π || π₀) subject to π₀(X₀) = p₀, π₀(X₁) = p₁
//   where π₀ is the reference measure (Brownian motion)
//
//   Entropy-regularized OT (Sinkhorn):
//   min <C, π> - ε·H(π)
//   where C is cost matrix, H(π) = -Σ π_ij·log(π_ij)
//
//   Sinkhorn iterations:
//   u = p₀ / (K·v)
//   v = p₁ / (Kᵀ·u)
//   where K = exp(-C/ε)
//   π* = diag(u)·K·diag(v)
//
//   Transport plan: π*_ij = probability of moving from i to j
//
//   Applications: regime transition paths, distribution evolution,
//   optimal trading trajectory between portfolio states

// Sinkhorn algorithm for entropy-regularized OT
const sinkhorn = (C, p, q, epsilon, maxIter = 100, tol = 1e-6) => {
  const n = C.length, m = C[0].length
  // K = exp(-C/ε)
  const K = C.map(row => row.map(c => Math.exp(-c / epsilon)))

  let u = new Array(n).fill(1 / n)
  let v = new Array(m).fill(1 / m)

  const errors = []

  for (let iter = 0; iter < maxIter; iter++) {
    // u = p / (K·v)
    const Kv = K.map(row => row.reduce((s, k, j) => s + k * v[j], 0))
    u = p.map((pi, i) => pi / Math.max(1e-10, Kv[i]))

    // v = q / (Kᵀ·u)
    const Ktu = new Array(m).fill(0)
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) Ktu[j] += K[i][j] * u[i]
    }
    v = q.map((qi, j) => qi / Math.max(1e-10, Ktu[j]))

    // Check convergence
    const pi = u.map((ui, i) => K[i].map((k, j) => ui * k * v[j]))
    const rowSums = pi.map(row => row.reduce((s, v) => s + v, 0))
    const err = Math.sqrt(rowSums.reduce((s, rs, i) => s + (rs - p[i]) ** 2, 0))
    errors.push(err)
    if (err < tol) break
  }

  // Transport plan
  const plan = u.map((ui, i) => K[i].map((k, j) => ui * k * v[j]))

  // Transport cost
  let cost = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      cost += plan[i][j] * C[i][j]
    }
  }

  // Entropy of plan
  let entropy = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (plan[i][j] > 1e-10) entropy -= plan[i][j] * Math.log(plan[i][j])
    }
  }

  return { plan, cost, entropy, errors, u, v }
}

// Quantize distribution into bins
const quantize = (values, nBins) => {
  const min = Math.min(...values), max = Math.max(...values)
  const binW = (max - min) / nBins || 1
  const counts = new Array(nBins).fill(0)
  for (const v of values) {
    const idx = Math.min(nBins - 1, Math.max(0, Math.floor((v - min) / binW)))
    counts[idx]++
  }
  const total = values.length
  return { probs: counts.map(c => c / total), min, max, binW }
}

// Compute returns
const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

export default function SchrodingerBridge({ candles, symbol, exchange }) {
  const [nBins, setNBins] = useState(10)
  const [epsilon, setEpsilon] = useState(0.1)
  const [windowSize, setWindowSize] = useState(30)
  const [lookback, setLookback] = useState(120)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Split into two windows: "past" and "current"
    const halfIdx = Math.floor(returns.length / 2)
    const pastReturns = returns.slice(0, halfIdx)
    const currentReturns = returns.slice(halfIdx)

    // Quantize both distributions
    const pastDist = quantize(pastReturns, nBins)
    const currentDist = quantize(currentReturns, nBins)

    // Cost matrix: squared distance between bin centers
    const C = []
    for (let i = 0; i < nBins; i++) {
      const row = []
      const xi = pastDist.min + (i + 0.5) * pastDist.binW
      for (let j = 0; j < nBins; j++) {
        const xj = currentDist.min + (j + 0.5) * currentDist.binW
        row.push((xi - xj) ** 2)
      }
      C.push(row)
    }

    // Sinkhorn
    const result = sinkhorn(C, pastDist.probs, currentDist.probs, epsilon, 200, 1e-8)

    // Barycentric mapping: for each source bin, where does it transport to?
    const barycentric = []
    for (let i = 0; i < nBins; i++) {
      let weightedSum = 0, totalProb = 0
      for (let j = 0; j < nBins; j++) {
        const xj = currentDist.min + (j + 0.5) * currentDist.binW
        weightedSum += result.plan[i][j] * xj
        totalProb += result.plan[i][j]
      }
      barycentric.push({
        source: pastDist.min + (i + 0.5) * pastDist.binW,
        target: totalProb > 0 ? weightedSum / totalProb : 0,
        prob: pastDist.probs[i],
      })
    }

    // Displacement: how much each bin moves
    const displacements = barycentric.map(b => b.target - b.source)

    // Transport map signal: overall shift
    const weightedDisplacement = barycentric.reduce((s, b) => s + b.prob * (b.target - b.source), 0)

    // Wasserstein distance (approximate)
    const wasserstein = Math.sqrt(result.cost)

    // Signal
    let signal = 'NEUTRAL'
    let reason = ''
    if (weightedDisplacement > 0.001) {
      signal = 'DISTRIBUTION_SHIFT_UP'
      reason = `Transport displacement = ${weightedDisplacement.toFixed(6)} (distribution shifted right/up)`
    } else if (weightedDisplacement < -0.001) {
      signal = 'DISTRIBUTION_SHIFT_DOWN'
      reason = `Transport displacement = ${weightedDisplacement.toFixed(6)} (distribution shifted left/down)`
    } else {
      reason = `Transport displacement = ${weightedDisplacement.toFixed(6)} (stable distribution)`
    }

    // Entropy (high entropy = diffuse transport = uncertain)
    const isDiffuse = result.entropy > Math.log(nBins) * 0.8

    // Multi-window analysis: sliding windows
    const slidingResults = []
    for (let w = 0; w + windowSize * 2 <= returns.length; w += Math.max(5, Math.floor(windowSize / 4))) {
      const w1 = returns.slice(w, w + windowSize)
      const w2 = returns.slice(w + windowSize, w + windowSize * 2)
      const d1 = quantize(w1, nBins)
      const d2 = quantize(w2, nBins)
      const c = []
      for (let i = 0; i < nBins; i++) {
        const xi = d1.min + (i + 0.5) * d1.binW
        const row = []
        for (let j = 0; j < nBins; j++) {
          const xj = d2.min + (j + 0.5) * d2.binW
          row.push((xi - xj) ** 2)
        }
        c.push(row)
      }
      const r = sinkhorn(c, d1.probs, d2.probs, epsilon, 100, 1e-6)
      const wd = d1.probs.reduce((s, p, i) => {
        let target = 0, total = 0
        for (let j = 0; j < nBins; j++) {
          target += r.plan[i][j] * (d2.min + (j + 0.5) * d2.binW)
          total += r.plan[i][j]
        }
        return s + p * (total > 0 ? target / total - (d1.min + (i + 0.5) * d1.binW) : 0)
      }, 0)
      slidingResults.push({ idx: w, displacement: wd, wasserstein: Math.sqrt(r.cost), entropy: r.entropy })
    }

    return {
      pastDist, currentDist, result, barycentric, displacements,
      weightedDisplacement, wasserstein, signal, reason, isDiffuse,
      slidingResults, nBins,
    }
  }, [candles, exchange, symbol, nBins, epsilon, windowSize, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'DISTRIBUTION_SHIFT_UP' ? '#22c55e' : data.signal === 'DISTRIBUTION_SHIFT_DOWN' ? '#ef4444' : '#94a3b8'

  // Transport plan heatmap
  const maxPlan = Math.max(...data.result.plan.flat(), 0.001)

  // Distributions
  const maxProb = Math.max(...data.pastDist.probs, ...data.currentDist.probs, 0.001)
  const sxDist = (i) => P + (i / data.nBins) * (W - 2 * P)
  const syDist = (v) => H - P - (v / maxProb) * (H - 2 * P)

  // Sliding displacements
  const maxDisp = Math.max(...data.slidingResults.map(s => Math.abs(s.displacement)), 0.001)
  const sxSlide = (i) => P + (i / data.slidingResults.length) * (W - 2 * P)
  const sySlide = (v) => H - P - ((v + maxDisp) / (2 * maxDisp)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Schrödinger Bridge (Entropy-Regularized OT) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
        {data.isDiffuse && <span className="px-2 py-0.5 text-xs rounded bg-amber-500/20 text-amber-400">DIFFUSE</span>}
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Bins:</span>
          <input type="number" value={nBins} onChange={e => setNBins(Math.max(4, Math.min(20, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">ε (entropy):</span>
          <input type="number" step="0.01" value={epsilon} onChange={e => setEpsilon(Math.max(0.01, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
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

      {/* Transport plan heatmap */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Transport Plan π* (Sinkhorn, ε={epsilon})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          {data.result.plan.map((row, i) =>
            row.map((v, j) => {
              const intensity = v / maxPlan
              const cellW = (W - 2 * P) / data.nBins
              const cellH = (H - 2 * P) / data.nBins
              return <rect key={`${i}-${j}`} x={P + j * cellW} y={P + i * cellH} width={cellW - 0.5} height={cellH - 0.5} fill={`hsl(${240 - intensity * 240}, 80%, ${20 + intensity * 40}%)`} opacity={0.8} />
            })
          )}
          <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={9}>Current →</text>
          <text x={5} y={P + 10} fill="#475569" fontSize={9}>Past ↓</text>
        </svg>
      </div>

      {/* Distribution comparison */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Source (past) vs Target (current) Return Distributions</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.pastDist.probs.map((p, i) => (
            <rect key={`p-${i}`} x={sxDist(i)} y={syDist(p)} width={(W - 2 * P) / data.nBins - 1} height={H - P - syDist(p)} fill="#06b6d4" opacity={0.5} />
          ))}
          {data.currentDist.probs.map((p, i) => (
            <rect key={`c-${i}`} x={sxDist(i)} y={syDist(p)} width={(W - 2 * P) / data.nBins - 1} height={H - P - syDist(p)} fill="#f59e0b" opacity={0.5} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>Past</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>Current</text>
        </svg>
      </div>

      {/* Barycentric mapping (transport arrows) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Barycentric Transport Map (where each bin moves to)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.barycentric.map((b, i) => {
            const x1 = P + ((b.source - data.pastDist.min) / (data.pastDist.max - data.pastDist.min + 0.001)) * (W - 2 * P)
            const x2 = P + ((b.target - data.pastDist.min) / (data.pastDist.max - data.pastDist.min + 0.001)) * (W - 2 * P)
            const y = H - P - b.prob / maxProb * (H - 2 * P)
            const color = b.target > b.source ? '#22c55e' : b.target < b.source ? '#ef4444' : '#94a3b8'
            return (
              <g key={i}>
                <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={2} markerEnd="url(#arrowhead)" />
                <circle cx={x1} cy={y} r={3} fill="#06b6d4" />
                <circle cx={x2} cy={y} r={3} fill={color} />
              </g>
            )
          })}

          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="3" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
            </marker>
          </defs>
        </svg>
      </div>

      {/* Sliding window displacements */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Sliding Window: Transport Displacement Over Time</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.slidingResults.map((s, i) => (
            <line key={i} x1={sxSlide(i)} y1={H / 2} x2={sxSlide(i)} y2={sySlide(s.displacement)} stroke={s.displacement > 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} opacity={0.7} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>Shift up</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>Shift down</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Wasserstein W₂</div>
          <div className="text-cyan-400 font-mono">{data.wasserstein.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Transport cost</div>
          <div className="text-emerald-400 font-mono">{data.result.cost.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Entropy H(π)</div>
          <div className="text-amber-400 font-mono">{data.result.entropy.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Displacement</div>
          <div className="text-purple-400 font-mono">{data.weightedDisplacement.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Sinkhorn iters</div>
          <div className="text-slate-300 font-mono">{data.result.errors.length}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Bridge:</strong> π* = argmin KL(π||π₀) s.t. marginals = p₀, p₁ |
        <strong> Sinkhorn:</strong> u=p/(Kv), v=q/(Kᵀu), K=exp(-C/ε) |
        <strong> Cost:</strong> C_ij = (x_i - x_j)² |
        <strong> Entropy:</strong> ε controls sharpness (low ε → deterministic OT)
      </div>
    </div>
  )
}
