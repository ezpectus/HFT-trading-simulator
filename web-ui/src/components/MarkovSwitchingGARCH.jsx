import React, { useMemo, useState } from 'react'

// ─── Markov-Switching GARCH (Regime-Switching Volatility) ────────────────────
// Combines a hidden Markov chain (regime switching) with GARCH volatility
// modeling. Each regime has its own GARCH parameters, capturing the fact
// that volatility dynamics differ between market states (e.g., calm vs crisis).
//
// Mathematical foundation:
//   Regime s_t ∈ {0, 1, ..., K-1} follows Markov chain:
//   P(s_t = j | s_{t-1} = i) = p_ij
//
//   In regime s_t = k, returns follow:
//   r_t = μ_k + ε_t, ε_t ~ N(0, h_t)
//   h_t = ω_k + α_k·ε_{t-1}² + β_k·h_{t-1}
//
//   The model is estimated via Kim's filtering approach:
//   1. Run GARCH filter for each regime
//   2. Combine with Hamilton filter for regime probabilities
//   3. Smooth via Kim's approximation
//
//   Log-likelihood: Σ log [Σ_k P(s_t=k|F_{t-1}) · f(r_t|s_t=k, F_{t-1})]

const garchFilter = (returns, omega, alpha, beta, h0) => {
  const n = returns.length
  const h = new Array(n).fill(0)
  h[0] = h0 || returns[0] * returns[0]
  for (let t = 1; t < n; t++) {
    h[t] = omega + alpha * returns[t - 1] ** 2 + beta * h[t - 1]
    h[t] = Math.max(1e-10, h[t])
  }
  return h
}

const gaussianLogPdf = (x, mean, var_) => {
  if (var_ <= 0) return -Infinity
  return -0.5 * Math.log(2 * Math.PI * var_) - (x - mean) ** 2 / (2 * var_)
}

// Kim's filtering for Markov-Switching GARCH
const msGarchFilter = (returns, params, nRegimes = 2) => {
  const n = returns.length
  const { transition, regimes } = params

  // GARCH filtered variances for each regime
  const h = []
  for (let k = 0; k < nRegimes; k++) {
    h.push(garchFilter(returns, regimes[k].omega, regimes[k].alpha, regimes[k].beta, regimes[k].h0))
  }

  // Filtered probabilities
  const filteredProb = Array.from({ length: n }, () => new Array(nRegimes).fill(0))
  const logLik = new Array(n).fill(0)

  // Initialize
  const initProb = new Array(nRegimes).fill(1 / nRegimes)
  filteredProb[0] = initProb.slice()

  for (let t = 1; t < n; t++) {
    // Predicted probabilities: P(s_t=j|F_{t-1}) = Σ_i p_ij · P(s_{t-1}=i|F_{t-1})
    const predProb = new Array(nRegimes).fill(0)
    for (let j = 0; j < nRegimes; j++) {
      for (let i = 0; i < nRegimes; i++) {
        predProb[j] += transition[i][j] * filteredProb[t - 1][i]
      }
    }

    // Likelihood contribution from each regime
    const regimeLL = new Array(nRegimes).fill(0)
    let totalLL = 0
    for (let k = 0; k < nRegimes; k++) {
      regimeLL[k] = Math.exp(gaussianLogPdf(returns[t], regimes[k].mu, h[k][t]))
      totalLL += predProb[k] * regimeLL[k]
    }

    logLik[t] = Math.log(Math.max(1e-10, totalLL))

    // Updated probabilities
    for (let k = 0; k < nRegimes; k++) {
      filteredProb[t][k] = totalLL > 0 ? (predProb[k] * regimeLL[k]) / totalLL : 1 / nRegimes
    }
  }

  // Smoothed probabilities (Kim's approximation)
  const smoothedProb = Array.from({ length: n }, () => new Array(nRegimes).fill(0))
  smoothedProb[n - 1] = filteredProb[n - 1].slice()
  for (let t = n - 2; t >= 0; t--) {
    for (let k = 0; k < nRegimes; k++) {
      let sum = 0
      for (let j = 0; j < nRegimes; j++) {
        const ratio = filteredProb[t + 1][j] > 0 ?
          (transition[k][j] * smoothedProb[t + 1][j]) / filteredProb[t + 1][j] : 0
        sum += ratio
      }
      smoothedProb[t][k] = filteredProb[t][k] * sum
    }
    // Normalize
    const total = smoothedProb[t].reduce((a, b) => a + b, 0)
    if (total > 0) for (let k = 0; k < nRegimes; k++) smoothedProb[t][k] /= total
  }

  // Combined volatility
  const combinedVol = new Array(n)
  for (let t = 0; t < n; t++) {
    let v = 0
    for (let k = 0; k < nRegimes; k++) {
      v += smoothedProb[t][k] * Math.sqrt(h[k][t])
    }
    combinedVol[t] = v
  }

  // Current regime
  const currentRegime = smoothedProb[n - 1].indexOf(Math.max(...smoothedProb[n - 1]))

  // Total log-likelihood
  const totalLogLik = logLik.reduce((a, b) => a + b, 0)

  return {
    filteredProb, smoothedProb, h, combinedVol,
    currentRegime, totalLogLik,
    regimeLabels: params.regimes.map(r => r.label),
  }
}

// Estimate parameters via simple grid search
const estimateParams = (returns, nRegimes = 2) => {
  const meanR = returns.reduce((a, b) => a + b, 0) / returns.length
  const varR = returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length

  // Try different parameter sets
  let best = null
  let bestLL = -Infinity

  const paramSets = [
    {
      transition: [[0.95, 0.05], [0.05, 0.95]],
      regimes: [
        { mu: meanR * 0.5, omega: varR * 0.02, alpha: 0.05, beta: 0.9, h0: varR, label: 'Calm' },
        { mu: meanR, omega: varR * 0.1, alpha: 0.15, beta: 0.8, h0: varR * 2, label: 'Volatile' },
      ]
    },
    {
      transition: [[0.97, 0.03], [0.10, 0.90]],
      regimes: [
        { mu: meanR * 0.3, omega: varR * 0.01, alpha: 0.03, beta: 0.93, h0: varR, label: 'Calm' },
        { mu: meanR, omega: varR * 0.15, alpha: 0.20, beta: 0.75, h0: varR * 3, label: 'Crisis' },
      ]
    },
    {
      transition: [[0.90, 0.10], [0.15, 0.85]],
      regimes: [
        { mu: meanR * 0.5, omega: varR * 0.03, alpha: 0.08, beta: 0.88, h0: varR, label: 'Calm' },
        { mu: -Math.abs(meanR), omega: varR * 0.2, alpha: 0.25, beta: 0.7, h0: varR * 4, label: 'Crisis' },
      ]
    },
  ]

  for (const params of paramSets) {
    const result = msGarchFilter(returns, params, nRegimes)
    if (result.totalLogLik > bestLL) {
      bestLL = result.totalLogLik
      best = params
    }
  }

  return { params: best, logLik: bestLL }
}

export default function MarkovSwitchingGARCH({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(100)
  const [nRegimes, setNRegimes] = useState(2)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback - 1).map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    const { params, logLik } = estimateParams(returns, nRegimes)
    const result = msGarchFilter(returns, params, nRegimes)

    // Regime probabilities over time
    const regimeProbs = result.smoothedProb

    // Current state
    const currentRegime = result.currentRegime
    const currentLabel = result.regimeLabels[currentRegime]
    const currentProb = result.smoothedProb[returns.length - 1][currentRegime]

    // Current volatility (annualized)
    const currentVol = result.combinedVol[returns.length - 1] * Math.sqrt(252)

    // Regime-specific volatilities
    const regimeVols = params.regimes.map((r, k) => {
      const h = result.h[k]
      return Math.sqrt(h[h.length - 1]) * Math.sqrt(252)
    })

    // Expected duration of current regime
    const stayProb = params.transition[currentRegime][currentRegime]
    const expectedDuration = 1 / (1 - stayProb)

    // Signal
    let signal = 'NEUTRAL'
    let reason = ''
    if (currentRegime === 0) {
      signal = 'BUY'
      reason = `Calm regime (P=${(currentProb * 100).toFixed(1)}%), low volatility`
    } else {
      signal = 'SELL'
      reason = `Volatile/Crisis regime (P=${(currentProb * 100).toFixed(1)}%), high volatility`
    }

    // Regime transitions
    const transitions = []
    let prevRegime = result.smoothedProb[0].indexOf(Math.max(...result.smoothedProb[0]))
    for (let t = 1; t < returns.length; t++) {
      const r = result.smoothedProb[t].indexOf(Math.max(...result.smoothedProb[t]))
      if (r !== prevRegime) {
        transitions.push({ time: t, from: prevRegime, to: r })
        prevRegime = r
      }
    }

    return {
      ...result, params, logLik, returns,
      currentRegime, currentLabel, currentProb,
      currentVol, regimeVols, expectedDuration,
      signal, reason, transitions,
      prices: prices.slice(1),
      nRegimes,
    }
  }, [candles, exchange, symbol, lookback, nRegimes])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : '#ef4444'
  const regimeColors = ['#22c55e', '#ef4444', '#f59e0b', '#a855f7']

  const N = data.returns.length
  const sx = (i) => P + (i / N) * (W - 2 * P)

  // Volatility chart
  const maxVol = Math.max(...data.combinedVol) * Math.sqrt(252)
  const syVol = (v) => H - P - (v / maxVol) * (H - 2 * P)

  // Probability chart
  const syProb = (v) => H - P - v * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Markov-Switching GARCH — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.currentLabel} → {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Regimes:</span>
          <input type="number" value={nRegimes} onChange={e => setNRegimes(Math.max(2, Math.min(4, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Regime probability */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Smoothed Regime Probabilities (Kim's filter)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={syProb(0.5)} x2={W - P} y2={syProb(0.5)} stroke="#475569" strokeDasharray="3,3" />

          {Array.from({ length: data.nRegimes }, (_, k) => (
            <g key={k}>
              <path
                d={data.smoothedProb.map((probs, t) => `${t === 0 ? 'M' : 'L'} ${sx(t)} ${syProb(probs[k])}`).join(' ')}
                fill="none" stroke={regimeColors[k]} strokeWidth={1.5} opacity={0.8}
              />
              <text x={W - P} y={15 + k * 12} textAnchor="end" fill={regimeColors[k]} fontSize={9}>
                {data.regimeLabels[k]}: {(data.smoothedProb[N - 1][k] * 100).toFixed(1)}%
              </text>
            </g>
          ))}

          {/* Transition markers */}
          {data.transitions.map((tr, i) => (
            <line key={i} x1={sx(tr.time)} y1={P} x2={sx(tr.time)} y2={H - P} stroke="#475569" strokeDasharray="2,2" opacity={0.5} />
          ))}
        </svg>
      </div>

      {/* Combined volatility */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Combined Volatility (regime-weighted GARCH)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Regime-specific vol */}
          {data.h.map((hArr, k) => (
            <path
              key={k}
              d={hArr.map((h, t) => `${t === 0 ? 'M' : 'L'} ${sx(t)} ${syVol(Math.sqrt(h) * Math.sqrt(252))}`).join(' ')}
              fill="none" stroke={regimeColors[k]} strokeWidth={1} opacity={0.3} strokeDasharray="3,2"
            />
          ))}

          {/* Combined vol */}
          <path
            d={data.combinedVol.map((v, t) => `${t === 0 ? 'M' : 'L'} ${sx(t)} ${syVol(v * Math.sqrt(252))}`).join(' ')}
            fill="none" stroke="#06b6d4" strokeWidth={2}
          />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>Combined vol (annualized)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#475569" fontSize={9}>Dashed = regime-specific</text>
        </svg>
      </div>

      {/* Transition matrix */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Transition Matrix</div>
        <div className="grid gap-1 text-xs text-center" style={{ gridTemplateColumns: `auto repeat(${data.nRegimes}, 1fr)` }}>
          <div></div>
          {data.regimeLabels.map((label, j) => (
            <div key={j} className="text-slate-400">{label}</div>
          ))}
          {data.params.transition.map((row, i) => (
            <React.Fragment key={i}>
              <div className="text-slate-400 text-right pr-2">{data.regimeLabels[i]}</div>
              {row.map((p, j) => (
                <div key={j} className="bg-slate-900 rounded p-1 font-mono" style={{ color: p > 0.5 ? regimeColors[i] : '#64748b' }}>
                  {(p * 100).toFixed(1)}%
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Current Regime</div>
          <div className="font-mono" style={{ color: regimeColors[data.currentRegime] }}>{data.currentLabel}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Regime Prob</div>
          <div className="text-cyan-400 font-mono">{(data.currentProb * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Current Vol</div>
          <div className="text-amber-400 font-mono">{(data.currentVol * 100).toFixed(2)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Exp. Duration</div>
          <div className="text-purple-400 font-mono">{data.expectedDuration.toFixed(1)} days</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Transitions</div>
          <div className="text-slate-300 font-mono">{data.transitions.length}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Log-Lik:</strong> {data.logLik.toFixed(2)} |
        <strong> Regime vols:</strong> {data.regimeVols.map(v => (v * 100).toFixed(1) + '%').join(', ')}
      </div>
    </div>
  )
}
