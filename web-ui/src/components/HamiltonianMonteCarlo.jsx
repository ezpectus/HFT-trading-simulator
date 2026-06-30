import React, { useMemo, useState } from 'react'

// ─── Hamiltonian Monte Carlo (HMC) ──────────────────────────────────────────
// Momentum-based MCMC sampler that uses Hamiltonian dynamics to propose
// samples, enabling efficient exploration of high-dimensional posterior
// distributions for Bayesian inference in financial models.
//
// Mathematical foundation:
//   Hamiltonian: H(q, p) = U(q) + K(p)
//   U(q) = -log p(q|D) (potential energy = negative log posterior)
//   K(p) = ½·pᵀ·M⁻¹·p (kinetic energy, M = mass matrix)
//
//   Leapfrog integrator (symplectic, preserves volume):
//   p_{½} = p - (ε/2)·∇U(q)
//   q' = q + ε·M⁻¹·p_{½}
//   p' = p_{½} - (ε/2)·∇U(q')
//
//   Metropolis acceptance:
//   α = min(1, exp(H(q,p) - H(q',p')))
//
//   NUTS (No-U-Turn Sampler): adaptively choose trajectory length
//
//   Applications: Bayesian parameter estimation, posterior for GARCH,
//   volatility surface fitting, risk factor distribution inference

const randomNormal = () => {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Log posterior for GARCH(1,1) parameters (simplified)
// Parameters: q = [omega, alpha, beta] (GARCH params)
const logPosterior = (q, returns) => {
  const [omega, alpha, beta] = q
  // Constraints: omega > 0, alpha > 0, beta > 0, alpha + beta < 1
  if (omega <= 0 || alpha <= 0 || beta <= 0 || alpha + beta >= 1) return -Infinity

  // Prior: log-normal-ish
  const logPrior = -omega * 10 - alpha * 5 - beta * 5

  // Likelihood: GARCH(1,1) log-likelihood
  let sigma2 = omega / (1 - alpha - beta + 1e-10) // unconditional variance
  let logLik = 0
  for (let t = 0; t < returns.length; t++) {
    sigma2 = omega + alpha * returns[t] * returns[t] + beta * sigma2
    if (sigma2 <= 0) return -Infinity
    logLik += -0.5 * Math.log(2 * Math.PI * sigma2) - returns[t] * returns[t] / (2 * sigma2)
  }

  return logPrior + logLik
}

// Gradient of negative log posterior (numerical)
const gradLogPosterior = (q, returns, eps = 1e-6) => {
  const grad = new Array(q.length).fill(0)
  for (let i = 0; i < q.length; i++) {
    const qPlus = [...q]; qPlus[i] += eps
    const qMinus = [...q]; qMinus[i] -= eps
    grad[i] = (logPosterior(qPlus, returns) - logPosterior(qMinus, returns)) / (2 * eps)
  }
  return grad
}

// Leapfrog integrator
const leapfrog = (q, p, gradFn, stepSize, nSteps, mass) => {
  q = q.slice()
  p = p.slice()
  let grad = gradFn(q)

  for (let i = 0; i < nSteps; i++) {
    // Half step for momentum
    for (let j = 0; j < q.length; j++) p[j] -= 0.5 * stepSize * grad[j]
    // Full step for position
    for (let j = 0; j < q.length; j++) q[j] += stepSize * p[j] / mass[j]
    // Update gradient
    grad = gradFn(q)
    // Half step for momentum
    for (let j = 0; j < q.length; j++) p[j] -= 0.5 * stepSize * grad[j]
  }

  return { q, p }
}

// HMC sampler
const hmc = (initQ, logPostFn, gradFn, nSamples, stepSize, nLeapfrog, mass) => {
  let q = initQ.slice()
  const samples = []
  const acceptHistory = []
  const logPostHistory = []

  for (let s = 0; s < nSamples; s++) {
    // Sample momentum
    const p = q.map((_, i) => randomNormal() * Math.sqrt(mass[i]))

    // Current Hamiltonian
    const currentLogPost = logPostFn(q)
    const currentK = 0.5 * p.reduce((s, pi, i) => s + pi * pi / mass[i], 0)
    const currentH = -currentLogPost + currentK

    // Leapfrog
    const { q: newQ, p: newP } = leapfrog(q, p, gradFn, stepSize, nLeapfrog, mass)

    // Proposed Hamiltonian
    const newLogPost = logPostFn(newQ)
    const newK = 0.5 * newP.reduce((s, pi, i) => s + pi * pi / mass[i], 0)
    const newH = -newLogPost + newK

    // Metropolis acceptance
    const acceptProb = Math.min(1, Math.exp(currentH - newH))
    const accepted = Math.random() < acceptProb

    if (accepted && isFinite(newLogPost)) {
      q = newQ
    }

    samples.push(q.slice())
    acceptHistory.push(accepted ? 1 : 0)
    logPostHistory.push(isFinite(newLogPost) ? newLogPost : currentLogPost)
  }

  return { samples, acceptHistory, logPostHistory }
}

export default function HamiltonianMonteCarlo({ candles, symbol, exchange }) {
  const [nSamples, setNSamples] = useState(500)
  const [stepSize, setStepSize] = useState(0.005)
  const [nLeapfrog, setNLeapfrog] = useState(20)
  const [lookback, setLookback] = useState(100)
  const [burnIn, setBurnIn] = useState(100)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback - 1).map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // Initialize GARCH parameters
    const initQ = [0.02, 0.08, 0.9] // [omega, alpha, beta]
    const mass = [1, 1, 1]

    // Run HMC
    const logPostFn = (q) => logPosterior(q, returns)
    const gradFn = (q) => gradLogPosterior(q, returns)

    const result = hmc(initQ, logPostFn, gradFn, nSamples, stepSize, nLeapfrog, mass)

    // Post burn-in samples
    const postSamples = result.samples.slice(burnIn)

    // Posterior statistics
    const paramNames = ['omega', 'alpha', 'beta']
    const postStats = paramNames.map((name, i) => {
      const vals = postSamples.map(s => s[i])
      vals.sort((a, b) => a - b)
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length)
      const p25 = vals[Math.floor(vals.length * 0.25)]
      const p50 = vals[Math.floor(vals.length * 0.5)]
      const p75 = vals[Math.floor(vals.length * 0.75)]
      const p025 = vals[Math.floor(vals.length * 0.025)]
      const p975 = vals[Math.floor(vals.length * 0.975)]
      return { name, mean, std, p25, p50, p75, p025, p975, samples: vals }
    })

    // Acceptance rate
    const acceptRate = result.acceptHistory.slice(burnIn).reduce((a, b) => a + b, 0) / (nSamples - burnIn)

    // Persistence (alpha + beta)
    const persistence = postSamples.map(s => s[1] + s[2])
    const persMean = persistence.reduce((a, b) => a + b, 0) / persistence.length
    const persStd = Math.sqrt(persistence.reduce((s, v) => s + (v - persMean) ** 2, 0) / persistence.length)

    // Long-run variance: omega / (1 - alpha - beta)
    const longRunVar = postSamples.map(s => s[0] / (1 - s[1] - s[2] + 1e-10))
    const lrvMean = longRunVar.reduce((a, b) => a + b, 0) / longRunVar.length

    // Signal: persistence-based
    let signal = 'NEUTRAL'
    let reason = ''
    if (persMean > 0.98) {
      signal = 'HIGH_PERSISTENCE'
      reason = `GARCH persistence α+β = ${persMean.toFixed(4)} (long memory, vol clustering)`
    } else if (persMean < 0.9) {
      signal = 'LOW_PERSISTENCE'
      reason = `GARCH persistence α+β = ${persMean.toFixed(4)} (fast mean reversion)`
    } else {
      reason = `GARCH persistence α+β = ${persMean.toFixed(4)} (moderate)`
    }

    // Trace plots (thinned)
    const thin = Math.max(1, Math.floor(postSamples.length / 100))
    const traces = paramNames.map((name, i) => ({
      name,
      values: postSamples.filter((_, j) => j % thin === 0).map(s => s[i]),
    }))

    return {
      postStats, acceptRate, persistence: { mean: persMean, std: persStd },
      longRunVar: lrvMean, signal, reason,
      traces, logPostHistory: result.logPostHistory.slice(burnIn),
      nPost: postSamples.length,
    }
  }, [candles, exchange, symbol, nSamples, stepSize, nLeapfrog, lookback, burnIn])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'HIGH_PERSISTENCE' ? '#ef4444' : data.signal === 'LOW_PERSISTENCE' ? '#22c55e' : '#f59e0b'
  const paramColors = ['#06b6d4', '#f59e0b', '#a855f7']

  // Trace plots
  const allTraceVals = data.traces.flatMap(t => t.values)
  const minT = Math.min(...allTraceVals)
  const maxT = Math.max(...allTraceVals)
  const sxTrace = (i, n) => P + (i / Math.max(1, n - 1)) * (W - 2 * P)
  const syTrace = (v) => H - P - ((v - minT) / (maxT - minT + 0.001)) * (H - 2 * P)

  // Log posterior trace
  const maxLP = Math.max(...data.logPostHistory)
  const minLP = Math.min(...data.logPostHistory)
  const syLP = (v) => H - P - ((v - minLP) / (maxLP - minLP + 0.001)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Hamiltonian Monte Carlo (Bayesian GARCH) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Samples:</span>
          <input type="number" value={nSamples} onChange={e => setNSamples(Math.max(100, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Step size ε:</span>
          <input type="number" step="0.001" value={stepSize} onChange={e => setStepSize(Math.max(0.001, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Leapfrog L:</span>
          <input type="number" value={nLeapfrog} onChange={e => setNLeapfrog(Math.max(5, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Burn-in:</span>
          <input type="number" value={burnIn} onChange={e => setBurnIn(Math.max(0, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Trace plots */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Posterior Trace Plots (MCMC convergence check)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.traces.map((trace, i) => (
            <path key={i} d={trace.values.map((v, j) => `${j === 0 ? 'M' : 'L'} ${sxTrace(j, trace.values.length)} ${syTrace(v)}`).join(' ')} fill="none" stroke={paramColors[i]} strokeWidth={1.5} opacity={0.8} />
          ))}

          {data.traces.map((trace, i) => (
            <text key={i} x={W - P} y={20 + i * 14} textAnchor="end" fill={paramColors[i]} fontSize={9}>{trace.name}</text>
          ))}
        </svg>
      </div>

      {/* Log posterior */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Log Posterior Trace (burn-in removed)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          <path d={data.logPostHistory.map((lp, i) => `${i === 0 ? 'M' : 'L'} ${sxTrace(i, data.logPostHistory.length)} ${syLP(lp)}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth={1.5} />
          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>log p(q|D) = {data.logPostHistory[data.logPostHistory.length - 1].toFixed(2)}</text>
        </svg>
      </div>

      {/* Posterior distributions */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Posterior Distributions (GARCH parameters)</div>
        <div className="space-y-1">
          {data.postStats.map((stat, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-16">{stat.name}</span>
              <span className="font-mono w-20" style={{ color: paramColors[i] }}>μ={stat.mean.toFixed(4)}</span>
              <span className="text-slate-500 font-mono w-20">σ={stat.std.toFixed(4)}</span>
              <span className="text-slate-500 font-mono w-32">95% CI: [{stat.p025.toFixed(4)}, {stat.p975.toFixed(4)}]</span>
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
                <div className="h-full rounded absolute" style={{
                  width: `${Math.min(50, Math.abs(stat.mean) * 100)}%`,
                  background: paramColors[i],
                  left: stat.mean >= 0 ? '50%' : `${50 - Math.min(50, Math.abs(stat.mean) * 100)}%`
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Post samples</div>
          <div className="text-cyan-400 font-mono">{data.nPost}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Accept rate</div>
          <div className="text-emerald-400 font-mono">{(data.acceptRate * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Persistence</div>
          <div className="text-amber-400 font-mono">{data.persistence.mean.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Long-run var</div>
          <div className="text-purple-400 font-mono">{data.longRunVar.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Pers. std</div>
          <div className="text-slate-300 font-mono">{data.persistence.std.toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> H:</strong> H(q,p) = U(q) + K(p), U = -log p(q|D) |
        <strong> Leapfrog:</strong> symplectic integrator (ε={stepSize}, L={nLeapfrog}) |
        <strong> Accept:</strong> α = min(1, exp(H-H')) |
        <strong> Target:</strong> ~60-80% acceptance (optimal)
      </div>
    </div>
  )
}
