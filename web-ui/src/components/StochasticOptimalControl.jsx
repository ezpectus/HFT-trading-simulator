import React, { useMemo, useState } from 'react'

// ─── Stochastic Optimal Control (HJB Equation) ──────────────────────────────
// Solves the Hamilton-Jacobi-Bellman equation for optimal trading decisions
// under stochastic dynamics, finding the value function and optimal policy.
//
// Mathematical foundation:
//   State: dX = μ(X,t)dt + σ(X,t)dW
//   Objective: V(x,t) = max_u E[∫ e^{-ρs} L(X,u) ds + e^{-ρT} G(X_T)]
//
//   HJB equation:
//   -V_t + ρV = max_u [L(x,u) + μ(x,u)·V_x + (1/2)σ²(x,u)·V_xx]
//
//   Optimal policy: u* = argmax_u [...]
//
//   For portfolio: X = wealth, u = position size
//   dX = u·(μdt + σdW)
//   L = -u²·γ/2 (risk penalty) + u·μ (expected return)
//
//   Numerical: finite difference on (x, t) grid
//   V_t + max_u[H(x,u,V_x,V_xx)] = 0

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Solve HJB via backward finite differences
const solveHJB = (xGrid, tGrid, mu, sigma, gamma, rho, dt, dx) => {
  const nX = xGrid.length
  const nT = tGrid.length
  const V = Array.from({ length: nT }, () => new Array(nX).fill(0))
  const U = Array.from({ length: nT }, () => new Array(nX).fill(0))

  // Terminal condition: V(x, T) = G(x) = log(x) (utility of terminal wealth)
  for (let i = 0; i < nX; i++) {
    V[nT - 1][i] = Math.log(Math.max(xGrid[i], 0.01))
  }

  // Backward in time
  for (let t = nT - 2; t >= 0; t--) {
    for (let i = 1; i < nX - 1; i++) {
      const x = xGrid[i]

      // Find optimal u
      // H = u·μ·x - (γ/2)·u²·σ²·x² + (u·μ·x)·V_x + (1/2)·u²·σ²·x²·V_xx
      // dH/du = μ·x - γ·u·σ²·x² + μ·x·V_x + u·σ²·x²·V_xx = 0
      // u* = (μ·x·(1 + V_x)) / (σ²·x²·(γ - V_xx))

      const Vx = (V[t + 1][i + 1] - V[t + 1][i - 1]) / (2 * dx)
      const Vxx = (V[t + 1][i + 1] - 2 * V[t + 1][i] + V[t + 1][i - 1]) / (dx * dx)

      const numerator = mu * x * (1 + Vx)
      const denominator = sigma * sigma * x * x * (gamma - Vxx)

      let uOpt = Math.abs(denominator) > 1e-10 ? numerator / denominator : 0
      // Clamp position
      uOpt = Math.max(-2, Math.min(2, uOpt))

      // Value function update (backward Euler)
      const drift = uOpt * mu * x
      const diffusion = uOpt * sigma * x
      const reward = uOpt * mu * x - (gamma / 2) * uOpt * uOpt * sigma * sigma * x * x

      const V_t = reward + drift * Vx + 0.5 * diffusion * diffusion * Vxx - rho * V[t + 1][i]
      V[t][i] = V[t + 1][i] + dt * V_t
      U[t][i] = uOpt
    }

    // Boundary conditions
    V[t][0] = V[t][1]
    V[t][nX - 1] = V[t][nX - 2]
    U[t][0] = 0
    U[t][nX - 1] = 0
  }

  return { V, U }
}

export default function StochasticOptimalControl({ candles, symbol, exchange }) {
  const [gamma, setGamma] = useState(2.0)
  const [rho, setRho] = useState(0.05)
  const [lookback, setLookback] = useState(100)
  const [nT, setNT] = useState(30)
  const [nX, setNX] = useState(50)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Estimate parameters
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length
    const varR = returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length
    const stdR = Math.sqrt(varR)
    const mu = meanR * 252 // annualized drift
    const sigma = stdR * Math.sqrt(252) // annualized vol

    // Current wealth (normalized to 1)
    const currentWealth = 1.0

    // Grid setup
    const xMin = 0.1, xMax = 3.0
    const dx = (xMax - xMin) / (nX - 1)
    const xGrid = Array.from({ length: nX }, (_, i) => xMin + i * dx)

    const T = 1.0 // 1 year horizon
    const dt = T / nT
    const tGrid = Array.from({ length: nT + 1 }, (_, i) => i * dt)

    // Solve HJB
    const { V, U } = solveHJB(xGrid, tGrid, mu, sigma, gamma, rho, dt, dx)

    // Find optimal position at current wealth
    const currentIdx = Math.min(nX - 2, Math.max(1, Math.floor((currentWealth - xMin) / dx)))
    const optimalPosition = U[0][currentIdx]
    const currentValue = V[0][currentIdx]

    // Optimal position trajectory over time
    const positionTrajectory = []
    let wealthIdx = currentIdx
    for (let t = 0; t < nT; t++) {
      positionTrajectory.push({
        t: t * dt,
        position: U[t][wealthIdx],
        wealth: xGrid[wealthIdx],
        value: V[t][wealthIdx],
      })
      // Simulate wealth evolution (deterministic drift)
      const u = U[t][wealthIdx]
      const newWealth = xGrid[wealthIdx] * (1 + u * mu * dt)
      wealthIdx = Math.min(nX - 2, Math.max(1, Math.floor((newWealth - xMin) / dx)))
    }

    // Value function slices at different times
    const valueSlices = [0, Math.floor(nT / 3), Math.floor(2 * nT / 3), nT - 1].map(tIdx => ({
      tLabel: `t=${(tIdx * dt).toFixed(2)}`,
      values: V[tIdx].slice(),
    }))

    // Signal
    let signal = 'NEUTRAL'
    let reason = ''
    if (optimalPosition > 0.3) {
      signal = 'LONG'
      reason = `Optimal position u*=${optimalPosition.toFixed(4)} (long, risk aversion γ=${gamma})`
    } else if (optimalPosition < -0.3) {
      signal = 'SHORT'
      reason = `Optimal position u*=${optimalPosition.toFixed(4)} (short, risk aversion γ=${gamma})`
    } else {
      reason = `Optimal position u*=${optimalPosition.toFixed(4)} (near zero, high risk aversion)`
    }

    // Sharpe-like ratio of optimal policy
    const sharpe = (optimalPosition * mu) / (Math.abs(optimalPosition) * sigma + 1e-10)

    return {
      V, U, xGrid, tGrid, dx, dt,
      optimalPosition, currentValue,
      positionTrajectory, valueSlices,
      signal, reason, mu, sigma, sharpe,
      currentWealth, currentIdx,
    }
  }, [candles, exchange, symbol, gamma, rho, lookback, nT, nX])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'LONG' ? '#22c55e' : data.signal === 'SHORT' ? '#ef4444' : '#94a3b8'
  const sliceColors = ['#06b6d4', '#f59e0b', '#a855f7', '#22c55e']

  // Value function slices
  const allV = data.valueSlices.flatMap(s => s.values)
  const minV = Math.min(...allV), maxV = Math.max(...allV)
  const sxV = (x) => P + ((x - data.xGrid[0]) / (data.xGrid[data.xGrid.length - 1] - data.xGrid[0])) * (W - 2 * P)
  const syV = (v) => H - P - ((v - minV) / (maxV - minV + 0.001)) * (H - 2 * P)

  // Optimal position over time
  const maxU = Math.max(...data.positionTrajectory.map(p => Math.abs(p.position)), 0.1)
  const sxU = (i) => P + (i / data.positionTrajectory.length) * (W - 2 * P)
  const syU = (v) => H - P - ((v + maxU) / (2 * maxU)) * (H - 2 * P)

  // Optimal position vs wealth (policy function)
  const maxPolicy = Math.max(...data.U[0].map(Math.abs), 0.1)
  const syPol = (v) => H - P - ((v + maxPolicy) / (2 * maxPolicy)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Stochastic Optimal Control (HJB) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">γ (risk aversion):</span>
          <input type="number" step="0.5" value={gamma} onChange={e => setGamma(Math.max(0.1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">ρ (discount):</span>
          <input type="number" step="0.01" value={rho} onChange={e => setRho(Math.max(0, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Time steps:</span>
          <input type="number" value={nT} onChange={e => setNT(Math.max(10, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Wealth grid:</span>
          <input type="number" value={nX} onChange={e => setNX(Math.max(20, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Value function slices */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Value Function V(x, t) at Different Times</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.valueSlices.map((slice, i) => (
            <path key={i} d={slice.values.map((v, j) => `${j === 0 ? 'M' : 'L'} ${sxV(data.xGrid[j])} ${syV(v)}`).join(' ')} fill="none" stroke={sliceColors[i]} strokeWidth={2} />
          ))}

          {data.valueSlices.map((slice, i) => (
            <text key={i} x={W - P} y={20 + i * 14} textAnchor="end" fill={sliceColors[i]} fontSize={9}>{slice.tLabel}</text>
          ))}

          {/* Current wealth marker */}
          <line x1={sxV(data.currentWealth)} y1={P} x2={sxV(data.currentWealth)} y2={H - P} stroke="#fbbf24" strokeWidth={1} strokeDasharray="3,3" />
        </svg>
      </div>

      {/* Optimal policy function u*(x) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Optimal Policy u*(x) — Position Size vs Wealth (t=0)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.U[0].map((u, i) => (
            <line key={i} x1={sxV(data.xGrid[i])} y1={H / 2} x2={sxV(data.xGrid[i])} y2={syPol(u)} stroke={u > 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} opacity={0.7} />
          ))}

          <line x1={sxV(data.currentWealth)} y1={P} x2={sxV(data.currentWealth)} y2={H - P} stroke="#fbbf24" strokeWidth={1} strokeDasharray="3,3" />
          <text x={sxV(data.currentWealth)} y={P + 10} textAnchor="middle" fill="#fbbf24" fontSize={9}>current</text>

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>u* {'>'} 0 (long)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>u* {'<'} 0 (short)</text>
        </svg>
      </div>

      {/* Position trajectory */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Optimal Position Trajectory u*(t) (simulated wealth path)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.positionTrajectory.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sxU(i)} ${syU(p.position)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />
          {data.positionTrajectory.map((p, i) => (
            <circle key={i} cx={sxU(i)} cy={syU(p.position)} r={3} fill={p.position > 0 ? '#22c55e' : '#ef4444'} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>u*(t) optimal position</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">u* (position)</div>
          <div className="text-cyan-400 font-mono">{data.optimalPosition.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">V(x, 0)</div>
          <div className="text-emerald-400 font-mono">{data.currentValue.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">μ (drift)</div>
          <div className="text-amber-400 font-mono">{data.mu.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">σ (vol)</div>
          <div className="text-purple-400 font-mono">{data.sigma.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Sharpe</div>
          <div className="text-slate-300 font-mono">{data.sharpe.toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> HJB:</strong> -V_t + ρV = max_u[L + μ·V_x + (1/2)σ²·V_xx] |
        <strong> Policy:</strong> u* = μ·x·(1+V_x) / (σ²x²·(γ-V_xx)) |
        <strong> Utility:</strong> G(x) = log(x) (terminal), L = u·μ·x - (γ/2)·u²·σ²·x² |
        <strong> Method:</strong> backward Euler finite differences (nT={nT}, nX={nX})
      </div>
    </div>
  )
}
