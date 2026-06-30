import React, { useMemo, useState } from 'react'

// ─── Burgers Equation (Nonlinear PDE, Shock Formation) ──────────────────────
// Models order flow dynamics via the viscous Burgers equation, capturing
// nonlinear wave steepening and shock formation (sudden price jumps).
//
// Mathematical foundation:
//   Viscous Burgers equation:
//   ∂u/∂t + u·∂u/∂x = ν·∂²u/∂x²
//
//   Inviscid (ν=0): ∂u/∂t + u·∂u/∂x = 0
//   → characteristics: dx/dt = u, shock when characteristics cross
//
//   Hopf-Cole transformation: u = -2ν·(∂/∂x) log φ
//   → transforms Burgers to heat equation ∂φ/∂t = ν·∂²φ/∂x²
//
//   Numerical: Lax-Friedrichs scheme (inviscid)
//   u_i^{n+1} = (1/2)(u_{i+1}^n + u_{i-1}^n) - (Δt/2Δx)·u_i^n·(u_{i+1}^n - u_{i-1}^n)
//
//   Applications: order flow shock detection, price jump prediction,
//   nonlinear wave propagation in microstructure

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Solve viscous Burgers equation via finite differences
const solveBurgers = (u0, xGrid, dt, nSteps, nu) => {
  const n = xGrid.length
  const dx = xGrid[1] - xGrid[0]
  let u = u0.slice()
  const history = [u.slice()]
  const shockPoints = []

  for (let step = 0; step < nSteps; step++) {
    const newU = new Array(n).fill(0)
    for (let i = 1; i < n - 1; i++) {
      // Advection: -u·∂u/∂x (upwind)
      const du = (u[i + 1] - u[i - 1]) / (2 * dx)
      const advection = -u[i] * du
      // Diffusion: ν·∂²u/∂x²
      const diffusion = nu * (u[i + 1] - 2 * u[i] + u[i - 1]) / (dx * dx)
      newU[i] = u[i] + dt * (advection + diffusion)
    }
    // Boundary: periodic
    newU[0] = newU[n - 2]
    newU[n - 1] = newU[1]

    // Detect shocks: large negative gradient
    for (let i = 1; i < n - 1; i++) {
      const grad = (newU[i + 1] - newU[i - 1]) / (2 * dx)
      if (grad < -shockThreshold(u)) {
        shockPoints.push({ step, xIdx: i, x: xGrid[i], gradient: grad })
      }
    }

    u = newU
    if (step % Math.max(1, Math.floor(nSteps / 20)) === 0) {
      history.push(u.slice())
    }
  }

  return { finalU: u, history, shockPoints }
}

const shockThreshold = (u) => {
  const std = Math.sqrt(u.reduce((s, v) => s + v * v, 0) / u.length)
  return 2 * std
}

export default function BurgersEquation({ candles, symbol, exchange }) {
  const [nu, setNu] = useState(0.01)
  const [nSteps, setNSteps] = useState(200)
  const [dt, setDt] = useState(0.01)
  const [lookback, setLookback] = useState(100)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Normalize returns to be initial condition
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length)
    const normR = returns.map(r => std > 0 ? (r - mean) / std : 0)

    // Spatial grid (return values as x-axis)
    const nGrid = Math.min(80, normR.length)
    const xMin = Math.min(...normR) - 0.5
    const xMax = Math.max(...normR) + 0.5
    const dx = (xMax - xMin) / (nGrid - 1)
    const xGrid = Array.from({ length: nGrid }, (_, i) => xMin + i * dx)

    // Initial condition: histogram density mapped to velocity field
    const binW = (xMax - xMin) / nGrid
    const u0 = new Array(nGrid).fill(0)
    for (const r of normR) {
      const idx = Math.min(nGrid - 1, Math.max(0, Math.floor((r - xMin) / binW)))
      u0[idx] += 1
    }
    // Normalize and smooth
    const maxU0 = Math.max(...u0, 1)
    for (let i = 0; i < nGrid; i++) u0[i] = (u0[i] / maxU0) * 2 - 1 // scale to [-1, 1]

    // Solve Burgers
    const result = solveBurgers(u0, xGrid, dt, nSteps, nu)

    // Analyze shocks
    const shocks = result.shockPoints
    const shockTimes = shocks.reduce((acc, s) => {
      acc[s.step] = (acc[s.step] || 0) + 1
      return acc
    }, {})

    // Energy: E = (1/2)∫u²dx
    const energyHistory = result.history.map(u => ({
      energy: 0.5 * u.reduce((s, v) => s + v * v, 0) * dx,
    }))

    // Entropy: S = -∫u·log|u|dx
    const entropyHistory = result.history.map(u => ({
      entropy: -u.reduce((s, v) => s + (Math.abs(v) > 0.01 ? v * Math.log(Math.abs(v)) : 0), 0) * dx,
    }))

    // Signal
    const totalShocks = shocks.length
    const maxShockGrad = shocks.length > 0 ? Math.min(...shocks.map(s => s.gradient)) : 0
    let signal = 'SMOOTH_FLOW'
    let reason = ''
    if (totalShocks > 20) {
      signal = 'SHOCK_FORMATION'
      reason = `${totalShocks} shock points detected (max gradient: ${maxShockGrad.toFixed(4)}, nonlinear steepening)`
    } else if (totalShocks > 5) {
      signal = 'WEAK_SHOCKS'
      reason = `${totalShocks} shock points (mild nonlinear effects, gradient: ${maxShockGrad.toFixed(4)})`
    } else {
      reason = `${totalShocks} shock points (smooth flow, viscosity dominates, ν=${nu})`
    }

    // Energy decay rate
    const e0 = energyHistory[0].energy
    const eT = energyHistory[energyHistory.length - 1].energy
    const energyDecay = e0 > 0 ? (1 - eT / e0) * 100 : 0

    return {
      xGrid, result, shocks, shockTimes,
      energyHistory, entropyHistory,
      signal, reason, totalShocks, maxShockGrad,
      energyDecay, u0, dx,
    }
  }, [candles, exchange, symbol, nu, nSteps, dt, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'SHOCK_FORMATION' ? '#ef4444' : data.signal === 'WEAK_SHOCKS' ? '#f59e0b' : '#22c55e'

  // Solution evolution
  const allU = [...data.u0, ...data.result.finalU, ...data.result.history.flat()]
  const maxU = Math.max(...allU, 0.1)
  const minU = Math.min(...allU, -0.1)
  const sxX = (i) => P + (i / data.xGrid.length) * (W - 2 * P)
  const syU = (v) => H - P - ((v - minU) / (maxU - minU + 0.001)) * (H - 2 * P)

  // Energy decay
  const maxE = Math.max(...data.energyHistory.map(e => e.energy), 0.01)
  const sxE = (i) => P + (i / data.energyHistory.length) * (W - 2 * P)
  const syE = (v) => H - P - (v / maxE) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Burgers Equation (Shock Formation) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">ν (viscosity):</span>
          <input type="number" step="0.005" value={nu} onChange={e => setNu(Math.max(0, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Steps:</span>
          <input type="number" value={nSteps} onChange={e => setNSteps(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Δt:</span>
          <input type="number" step="0.005" value={dt} onChange={e => setDt(Math.max(0.001, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Burgers solution evolution */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Burgers Equation Solution u(x,t): Initial → Final (wave steepening)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Initial */}
          <path d={data.u0.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxX(i)} ${syU(v)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {/* Intermediate snapshots */}
          {data.result.history.slice(1, -1).map((u, k) => (
            <path key={k} d={u.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxX(i)} ${syU(v)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={0.5} opacity={0.3} />
          ))}

          {/* Final */}
          <path d={data.result.finalU.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxX(i)} ${syU(v)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>u(x, 0) initial</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>intermediate</text>
          <text x={W - P} y={48} textAnchor="end" fill="#ef4444" fontSize={9}>u(x, T) final</text>
        </svg>
      </div>

      {/* Spacetime diagram */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Spacetime Diagram (time ↓, space →, color = u)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          {data.result.history.map((u, t) => {
            const cellH = (H - 2 * P) / data.result.history.length
            return u.map((val, i) => {
              const cellW = (W - 2 * P) / data.xGrid.length
              const intensity = (val - minU) / (maxU - minU + 0.001)
              return <rect key={`${t}-${i}`} x={P + i * cellW} y={P + t * cellH} width={cellW} height={cellH} fill={`hsl(${240 - intensity * 240}, 80%, ${20 + intensity * 40}%)`} opacity={0.6} />
            })
          })}
          <text x={W - P} y={20} textAnchor="end" fill="#475569" fontSize={9}>t →</text>
        </svg>
      </div>

      {/* Energy decay */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Energy E(t) = (1/2)∫u²dx (dissipation rate)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.energyHistory.map((e, i) => `${i === 0 ? 'M' : 'L'} ${sxE(i)} ${syE(e.energy)}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>E(t) = (1/2)∫u²dx</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>decay: {data.energyDecay.toFixed(1)}%</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Shocks</div>
          <div className="text-red-400 font-mono">{data.totalShocks}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Max grad</div>
          <div className="text-amber-400 font-mono">{data.maxShockGrad.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Energy decay</div>
          <div className="text-emerald-400 font-mono">{data.energyDecay.toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">ν (viscosity)</div>
          <div className="text-cyan-400 font-mono">{nu.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Grid pts</div>
          <div className="text-slate-300 font-mono">{data.xGrid.length}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> PDE:</strong> ∂u/∂t + u·∂u/∂x = ν·∂²u/∂x² (viscous Burgers) |
        <strong> Inviscid:</strong> ν=0 → shock formation (characteristics cross) |
        <strong> Hopf-Cole:</strong> u = -2ν·∂_x log φ → heat equation |
        <strong> Energy:</strong> dE/dt = -ν·∫(∂u/∂x)²dx ≤ 0 (dissipation)
      </div>
    </div>
  )
}
