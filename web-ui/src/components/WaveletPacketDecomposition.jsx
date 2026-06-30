import React, { useMemo, useState } from 'react'

// ─── Wavelet Packet Decomposition (WPD) ─────────────────────────────────────
// Full binary tree wavelet decomposition providing richer frequency resolution
// than standard DWT. Each level splits both approximation AND detail coefficients.
//
// Mathematical foundation:
//   WPD creates a binary tree of subspaces:
//   Level 0:  W(0,0) = original signal
//   Level j:  W(j, 2k) = low-pass filter on W(j-1, k)
//             W(j, 2k+1) = high-pass filter on W(j-1, k)
//
//   Filters (Daubechies-4):
//   h = [0.4830, 0.8365, 0.2241, -0.1294]  (low-pass)
//   g = [-0.1294, -0.2241, 0.8365, -0.4830] (high-pass, = h reversed with sign alternation)
//
//   Best basis selection (Coifman-Wickerhauser):
//   Minimize entropy: H(p) = -Σ p_i·log(p_i)
//   Compare parent vs children entropy, keep lower
//
//   Applications: denoising, feature extraction, multi-scale analysis

const db4Low = [0.4830, 0.8365, 0.2241, -0.1294]
const db4High = [-0.1294, -0.2241, 0.8365, -0.4830]

const convolve = (signal, filter) => {
  const n = signal.length
  const f = filter.length
  const result = []
  for (let i = 0; i < n; i += 2) {
    let sum = 0
    for (let j = 0; j < f; j++) {
      const idx = i + j - Math.floor(f / 2) + 1
      if (idx >= 0 && idx < n) sum += signal[idx] * filter[j]
    }
    result.push(sum)
  }
  return result
}

// Single-level WPD split
const wpdSplit = (signal) => {
  const approx = convolve(signal, db4Low)
  const detail = convolve(signal, db4High)
  return { approx, detail }
}

// Full WPD tree
const wpdDecompose = (signal, maxLevel) => {
  const tree = [[signal]]
  for (let level = 0; level < maxLevel; level++) {
    const prevLevel = tree[level]
    const nextLevel = []
    for (const node of prevLevel) {
      if (node.length < 4) {
        nextLevel.push(node, [])
        continue
      }
      const { approx, detail } = wpdSplit(node)
      nextLevel.push(approx, detail)
    }
    tree.push(nextLevel)
  }
  return tree
}

// Shannon entropy
const shannonEntropy = (coeffs) => {
  const sum = coeffs.reduce((a, b) => a + Math.abs(b), 0) || 1
  const probs = coeffs.map(c => Math.abs(c) / sum)
  return -probs.reduce((s, p) => p > 0 ? s + p * Math.log2(p) : s, 0)
}

// Energy of coefficients
const energy = (coeffs) => coeffs.reduce((s, c) => s + c * c, 0)

// Best basis selection (Coifman-Wickerhauser)
const bestBasis = (tree) => {
  const costs = tree.map(level => level.map(node => shannonEntropy(node)))
  const selected = new Set()

  // Bottom-up: compare parent cost vs sum of children costs
  for (let level = tree.length - 1; level > 0; level--) {
    for (let i = 0; i < tree[level].length; i += 2) {
      const parentIdx = Math.floor(i / 2)
      const parentCost = costs[level - 1][parentIdx]
      const childrenCost = (costs[level][i] || 0) + (costs[level][i + 1] || 0)
      if (parentCost <= childrenCost) {
        selected.add(`${level - 1}-${parentIdx}`)
      }
    }
  }

  return { costs, selected }
}

// Thresholding for denoising
const softThreshold = (coeffs, threshold) => {
  return coeffs.map(c => {
    const sign = Math.sign(c)
    const abs = Math.abs(c)
    return abs > threshold ? sign * (abs - threshold) : 0
  })
}

const hardThreshold = (coeffs, threshold) => {
  return coeffs.map(c => Math.abs(c) > threshold ? c : 0)
}

// Universal threshold (VisuShrink): σ·√(2·log(N))
const universalThreshold = (coeffs) => {
  const n = coeffs.length
  if (n === 0) return 0
  const median = [...coeffs].sort((a, b) => a - b)[Math.floor(n / 2)]
  const sigma = median / 0.6745 // MAD estimator
  return sigma * Math.sqrt(2 * Math.log(n))
}

export default function WaveletPacketDecomposition({ candles, symbol, exchange }) {
  const [maxLevel, setMaxLevel] = useState(4)
  const [thresholdMethod, setThresholdMethod] = useState('soft')
  const [lookback, setLookback] = useState(128)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // Normalize
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length)
    const normR = returns.map(r => std > 0 ? (r - mean) / std : 0)

    // Pad to power of 2
    const paddedLen = Math.pow(2, Math.ceil(Math.log2(normR.length)))
    const padded = [...normR, ...new Array(paddedLen - normR.length).fill(0)]

    // WPD
    const tree = wpdDecompose(padded, maxLevel)

    // Best basis
    const { costs, selected } = bestBasis(tree)

    // Energy distribution
    const energies = tree.map(level => level.map(node => energy(node)))
    const totalEnergy = energies.flat().reduce((a, b) => a + b, 0)

    // Denoising: threshold detail coefficients at each level
    const denoisedTree = tree.map((level, l) => {
      if (l === 0) return level
      return level.map(node => {
        const thresh = universalThreshold(node)
        return thresholdMethod === 'soft' ? softThreshold(node, thresh) : hardThreshold(node, thresh)
      })
    })

    // Reconstruction (simplified: sum all leaf nodes)
    const leafLevel = denoisedTree[denoisedTree.length - 1]
    const reconstructed = leafLevel.length > 0 ? leafLevel[0] : padded

    // Signal: compare energy at different scales
    const detailEnergies = []
    for (let l = 1; l < tree.length; l++) {
      const levelE = energies[l]
      const detailE = levelE.reduce((a, b, i) => i % 2 === 1 ? a + b : a, 0)
      const approxE = levelE.reduce((a, b, i) => i % 2 === 0 ? a + b : a, 0)
      detailEnergies.push({ level: l, detail: detailE, approx: approxE })
    }

    // Current dominant scale
    const maxDetailLevel = detailEnergies.reduce((max, d) => d.detail > max.detail ? d : max, detailEnergies[0] || { level: 0, detail: 0 })

    let signal = 'NEUTRAL'
    let reason = ''
    if (maxDetailLevel.level <= 1) {
      signal = 'HIGH_FREQ'
      reason = `Dominant energy at level ${maxDetailLevel.level} (high frequency, noise/mean-reversion)`
    } else if (maxDetailLevel.level >= maxLevel - 1) {
      signal = 'LOW_FREQ'
      reason = `Dominant energy at level ${maxDetailLevel.level} (low frequency, trending)`
    } else {
      signal = 'MID_FREQ'
      reason = `Dominant energy at level ${maxDetailLevel.level} (mid frequency, cyclical)`
    }

    return {
      tree, costs, selected, energies, totalEnergy,
      detailEnergies, maxDetailLevel,
      signal, reason, nLevels: tree.length,
      padded, reconstructed,
      normR, prices,
    }
  }, [candles, exchange, symbol, maxLevel, thresholdMethod, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'HIGH_FREQ' ? '#06b6d4' : data.signal === 'LOW_FREQ' ? '#f59e0b' : '#a855f7'

  // Energy heatmap
  const maxE = Math.max(...data.energies.flat().filter(e => e > 0), 0.001)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Wavelet Packet Decomposition — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max level:</span>
          <input type="number" value={maxLevel} onChange={e => setMaxLevel(Math.max(2, Math.min(7, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Threshold:</span>
          <select value={thresholdMethod} onChange={e => setThresholdMethod(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="soft">Soft (VisuShrink)</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(32, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Energy heatmap */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">WPD Energy Heatmap (Daubechies-4, {data.nLevels} levels)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.energies.map((level, l) => {
            const nodeWidth = (W - 2 * P) / level.length
            return level.map((e, i) => {
              const intensity = e / maxE
              const hue = 240 - intensity * 240
              const nodeH = (H - 2 * P) / data.energies.length
              return (
                <g key={`${l}-${i}`}>
                  <rect
                    x={P + i * nodeWidth} y={P + l * nodeH}
                    width={nodeWidth - 1} height={nodeH - 1}
                    fill={`hsl(${hue}, 80%, ${20 + intensity * 40}%)`}
                    opacity={0.8}
                  />
                  {intensity > 0.3 && (
                    <text x={P + i * nodeWidth + nodeWidth / 2} y={P + l * nodeH + nodeH / 2 + 3} textAnchor="middle" fill="#fff" fontSize={7}>
                      {e.toFixed(1)}
                    </text>
                  )}
                </g>
              )
            })
          })}

          <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={9}>Node index →</text>
          <text x={5} y={P + 10} fill="#475569" fontSize={9}>Level ↓</text>
        </svg>
      </div>

      {/* Energy distribution by level */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Energy Distribution: Detail vs Approximation by Level</div>
        <div className="space-y-1">
          {data.detailEnergies.map((d, i) => {
            const totalE = d.detail + d.approx
            const detailPct = totalE > 0 ? (d.detail / totalE) * 100 : 0
            return (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="text-slate-400 w-20">Level {d.level}</span>
                <div className="flex-1 bg-slate-900 rounded h-3 relative">
                  <div className="h-full rounded absolute" style={{ width: `${100 - detailPct}%`, background: '#06b6d4' }} />
                  <div className="h-full rounded absolute" style={{ left: `${100 - detailPct}%`, width: `${detailPct}%`, background: '#f59e0b' }} />
                </div>
                <span className="text-cyan-400 font-mono w-16">A:{((d.approx / data.totalEnergy) * 100).toFixed(1)}%</span>
                <span className="text-amber-400 font-mono w-16">D:{((d.detail / data.totalEnergy) * 100).toFixed(1)}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Best basis entropy */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Best Basis Entropy (Coifman-Wickerhauser)</div>
        <div className="space-y-1">
          {data.costs.map((level, l) => (
            <div key={l} className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 w-12">L{l}</span>
              {level.map((cost, i) => (
                <span key={i} className="font-mono px-1 rounded" style={{
                  background: data.selected.has(`${l}-${i}`) ? '#22c55e22' : 'transparent',
                  color: data.selected.has(`${l}-${i}`) ? '#22c55e' : '#64748b'
                }} title={`Node (${l},${i})`}>
                  {cost.toFixed(2)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Levels</div>
          <div className="text-cyan-400 font-mono">{data.nLevels}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Total energy</div>
          <div className="text-emerald-400 font-mono">{data.totalEnergy.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Best basis nodes</div>
          <div className="text-amber-400 font-mono">{data.selected.size}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Dominant level</div>
          <div className="text-purple-400 font-mono">{data.maxDetailLevel.level}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Wavelet</div>
          <div className="text-slate-300 font-mono">Db4</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Wavelet:</strong> Daubechies-4 (4-tap) |
        <strong> Threshold:</strong> {thresholdMethod} (VisuShrink: σ·√(2·log(N))) |
        <strong> Best basis:</strong> Shannon entropy minimization
      </div>
    </div>
  )
}
