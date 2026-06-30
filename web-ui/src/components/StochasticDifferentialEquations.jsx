import React, { useMemo, useState } from 'react'

// ─── Stochastic Differential Equations (SDE) ────────────────────────────────
// Simulates financial SDEs using Euler-Maruyama and Milstein schemes.
// Includes GBM, Ornstein-Uhlenbeck, CIR, Heston, and Jump-Diffusion models.
//
// Mathematical foundation:
//   General SDE: dX_t = μ(X_t, t)dt + σ(X_t, t)dW_t
//
//   Euler-Maruyama: X_{n+1} = X_n + μ·Δt + σ·√Δt·Z_n
//
//   Milstein (strong order 1.0):
//   X_{n+1} = X_n + μ·Δt + σ·√Δt·Z_n + ½·σ·σ'·(Z_n² - 1)·Δt
//
//   Models:
//   GBM: dS = μS dt + σS dW
//   OU: dX = θ(μ - X) dt + σ dW  (mean-reverting)
//   CIR: dX = κ(θ - X) dt + σ√X dW  (positive mean-reverting)
//   Heston: dS = μS dt + √v S dW₁, dv = κ(θ-v) dt + ξ√v dW₂
//   Jump-Diffusion (Merton): dS = μS dt + σS dW + S·J·dN  (Poisson jumps)

const randomNormal = () => {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Euler-Maruyama for GBM
const simulateGBM = (S0, mu, sigma, T, nSteps, nPaths) => {
  const dt = T / nSteps
  const paths = []
  for (let p = 0; p < nPaths; p++) {
    const path = [S0]
    for (let i = 1; i < nSteps; i++) {
      const Z = randomNormal()
      path.push(path[i - 1] * (1 + mu * dt + sigma * Math.sqrt(dt) * Z))
    }
    paths.push(path)
  }
  return paths
}

// Milstein for GBM (strong order 1.0)
const simulateGBMMilstein = (S0, mu, sigma, T, nSteps, nPaths) => {
  const dt = T / nSteps
  const paths = []
  for (let p = 0; p < nPaths; p++) {
    const path = [S0]
    for (let i = 1; i < nSteps; i++) {
      const Z = randomNormal()
      const S = path[i - 1]
      // Milstein: S + μS dt + σS√dt Z + ½σ²S(Z²-1)dt
      path.push(S + mu * S * dt + sigma * S * Math.sqrt(dt) * Z + 0.5 * sigma * sigma * S * (Z * Z - 1) * dt)
    }
    paths.push(path)
  }
  return paths
}

// Ornstein-Uhlenbeck (mean-reverting)
const simulateOU = (X0, theta, mu, sigma, T, nSteps, nPaths) => {
  const dt = T / nSteps
  const paths = []
  for (let p = 0; p < nPaths; p++) {
    const path = [X0]
    for (let i = 1; i < nSteps; i++) {
      const Z = randomNormal()
      const X = path[i - 1]
      path.push(X + theta * (mu - X) * dt + sigma * Math.sqrt(dt) * Z)
    }
    paths.push(path)
  }
  return paths
}

// CIR (Cox-Ingersoll-Ross)
const simulateCIR = (X0, kappa, theta, sigma, T, nSteps, nPaths) => {
  const dt = T / nSteps
  const paths = []
  for (let p = 0; p < nPaths; p++) {
    const path = [X0]
    for (let i = 1; i < nSteps; i++) {
      const Z = randomNormal()
      const X = Math.max(0, path[i - 1])
      // Milstein for CIR
      const drift = kappa * (theta - X) * dt
      const vol = sigma * Math.sqrt(X) * Math.sqrt(dt) * Z
      const milstein = 0.25 * sigma * sigma * (Z * Z - 1) * dt
      path.push(Math.max(0, X + drift + vol + milstein))
    }
    paths.push(path)
  }
  return paths
}

// Heston model (stochastic volatility)
const simulateHeston = (S0, v0, mu, kappa, theta, xi, rho, T, nSteps, nPaths) => {
  const dt = T / nSteps
  const paths = []
  const volPaths = []
  for (let p = 0; p < nPaths; p++) {
    const price = [S0]
    const vol = [v0]
    for (let i = 1; i < nSteps; i++) {
      const Z1 = randomNormal()
      const Z2 = rho * Z1 + Math.sqrt(1 - rho * rho) * randomNormal()
      const vPrev = Math.max(0, vol[i - 1])
      const sPrev = price[i - 1]
      // Volatility: CIR-like
      vol.push(Math.max(0, vPrev + kappa * (theta - vPrev) * dt + xi * Math.sqrt(vPrev) * Math.sqrt(dt) * Z2))
      // Price: GBM with stochastic vol
      price.push(sPrev * (1 + mu * dt + Math.sqrt(vPrev) * Math.sqrt(dt) * Z1))
    }
    paths.push(price)
    volPaths.push(vol)
  }
  return { paths, volPaths }
}

// Merton Jump-Diffusion
const simulateMerton = (S0, mu, sigma, lambda, jumpMean, jumpStd, T, nSteps, nPaths) => {
  const dt = T / nSteps
  const paths = []
  for (let p = 0; p < nPaths; p++) {
    const path = [S0]
    for (let i = 1; i < nSteps; i++) {
      const Z = randomNormal()
      const S = path[i - 1]
      // Number of jumps in [t, t+dt] ~ Poisson(λ·dt)
      const nJumps = Math.random() < lambda * dt ? 1 : 0
      let jumpComponent = 0
      for (let j = 0; j < nJumps; j++) {
        const J = Math.exp(jumpMean + jumpStd * randomNormal()) - 1
        jumpComponent += J
      }
      path.push(S * (1 + mu * dt + sigma * Math.sqrt(dt) * Z + jumpComponent))
    }
    paths.push(path)
  }
  return paths
}

// Estimate parameters from returns
const estimateParams = (returns) => {
  const n = returns.length
  const mean = returns.reduce((a, b) => a + b, 0) / n
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / n
  const std = Math.sqrt(variance)

  // OU parameter estimation (simplified)
  let sumXY = 0, sumXX = 0, sumX = 0, sumY = 0
  for (let i = 0; i < n - 1; i++) {
    sumX += returns[i]; sumY += returns[i + 1]
    sumXY += returns[i] * returns[i + 1]; sumXX += returns[i] * returns[i]
  }
  const phi = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const ouTheta = -Math.log(Math.max(0.01, Math.abs(phi))) // mean reversion speed
  const ouMu = (sumY - phi * sumX) / (n * (1 - phi))

  return { mu: mean * 252, sigma: std * Math.sqrt(252), ouTheta, ouMu: ouMu * 252 }
}

export default function StochasticDifferentialEquations({ candles, symbol, exchange }) {
  const [model, setModel] = useState('gbm')
  const [nSteps, setNSteps] = useState(100)
  const [nPaths, setNPaths] = useState(50)
  const [T, setT] = useState(30 / 365)
  const [mu, setMu] = useState(0.1)
  const [sigma, setSigma] = useState(0.3)
  const [theta, setTheta] = useState(5)
  const [kappa, setKappa] = useState(2)
  const [xi, setXi] = useState(0.3)
  const [rho, setRho] = useState(-0.7)
  const [lambda, setLambda] = useState(5)
  const [scheme, setScheme] = useState('euler')
  const [autoParams, setAutoParams] = useState(true)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 30) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    const est = estimateParams(returns)
    const usedMu = autoParams ? est.mu : mu
    const usedSigma = autoParams ? est.sigma : sigma
    const S0 = prices[prices.length - 1]

    let sim = null
    let volSim = null

    if (model === 'gbm') {
      sim = scheme === 'milstein'
        ? simulateGBMMilstein(S0, usedMu, usedSigma, T, nSteps, nPaths)
        : simulateGBM(S0, usedMu, usedSigma, T, nSteps, nPaths)
    } else if (model === 'ou') {
      sim = simulateOU(S0, theta, est.ouMu || 0, usedSigma, T, nSteps, nPaths)
    } else if (model === 'cir') {
      sim = simulateCIR(usedSigma * usedSigma, kappa, usedSigma * usedSigma * 0.25, xi, T, nSteps, nPaths)
    } else if (model === 'heston') {
      const h = simulateHeston(S0, usedSigma * usedSigma, usedMu, kappa, usedSigma * usedSigma * 0.25, xi, rho, T, nSteps, nPaths)
      sim = h.paths; volSim = h.volPaths
    } else if (model === 'merton') {
      sim = simulateMerton(S0, usedMu, usedSigma, lambda, -0.05, 0.08, T, nSteps, nPaths)
    }

    // Statistics
    const finalPrices = sim.map(p => p[p.length - 1])
    finalPrices.sort((a, b) => a - b)
    const meanFinal = finalPrices.reduce((a, b) => a + b, 0) / finalPrices.length
    const p5 = finalPrices[Math.floor(finalPrices.length * 0.05)]
    const p25 = finalPrices[Math.floor(finalPrices.length * 0.25)]
    const median = finalPrices[Math.floor(finalPrices.length * 0.5)]
    const p75 = finalPrices[Math.floor(finalPrices.length * 0.75)]
    const p95 = finalPrices[Math.floor(finalPrices.length * 0.95)]

    // Mean path
    const meanPath = new Array(nSteps).fill(0)
    for (let t = 0; t < nSteps; t++) {
      for (let p = 0; p < nPaths; p++) meanPath[t] += sim[p][t]
      meanPath[t] /= nPaths
    }

    // Signal
    const expectedReturn = (meanFinal - S0) / S0
    let signal = 'NEUTRAL'
    if (expectedReturn > 0.01) signal = 'BUY'
    else if (expectedReturn < -0.01) signal = 'SELL'

    // Confidence interval width
    const ciWidth = (p95 - p5) / S0

    return {
      sim, volSim, S0, meanFinal, meanPath,
      p5, p25, median, p75, p95,
      expectedReturn, signal, ciWidth,
      usedMu, usedSigma, est,
    }
  }, [candles, exchange, symbol, model, nSteps, nPaths, T, mu, sigma, theta, kappa, xi, rho, lambda, scheme, autoParams])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 30 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 300, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'

  // Price paths
  const allPrices = data.sim.flat()
  const minP = Math.min(...allPrices)
  const maxP = Math.max(...allPrices)
  const sxP = (t) => P + (t / nSteps) * (W - 2 * P)
  const syP = (p) => H - P - ((p - minP) / (maxP - minP + 0.001)) * (H - 2 * P)

  // Volatility paths (Heston)
  const allVols = data.volSim ? data.volSim.flat() : []
  const maxV = allVols.length > 0 ? Math.max(...allVols) : 1
  const syV = (v) => H - P - (v / maxV) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Stochastic Differential Equations — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Model:</span>
          <select value={model} onChange={e => setModel(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="gbm">GBM (Geometric Brownian)</option>
            <option value="ou">Ornstein-Uhlenbeck</option>
            <option value="cir">CIR (Cox-Ingersoll-Ross)</option>
            <option value="heston">Heston (stochastic vol)</option>
            <option value="merton">Merton Jump-Diffusion</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Scheme:</span>
          <select value={scheme} onChange={e => setScheme(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="euler">Euler-Maruyama</option>
            <option value="milstein">Milstein (strong 1.0)</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={autoParams} onChange={e => setAutoParams(e.target.checked)} />
          <span className="text-slate-400">Auto-estimate (μ={data.usedMu.toFixed(3)}, σ={data.usedSigma.toFixed(3)})</span>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Paths:</span>
          <input type="number" value={nPaths} onChange={e => setNPaths(Math.max(10, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">T (days):</span>
          <input type="number" value={Math.round(T * 365)} onChange={e => setT(Math.max(1, +e.target.value) / 365)} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {!autoParams && (
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <label className="flex items-center gap-1">
            <span className="text-slate-400">μ (drift):</span>
            <input type="number" step="0.01" value={mu} onChange={e => setMu(+e.target.value)} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-slate-400">σ (vol):</span>
            <input type="number" step="0.01" value={sigma} onChange={e => setSigma(Math.max(0.01, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
          </label>
          {(model === 'ou' || model === 'cir' || model === 'heston') && (
            <label className="flex items-center gap-1">
              <span className="text-slate-400">κ/θ (reversion):</span>
              <input type="number" step="0.5" value={model === 'ou' ? theta : kappa} onChange={e => model === 'ou' ? setTheta(Math.max(0.1, +e.target.value)) : setKappa(Math.max(0.1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
            </label>
          )}
          {(model === 'cir' || model === 'heston') && (
            <label className="flex items-center gap-1">
              <span className="text-slate-400">ξ (vol of vol):</span>
              <input type="number" step="0.05" value={xi} onChange={e => setXi(Math.max(0.01, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
            </label>
          )}
          {model === 'heston' && (
            <label className="flex items-center gap-1">
              <span className="text-slate-400">ρ (correlation):</span>
              <input type="number" step="0.1" value={rho} onChange={e => setRho(Math.max(-0.99, Math.min(0.99, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
            </label>
          )}
          {model === 'merton' && (
            <label className="flex items-center gap-1">
              <span className="text-slate-400">λ (jump rate):</span>
              <input type="number" step="1" value={lambda} onChange={e => setLambda(Math.max(0, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
            </label>
          )}
        </div>
      )}

      {/* Price paths */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Simulated Paths ({model.toUpperCase()}, {nPaths} paths, {scheme})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Sample paths */}
          {data.sim.slice(0, 30).map((path, i) => (
            <path key={i} d={path.map((p, t) => `${t === 0 ? 'M' : 'L'} ${sxP(t)} ${syP(p)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={0.5} opacity={0.15} />
          ))}

          {/* Mean path */}
          <path d={data.meanPath.map((p, t) => `${t === 0 ? 'M' : 'L'} ${sxP(t)} ${syP(p)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2} />

          {/* Percentile bands */}
          <line x1={sxP(nSteps - 1)} y1={syP(data.p5)} x2={sxP(nSteps - 1)} y2={syP(data.p95)} stroke="#22c55e" strokeWidth={3} />
          <line x1={sxP(nSteps - 1)} y1={syP(data.p25)} x2={sxP(nSteps - 1)} y2={syP(data.p75)} stroke="#06b6d4" strokeWidth={3} />
          <circle cx={sxP(nSteps - 1)} cy={syP(data.median)} r={4} fill="#a855f7" />

          <text x={sxP(nSteps - 1) + 8} y={syP(data.p95)} fill="#22c55e" fontSize={9}>P95: ${data.p95.toFixed(2)}</text>
          <text x={sxP(nSteps - 1) + 8} y={syP(data.median)} fill="#a855f7" fontSize={9}>P50: ${data.median.toFixed(2)}</text>
          <text x={sxP(nSteps - 1) + 8} y={syP(data.p5)} fill="#22c55e" fontSize={9}>P5: ${data.p5.toFixed(2)}</text>
          <text x={W - P} y={20} textAnchor="end" fill="#f59e0b" fontSize={9}>Mean: ${data.meanFinal.toFixed(2)}</text>
        </svg>
      </div>

      {/* Volatility paths (Heston only) */}
      {data.volSim && (
        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">Stochastic Volatility Paths (Heston variance)</div>
          <svg width={W} height={200} className="bg-slate-900 rounded">
            <line x1={P} y1={170} x2={W - P} y2={170} stroke="#334155" />
            {data.volSim.slice(0, 20).map((vol, i) => (
              <path key={i} d={vol.map((v, t) => `${t === 0 ? 'M' : 'L'} ${sxP(t)} ${syV(v)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={0.5} opacity={0.2} />
            ))}
          </svg>
        </div>
      )}

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">S₀</div>
          <div className="text-cyan-400 font-mono">${data.S0.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">E[S_T]</div>
          <div className="text-amber-400 font-mono">${data.meanFinal.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Expected return</div>
          <div className="font-mono" style={{ color: sigColor }}>{(data.expectedReturn * 100).toFixed(2)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">90% CI width</div>
          <div className="text-purple-400 font-mono">{(data.ciWidth * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Median</div>
          <div className="text-emerald-400 font-mono">${data.median.toFixed(2)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Model:</strong> {model.toUpperCase()} ({scheme}) |
        <strong> μ:</strong> {data.usedMu.toFixed(4)} |
        <strong> σ:</strong> {data.usedSigma.toFixed(4)} |
        <strong> Paths:</strong> {nPaths} × {nSteps} steps |
        <strong> T:</strong> {Math.round(T * 365)} days
      </div>
    </div>
  )
}
