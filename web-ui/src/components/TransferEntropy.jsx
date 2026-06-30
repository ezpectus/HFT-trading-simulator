import React, { useMemo, useState } from 'react'

// ─── Transfer Entropy (Information-Theoretic Causality) ──────────────────────
// Measures directed information flow between time series using transfer entropy.
// Unlike Granger causality (linear), TE captures non-linear dependencies.
//
// Mathematical foundation:
//   Transfer entropy from X to Y:
//   TE_{X→Y} = Σ p(y_{t+1}, y_t^{(k)}, x_t^{(l)}) · log₂ [p(y_{t+1}|y_t^{(k)}, x_t^{(l)}) / p(y_{t+1}|y_t^{(k)})]
//
//   = H(Y_{t+1}|Y_t^{(k)}) - H(Y_{t+1}|Y_t^{(k)}, X_t^{(l)})
//
//   where:
//   - y_t^{(k)} = [y_t, y_{t-1}, ..., y_{t-k+1}] (k history of Y)
//   - x_t^{(l)} = [x_t, x_{t-1}, ..., x_{t-l+1}] (l history of X)
//   - H(·|·) = conditional entropy
//
//   TE = 0 if X provides no additional information about Y's future
//   TE > 0 if X has causal influence on Y (beyond Y's own history)
//
//   Effective TE (ETE): TE - TE_surrogate (shuffle X to destroy causality)

// Quantize continuous values into discrete bins
const quantize = (values, nBins = 5) => {
  const min = Math.min(...values), max = Math.max(...values)
  const binW = (max - min) / nBins || 1
  return values.map(v => Math.min(nBins - 1, Math.max(0, Math.floor((v - min) / binW))))
}

// Joint probability from tuples
const jointProb = (tuples, nBins) => {
  const counts = new Map()
  for (const t of tuples) {
    const key = t.join(',')
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const total = tuples.length
  const probs = {}
  for (const [key, count] of counts) {
    probs[key] = count / total
  }
  return probs
}

// Conditional probability P(A | B)
const conditionalProb = (tuplesA, tuplesB, nBins) => {
  const jointCounts = new Map()
  const bCounts = new Map()
  for (let i = 0; i < tuplesA.length; i++) {
    const keyA = tuplesA[i].join(',')
    const keyB = tuplesB[i].join(',')
    const jointKey = keyA + '|' + keyB
    jointCounts.set(jointKey, (jointCounts.get(jointKey) || 0) + 1)
    bCounts.set(keyB, (bCounts.get(keyB) || 0) + 1)
  }
  return { jointCounts, bCounts }
}

// Compute transfer entropy TE_{X→Y}
const transferEntropy = (X, Y, k = 1, l = 1, nBins = 5) => {
  const qX = quantize(X, nBins)
  const qY = quantize(Y, nBins)
  const n = Math.min(qX.length, qY.length)

  // Build tuples
  // y_{t+1}: future of Y
  // y_t^{(k)}: k-lag history of Y
  // x_t^{(l)}: l-lag history of X
  const yFuture = []
  const yHistory = []
  const xHistory = []
  const yxHistory = []

  for (let t = Math.max(k, l); t < n - 1; t++) {
    yFuture.push([qY[t + 1]])
    const yh = []
    for (let i = 0; i < k; i++) yh.push(qY[t - i])
    yHistory.push(yh)
    const xh = []
    for (let i = 0; i < l; i++) xh.push(qX[t - i])
    xHistory.push(xh)
    yxHistory.push([...yh, ...xh])
  }

  if (yFuture.length < 10) return 0

  // P(y_{t+1}, y_t^{(k)}, x_t^{(l)})
  const jointAll = jointProb(yFuture.map((y, i) => [...y, ...yxHistory[i]]), nBins)
  // P(y_{t+1}, y_t^{(k)})
  const jointY = jointProb(yFuture.map((y, i) => [...y, ...yHistory[i]]), nBins)
  // P(y_t^{(k)}, x_t^{(l)})
  const jointYX = jointProb(yxHistory, nBins)
  // P(y_t^{(k)})
  const jointYonly = jointProb(yHistory, nBins)

  // TE = Σ p(y_{t+1}, y_t^k, x_t^l) · log₂ [p(y_{t+1}|y_t^k, x_t^l) / p(y_{t+1}|y_t^k)]
  // = Σ p(y_{t+1}, y_t^k, x_t^l) · log₂ [p(y_{t+1}, y_t^k, x_t^l) · p(y_t^k) / (p(y_{t+1}, y_t^k) · p(y_t^k, x_t^l))]
  let te = 0
  for (let i = 0; i < yFuture.length; i++) {
    const keyAll = [...yFuture[i], ...yxHistory[i]].join(',')
    const keyY = [...yFuture[i], ...yHistory[i]].join(',')
    const keyYX = yxHistory[i].join(',')
    const keyYonly = yHistory[i].join(',')

    const pAll = jointAll[keyAll] || 0
    const pY = jointY[keyY] || 0
    const pYX = jointYX[keyYX] || 0
    const pYonly = jointYonly[keyYonly] || 0

    if (pAll > 0 && pY > 0 && pYX > 0 && pYonly > 0) {
      te += pAll * Math.log2((pAll * pYonly) / (pY * pYX))
    }
  }

  return Math.max(0, te)
}

// Surrogate TE (shuffle X to destroy causality)
const surrogateTE = (X, Y, k, l, nBins, nSurrogates = 10) => {
  const tes = []
  for (let s = 0; s < nSurrogates; s++) {
    const shuffled = [...X].sort(() => Math.random() - 0.5)
    tes.push(transferEntropy(shuffled, Y, k, l, nBins))
  }
  return tes.reduce((a, b) => a + b, 0) / nSurrogates
}

export default function TransferEntropy({ candles, symbol, exchange, symbols }) {
  const [k, setK] = useState(1)
  const [l, setL] = useState(1)
  const [nBins, setNBins] = useState(5)
  const [lookback, setLookback] = useState(100)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices1 = cds.slice(-lookback).map(c => c.close)
    const returns1 = []
    for (let i = 1; i < prices1.length; i++) {
      returns1.push((prices1[i] - prices1[i - 1]) / prices1[i - 1])
    }

    // Compute TE between symbol and all other symbols
    const results = []

    // Self-entropy (Y → Y, should be high)
    const selfTE = transferEntropy(returns1, returns1, k, l, nBins)
    const selfSurrogate = surrogateTE(returns1, returns1, k, l, nBins, 5)
    results.push({ target: symbol + ' (self)', teXY: selfTE, teYX: selfTE, netTE: 0, surrogate: selfSurrogate, ete: selfTE - selfSurrogate })

    if (symbols) {
      for (const sym2 of symbols) {
        if (sym2 === symbol) continue
        const cds2 = candles[exchange]?.[sym2]
        if (!cds2 || cds2.length < lookback + 1) continue
        const prices2 = cds2.slice(-lookback).map(c => c.close)
        const returns2 = []
        for (let i = 1; i < prices2.length; i++) {
          returns2.push((prices2[i] - prices2[i - 1]) / prices2[i - 1])
        }

        const minLen = Math.min(returns1.length, returns2.length)
        const X = returns1.slice(-minLen)
        const Y = returns2.slice(-minLen)

        // TE_{X→Y} and TE_{Y→X}
        const teXY = transferEntropy(X, Y, k, l, nBins)
        const teYX = transferEntropy(Y, X, k, l, nBins)
        const surrogateXY = surrogateTE(X, Y, k, l, nBins, 5)
        const surrogateYX = surrogateTE(Y, X, k, l, nBins, 5)

        results.push({
          target: sym2,
          teXY, teYX,
          netTE: teXY - teYX,
          surrogate: (surrogateXY + surrogateYX) / 2,
          ete: (teXY - surrogateXY + teYX - surrogateYX) / 2,
        })
      }
    }

    results.sort((a, b) => Math.abs(b.netTE) - Math.abs(a.netTE))

    // Signal: strongest directional flow
    const strongest = results[1] || results[0] // skip self
    let signal = 'NEUTRAL'
    let reason = ''
    if (strongest && strongest.target !== symbol + ' (self)') {
      if (strongest.netTE > 0.01) {
        signal = strongest.netTE > 0 ? 'INFLUENCER' : 'INFLUENCED'
        reason = `${symbol} → ${strongest.target} (net TE = ${strongest.netTE.toFixed(4)})`
      } else if (strongest.netTE < -0.01) {
        signal = 'INFLUENCED'
        reason = `${strongest.target} → ${symbol} (net TE = ${(-strongest.netTE).toFixed(4)})`
      } else {
        reason = `Weak causal link with ${strongest.target} (net TE = ${strongest.netTE.toFixed(4)})`
      }
    }

    return { results, signal, reason, selfTE }
  }, [candles, exchange, symbol, symbols, k, l, nBins, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'INFLUENCER' ? '#22c55e' : data.signal === 'INFLUENCED' ? '#ef4444' : '#94a3b8'

  // Bar chart for net TE
  const maxTE = Math.max(0.01, ...data.results.map(r => Math.abs(r.netTE)))

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Transfer Entropy (Causality) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">k (Y history):</span>
          <input type="number" value={k} onChange={e => setK(Math.max(1, Math.min(3, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">l (X history):</span>
          <input type="number" value={l} onChange={e => setL(Math.max(1, Math.min(3, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Bins:</span>
          <input type="number" value={nBins} onChange={e => setNBins(Math.max(2, Math.min(10, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Net TE bar chart */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Net Transfer Entropy: {symbol} ↔ other symbols</div>
        <div className="space-y-1">
          {data.results.map((r, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-32 truncate">{r.target}</span>
              <div className="flex-1 bg-slate-900 rounded h-4 relative">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
                <div
                  className="h-full rounded absolute"
                  style={{
                    width: `${(Math.abs(r.netTE) / maxTE) * 50}%`,
                    background: r.netTE >= 0 ? '#22c55e' : '#ef4444',
                    left: r.netTE >= 0 ? '50%' : `${50 - (Math.abs(r.netTE) / maxTE) * 50}%`
                  }}
                />
              </div>
              <span className="font-mono w-16" style={{ color: r.netTE >= 0 ? '#22c55e' : '#ef4444' }}>
                {r.netTE >= 0 ? '+' : ''}{r.netTE.toFixed(4)}
              </span>
              <span className="text-slate-500 font-mono w-16">ETE={r.ete.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Directional TE comparison */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Directional Transfer Entropy</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.results.filter(r => !r.target.includes('self')).map((r, i) => {
            const n = data.results.length - 1
            const x = P + (i / Math.max(1, n - 1)) * (W - 2 * P)
            const maxVal = Math.max(0.01, ...data.results.map(r => Math.max(r.teXY, r.teYX)))
            const hXY = (r.teXY / maxVal) * (H - 2 * P)
            const hYX = (r.teYX / maxVal) * (H - 2 * P)
            return (
              <g key={i}>
                <rect x={x} y={H - P - hXY} width={12} height={hXY} fill="#06b6d4" opacity={0.8} />
                <rect x={x + 14} y={H - P - hYX} width={12} height={hYX} fill="#f59e0b" opacity={0.8} />
                <text x={x + 13} y={H - P + 12} textAnchor="middle" fill="#94a3b8" fontSize={8}>{r.target.slice(0, 8)}</text>
              </g>
            )
          })}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>TE({symbol}→target)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>TE(target→{symbol})</text>
        </svg>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Self-TE</div>
          <div className="text-cyan-400 font-mono">{data.selfTE.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Pairs tested</div>
          <div className="text-amber-400 font-mono">{data.results.length - 1}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Strongest link</div>
          <div className="text-emerald-400 font-mono text-[10px]">{data.results[1]?.target || 'N/A'}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Max |net TE|</div>
          <div className="text-purple-400 font-mono">{Math.max(...data.results.map(r => Math.abs(r.netTE))).toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Method:</strong> TE_{k},{l} with {nBins}-bin quantization |
        <strong> Surrogates:</strong> 5 shuffles per direction |
        <strong> ETE:</strong> TE - TE_surrogate (effective transfer entropy)
      </div>
    </div>
  )
}
