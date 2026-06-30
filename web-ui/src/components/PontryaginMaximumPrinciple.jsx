import React, { useMemo, useState } from 'react'

// ─── Pontryagin Maximum Principle (Optimal Trading Trajectory) ──────────────
// Applies the Pontryagin Maximum Principle (PMP) to find the optimal
// trading trajectory that minimizes execution cost + market impact.
//
// Mathematical foundation:
//   State: x'(t) = f(x, u, t) = u(t)  (inventory evolves with trade rate)
//   Objective: min J = ∫₀ᵀ [½·κ·u² + λ·u²·x + η·x²] dt
//   where:
//     ½·κ·u² = execution cost (quadratic in trade rate)
//     λ·u²·x = temporary market impact (Almgren-Chriss)
//     η·x² = inventory risk penalty
//
//   Hamiltonian: H = ½·κ·u² + λ·u²·x + η·x² + p·u
//   Costate: p'(t) = -∂H/∂x = -λ·u² - 2·η·x
//   Optimality: ∂H/∂u = κ·u + 2·λ·u·x + p = 0
//   → u* = -p / (κ + 2·λ·x)
//
//   Boundary conditions:
//   x(0) = X₀ (initial inventory), x(T) = 0 (liquidate by T)
//   p(T) = 0 (transversality), or p(T) = penalty if x(T) ≠ 0
//
//   Solution: two-point boundary value problem (shooting method)

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Solve PMP via shooting method
const solvePMP = (X0, T, kappa, lambda, eta, nSteps) => {
  const dt = T / nSteps

  // Shooting: guess p(0), integrate forward, adjust to hit x(T)=0
  let p0Low = -10, p0High = 10
  let bestSolution = null

  for (let iter = 0; iter < 50; iter++) {
    const p0 = (p0Low + p0High) / 2
    const trajectory = []
    let x = X0, p = p0

    for (let step = 0; step < nSteps; step++) {
      const t = step * dt
      // Optimal control: u* = -p / (κ + 2λx)
      const u = -p / (kappa + 2 * lambda * x + 1e-10)
      // Clamp
      const uClamped = Math.max(-Math.abs(X0) * 2, Math.min(Math.abs(X0) * 2, u))

      // Cost
      const cost = 0.5 * kappa * uClamped * uClamped + lambda * uClamped * uClamped * x + eta * x * x

      trajectory.push({ t, x, p, u: uClamped, cost })

      // State: x' = u
      x = x + uClamped * dt
      // Costate: p' = -∂H/∂x = -λ·u² - 2·η·x
      p = p + (-lambda * uClamped * uClamped - 2 * eta * x) * dt
    }

    // Check terminal condition x(T) ≈ 0
    if (Math.abs(x) < 0.01) {
      bestSolution = trajectory
      break
    }
    // Bisection
    if (x > 0) {
      p0Low = p0 // need more negative p to sell faster
    } else {
      p0High = p0
    }
    bestSolution = trajectory
  }

  // Total cost
  const totalCost = bestSolution ? bestSolution.reduce((s, t) => s + t.cost * dt, 0) : 0
  // TWAP comparison
  const twapCost = 0.5 * kappa * (X0 / T) ** 2 * T + eta * X0 ** 2 * T / 3

  return { trajectory: bestSolution, totalCost, twapCost, savings: twapCost - totalCost }
}

export default function PontryaginMaximumPrinciple({ candles, symbol, exchange }) {
  const [kappa, setKappa] = useState(0.1)
  const [lambda, setLambda] = useState(0.01)
  const [eta, setEta] = useState(0.05)
  const [X0, setX0] = useState(1.0)
  const [T, setT] = useState(1.0)
  const [lookback, setLookback] = useState(100)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Estimate volatility for parameter calibration
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length
    const stdR = Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length)

    // Calibrate eta to volatility (risk penalty ∝ σ²)
    const etaCalibrated = eta * stdR * stdR * 252

    const nSteps = 100
    const result = solvePMP(X0, T, kappa, lambda, etaCalibrated, nSteps)

    // TWAP trajectory (constant rate)
    const twapTraj = []
    const twapRate = X0 / T
    let xTwap = X0
    for (let step = 0; step < nSteps; step++) {
      const t = step * (T / nSteps)
      const cost = 0.5 * kappa * twapRate * twapRate + etaCalibrated * xTwap * xTwap
      twapTraj.push({ t, x: xTwap, u: twapRate, cost })
      xTwap = xTwap - twapRate * (T / nSteps)
    }

    // Immediate execution (all at once)
    const immediateCost = 0.5 * kappa * (X0 / 0.01) ** 2 * 0.01 + lambda * (X0 / 0.01) ** 2 * X0

    // Signal
    let signal = 'OPTIMAL_EXECUTION'
    let reason = ''
    const savingsPct = result.twapCost > 0 ? (result.savings / result.twapCost) * 100 : 0
    if (savingsPct > 10) {
      signal = 'SIGNIFICANT_SAVINGS'
      reason = `PMP saves ${savingsPct.toFixed(1)}% vs TWAP (cost: ${result.totalCost.toFixed(6)} vs ${result.twapCost.toFixed(6)})`
    } else if (savingsPct > 0) {
      reason = `PMP saves ${savingsPct.toFixed(1)}% vs TWAP (cost: ${result.totalCost.toFixed(6)} vs ${result.twapCost.toFixed(6)})`
    } else {
      signal = 'TWAP_PREFERRED'
      reason = `TWAP preferred (PMP cost: ${result.totalCost.toFixed(6)} vs TWAP: ${result.twapCost.toFixed(6)})`
    }

    // Current trade rate
    const currentU = result.trajectory ? result.trajectory[0].u : 0
    const tradeDirection = currentU < 0 ? 'SELLING' : currentU > 0 ? 'BUYING' : 'NEUTRAL'

    return {
      result, twapTraj, immediateCost,
      signal, reason, savingsPct,
      currentU, tradeDirection,
      stdR, etaCalibrated,
    }
  }, [candles, exchange, symbol, kappa, lambda, eta, X0, T, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'SIGNIFICANT_SAVINGS' ? '#22c55e' : data.signal === 'TWAP_PREFERRED' ? '#f59e0b' : '#06b6d4'

  // Inventory trajectory
  const traj = data.result.trajectory || []
  const maxInv = Math.max(...traj.map(t => Math.abs(t.x)), X0, 0.1)
  const sxT = (t) => P + (t / T) * (W - 2 * P)
  const syInv = (v) => H - P - ((v + maxInv) / (2 * maxInv)) * (H - 2 * P)

  // Trade rate
  const maxU = Math.max(...traj.map(t => Math.abs(t.u)), 0.1)
  const syU = (v) => H - P - ((v + maxU) / (2 * maxU)) * (H - 2 * P)

  // Costate
  const maxP = Math.max(...traj.map(t => Math.abs(t.p)), 0.1)
  const syP = (v) => H - P - ((v + maxP) / (2 * maxP)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Pontryagin Maximum Principle (Optimal Execution) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">κ (exec cost):</span>
          <input type="number" step="0.01" value={kappa} onChange={e => setKappa(Math.max(0.001, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">λ (impact):</span>
          <input type="number" step="0.005" value={lambda} onChange={e => setLambda(Math.max(0, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">η (risk):</span>
          <input type="number" step="0.01" value={eta} onChange={e => setEta(Math.max(0, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">X₀ (inventory):</span>
          <input type="number" step="0.1" value={X0} onChange={e => setX0(+e.target.value)} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">T (horizon):</span>
          <input type="number" step="0.1" value={T} onChange={e => setT(Math.max(0.1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Inventory trajectory */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Optimal Inventory x(t): PMP vs TWAP</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* PMP optimal */}
          <path d={traj.map((t, i) => `${i === 0 ? 'M' : 'L'} ${sxT(t.t)} ${syInv(t.x)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2.5} />

          {/* TWAP */}
          <path d={data.twapTraj.map((t, i) => `${i === 0 ? 'M' : 'L'} ${sxT(t.t)} ${syInv(t.x)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5,3" />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>PMP optimal x*(t)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>TWAP (linear)</text>
        </svg>
      </div>

      {/* Trade rate */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Optimal Trade Rate u*(t) (control signal)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={traj.map((t, i) => `${i === 0 ? 'M' : 'L'} ${sxT(t.t)} ${syU(t.u)}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth={2} />
          {traj.filter((_, i) => i % 10 === 0).map((t, i) => (
            <circle key={i} cx={sxT(t.t)} cy={syU(t.u)} r={3} fill={t.u < 0 ? '#ef4444' : '#22c55e'} />
          ))}

          {/* TWAP rate */}
          <line x1={P} y1={syU(data.twapTraj[0].u)} x2={W - P} y2={syU(data.twapTraj[0].u)} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3" />

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>u*(t) PMP optimal</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>TWAP constant rate</text>
        </svg>
      </div>

      {/* Costate p(t) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Costate p(t) (shadow price of inventory)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={traj.map((t, i) => `${i === 0 ? 'M' : 'L'} ${sxT(t.t)} ${syP(t.p)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>p(t) costate (shadow price)</text>
        </svg>
      </div>

      {/* Cost comparison */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Execution Cost Comparison</div>
        <div className="space-y-1">
          {[
            { label: 'PMP optimal', cost: data.result.totalCost, color: '#06b6d4' },
            { label: 'TWAP', cost: data.result.twapCost, color: '#f59e0b' },
            { label: 'Immediate', cost: data.immediateCost, color: '#ef4444' },
          ].sort((a, b) => a.cost - b.cost).map((c, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-24">{c.label}</span>
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="h-full rounded" style={{ width: `${Math.min(100, c.cost / data.immediateCost * 100)}%`, background: c.color }} />
              </div>
              <span className="font-mono w-24" style={{ color: c.color }}>{c.cost.toFixed(6)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">PMP cost</div>
          <div className="text-cyan-400 font-mono">{data.result.totalCost.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">TWAP cost</div>
          <div className="text-amber-400 font-mono">{data.result.twapCost.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Savings</div>
          <div className="text-emerald-400 font-mono">{data.savingsPct.toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">u*(0) rate</div>
          <div className="text-purple-400 font-mono">{data.currentU.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Direction</div>
          <div className="font-mono" style={{ color: sigColor }}>{data.tradeDirection}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> PMP:</strong> H = ½κu² + λu²x + ηx² + p·u, u* = -p/(κ+2λx) |
        <strong> State:</strong> x'=u (inventory), Costate: p'=-λu²-2ηx |
        <strong> BC:</strong> x(0)=X₀, x(T)=0, p(T)=0 |
        <strong> Method:</strong> shooting (bisection on p(0)) |
        <strong> Model:</strong> Almgren-Chriss with risk penalty
      </div>
    </div>
  )
}
