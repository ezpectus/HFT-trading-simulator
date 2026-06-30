import React, { useMemo, useState } from 'react'

// ─── Hidden Markov Model (HMM) ───────────────────────────────────────────────
// Full implementation of HMM with:
// 1. Baum-Welch (EM) training — forward-backward + parameter re-estimation
// 2. Viterbi decoding — most likely state sequence
// 3. Forward algorithm — likelihood computation
// 4. Posterior marginal probabilities
//
// Mathematical foundation:
//   λ = (A, B, π) where:
//   A = transition matrix [N×N], a_ij = P(q_{t+1}=j | q_t=i)
//   B = emission matrix [N×M], b_j(k) = P(o_t=k | q_t=j)
//   π = initial distribution [N]
//
//   Forward: α_t(j) = [Σ_i α_{t-1}(i)·a_ij]·b_j(o_t)
//   Backward: β_t(i) = Σ_j a_ij·b_j(o_{t+1})·β_{t+1}(j)
//   γ_t(i) = α_t(i)·β_t(i) / P(O|λ)
//   ξ_t(i,j) = α_t(i)·a_ij·b_j(o_{t+1})·β_{t+1}(j) / P(O|λ)
//
//   Baum-Welch re-estimation:
//   π_i = γ_1(i)
//   a_ij = Σ_t ξ_t(i,j) / Σ_t γ_t(i)
//   b_j(k) = Σ_{t: o_t=k} γ_t(j) / Σ_t γ_t(j)
//
//   Viterbi: δ_t(j) = max_i [δ_{t-1}(i)·a_ij]·b_j(o_t)

const forward = (obs, A, B, pi) => {
  const N = A.length, T = obs.length
  const alpha = Array.from({ length: T }, () => new Array(N).fill(0))
  const scales = new Array(T).fill(0)

  // Initialize
  for (let i = 0; i < N; i++) {
    alpha[0][i] = pi[i] * B[i][obs[0]]
  }
  let sum = alpha[0].reduce((a, b) => a + b, 0)
  scales[0] = sum > 0 ? sum : 1e-10
  for (let i = 0; i < N; i++) alpha[0][i] /= scales[0]

  // Induction
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let s = 0
      for (let i = 0; i < N; i++) s += alpha[t - 1][i] * A[i][j]
      alpha[t][j] = s * B[j][obs[t]]
    }
    sum = alpha[t].reduce((a, b) => a + b, 0)
    scales[t] = sum > 0 ? sum : 1e-10
    for (let j = 0; j < N; j++) alpha[t][j] /= scales[t]
  }

  // Log likelihood
  const logLik = scales.reduce((s, c) => s + Math.log(c), 0)
  return { alpha, scales, logLik }
}

const backward = (obs, A, B, scales) => {
  const N = A.length, T = obs.length
  const beta = Array.from({ length: T }, () => new Array(N).fill(0))

  // Initialize
  for (let i = 0; i < N; i++) beta[T - 1][i] = 1 / scales[T - 1]

  // Induction
  for (let t = T - 2; t >= 0; t--) {
    for (let i = 0; i < N; i++) {
      let s = 0
      for (let j = 0; j < N; j++) s += A[i][j] * B[j][obs[t + 1]] * beta[t + 1][j]
      beta[t][i] = s / scales[t]
    }
  }

  return beta
}

const viterbi = (obs, A, B, pi) => {
  const N = A.length, T = obs.length
  const delta = Array.from({ length: T }, () => new Array(N).fill(0))
  const psi = Array.from({ length: T }, () => new Array(N).fill(0))

  // Initialize (log space)
  for (let i = 0; i < N; i++) {
    delta[0][i] = Math.log(Math.max(1e-10, pi[i] * B[i][obs[0]]))
  }

  // Recursion
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let bestVal = -Infinity, bestState = 0
      for (let i = 0; i < N; i++) {
        const val = delta[t - 1][i] + Math.log(Math.max(1e-10, A[i][j]))
        if (val > bestVal) { bestVal = val; bestState = i }
      }
      delta[t][j] = bestVal + Math.log(Math.max(1e-10, B[j][obs[t]]))
      psi[t][j] = bestState
    }
  }

  // Backtrack
  const states = new Array(T).fill(0)
  let bestLast = 0
  let bestVal = -Infinity
  for (let i = 0; i < N; i++) {
    if (delta[T - 1][i] > bestVal) { bestVal = delta[T - 1][i]; bestLast = i }
  }
  states[T - 1] = bestLast
  for (let t = T - 2; t >= 0; t--) {
    states[t] = psi[t + 1][states[t + 1]]
  }

  return { states, logProb: bestVal }
}

const baumWelch = (obs, N, M, maxIter = 50) => {
  // Initialize parameters
  let pi = new Array(N).fill(1 / N)
  let A = Array.from({ length: N }, () => new Array(N).fill(1 / N))
  let B = Array.from({ length: N }, () => new Array(M).fill(1 / M))

  // Add slight randomization to break symmetry
  for (let i = 0; i < N; i++) {
    pi[i] = 0.3 + Math.random() * 0.4
    for (let j = 0; j < N; j++) A[i][j] = 0.3 + Math.random() * 0.4
    for (let k = 0; k < M; k++) B[i][k] = 0.3 + Math.random() * 0.4
  }
  // Normalize
  const normRow = (row) => {
    const s = row.reduce((a, b) => a + b, 0)
    return row.map(v => v / s)
  }
  pi = normRow(pi)
  A = A.map(normRow)
  B = B.map(normRow)

  let prevLogLik = -Infinity

  for (let iter = 0; iter < maxIter; iter++) {
    const { alpha, scales, logLik } = forward(obs, A, B, pi)
    const beta = backward(obs, A, B, scales)

    if (Math.abs(logLik - prevLogLik) < 1e-6) break
    prevLogLik = logLik

    const T = obs.length

    // γ_t(i) = α_t(i)·β_t(i)
    const gamma = Array.from({ length: T }, () => new Array(N).fill(0))
    for (let t = 0; t < T; t++) {
      for (let i = 0; i < N; i++) {
        gamma[t][i] = alpha[t][i] * beta[t][i]
      }
      const sum = gamma[t].reduce((a, b) => a + b, 0)
      if (sum > 0) for (let i = 0; i < N; i++) gamma[t][i] /= sum
    }

    // ξ_t(i,j)
    const xi = Array.from({ length: T - 1 }, () => Array.from({ length: N }, () => new Array(N).fill(0)))
    for (let t = 0; t < T - 1; t++) {
      let denom = 0
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          xi[t][i][j] = alpha[t][i] * A[i][j] * B[j][obs[t + 1]] * beta[t + 1][j]
          denom += xi[t][i][j]
        }
      }
      if (denom > 0) {
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) xi[t][i][j] /= denom
      }
    }

    // Re-estimate π
    for (let i = 0; i < N; i++) pi[i] = gamma[0][i]

    // Re-estimate A
    for (let i = 0; i < N; i++) {
      let denomA = 0
      for (let t = 0; t < T - 1; t++) denomA += gamma[t][i]
      for (let j = 0; j < N; j++) {
        let numA = 0
        for (let t = 0; t < T - 1; t++) numA += xi[t][i][j]
        A[i][j] = denomA > 0 ? numA / denomA : 1 / N
      }
    }

    // Re-estimate B
    for (let j = 0; j < N; j++) {
      let denomB = 0
      for (let t = 0; t < T; t++) denomB += gamma[t][j]
      for (let k = 0; k < M; k++) {
        let numB = 0
        for (let t = 0; t < T; t++) if (obs[t] === k) numB += gamma[t][j]
        B[j][k] = denomB > 0 ? numB / denomB : 1 / M
      }
    }
  }

  return { A, B, pi, logLik: prevLogLik }
}

// Quantize returns into discrete observations
const quantize = (returns, M = 5) => {
  const sorted = [...returns].sort((a, b) => a - b)
  const quantiles = []
  for (let i = 1; i < M; i++) quantiles.push(sorted[Math.floor(i * sorted.length / M)])
  return returns.map(r => {
    let idx = 0
    for (let i = 0; i < quantiles.length; i++) {
      if (r > quantiles[i]) idx = i + 1
    }
    return idx
  })
}

export default function HiddenMarkovModel({ candles, symbol, exchange }) {
  const [nStates, setNStates] = useState(3)
  const [nSymbols, setNSymbols] = useState(5)
  const [maxIter, setMaxIter] = useState(50)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 50) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)

    // Returns
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // Quantize to discrete observations
    const obs = quantize(returns, nSymbols)
    const obsLabels = ['Big Drop', 'Small Drop', 'Neutral', 'Small Up', 'Big Up']

    // Train HMM
    const { A, B, pi, logLik } = baumWelch(obs, nStates, nSymbols, maxIter)

    // Viterbi decoding
    const { states, logProb } = viterbi(obs, A, B, pi)

    // Forward for posterior
    const { alpha, scales } = forward(obs, A, B, pi)
    const beta = backward(obs, A, B, scales)
    const gamma = Array.from({ length: obs.length }, () => new Array(nStates).fill(0))
    for (let t = 0; t < obs.length; t++) {
      for (let i = 0; i < nStates; i++) gamma[t][i] = alpha[t][i] * beta[t][i]
      const sum = gamma[t].reduce((a, b) => a + b, 0)
      if (sum > 0) for (let i = 0; i < nStates; i++) gamma[t][i] /= sum
    }

    // Analyze states: compute mean return and volatility per state
    const stateStats = []
    for (let s = 0; s < nStates; s++) {
      const stateReturns = returns.filter((_, t) => states[t] === s)
      const mean = stateReturns.length > 0 ? stateReturns.reduce((a, b) => a + b, 0) / stateReturns.length : 0
      const variance = stateReturns.length > 0 ? stateReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / stateReturns.length : 0
      const vol = Math.sqrt(variance)

      let label = ''
      if (mean > 0.005 && vol < 0.01) label = 'Calm Bull'
      else if (mean > 0.005 && vol >= 0.01) label = 'Volatile Bull'
      else if (mean < -0.005 && vol < 0.01) label = 'Calm Bear'
      else if (mean < -0.005 && vol >= 0.01) label = 'Volatile Bear'
      else if (vol > 0.02) label = 'High Vol'
      else label = 'Sideways'

      stateStats.push({ state: s, mean: mean * 100, vol: vol * 100, count: stateReturns.length, label })
    }

    // Sort states by mean return for consistent labeling
    stateStats.sort((a, b) => a.mean - b.mean)
    const stateOrder = stateStats.map(ss => ss.state)

    // Current state
    const currentState = states[states.length - 1]
    const currentStat = stateStats.find(ss => ss.state === currentState)

    // Next state prediction
    const nextStateProbs = A[currentState]
    const predictedNext = nextStateProbs.indexOf(Math.max(...nextStateProbs))
    const predictedStat = stateStats.find(ss => ss.state === predictedNext)

    // Signal
    let signal = 'NEUTRAL'
    let reason = ''
    if (currentStat && currentStat.mean > 0.003) {
      signal = 'BUY'
      reason = `State "${currentStat.label}" (mean=+${currentStat.mean.toFixed(3)}%)`
    } else if (currentStat && currentStat.mean < -0.003) {
      signal = 'SELL'
      reason = `State "${currentStat.label}" (mean=${currentStat.mean.toFixed(3)}%)`
    } else {
      reason = `State "${currentStat?.label || 'Unknown'}" (neutral)`
    }

    return {
      prices, returns: returns.slice(-80), obs: obs.slice(-80),
      states: states.slice(-80), gamma: gamma.slice(-80),
      A, B, pi, logLik, logProb,
      stateStats, stateOrder, currentState, currentStat,
      predictedNext, predictedStat, nextStateProbs,
      signal, reason, obsLabels,
    }
  }, [candles, exchange, symbol, nStates, nSymbols, maxIter])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 50 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 200, P = 30
  const colors = ['#ef4444', '#f59e0b', '#64748b', '#22c55e', '#06b6d4', '#a855f7', '#ec4899', '#14b8a6']
  const stateColors = data.stateOrder.map((_, i) => colors[i % colors.length])
  const stateColorMap = {}
  data.stateOrder.forEach((s, i) => { stateColorMap[s] = stateColors[i] })

  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Hidden Markov Model — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">States (N):</span>
          <input type="number" value={nStates} onChange={e => setNStates(Math.max(2, Math.min(8, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Symbols (M):</span>
          <input type="number" value={nSymbols} onChange={e => setNSymbols(Math.max(2, Math.min(10, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">EM Iterations:</span>
          <input type="number" value={maxIter} onChange={e => setMaxIter(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* State sequence */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Viterbi State Sequence (most likely path)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          {data.states.map((s, i) => {
            const x = P + (i / data.states.length) * (W - 2 * P)
            const w = (W - 2 * P) / data.states.length
            return <rect key={i} x={x} y={P} width={w} height={H - 2 * P} fill={stateColorMap[s] || '#475569'} opacity={0.6} />
          })}
          {/* Price overlay */}
          {(() => {
            const maxP = Math.max(...data.prices.slice(-data.returns.length))
            const minP = Math.min(...data.prices.slice(-data.returns.length))
            const py = (i) => H - P - ((data.prices[data.prices.length - data.returns.length + i] - minP) / (maxP - minP + 0.001)) * (H - 2 * P)
            const path = data.returns.map((_, i) => `${i === 0 ? 'M' : 'L'} ${P + (i / data.returns.length) * (W - 2 * P)} ${py(i)}`).join(' ')
            return <path d={path} fill="none" stroke="#fff" strokeWidth={1.5} opacity={0.8} />
          })()}
        </svg>
      </div>

      {/* Posterior probabilities */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Posterior State Probabilities (γ)</div>
        <svg width={W} height={120} className="bg-slate-900 rounded">
          {data.gamma.map((probs, t) => {
            const x = P + (t / data.gamma.length) * (W - 2 * P)
            const w = (W - 2 * P) / data.gamma.length
            let yOff = 10
            return data.stateOrder.map((s, si) => {
              const h = probs[s] * 100
              const rect = <rect key={`${t}-${s}`} x={x} y={yOff} width={w} height={h} fill={stateColors[si]} opacity={0.7} />
              yOff += h
              return rect
            })
          })}
        </svg>
      </div>

      {/* Transition matrix */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-2">Transition Matrix (A)</div>
          <table className="text-xs font-mono">
            <thead>
              <tr>
                <th className="text-slate-500"></th>
                {data.stateOrder.map((s, i) => <th key={s} className="px-2" style={{ color: stateColors[i] }}>{data.stateStats[i].label.slice(0, 6)}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.stateOrder.map((s, i) => (
                <tr key={s}>
                  <td className="text-slate-500 pr-2" style={{ color: stateColors[i] }}>{data.stateStats[i].label.slice(0, 6)}</td>
                  {data.stateOrder.map((s2, j) => (
                    <td key={s2} className="px-2 text-slate-300">{(data.A[s][s2]).toFixed(3)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-2">State Statistics</div>
          <div className="space-y-1">
            {data.stateStats.map((ss, i) => (
              <div key={ss.state} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded" style={{ background: stateColors[i] }} />
                <span className="text-slate-300 w-24">{ss.label}</span>
                <span className="text-slate-400">μ={ss.mean.toFixed(3)}%</span>
                <span className="text-slate-400">σ={ss.vol.toFixed(3)}%</span>
                <span className="text-slate-500">({ss.count})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Log Likelihood</div>
          <div className="text-cyan-400 font-mono">{data.logLik.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Current State</div>
          <div className="font-mono" style={{ color: stateColorMap[data.currentState] }}>
            {data.currentStat?.label || 'Unknown'}
          </div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Next (predicted)</div>
          <div className="font-mono" style={{ color: stateColorMap[data.predictedNext] }}>
            {data.predictedStat?.label || 'Unknown'}
          </div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">P(next)</div>
          <div className="text-amber-400 font-mono">{(Math.max(...data.nextStateProbs) * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} | <strong>Viterbi log P:</strong> {data.logProb.toFixed(2)}
      </div>
    </div>
  )
}
