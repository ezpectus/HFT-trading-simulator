import React, { useMemo, useState } from 'react'

// ─── Almgren-Chriss Optimal Execution ────────────────────────────────────────
// Implements the Almgren-Chriss model for optimal order execution that
// minimizes the trade-off between market impact and timing risk.
//
// Mathematical foundation:
//   The model decomposes execution into:
//   - Temporary impact (paid per trade, proportional to execution rate)
//   - Permanent impact (affects all future prices, proportional to total traded)
//   - Timing risk (variance of execution cost due to price volatility)
//
//   Objective: minimize E[cost] + λ * Var[cost]
//   where cost = permanent_impact + temporary_impact + timing_risk
//
//   Solution: optimal trajectory x(t) = X * sinh(κ(T-t)) / sinh(κT)
//   where κ = sqrt(λσ²/η), X = total shares, T = time horizon
//
//   Parameters:
//   - σ (sigma): daily volatility
//   - η (eta): temporary impact coefficient
//   - γ (gamma): permanent impact coefficient
//   - λ (lambda): risk aversion parameter
//   - T: execution time horizon

const almgrenChriss = (X, T, sigma, eta, gamma, lambda, nSteps = 20) => {
  if (X <= 0 || T <= 0 || sigma <= 0 || eta <= 0) return null

  const dt = T / nSteps
  const kappa = Math.sqrt(lambda * sigma * sigma / eta)

  // Optimal trajectory: x(t) = X * sinh(κ(T-t)) / sinh(κT)
  const trajectory = []
  const trades = []
  let prevX = X
  for (let i = 0; i <= nSteps; i++) {
    const t = i * dt
    const x = X * Math.sinh(kappa * (T - t)) / Math.sinh(kappa * T)
    trajectory.push({ t, x })
    if (i > 0) {
      trades.push({ t, amount: prevX - x, rate: (prevX - x) / dt })
    }
    prevX = x
  }

  // Expected cost: E[cost] = ½γX² + ½η * Σ(v_k²) * dt
  // where v_k = (x_{k-1} - x_k) / dt
  let tempImpactCost = 0
  for (let i = 0; i < trades.length; i++) {
    const v = trades[i].rate
    tempImpactCost += eta * v * v * dt
  }
  const permImpactCost = 0.5 * gamma * X * X
  const expectedCost = permImpactCost + tempImpactCost

  // Variance: Var[cost] = σ² * Σ(x_k²) * dt
  let variance = 0
  for (let i = 0; i < trajectory.length - 1; i++) {
    variance += sigma * sigma * trajectory[i].x * trajectory[i].x * dt
  }
  const stdDev = Math.sqrt(variance)

  // Utility: U = E[cost] + λ * Var[cost]
  const utility = expectedCost + lambda * variance

  // Comparison: TWAP trajectory
  const twapTrades = []
  const twapPerStep = X / nSteps
  for (let i = 0; i < nSteps; i++) {
    twapTrades.push({ t: (i + 1) * dt, amount: twapPerStep, rate: twapPerStep / dt })
  }
  let twapTempCost = 0
  for (let i = 0; i < twapTrades.length; i++) {
    twapTempCost += eta * twapTrades[i].rate * twapTrades[i].rate * dt
  }
  const twapCost = permImpactCost + twapTempCost
  let twapVar = 0
  let twapRemaining = X
  for (let i = 0; i < nSteps; i++) {
    twapVar += sigma * sigma * twapRemaining * twapRemaining * dt
    twapRemaining -= twapPerStep
  }
  const twapStdDev = Math.sqrt(twapVar)
  const twapUtility = twapCost + lambda * twapVar

  // Efficient frontier: vary λ and compute (stdDev, expectedCost) pairs
  const frontier = []
  for (let li = -3; li <= 3; li += 0.5) {
    const lam = Math.pow(10, li)
    const k = Math.sqrt(lam * sigma * sigma / eta)
    let ec = 0
    let prevXi = X
    let varc = 0
    for (let i = 0; i <= nSteps; i++) {
      const t = i * dt
      const x = X * Math.sinh(k * (T - t)) / Math.sinh(k * T)
      if (i > 0) {
        const v = (prevXi - x) / dt
        ec += eta * v * v * dt
      }
      if (i < nSteps) varc += sigma * sigma * x * x * dt
      prevXi = x
    }
    ec += 0.5 * gamma * X * X
    frontier.push({ lambda: lam, cost: ec, stdDev: Math.sqrt(varc), utility: ec + lam * varc })
  }

  return {
    trajectory, trades,
    expectedCost, stdDev, utility,
    twapCost, twapStdDev, twapUtility,
    frontier,
    kappa, dt, nSteps,
    permImpactCost, tempImpactCost,
  }
}

export default function AlmgrenChriss({ candles, symbol, exchange, currentPrice }) {
  const [orderSize, setOrderSize] = useState(100)
  const [timeHorizon, setTimeHorizon] = useState(1) // days
  const [riskAversion, setRiskAversion] = useState(1e-6)
  const [nSteps, setNSteps] = useState(20)
  const [eta, setEta] = useState(0.1) // temporary impact
  const [gamma, setGamma] = useState(0.01) // permanent impact

  // Estimate sigma from candle data
  const sigma = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 10) return 0.02
    const cds = candles[exchange][symbol]
    const returns = []
    for (let i = 1; i < cds.length; i++) {
      returns.push((cds[i].close - cds[i - 1].close) / cds[i - 1].close)
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length
    return Math.sqrt(variance)
  }, [candles, exchange, symbol])

  const result = useMemo(() => {
    return almgrenChriss(orderSize, timeHorizon, sigma, eta, gamma, riskAversion, nSteps)
  }, [orderSize, timeHorizon, sigma, eta, gamma, riskAversion, nSteps])

  if (!result) {
    return <div className="p-4 text-sm text-slate-400">Invalid parameters for Almgren-Chriss model</div>
  }

  const W = 800, H = 300, P = 40

  // Trajectory chart
  const trajMaxX = orderSize
  const trajMaxT = timeHorizon
  const txScale = (t) => P + (t / trajMaxT) * (W - 2 * P)
  const tyScale = (x) => H - P - (x / trajMaxX) * (H - 2 * P)

  const trajPath = result.trajectory.map((d, i) =>
    `${i === 0 ? 'M' : 'L'} ${txScale(d.t)} ${tyScale(d.x)}`
  ).join(' ')

  // TWAP line
  const twapPath = result.trajectory.map((d, i) => {
    const twapX = orderSize * (1 - d.t / timeHorizon)
    return `${i === 0 ? 'M' : 'L'} ${txScale(d.t)} ${tyScale(Math.max(0, twapX))}`
  }).join(' ')

  // Efficient frontier chart
  const fW = 350, fH = 200
  const allCosts = [...result.frontier.map(f => f.cost), result.twapCost]
  const allStds = [...result.frontier.map(f => f.stdDev), result.twapStdDev]
  const maxCost = Math.max(...allCosts) * 1.1
  const maxStd = Math.max(...allStds) * 1.1
  const fxScale = (s) => P + (s / maxStd) * (fW - 2 * P)
  const fyScale = (c) => fH - P - (c / maxCost) * (fH - 2 * P)

  const frontierPath = result.frontier.map((f, i) =>
    `${i === 0 ? 'M' : 'L'} ${fxScale(f.stdDev)} ${fyScale(f.cost)}`
  ).join(' ')

  const optimalIdx = result.frontier.reduce((best, f, i) =>
    Math.abs(f.lambda - riskAversion) < Math.abs(result.frontier[best].lambda - riskAversion) ? i : best, 0)

  const savings = result.twapCost - result.expectedCost
  const savingsPct = result.twapCost > 0 ? (savings / result.twapCost) * 100 : 0

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Almgren-Chriss Optimal Execution — {symbol}</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Order Size:</span>
          <input type="number" value={orderSize} onChange={e => setOrderSize(Math.max(1, +e.target.value))} className="w-20 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">T (days):</span>
          <input type="number" step="0.1" value={timeHorizon} onChange={e => setTimeHorizon(Math.max(0.1, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Steps:</span>
          <input type="number" value={nSteps} onChange={e => setNSteps(Math.max(2, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">λ (risk aversion):</span>
          <input type="number" step="0.0000001" value={riskAversion} onChange={e => setRiskAversion(Math.max(1e-10, +e.target.value))} className="w-24 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">η (temp impact):</span>
          <input type="number" step="0.01" value={eta} onChange={e => setEta(Math.max(0.001, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">γ (perm impact):</span>
          <input type="number" step="0.001" value={gamma} onChange={e => setGamma(Math.max(0, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      <div className="flex gap-3">
        {/* Trajectory */}
        <div className="flex-1 bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">Optimal Execution Trajectory</div>
          <svg width={W} height={H} className="bg-slate-900 rounded">
            <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
            <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
            <path d={trajPath} fill="none" stroke="#06b6d4" strokeWidth={2} />
            <path d={twapPath} fill="none" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4,3" />
            <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={10}>Time (days)</text>
            <text x={5} y={P + 10} fill="#475569" fontSize={10}>Shares</text>
            <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={10}>Almgren-Chriss</text>
            <text x={W - P} y={34} textAnchor="end" fill="#64748b" fontSize={10}>TWAP (dashed)</text>
          </svg>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Efficient frontier */}
        <div className="flex-1 bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">Efficient Frontier (Cost vs Risk)</div>
          <svg width={fW} height={fH} className="bg-slate-900 rounded">
            <line x1={P} y1={fH - P} x2={fW - P} y2={fH - P} stroke="#334155" />
            <line x1={P} y1={P} x2={P} y2={fH - P} stroke="#334155" />
            <path d={frontierPath} fill="none" stroke="#f59e0b" strokeWidth={2} />
            {result.frontier[optimalIdx] && (
              <circle cx={fxScale(result.frontier[optimalIdx].stdDev)} cy={fyScale(result.frontier[optimalIdx].cost)} r={4} fill="#22c55e" />
            )}
            <circle cx={fxScale(result.twapStdDev)} cy={fyScale(result.twapCost)} r={4} fill="#64748b" />
            <text x={fW - P} y={fH - 5} textAnchor="end" fill="#475569" fontSize={9}>Risk (σ)</text>
            <text x={5} y={P + 8} fill="#475569" fontSize={9}>Cost</text>
          </svg>
          <div className="text-xs text-slate-500 mt-1">● Optimal (green) vs TWAP (gray)</div>
        </div>

        {/* Trade schedule */}
        <div className="flex-1 bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">Execution Schedule (first 5 + last)</div>
          <div className="space-y-1 text-xs font-mono max-h-48 overflow-auto">
            {result.trades.slice(0, 5).map((t, i) => (
              <div key={i} className="flex justify-between text-slate-300">
                <span className="text-slate-500">t={t.t.toFixed(3)}</span>
                <span>{t.amount.toFixed(2)}</span>
                <span className="text-cyan-400">{t.rate.toFixed(1)}/day</span>
              </div>
            ))}
            {result.trades.length > 5 && (
              <>
                <div className="text-slate-500 text-center">...</div>
                {result.trades.slice(-1).map((t, i) => (
                  <div key={i} className="flex justify-between text-slate-300">
                    <span className="text-slate-500">t={t.t.toFixed(3)}</span>
                    <span>{t.amount.toFixed(2)}</span>
                    <span className="text-cyan-400">{t.rate.toFixed(1)}/day</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">E[cost] (AC)</div>
          <div className="text-cyan-400 font-mono">{result.expectedCost.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">σ[cost] (AC)</div>
          <div className="text-amber-400 font-mono">{result.stdDev.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">E[cost] (TWAP)</div>
          <div className="text-slate-300 font-mono">{result.twapCost.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Savings</div>
          <div className="text-emerald-400 font-mono">{savings.toFixed(4)} ({savingsPct.toFixed(1)}%)</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">κ</div>
          <div className="text-purple-400 font-mono">{result.kappa.toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Model:</strong> σ={sigma.toFixed(5)}, η={eta}, γ={gamma}, λ={riskAversion.toExponential(2)} |
        <strong> Impact:</strong> permanent={result.permImpactCost.toFixed(4)}, temporary={result.tempImpactCost.toFixed(4)} |
        <strong> Utility:</strong> AC={result.utility.toFixed(4)} vs TWAP={result.twapUtility.toFixed(4)}
      </div>
    </div>
  )
}
