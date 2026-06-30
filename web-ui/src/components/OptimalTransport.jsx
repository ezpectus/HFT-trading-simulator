import React, { useMemo, useState } from 'react'

// ─── Optimal Transport (Wasserstein Distance) ───────────────────────────────
// Computes Wasserstein (earth mover's) distance between return distributions
// and uses it for regime change detection and distribution comparison.
//
// Mathematical foundation:
//   1-Wasserstein distance (EMD):
//   W₁(P, Q) = inf_{γ∈Π(P,Q)} E_{(x,y)~γ}[|x - y|]
//   = Σ |F_P(x) - F_Q(x)| dx  (for 1D, via CDFs)
//
//   2-Wasserstein distance:
//   W₂²(P, Q) = ∫₀¹ (F_P⁻¹(u) - F_Q⁻¹(u))² du
//   = (μ_P - μ_Q)² + (σ_P - σ_Q)²  (for Gaussians)
//
//   Sinkhorn divergence (entropic regularization):
//   W_ε(P, Q) = min_γ <γ, C> - ε·H(γ)
//   Solved via Sinkhorn iterations: u ← p / (K·v), v ← q / (Kᵀ·u)
//
//   Applications:
//   - Regime detection: compare recent vs historical distributions
//   - Distribution shift: W₁ between rolling windows
//   - Signal: large W₁ → distribution shift → regime change

// 1D Wasserstein distance via sorted samples
const wasserstein1D = (samples1, samples2) => {
  const s1 = [...samples1].sort((a, b) => a - b)
  const s2 = [...samples2].sort((a, b) => a - b)
  const n = Math.min(s1.length, s2.length)
  let dist = 0
  for (let i = 0; i < n; i++) {
    dist += Math.abs(s1[i] - s2[i])
  }
  return dist / n
}

// 2-Wasserstein for empirical distributions via quantile matching
const wasserstein2 = (samples1, samples2) => {
  const s1 = [...samples1].sort((a, b) => a - b)
  const s2 = [...samples2].sort((a, b) => a - b)
  const n = Math.min(s1.length, s2.length)
  let dist = 0
  for (let i = 0; i < n; i++) {
    const q1 = s1[Math.floor((i / n) * s1.length)]
    const q2 = s2[Math.floor((i / n) * s2.length)]
    dist += (q1 - q2) ** 2
  }
  return Math.sqrt(dist / n)
}

// Sinkhorn algorithm for 2D distributions
const sinkhorn = (p, q, C, epsilon = 0.1, maxIter = 100) => {
  const n = p.length, m = q.length
  // Kernel: K = exp(-C / ε)
  const K = Array.from({ length: n }, () => new Array(m).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      K[i][j] = Math.exp(-C[i][j] / epsilon)
    }
  }

  let u = new Array(n).fill(1 / n)
  let v = new Array(m).fill(1 / m)

  for (let iter = 0; iter < maxIter; iter++) {
    // u ← p / (K·v)
    for (let i = 0; i < n; i++) {
      let Kv = 0
      for (let j = 0; j < m; j++) Kv += K[i][j] * v[j]
      u[i] = p[i] / (Kv + 1e-10)
    }
    // v ← q / (Kᵀ·u)
    for (let j = 0; j < m; j++) {
      let Ktu = 0
      for (let i = 0; i < n; i++) Ktu += K[i][j] * u[i]
      v[j] = q[j] / (Ktu + 1e-10)
    }
  }

  // Transport plan: γ = diag(u)·K·diag(v)
  // Wasserstein distance: <γ, C>
  let dist = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const gamma = u[i] * K[i][j] * v[j]
      dist += gamma * C[i][j]
    }
  }

  return dist
}

// Compute histogram
const histogram = (data, nBins = 20) => {
  const min = Math.min(...data), max = Math.max(...data)
  const binW = (max - min) / nBins || 1
  const bins = new Array(nBins).fill(0)
  for (const v of data) {
    const idx = Math.min(nBins - 1, Math.floor((v - min) / binW))
    bins[idx]++
  }
  const total = data.length
  return {
    probs: bins.map(b => b / total),
    edges: Array.from({ length: nBins }, (_, i) => min + i * binW),
    min, max, binW,
  }
}

// Cost matrix for binned distributions
const costMatrix = (edges1, edges2) => {
  const n = edges1.length, m = edges2.length
  const C = Array.from({ length: n }, () => new Array(m).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      C[i][j] = Math.abs(edges1[i] - edges2[j])
    }
  }
  return C
}

export default function OptimalTransport({ candles, symbol, exchange }) {
  const [windowSize, setWindowSize] = useState(30)
  const [epsilon, setEpsilon] = useState(0.1)
  const [nBins, setNBins] = useState(20)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < windowSize * 3) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // Recent vs historical window
    const recent = returns.slice(-windowSize)
    const historical = returns.slice(-windowSize * 2, -windowSize)

    // 1-Wasserstein
    const w1 = wasserstein1D(recent, historical)
    // 2-Wasserstein
    const w2 = wasserstein2(recent, historical)

    // Sinkhorn (binned)
    const hist1 = histogram(recent, nBins)
    const hist2 = histogram(historical, nBins)
    const C = costMatrix(hist1.edges, hist2.edges)
    const sinkhornDist = sinkhorn(hist1.probs, hist2.probs, C, epsilon, 50)

    // Rolling Wasserstein distance over time
    const rollingW1 = []
    for (let t = windowSize * 2; t < returns.length; t++) {
      const w1 = returns.slice(t - windowSize, t)
      const w2 = returns.slice(t - windowSize * 2, t - windowSize)
      rollingW1.push({ time: t, w1: wasserstein1D(w1, w2) })
    }

    // Rolling statistics
    const meanRecent = recent.reduce((a, b) => a + b, 0) / recent.length
    const meanHist = historical.reduce((a, b) => a + b, 0) / historical.length
    const stdRecent = Math.sqrt(recent.reduce((s, r) => s + (r - meanRecent) ** 2, 0) / recent.length)
    const stdHist = Math.sqrt(historical.reduce((s, r) => s + (r - meanHist) ** 2, 0) / historical.length)

    // Gaussian approximation W2
    const w2Gaussian = Math.sqrt((meanRecent - meanHist) ** 2 + (stdRecent - stdHist) ** 2)

    // Kolmogorov-Smirnov statistic
    const sortedR = [...recent].sort((a, b) => a - b)
    const sortedH = [...historical].sort((a, b) => a - b)
    let ksStat = 0
    for (let i = 0; i < Math.min(sortedR.length, sortedH.length); i++) {
      const cdfR = (i + 1) / sortedR.length
      const cdfH = (i + 1) / sortedH.length
      ksStat = Math.max(ksStat, Math.abs(cdfR - cdfH))
    }

    // Signal: large W1 → distribution shift
    const rollingMean = rollingW1.length > 0 ? rollingW1.reduce((s, r) => s + r.w1, 0) / rollingW1.length : 0
    const rollingStd = rollingW1.length > 0 ? Math.sqrt(rollingW1.reduce((s, r) => s + (r.w1 - rollingMean) ** 2, 0) / rollingW1.length) : 0
    const currentW1 = rollingW1[rollingW1.length - 1]?.w1 || w1
    const w1ZScore = rollingStd > 0 ? (currentW1 - rollingMean) / rollingStd : 0

    let signal = 'STABLE'
    let reason = ''
    if (w1ZScore > 2) {
      signal = 'REGIME_SHIFT'
      reason = `W₁ z-score = ${w1ZScore.toFixed(2)} (distribution shift detected)`
    } else if (w1ZScore > 1) {
      signal = 'SHIFTING'
      reason = `W₁ z-score = ${w1ZScore.toFixed(2)} (distribution changing)`
    } else {
      reason = `W₁ z-score = ${w1ZScore.toFixed(2)} (distribution stable)`
    }

    return {
      w1, w2, sinkhornDist, w2Gaussian, ksStat,
      recent, historical,
      hist1, hist2,
      rollingW1: rollingW1.slice(-60),
      meanRecent, meanHist, stdRecent, stdHist,
      rollingMean, rollingStd, currentW1, w1ZScore,
      signal, reason,
    }
  }, [candles, exchange, symbol, windowSize, epsilon, nBins])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {windowSize * 3 + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'REGIME_SHIFT' ? '#ef4444' : data.signal === 'SHIFTING' ? '#f59e0b' : '#22c55e'

  // Histogram comparison
  const maxProb = Math.max(...data.hist1.probs, ...data.hist2.probs)
  const sxHist = (i) => P + (i / nBins) * (W - 2 * P)
  const syHist = (v) => H - P - (v / maxProb) * (H - 2 * P)

  // Rolling W1
  const maxW1 = Math.max(...data.rollingW1.map(r => r.w1), 0.001)
  const sxRoll = (i) => P + (i / Math.max(1, data.rollingW1.length - 1)) * (W - 2 * P)
  const syRoll = (v) => H - P - (v / maxW1) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Optimal Transport (Wasserstein) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">ε (Sinkhorn):</span>
          <input type="number" step="0.01" value={epsilon} onChange={e => setEpsilon(Math.max(0.01, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Bins:</span>
          <input type="number" value={nBins} onChange={e => setNBins(Math.max(5, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Distribution comparison */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Return Distribution: Recent vs Historical (histogram)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          {data.hist1.probs.map((p, i) => (
            <g key={i}>
              <rect x={sxHist(i)} y={syHist(p)} width={(W - 2 * P) / nBins / 2 - 1} height={H - P - syHist(p)} fill="#06b6d4" opacity={0.7} />
              <rect x={sxHist(i) + (W - 2 * P) / nBins / 2 + 1} y={syHist(data.hist2.probs[i])} width={(W - 2 * P) / nBins / 2 - 1} height={H - P - syHist(data.hist2.probs[i])} fill="#f59e0b" opacity={0.7} />
            </g>
          ))}
          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>Recent (μ={data.meanRecent.toFixed(5)})</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>Historical (μ={data.meanHist.toFixed(5)})</text>
        </svg>
      </div>

      {/* Rolling Wasserstein distance */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Rolling W₁ Distance (regime shift detector)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Mean + threshold lines */}
          <line x1={P} y1={syRoll(data.rollingMean)} x2={W - P} y2={syRoll(data.rollingMean)} stroke="#64748b" strokeDasharray="3,2" />
          <line x1={P} y1={syRoll(data.rollingMean + 2 * data.rollingStd)} x2={W - P} y2={syRoll(data.rollingMean + 2 * data.rollingStd)} stroke="#ef4444" strokeDasharray="4,3" />
          <text x={W - P} y={syRoll(data.rollingMean + 2 * data.rollingStd) - 5} textAnchor="end" fill="#ef4444" fontSize={9}>2σ threshold</text>

          {/* W1 path */}
          <path d={data.rollingW1.map((r, i) => `${i === 0 ? 'M' : 'L'} ${sxRoll(i)} ${syRoll(r.w1)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {/* Current marker */}
          <circle cx={sxRoll(data.rollingW1.length - 1)} cy={syRoll(data.currentW1)} r={5} fill={sigColor} />
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">W₁ (EMD)</div>
          <div className="text-cyan-400 font-mono">{data.w1.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">W₂ (empirical)</div>
          <div className="text-emerald-400 font-mono">{data.w2.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">W₂ (Gaussian)</div>
          <div className="text-amber-400 font-mono">{data.w2Gaussian.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Sinkhorn</div>
          <div className="text-purple-400 font-mono">{data.sinkhornDist.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">KS stat</div>
          <div className="text-slate-300 font-mono">{data.ksStat.toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> W₁ z-score:</strong> {data.w1ZScore.toFixed(2)} |
        <strong> σ_recent:</strong> {data.stdRecent.toFixed(5)} vs <strong>σ_hist:</strong> {data.stdHist.toFixed(5)} |
        <strong> Sinkhorn ε:</strong> {epsilon}
      </div>
    </div>
  )
}
