import React, { useMemo, useState } from 'react'

// ─── Kolmogorov-Sinai Entropy (Chaos Theory) ────────────────────────────────
// Measures the rate of information production in a dynamical system.
// For chaotic systems, KS entropy is positive; for periodic systems, zero.
//
// Mathematical foundation:
//   KS entropy: h_KS = lim_{ε→0} lim_{n→∞} (1/n) · H(s_0, s_1, ..., s_{n-1})
//   where s_i are symbolic partitions of the phase space
//
//   Estimation methods:
//   1. Symbolic dynamics: partition returns into symbols, compute block entropy
//      H_n = -Σ p(s_0...s_{n-1}) · log₂ p(s_0...s_{n-1})
//      h_KS = lim_{n→∞} (H_n - H_{n-1}) = lim (H_n / n)
//
//   2. Permutation entropy: ordinal patterns of length n
//      For each window, compute rank pattern → probability distribution
//      PE = -Σ p(π) · log₂ p(π)
//
//   3. Lyapunov spectrum: h_KS = Σ λ_i (sum of positive Lyapunov exponents)
//
//   4. Cross-sample entropy: complexity measure between segments
//
//   Applications: market efficiency, chaos vs noise, predictability horizon

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Symbolic partition: map returns to symbols {0, 1, 2} (down, flat, up)
const symbolize = (returns, nSymbols = 3) => {
  const sorted = [...returns].sort((a, b) => a - b)
  const thresholds = []
  for (let i = 1; i < nSymbols; i++) {
    thresholds.push(sorted[Math.floor(sorted.length * i / nSymbols)])
  }
  return returns.map(r => {
    let s = 0
    for (let i = 0; i < thresholds.length; i++) {
      if (r > thresholds[i]) s = i + 1
    }
    return s
  })
}

// Block entropy H_n: entropy of n-grams
const blockEntropy = (symbols, blockSize) => {
  const n = symbols.length
  if (n < blockSize) return 0
  const blocks = {}
  for (let i = 0; i <= n - blockSize; i++) {
    const key = symbols.slice(i, i + blockSize).join(',')
    blocks[key] = (blocks[key] || 0) + 1
  }
  const total = n - blockSize + 1
  let entropy = 0
  for (const key in blocks) {
    const p = blocks[key] / total
    if (p > 0) entropy -= p * Math.log2(p)
  }
  return entropy
}

// Permutation entropy
const permutationEntropy = (returns, order = 3) => {
  const n = returns.length
  if (n < order) return 0
  const patterns = {}
  for (let i = 0; i <= n - order; i++) {
    const window = returns.slice(i, i + order)
    const indexed = window.map((v, idx) => ({ v, idx }))
    indexed.sort((a, b) => a.v - b.v)
    const pattern = indexed.map(x => x.idx).join(',')
    patterns[pattern] = (patterns[pattern] || 0) + 1
  }
  const total = n - order + 1
  let entropy = 0
  for (const key in patterns) {
    const p = patterns[key] / total
    if (p > 0) entropy -= p * Math.log2(p)
  }
  // Normalize by log2(order!)
  const maxEntropy = Math.log2(factorial(order))
  return { entropy, normalized: entropy / maxEntropy, patterns }
}

const factorial = (n) => {
  let f = 1
  for (let i = 2; i <= n; i++) f *= i
  return f
}

// Sample entropy (complexity measure)
const sampleEntropy = (returns, m = 2, r = 0.2) => {
  const n = returns.length
  const std = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / n)
  const threshold = r * std

  const countMatches = (len) => {
    let count = 0
    for (let i = 0; i < n - len; i++) {
      for (let j = i + 1; j < n - len; j++) {
        let match = true
        for (let k = 0; k < len; k++) {
          if (Math.abs(returns[i + k] - returns[j + k]) > threshold) {
            match = false
            break
          }
        }
        if (match) count++
      }
    }
    return count
  }

  const A = countMatches(m + 1)
  const B = countMatches(m)
  if (B === 0) return 0
  return -Math.log(A / B)
}

// Largest Lyapunov exponent (Rosenstein's method)
const largestLyapunov = (returns, maxLag = 20) => {
  const n = returns.length
  if (n < maxLag * 2) return 0

  // Embedding dimension 2, delay 1
  const points = []
  for (let i = 0; i < n - 1; i++) {
    points.push([returns[i], returns[i + 1]])
  }

  // For each point, find nearest neighbor
  const divergences = []
  for (let lag = 1; lag <= maxLag; lag++) {
    let totalLog = 0, count = 0
    for (let i = 0; i < points.length - lag; i++) {
      // Find nearest neighbor (excluding temporal neighbors)
      let minDist = Infinity, nnIdx = -1
      for (let j = 0; j < points.length; j++) {
        if (Math.abs(j - i) < 5) continue
        const d = Math.sqrt((points[i][0] - points[j][0]) ** 2 + (points[i][1] - points[j][1]) ** 2)
        if (d < minDist && d > 0) { minDist = d; nnIdx = j }
      }
      if (nnIdx >= 0 && nnIdx + lag < points.length && i + lag < points.length) {
        const d0 = minDist
        const dt = Math.sqrt(
          (points[i + lag][0] - points[nnIdx + lag][0]) ** 2 +
          (points[i + lag][1] - points[nnIdx + lag][1]) ** 2
        )
        if (d0 > 0 && dt > 0) {
          totalLog += Math.log(dt / d0)
          count++
        }
      }
    }
    if (count > 0) {
      divergences.push({ lag, logDiv: totalLog / count })
    }
  }

  // Linear regression on log divergence vs lag
  if (divergences.length < 3) return { lle: 0, divergences }
  const nD = divergences.length
  const meanX = divergences.reduce((s, d) => s + d.lag, 0) / nD
  const meanY = divergences.reduce((s, d) => s + d.logDiv, 0) / nD
  let num = 0, den = 0
  for (const d of divergences) {
    num += (d.lag - meanX) * (d.logDiv - meanY)
    den += (d.lag - meanX) ** 2
  }
  const slope = den > 0 ? num / den : 0

  return { lle: slope, divergences }
}

export default function KolmogorovSinaiEntropy({ candles, symbol, exchange }) {
  const [nSymbols, setNSymbols] = useState(3)
  const [maxBlock, setMaxBlock] = useState(8)
  const [permOrder, setPermOrder] = useState(4)
  const [lookback, setLookback] = useState(200)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Symbolic dynamics
    const symbols = symbolize(returns, nSymbols)

    // Block entropy for different block sizes
    const blockEntropies = []
    for (let b = 1; b <= maxBlock; b++) {
      const H = blockEntropy(symbols, b)
      blockEntropies.push({ blockSize: b, entropy: H, rate: b > 1 ? H - blockEntropies[b - 2].entropy : H })
    }

    // KS entropy estimate: H_n - H_{n-1} as n → ∞
    const ksEntropy = blockEntropies[blockEntropies.length - 1].rate

    // Permutation entropy
    const pe = permutationEntropy(returns, permOrder)

    // Sample entropy
    const se = sampleEntropy(returns, 2, 0.2)

    // Largest Lyapunov exponent
    const lle = largestLyapunov(returns, 20)

    // Predictability horizon: 1 / h_KS
    const predictabilityHorizon = ksEntropy > 0 ? 1 / ksEntropy : Infinity

    // Sliding window KS entropy
    const windowSize = 50
    const slidingKS = []
    for (let i = 0; i + windowSize <= returns.length; i += Math.max(5, Math.floor(windowSize / 4))) {
      const window = returns.slice(i, i + windowSize)
      const wsym = symbolize(window, nSymbols)
      const be = []
      for (let b = 1; b <= Math.min(5, maxBlock); b++) {
        be.push(blockEntropy(wsym, b))
      }
      const ks = be[be.length - 1] - be[be.length - 2]
      slidingKS.push({ idx: i, ks: ks > 0 ? ks : 0 })
    }

    // Signal
    let signal = 'STOCHASTIC'
    let reason = ''
    if (lle.lle > 0.01) {
      signal = 'CHAOTIC'
      reason = `Positive Lyapunov exponent λ₁=${lle.lle.toFixed(4)} (chaotic, sensitive to initial conditions)`
    } else if (ksEntropy < 0.01) {
      signal = 'PERIODIC'
      reason = `KS entropy ≈ 0 (${ksEntropy.toFixed(4)}) (periodic/predictable)`
    } else if (ksEntropy > 0.5) {
      signal = 'HIGH_ENTROPY'
      reason = `KS entropy = ${ksEntropy.toFixed(4)} (high complexity, hard to predict)`
    } else {
      reason = `KS entropy = ${ksEntropy.toFixed(4)} (moderate complexity)`
    }

    return {
      blockEntropies, ksEntropy, pe, se, lle,
      predictabilityHorizon, slidingKS,
      signal, reason, symbols, returns,
    }
  }, [candles, exchange, symbol, nSymbols, maxBlock, permOrder, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'CHAOTIC' ? '#ef4444' : data.signal === 'PERIODIC' ? '#22c55e' : data.signal === 'HIGH_ENTROPY' ? '#f59e0b' : '#06b6d4'

  // Block entropy
  const maxBE = Math.max(...data.blockEntropies.map(b => b.entropy), 0.1)
  const sxBE = (i) => P + (i / data.blockEntropies.length) * (W - 2 * P)
  const syBE = (v) => H - P - (v / maxBE) * (H - 2 * P)

  // Lyapunov divergence
  const maxLD = Math.max(...data.lle.divergences.map(d => d.logDiv), 0.1)
  const minLD = Math.min(...data.lle.divergences.map(d => d.logDiv), -0.1)
  const sxLD = (i) => P + (i / data.lle.divergences.length) * (W - 2 * P)
  const syLD = (v) => H - P - ((v - minLD) / (maxLD - minLD + 0.001)) * (H - 2 * P)

  // Sliding KS
  const maxKS = Math.max(...data.slidingKS.map(s => s.ks), 0.01)
  const sxKS = (i) => P + (i / data.slidingKS.length) * (W - 2 * P)
  const syKS = (v) => H - P - (v / maxKS) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Kolmogorov-Sinai Entropy (Chaos) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Symbols:</span>
          <input type="number" value={nSymbols} onChange={e => setNSymbols(Math.max(2, Math.min(6, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max block:</span>
          <input type="number" value={maxBlock} onChange={e => setMaxBlock(Math.max(3, Math.min(12, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Perm. order:</span>
          <input type="number" value={permOrder} onChange={e => setPermOrder(Math.max(2, Math.min(6, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(100, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Block entropy and KS rate */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Block Entropy H_n and KS Rate (H_n - H_{'{n-1}'})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Block entropy */}
          <path d={data.blockEntropies.map((b, i) => `${i === 0 ? 'M' : 'L'} ${sxBE(i)} ${syBE(b.entropy)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {/* KS rate (difference) */}
          {data.blockEntropies.map((b, i) => (
            <line key={i} x1={sxBE(i)} y1={H - P} x2={sxBE(i)} y2={syBE(b.rate)} stroke="#f59e0b" strokeWidth={2} opacity={0.6} />
          ))}

          {data.blockEntropies.map((b, i) => (
            <text key={i} x={sxBE(i)} y={H - P + 12} textAnchor="middle" fill="#475569" fontSize={8}>n={b.blockSize}</text>
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>H_n (block entropy)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>h_KS ≈ {data.ksEntropy.toFixed(4)}</text>
        </svg>
      </div>

      {/* Lyapunov divergence */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Largest Lyapunov Exponent (Rosenstein's method)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.lle.divergences.map((d, i) => (
            <circle key={i} cx={sxLD(i)} cy={syLD(d.logDiv)} r={3} fill={d.logDiv > 0 ? '#ef4444' : '#22c55e'} opacity={0.7} />
          ))}

          {/* Linear fit */}
          {(() => {
            const n = data.lle.divergences.length
            const x1 = 0, x2 = n - 1
            const y1 = data.lle.lle * data.lle.divergences[0].lag
            const y2 = data.lle.lle * data.lle.divergences[n - 1].lag
            return <line x1={sxLD(x1)} y1={syLD(y1)} x2={sxLD(x2)} y2={syLD(y2)} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5,3" />
          })()}

          <text x={W - P} y={20} textAnchor="end" fill="#ef4444" fontSize={9}>log divergence</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>λ₁ = {data.lle.lle.toFixed(6)} (slope)</text>
        </svg>
      </div>

      {/* Sliding window KS entropy */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Sliding Window KS Entropy (complexity over time)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.slidingKS.map((s, i) => (
            <line key={i} x1={sxKS(i)} y1={H - P} x2={sxKS(i)} y2={syKS(s.ks)} stroke="#a855f7" strokeWidth={2} opacity={0.7} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>h_KS (windowed)</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">KS entropy</div>
          <div className="text-cyan-400 font-mono">{data.ksEntropy.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Perm. entropy</div>
          <div className="text-emerald-400 font-mono">{data.pe.normalized.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Sample entropy</div>
          <div className="text-amber-400 font-mono">{data.se.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Lyapunov λ₁</div>
          <div className="text-purple-400 font-mono">{data.lle.lle.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Pred. horizon</div>
          <div className="text-slate-300 font-mono">{isFinite(data.predictabilityHorizon) ? data.predictabilityHorizon.toFixed(1) + ' steps' : '∞'}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> KS:</strong> h_KS = lim(H_n - H_{'{n-1}'}) (block entropy rate) |
        <strong> PE:</strong> ordinal pattern entropy (normalized) |
        <strong> SE:</strong> sample entropy (complexity) |
        <strong> LLE:</strong> Rosenstein's method (λ₁ {'>'} 0 → chaos) |
        <strong> Horizon:</strong> 1/h_KS (predictability limit)
      </div>
    </div>
  )
}
