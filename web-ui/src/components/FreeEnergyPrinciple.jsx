import React, { useMemo, useState } from 'react'

// ─── Free Energy Principle (Active Inference for Trading) ───────────────────
// Implements the Free Energy Principle (Friston) for trading decisions:
// agents minimize variational free energy between internal model and observations.
//
// Mathematical foundation:
//   Variational Free Energy:
//   F = E_q[log q(x) - log p(x,o)]
//   = KL[q(x) || p(x|o)] - log p(o)
//   ≤ -log p(o)  (evidence bound)
//
//   For Gaussian model:
//   F = ½·Σ (μ_i - o_i)²/σ_i² + ½·Σ log(σ_i²) + const
//   = prediction error (precision-weighted) + complexity
//
//   Active inference:
//   - Update beliefs (perception): minimize F over μ
//   - Select actions (policy): minimize expected free energy G(π)
//   G(π) = E_q[log q(o|π) - log p(o|π)]
//   = risk (KL divergence) + ambiguity (entropy)
//
//   Precision weighting: σ_i controls how much prediction error matters
//   High precision (low σ) → strong prediction error → fast update

const randomNormal = () => {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Gaussian log density
const logGaussian = (x, mu, sigma2) => {
  if (sigma2 <= 0) return -Infinity
  return -0.5 * Math.log(2 * Math.PI * sigma2) - (x - mu) ** 2 / (2 * sigma2)
}

// Variational free energy for Gaussian model
const computeFreeEnergy = (observations, beliefs, precisions) => {
  let F = 0
  for (let i = 0; i < observations.length; i++) {
    // Prediction error (precision-weighted)
    const pe = (observations[i] - beliefs[i]) ** 2 / (2 * precisions[i])
    // Complexity (log precision)
    const complexity = 0.5 * Math.log(2 * Math.PI * precisions[i])
    F += pe + complexity
  }
  return F
}

// Update beliefs via gradient descent on free energy
const updateBeliefs = (observations, beliefs, precisions, lr = 0.1, maxIter = 50) => {
  let mu = beliefs.slice()
  const history = []

  for (let iter = 0; iter < maxIter; iter++) {
    let F = 0
    const grad = new Array(mu.length).fill(0)

    for (let i = 0; i < observations.length; i++) {
      // ∂F/∂μ_i = -(o_i - μ_i) / σ_i²
      grad[i] = -(observations[i] - mu[i]) / precisions[i]
      F += (observations[i] - mu[i]) ** 2 / (2 * precisions[i]) + 0.5 * Math.log(2 * Math.PI * precisions[i])
    }

    // Update
    for (let i = 0; i < mu.length; i++) {
      mu[i] -= lr * grad[i]
    }

    history.push({ iter, F, mu: mu.slice() })
  }

  return { mu, history }
}

// Expected free energy for policy selection
const expectedFreeEnergy = (predictedStates, predictedObs, preferences, precisions) => {
  // Risk: KL[q(o|π) || p(o)] (divergence from preferences)
  let risk = 0
  for (let i = 0; i < predictedObs.length; i++) {
    risk += (predictedObs[i] - preferences[i]) ** 2 / (2 * precisions[i])
  }

  // Ambiguity: entropy of predicted observations
  let ambiguity = 0
  for (let i = 0; i < precisions.length; i++) {
    ambiguity += 0.5 * Math.log(2 * Math.PI * Math.E * precisions[i])
  }

  return risk + ambiguity
}

// Generate policies (actions)
const generatePolicies = (nStates, nActions, horizon) => {
  const policies = []
  const generate = (current, depth) => {
    if (depth === 0) { policies.push(current.slice()); return }
    for (let a = 0; a < nActions; a++) {
      current.push(a)
      generate(current, depth - 1)
      current.pop()
    }
  }
  generate([], Math.min(horizon, 3)) // limit horizon for tractability
  return policies
}

export default function FreeEnergyPrinciple({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(50)
  const [precision, setPrecision] = useState(0.01)
  const [lr, setLr] = useState(0.1)
  const [horizon, setHorizon] = useState(3)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // Observations: recent returns (last 10)
    const observations = returns.slice(-10)

    // Initial beliefs: prior = 0 (no change)
    const initialBeliefs = new Array(10).fill(0)
    const precisions = new Array(10).fill(precision)

    // Minimize free energy (perception)
    const { mu, history } = updateBeliefs(observations, initialBeliefs, precisions, lr, 100)

    // Current free energy
    const currentF = history[history.length - 1].F

    // Policy selection (active inference)
    // Actions: 0=hold, 1=buy, 2=sell
    const actions = ['HOLD', 'BUY', 'SELL']
    const policies = []
    for (let a = 0; a < 3; a++) {
      // Predict next return under this action
      const actionEffect = a === 1 ? 0.001 : a === 2 ? -0.001 : 0
      const predictedReturn = mu[mu.length - 1] + actionEffect
      const predictedObs = [predictedReturn]
      const preferences = [0] // prefer no loss
      const policyPrecisions = [precision]

      const G = expectedFreeEnergy([predictedReturn], predictedObs, preferences, policyPrecisions)
      policies.push({ action: actions[a], actionIdx: a, G, predictedReturn })
    }

    // Select policy with lowest expected free energy
    policies.sort((a, b) => a.G - b.G)
    const bestPolicy = policies[0]

    // Signal
    let signal = bestPolicy.action
    let reason = `Min expected free energy G=${bestPolicy.G.toFixed(6)} (predicted return: ${(bestPolicy.predictedReturn * 100).toFixed(4)}%)`

    // Free energy history for visualization
    const feHistory = history.map(h => h.F)

    // Belief convergence
    const beliefHistory = history.slice(-10).map(h => h.mu[h.mu.length - 1])

    // Prediction errors
    const predictionErrors = observations.map((o, i) => o - mu[i])

    return {
      observations, mu, history, currentF,
      policies, bestPolicy, signal, reason,
      feHistory, beliefHistory, predictionErrors,
      returns, prices,
    }
  }, [candles, exchange, symbol, lookback, precision, lr, horizon])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'

  // Free energy convergence
  const maxF = Math.max(...data.feHistory, 0.1)
  const minF = Math.min(...data.feHistory, 0)
  const sxFE = (i) => P + (i / data.feHistory.length) * (W - 2 * P)
  const syFE = (v) => H - P - ((v - minF) / (maxF - minF + 0.001)) * (H - 2 * P)

  // Prediction errors
  const maxPE = Math.max(...data.predictionErrors.map(Math.abs), 0.001)
  const sxPE = (i) => P + (i / data.predictionErrors.length) * (W - 2 * P)
  const syPE = (v) => H / 2 - (v / maxPE) * (H / 2 - P)

  // Policy comparison
  const maxG = Math.max(...data.policies.map(p => p.G), 0.001)
  const minG = Math.min(...data.policies.map(p => p.G), 0)
  const sxPol = (i) => P + (i / data.policies.length) * (W - 2 * P)
  const syPol = (v) => H - P - ((v - minG) / (maxG - minG + 0.001)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Free Energy Principle (Active Inference) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Precision (1/σ²):</span>
          <input type="number" step="0.001" value={precision} onChange={e => setPrecision(Math.max(0.001, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Learning rate:</span>
          <input type="number" step="0.01" value={lr} onChange={e => setLr(Math.max(0.01, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(20, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Free energy convergence */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Variational Free Energy Minimization (Perception)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.feHistory.map((f, i) => `${i === 0 ? 'M' : 'L'} ${sxFE(i)} ${syFE(f)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>F = {data.currentF.toFixed(6)}</text>
          <text x={W - P} y={34} textAnchor="end" fill="#475569" fontSize={9}>F = ½Σ(μ-o)²/σ² + ½Σlog(σ²)</text>
        </svg>
      </div>

      {/* Prediction errors */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Prediction Errors (observation - belief)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          {data.predictionErrors.map((pe, i) => (
            <g key={i}>
              <line x1={sxPE(i)} y1={H / 2} x2={sxPE(i)} y2={syPE(pe)} stroke={pe > 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} opacity={0.7} />
              <circle cx={sxPE(i)} cy={syPE(pe)} r={3} fill={pe > 0 ? '#22c55e' : '#ef4444'} />
            </g>
          ))}
          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>Positive PE</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>Negative PE</text>
        </svg>
      </div>

      {/* Policy selection (active inference) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Policy Selection: Expected Free Energy G(π) (Action Selection)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.policies.map((p, i) => {
            const colors = ['#94a3b8', '#22c55e', '#ef4444']
            const isBest = i === 0
            return (
              <g key={i}>
                <rect x={sxPol(i) + 20} y={syPol(p.G)} width={60} height={H - P - syPol(p.G)} fill={colors[p.actionIdx]} opacity={isBest ? 0.8 : 0.4} />
                <text x={sxPol(i) + 50} y={H - P + 12} textAnchor="middle" fill={colors[p.actionIdx]} fontSize={10}>{p.action}</text>
                <text x={sxPol(i) + 50} y={syPol(p.G) - 5} textAnchor="middle" fill={colors[p.actionIdx]} fontSize={8}>G={p.G.toFixed(4)}</text>
                {isBest && <text x={sxPol(i) + 50} y={syPol(p.G) - 15} textAnchor="middle" fill="#fbbf24" fontSize={9} fontWeight="bold">★ BEST</text>}
              </g>
            )
          })}

          <text x={W - P} y={20} textAnchor="end" fill="#475569" fontSize={9}>G = risk (KL) + ambiguity (H)</text>
        </svg>
      </div>

      {/* Beliefs vs observations */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Posterior Beliefs vs Observations</div>
        <div className="space-y-1">
          {data.observations.map((o, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-12">t-{data.observations.length - i - 1}</span>
              <span className="text-cyan-400 font-mono w-24">obs: {(o * 100).toFixed(4)}%</span>
              <span className="text-amber-400 font-mono w-24">belief: {(data.mu[i] * 100).toFixed(4)}%</span>
              <span className="font-mono w-24" style={{ color: Math.abs(o - data.mu[i]) < 0.001 ? '#22c55e' : '#ef4444' }}>
                PE: {((o - data.mu[i]) * 100).toFixed(4)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Free energy F</div>
          <div className="text-cyan-400 font-mono">{data.currentF.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Best action</div>
          <div className="font-mono" style={{ color: sigColor }}>{data.bestPolicy.action}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Expected G</div>
          <div className="text-amber-400 font-mono">{data.bestPolicy.G.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Predicted return</div>
          <div className="text-purple-400 font-mono">{(data.bestPolicy.predictedReturn * 100).toFixed(4)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Precision</div>
          <div className="text-emerald-400 font-mono">{precision}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> FEP:</strong> minimize F = KL[q||p] - log p(o) |
        <strong> Perception:</strong> gradient descent on F (update μ) |
        <strong> Action:</strong> minimize G(π) = risk + ambiguity |
        <strong> Precision:</strong> 1/σ² controls prediction error weighting
      </div>
    </div>
  )
}
