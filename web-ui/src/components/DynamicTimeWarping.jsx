import React, { useMemo, useState } from 'react'

// ─── Dynamic Time Warping (DTW) ──────────────────────────────────────────────
// Measures similarity between temporal sequences that may vary in speed.
// Unlike Euclidean distance, DTW can match sequences of different lengths
// by non-linearly warping the time axis.
//
// Mathematical foundation:
//   DTW(x, y) = min over all warping paths W of Σ d(w_k)
//   where d(a,b) = (a-b)² (or |a-b|)
//
//   Recurrence:
//   D[i,j] = d(x_i, y_j) + min(D[i-1,j], D[i,j-1], D[i-1,j-1])
//
//   Constraints:
//   - Boundary: w_1 = (1,1), w_K = (|x|,|y|)
//   - Monotonicity: i_k ≤ i_{k+1}, j_k ≤ j_{k+1}
//   - Continuity: i_{k+1} - i_k ≤ 1, j_{k+1} - j_k ≤ 1
//
//   Sakoe-Chiba band: |i - j| ≤ r (window constraint)
//   Slanted band: |i - j·(|x|/|y|)| ≤ r
//
//   Applications:
//   - Pattern matching: find historical sequences similar to current
//   - Signal classification: match against template patterns
//   - Regime detection: compare current window to known regimes

const dtw = (x, y, window = null) => {
  const n = x.length, m = y.length
  const w = window !== null ? Math.max(window, Math.abs(n - m)) : Math.max(n, m)

  // Initialize DP matrix
  const D = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity))
  D[0][0] = 0

  for (let i = 1; i <= n; i++) {
    const jStart = Math.max(1, i - w)
    const jEnd = Math.min(m, i + w)
    for (let j = jStart; j <= jEnd; j++) {
      const cost = (x[i - 1] - y[j - 1]) ** 2
      D[i][j] = cost + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1])
    }
  }

  // Backtrack to find warping path
  const path = []
  let i = n, j = m
  while (i > 0 && j > 0) {
    path.unshift([i - 1, j - 1])
    const minVal = Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1])
    if (minVal === D[i - 1][j - 1]) { i--; j-- }
    else if (minVal === D[i - 1][j]) { i-- }
    else { j-- }
  }

  return { distance: Math.sqrt(D[n][m]), path, cost: D[n][m] }
}

// Extract subsequences (windows) from price series
const extractWindows = (prices, windowSize) => {
  const windows = []
  for (let i = 0; i <= prices.length - windowSize; i++) {
    windows.push({
      start: i,
      data: prices.slice(i, i + windowSize),
    })
  }
  return windows
}

// Normalize window (z-score)
const normalize = (arr) => {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length)
  return arr.map(v => std > 0 ? (v - mean) / std : 0)
}

// Compute returns
const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Define template patterns (synthetic)
const TEMPLATES = {
  doubleBottom: [1.0, 0.5, 0.0, -0.3, -0.5, -0.3, 0.0, 0.5, 1.0, 0.5, 0.0, -0.3, -0.5, -0.3, 0.0, 0.5, 1.0, 1.5, 2.0],
  headAndShoulders: [0.5, 1.0, 1.5, 1.0, 0.5, 1.0, 1.5, 2.0, 2.5, 2.0, 1.5, 1.0, 0.5, 1.0, 1.5, 1.0, 0.5],
  ascendingTriangle: [0.0, 0.5, 0.0, 0.8, 0.2, 1.0, 0.4, 1.0, 0.6, 1.0, 0.8, 1.0, 1.0, 1.5, 2.0, 2.5],
  descendingTriangle: [2.5, 2.0, 1.5, 1.0, 1.0, 0.8, 1.0, 0.6, 1.0, 0.4, 1.0, 0.2, 0.8, 0.0, 0.5, 0.0],
  cupAndHandle: [2.0, 1.5, 1.0, 0.5, 0.0, -0.3, -0.5, -0.3, 0.0, 0.5, 1.0, 1.5, 2.0, 1.8, 1.5, 1.8, 2.2, 2.5, 3.0],
  vReversal: [2.0, 1.5, 1.0, 0.5, 0.0, -0.5, -1.0, -1.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5],
  flag: [0.0, 1.0, 2.0, 3.0, 2.5, 2.0, 1.5, 2.0, 2.5, 2.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5],
  channel: [0.0, 0.5, 1.0, 0.5, 0.0, -0.5, -1.0, -0.5, 0.0, 0.5, 1.0, 0.5, 0.0, -0.5, -1.0, -0.5, 0.0, 0.5, 1.0],
}

export default function DynamicTimeWarping({ candles, symbol, exchange }) {
  const [windowSize, setWindowSize] = useState(20)
  const [dtwWindow, setDtwWindow] = useState(5)
  const [selectedTemplate, setSelectedTemplate] = useState('doubleBottom')
  const [scanAll, setScanAll] = useState(true)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 40) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)
    const returns = computeReturns(prices)

    // Current window (normalized)
    const currentWindow = prices.slice(-windowSize)
    const currentNorm = normalize(currentWindow)

    const results = []

    if (scanAll) {
      // Match current window against all templates
      for (const [name, template] of Object.entries(TEMPLATES)) {
        const templateNorm = normalize(template)
        const { distance, path } = dtw(currentNorm, templateNorm, dtwWindow)
        const similarity = 1 / (1 + distance)
        results.push({ name, distance, similarity, path, template: templateNorm })
      }
      results.sort((a, b) => a.distance - b.distance)
    } else {
      // Match selected template against all historical windows
      const templateNorm = normalize(TEMPLATES[selectedTemplate])
      const windows = extractWindows(prices, windowSize)

      for (const win of windows) {
        const winNorm = normalize(win.data)
        const { distance, path } = dtw(winNorm, templateNorm, dtwWindow)
        const similarity = 1 / (1 + distance)
        results.push({
          name: `Window @${win.start}`,
          start: win.start,
          distance, similarity, path,
          data: winNorm,
          endPrice: win.data[win.data.length - 1],
          startPrice: win.data[0],
        })
      }
      results.sort((a, b) => a.distance - b.distance)
    }

    // Best match
    const bestMatch = results[0]

    // Forward projection from best match
    let projection = null
    if (!scanAll && bestMatch) {
      const matchEndIdx = bestMatch.start + windowSize
      if (matchEndIdx + 10 < prices.length) {
        projection = prices.slice(matchEndIdx, matchEndIdx + 10)
      }
    }

    // Signal from best pattern match
    let signal = 'NEUTRAL'
    let reason = ''
    if (scanAll && bestMatch) {
      const bullishPatterns = ['doubleBottom', 'cupAndHandle', 'vReversal', 'ascendingTriangle', 'flag']
      const bearishPatterns = ['headAndShoulders', 'descendingTriangle']
      const neutralPatterns = ['channel']
      if (bullishPatterns.includes(bestMatch.name) && bestMatch.similarity > 0.3) {
        signal = 'BUY'
        reason = `${bestMatch.name} detected (similarity=${bestMatch.similarity.toFixed(3)})`
      } else if (bearishPatterns.includes(bestMatch.name) && bestMatch.similarity > 0.3) {
        signal = 'SELL'
        reason = `${bestMatch.name} detected (similarity=${bestMatch.similarity.toFixed(3)})`
      } else {
        reason = `${bestMatch.name} (similarity=${bestMatch.similarity.toFixed(3)})`
      }
    } else if (bestMatch) {
      reason = `Best match at position ${bestMatch.start} (distance=${bestMatch.distance.toFixed(4)})`
    }

    return {
      currentNorm, results, bestMatch, projection,
      signal, reason, prices, returns,
      currentWindow: currentWindow.map((v, i) => currentNorm[i]),
    }
  }, [candles, exchange, symbol, windowSize, dtwWindow, selectedTemplate, scanAll])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 40 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 280, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'

  // Chart: current window vs best match template
  const allVals = [...data.currentNorm]
  if (data.bestMatch?.template) allVals.push(...data.bestMatch.template)
  if (data.bestMatch?.data) allVals.push(...data.bestMatch.data)
  const maxAbs = Math.max(0.001, ...allVals.map(Math.abs))
  const sx = (i, len) => P + (i / Math.max(1, len - 1)) * (W - 2 * P)
  const sy = (v) => H / 2 - (v / maxAbs) * (H / 2 - P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Dynamic Time Warping — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window size:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">DTW band:</span>
          <input type="number" value={dtwWindow} onChange={e => setDtwWindow(Math.max(1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={scanAll} onChange={e => setScanAll(e.target.checked)} />
          <span className="text-slate-400">Scan all patterns</span>
        </label>
        {!scanAll && (
          <label className="flex items-center gap-1">
            <span className="text-slate-400">Template:</span>
            <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
              {Object.keys(TEMPLATES).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Current window vs best match */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">
          {scanAll ? `Current Window vs Best Pattern: ${data.bestMatch?.name}` : `Best Historical Match for ${selectedTemplate}`}
        </div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" strokeDasharray="3,2" />

          {/* Current window */}
          <path
            d={data.currentNorm.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i, data.currentNorm.length)} ${sy(v)}`).join(' ')}
            fill="none" stroke="#06b6d4" strokeWidth={2}
          />

          {/* Best match */}
          {data.bestMatch?.template && (
            <path
              d={data.bestMatch.template.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i, data.bestMatch.template.length)} ${sy(v)}`).join(' ')}
              fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4,3"
            />
          )}
          {data.bestMatch?.data && (
            <path
              d={data.bestMatch.data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i, data.bestMatch.data.length)} ${sy(v)}`).join(' ')}
              fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4,3"
            />
          )}

          {/* Warping path */}
          {data.bestMatch?.path && (() => {
            const len1 = data.currentNorm.length
            const len2 = data.bestMatch.template?.length || data.bestMatch.data?.length || 0
            return data.bestMatch.path.slice(0, 50).map(([i, j], k) => (
              <line key={k}
                x1={sx(i, len1)} y1={sy(data.currentNorm[i])}
                x2={sx(j, len2)} y2={sy(data.bestMatch.template?.[j] ?? data.bestMatch.data?.[j] ?? 0)}
                stroke="#475569" strokeWidth={0.5} opacity={0.3}
              />
            ))
          })()}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={10}>Current window</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={10}>Best match (dashed)</text>
        </svg>
      </div>

      {/* Results ranking */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">
          {scanAll ? 'Pattern Matching Results (all templates)' : `Top 5 Historical Matches for ${selectedTemplate}`}
        </div>
        <div className="space-y-1 max-h-40 overflow-auto">
          {data.results.slice(0, 10).map((r, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-500 w-4">{i + 1}</span>
              <span className="text-slate-300 w-32">{r.name}</span>
              <div className="flex-1 bg-slate-900 rounded h-3">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${r.similarity * 100}%`,
                    background: i === 0 ? '#22c55e' : `hsl(${200 + i * 20}, 60%, 50%)`
                  }}
                />
              </div>
              <span className="text-slate-400 font-mono w-20">d={r.distance.toFixed(4)}</span>
              <span className="text-slate-400 font-mono w-20">s={r.similarity.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Forward projection */}
      {data.projection && (
        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">Forward Projection (10 candles after best match)</div>
          <svg width={W} height={80} className="bg-slate-900 rounded">
            <path
              d={data.projection.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i, data.projection.length)} ${40 - v * 0.5}`).join(' ')}
              fill="none" stroke="#22c55e" strokeWidth={2}
            />
          </svg>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Best Match</div>
          <div className="text-cyan-400 font-mono text-[10px]">{data.bestMatch?.name || 'N/A'}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">DTW Distance</div>
          <div className="text-amber-400 font-mono">{data.bestMatch?.distance.toFixed(4) || 'N/A'}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Similarity</div>
          <div className="text-emerald-400 font-mono">{data.bestMatch?.similarity.toFixed(4) || 'N/A'}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Patterns</div>
          <div className="text-slate-300 font-mono">{data.results.length}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> DTW band:</strong> ±{dtwWindow} |
        <strong> Window:</strong> {windowSize} candles
      </div>
    </div>
  )
}
