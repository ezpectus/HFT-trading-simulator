import React, { useMemo, useState } from 'react'

// ─── Banach Fixed-Point Iteration (Contraction Mapping Equilibrium) ─────────
// Uses Banach's contraction mapping theorem to find fixed points of
// market equilibrium operators, detecting convergence/divergence regimes.
//
// Mathematical foundation:
//   Banach theorem: If T:X->X is a contraction with constant q < 1,
//   then T has a unique fixed point x* = T(x*)
//   Convergence: ||x_n - x*|| <= q^n / (1-q) * ||x_1 - x_0||
//
//   Market equilibrium: x* = T(x*) where T is the best-response operator
//   T_i(x) = argmax_{u_i} J_i(u_i, x_{-i}) (Nash equilibrium)
//
//   Applications: Nash equilibrium computation, market clearing prices,
//   iterative implied volatility calibration, convergence analysis

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Best-response operator for 2-player game
// Player 1: maximize a1*x - b1*x^2 - c1*y*x
// Player 2: maximize a2*y - b2*y^2 - c2*x*y
// Best response: T1(y) = (a1 - c1*y) / (2*b1), T2(x) = (a2 - c2*x) / (2*b2)
const bestResponse = (x, y, params) => {
  const { a1, b1, c1, a2, b2, c2 } = params
  const newX = (a1 - c1 * y) / (2 * b1)
  const newY = (a2 - c2 * x) / (2 * b2)
  return { x: newX, y: newY }
}

// Compute contraction constant (spectral radius of Jacobian of T)
const contractionConstant = (params) => {
  const { c1, b1, c2, b2 } = params
  // Jacobian: [[0, -c1/(2b1)], [-c2/(2b2), 0]]
  // Eigenvalues: ±sqrt(c1*c2 / (4*b1*b2))
  return Math.sqrt(Math.abs(c1 * c2) / (4 * b1 * b2))
}

// Fixed-point iteration
const fixedPointIteration = (x0, y0, params, maxIter) => {
  const trajectory = [{ x: x0, y: y0, iter: 0 }]
  let x = x0, y = y0
  const errors = [{ iter: 0, error: 0 }]

  for (let i = 1; i <= maxIter; i++) {
    const { x: newX, y: newY } = bestResponse(x, y, params)
    const error = Math.sqrt((newX - x) ** 2 + (newY - y) ** 2)
    trajectory.push({ x: newX, y: newY, iter: i })
    errors.push({ iter: i, error })
    x = newX
    y = newY
    if (error < 1e-8) break
  }

  return { trajectory, errors, converged: errors[errors.length - 1].error < 1e-6 }
}

export default function BanachFixedPoint({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(100)
  const [maxIter, setMaxIter] = useState(50)
  const [coupling, setCoupling] = useState(0.3)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Estimate game parameters from market data
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length
    const varR = returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length
    const stdR = Math.sqrt(varR)

    // Player 1 = momentum, Player 2 = mean-reversion
    // Coupling = interaction strength
    const params = {
      a1: meanR > 0 ? 0.02 : -0.02,
      b1: 0.05,
      c1: coupling,
      a2: -meanR * 0.5,
      b2: 0.05,
      c2: coupling,
    }

    const q = contractionConstant(params)

    // Initial conditions from recent data
    const x0 = returns[returns.length - 1] || 0.01
    const y0 = -x0 * 0.5

    const result = fixedPointIteration(x0, y0, params, maxIter)

    // Analytical Nash equilibrium
    // x* = (a1*2*b2 - c1*a2) / (4*b1*b2 - c1*c2)
    // y* = (a2*2*b1 - c2*a1) / (4*b1*b2 - c1*c2)
    const det = 4 * params.b1 * params.b2 - params.c1 * params.c2
    const nashX = det !== 0 ? (params.a1 * 2 * params.b2 - params.c1 * params.a2) / det : 0
    const nashY = det !== 0 ? (params.a2 * 2 * params.b1 - params.c2 * params.a1) / det : 0

    // Convergence rate
    const finalError = result.errors[result.errors.length - 1].error
    const convergenceRate = result.errors.length > 2
      ? Math.log(result.errors[result.errors.length - 1].error + 1e-20) / Math.log(result.errors[result.errors.length - 2].error + 1e-20)
      : 0

    // Signal
    let signal = 'CONVERGING'
    let reason = ''
    if (q < 1 && result.converged) {
      signal = 'EQUILIBRIUM_FOUND'
      reason = `Converged to Nash equilibrium (${nashX.toFixed(6)}, ${nashY.toFixed(6)}) in ${result.trajectory.length - 1} iterations, q=${q.toFixed(4)}`
    } else if (q < 1 && !result.converged) {
      signal = 'CONVERGING_SLOW'
      reason = `Converging slowly (q=${q.toFixed(4)} < 1), error=${finalError.toFixed(8)} after ${maxIter} iterations`
    } else {
      signal = 'DIVERGING'
      reason = `Diverging (q=${q.toFixed(4)} >= 1), no equilibrium exists for this coupling`
    }

    // Error decay
    const errorDecay = result.errors.map(e => ({
      iter: e.iter,
      logError: Math.log(e.error + 1e-20),
    }))

    return {
      result, params, q, nashX, nashY,
      signal, reason, finalError, convergenceRate,
      errorDecay, meanR, stdR,
    }
  }, [candles, exchange, symbol, lookback, maxIter, coupling])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'EQUILIBRIUM_FOUND' ? '#22c55e' : data.signal === 'CONVERGING_SLOW' ? '#f59e0b' : '#ef4444'

  // Trajectory in (x, y) space
  const traj = data.result.trajectory
  const allVals = traj.flatMap(t => [t.x, t.y])
  const maxVal = Math.max(...allVals.map(Math.abs), 0.1)
  const sxT = (v) => P + ((v + maxVal) / (2 * maxVal)) * (W - 2 * P)
  const syT = (v) => H - P - ((v + maxVal) / (2 * maxVal)) * (H - 2 * P)

  // Error decay
  const maxLogErr = Math.max(...data.errorDecay.map(e => e.logError), 0)
  const minLogErr = Math.min(...data.errorDecay.map(e => e.logError), -20)
  const sxE = (i) => P + (i / data.errorDecay.length) * (W - 2 * P)
  const syE = (v) => H - P - ((v - minLogErr) / (maxLogErr - minLogErr + 0.1)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Banach Fixed-Point Iteration — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Coupling (c):</span>
          <input type="number" step="0.05" value={coupling} onChange={e => setCoupling(Math.max(0, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max iterations:</span>
          <input type="number" value={maxIter} onChange={e => setMaxIter(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Phase space trajectory */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Phase Space: Strategy Trajectory (momentum vs mean-reversion)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={W / 2} y1={P} x2={W / 2} y2={H - P} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Trajectory path */}
          <path d={traj.map((t, i) => `${i === 0 ? 'M' : 'L'} ${sxT(t.x)} ${syT(t.y)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={1.5} opacity={0.5} />

          {/* Iteration points */}
          {traj.map((t, i) => (
            <circle key={i} cx={sxT(t.x)} cy={syT(t.y)} r={i === 0 ? 5 : i === traj.length - 1 ? 5 : 2} fill={i === 0 ? '#f59e0b' : i === traj.length - 1 ? '#22c55e' : '#06b6d4'} opacity={0.7} />
          ))}

          {/* Nash equilibrium */}
          <circle cx={sxT(data.nashX)} cy={syT(data.nashY)} r={8} fill="none" stroke="#ef4444" strokeWidth={2} />
          <text x={sxT(data.nashX)} y={syT(data.nashY) - 12} textAnchor="middle" fill="#ef4444" fontSize={9}>Nash</text>

          <text x={W - P} y={20} textAnchor="end" fill="#f59e0b" fontSize={9}>start</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>converged</text>
          <text x={W - P} y={48} textAnchor="end" fill="#ef4444" fontSize={9}>Nash equilibrium</text>
        </svg>
      </div>

      {/* Error decay */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Convergence: log(||error||) vs iteration (linear = geometric convergence)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.errorDecay.map((e, i) => `${i === 0 ? 'M' : 'L'} ${sxE(i)} ${syE(e.logError)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={2} />

          {data.errorDecay.filter((_, i) => i % 5 === 0).map((e, i) => (
            <circle key={i} cx={sxE(e.iter)} cy={syE(e.logError)} r={3} fill="#a855f7" />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>log(error) per iteration</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>slope = log(q) = {Math.log(data.q + 1e-20).toFixed(4)}</text>
        </svg>
      </div>

      {/* Strategy values over iterations */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Strategy Values: x_n (momentum) and y_n (mean-reversion) per iteration</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={traj.map((t, i) => `${i === 0 ? 'M' : 'L'} ${sxE(i)} ${syT(t.x)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />
          <path d={traj.map((t, i) => `${i === 0 ? 'M' : 'L'} ${sxE(i)} ${syT(t.y)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2} />

          {/* Nash equilibrium lines */}
          <line x1={P} y1={syT(data.nashX)} x2={W - P} y2={syT(data.nashX)} stroke="#22c55e" strokeWidth={1} strokeDasharray="4,3" />
          <line x1={P} y1={syT(data.nashY)} x2={W - P} y2={syT(data.nashY)} stroke="#ef4444" strokeWidth={1} strokeDasharray="4,3" />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>x_n (momentum)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>y_n (mean-reversion)</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">q (contraction)</div>
          <div className="text-cyan-400 font-mono">{data.q.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Iterations</div>
          <div className="text-emerald-400 font-mono">{data.result.trajectory.length - 1}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Final error</div>
          <div className="text-amber-400 font-mono">{data.finalError.toExponential(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Nash x*</div>
          <div className="text-purple-400 font-mono">{data.nashX.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Nash y*</div>
          <div className="text-slate-300 font-mono">{data.nashY.toFixed(6)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Banach:</strong> q {'<'} 1 implies unique fixed point (contraction) |
        <strong> Best response:</strong> T_i(x) = argmax J_i(u_i, x_{-i}) |
        <strong> Nash:</strong> x* = T(x*) (fixed point of best response) |
        <strong> Rate:</strong> ||e_n|| {'<='} q^n/(1-q) * ||e_0|| (geometric convergence)
      </div>
    </div>
  )
}
