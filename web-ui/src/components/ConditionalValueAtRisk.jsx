import React, { useMemo, useState } from 'react'

// ─── Conditional Value at Risk (CVaR) / Expected Shortfall ──────────────────
// Computes VaR, CVaR (Expected Shortfall), and performs CVaR-optimal
// portfolio allocation using Rockafellar-Uryasev formulation.
//
// Mathematical foundation:
//   VaR_α: the α-quantile of the loss distribution
//   VaR_α = inf{x : P(L ≤ x) ≥ α}
//
//   CVaR_α (Expected Shortfall):
//   CVaR_α = E[L | L ≥ VaR_α]
//   = (1/(1-α)) · ∫_α¹ VaR_u du
//
//   Rockafellar-Uryasev formulation:
//   min  ζ + (1/(1-α)) · Σ max(0, -r_i·w - ζ) / T
//   over (w, ζ) ∈ W × R
//
//   This is a linear program when W is polyhedral.
//   We solve it via gradient descent on the smooth approximation.
//
//   Entropic VaR (EVaR):
//   EVaR_α = inf_{z>0} (1/z) · log(E[exp(z·L)] / (1-α))

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Historical VaR
const historicalVaR = (returns, alpha = 0.95) => {
  const sorted = [...returns].sort((a, b) => a - b)
  const idx = Math.floor((1 - alpha) * sorted.length)
  return sorted[idx]
}

// Historical CVaR (Expected Shortfall)
const historicalCVaR = (returns, alpha = 0.95) => {
  const sorted = [...returns].sort((a, b) => a - b)
  const idx = Math.floor((1 - alpha) * sorted.length)
  const tail = sorted.slice(0, idx + 1)
  return tail.reduce((a, b) => a + b, 0) / tail.length
}

// Cornish-Fisher VaR (modified VaR with skewness and kurtosis)
const cornishFisherVaR = (returns, alpha = 0.95) => {
  const n = returns.length
  const mean = returns.reduce((a, b) => a + b, 0) / n
  const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / n)
  const skew = std > 0 ? returns.reduce((s, r) => s + ((r - mean) / std) ** 3, 0) / n : 0
  const kurt = std > 0 ? returns.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / n - 3 : 0

  const z = -1.645 // 95% quantile (one-tailed)
  const zCF = z + (1/6) * (z**2 - 1) * skew + (1/24) * (z**3 - 3*z) * kurt - (1/36) * (2*z**3 - 5*z) * skew**2

  return mean + zCF * std
}

// Entropic VaR
const entropicVaR = (returns, alpha = 0.95) => {
  const n = returns.length
  let bestEVaR = Infinity
  for (let z = 0.01; z <= 10; z += 0.1) {
    const expSum = returns.reduce((s, r) => s + Math.exp(-z * r), 0) / n
    const evar = (1 / z) * (Math.log(expSum) - Math.log(1 - alpha))
    if (evar < bestEVaR) bestEVaR = evar
  }
  return bestEVaR
}

// CVaR portfolio optimization (Rockafellar-Uryasev via gradient descent)
const cvarOptimize = (allReturns, alpha = 0.95, maxIter = 200, lr = 0.01) => {
  const nAssets = allReturns.length
  const T = allReturns[0].length

  // Initialize equal weights
  let w = new Array(nAssets).fill(1 / nAssets)
  let zeta = 0

  for (let iter = 0; iter < maxIter; iter++) {
    // Compute portfolio returns
    const portReturns = []
    for (let t = 0; t < T; t++) {
      let r = 0
      for (let i = 0; i < nAssets; i++) r += w[i] * allReturns[i][t]
      portReturns.push(r)
    }

    // Losses = -returns
    const losses = portReturns.map(r => -r)

    // CVaR gradient: ζ + (1/(1-α)) · Σ max(0, L_t - ζ) / T
    // ∂CVaR/∂ζ = 1 - (1/(1-α)) · Σ I(L_t > ζ) / T
    // ∂CVaR/∂w_i = (1/(1-α)) · Σ I(L_t > ζ) · (-r_{i,t}) / T

    const indicator = losses.map(L => L > zeta ? 1 : 0)
    const count = indicator.reduce((a, b) => a + b, 0)

    // Update ζ
    const dzeta = 1 - (1 / (1 - alpha)) * (count / T)
    zeta -= lr * dzeta

    // Update weights
    for (let i = 0; i < nAssets; i++) {
      let dw = 0
      for (let t = 0; t < T; t++) {
        if (indicator[t]) {
          dw += -allReturns[i][t]
        }
      }
      dw = (1 / (1 - alpha)) * (dw / T)
      w[i] -= lr * dw
    }

    // Normalize weights (long-only constraint)
    w = w.map(v => Math.max(0, v))
    const sum = w.reduce((a, b) => a + b, 0)
    if (sum > 0) w = w.map(v => v / sum)
  }

  // Compute final portfolio statistics
  const portReturns = []
  for (let t = 0; t < T; t++) {
    let r = 0
    for (let i = 0; i < nAssets; i++) r += w[i] * allReturns[i][t]
    portReturns.push(r)
  }

  const portVaR = historicalVaR(portReturns, alpha)
  const portCVaR = historicalCVaR(portReturns, alpha)
  const portMean = portReturns.reduce((a, b) => a + b, 0) / T * 252
  const portStd = Math.sqrt(portReturns.reduce((s, r) => s + (r - portReturns.reduce((a, b) => a + b, 0) / T) ** 2, 0) / T) * Math.sqrt(252)
  const sharpe = portStd > 0 ? portMean / portStd : 0

  return { w, zeta, portVaR, portCVaR, portMean, portStd, sharpe }
}

export default function ConditionalValueAtRisk({ candles, symbols, exchange }) {
  const [alpha, setAlpha] = useState(0.95)
  const [lookback, setLookback] = useState(100)
  const [optimize, setOptimize] = useState(true)

  const data = useMemo(() => {
    if (!candles?.[exchange] || !symbols || symbols.length < 2) return null

    const allReturns = []
    const validSymbols = []
    for (const sym of symbols) {
      const cds = candles[exchange]?.[sym]
      if (!cds || cds.length < lookback + 1) continue
      const prices = cds.slice(-lookback - 1).map(c => c.close)
      allReturns.push(computeReturns(prices))
      validSymbols.push(sym)
    }
    if (validSymbols.length < 2) return null

    const nAssets = validSymbols.length
    const T = allReturns[0].length

    // Per-asset VaR/CVaR
    const perAsset = validSymbols.map((sym, i) => {
      const rets = allReturns[i]
      const varH = historicalVaR(rets, alpha)
      const cvarH = historicalCVaR(rets, alpha)
      const varCF = cornishFisherVaR(rets, alpha)
      const evar = entropicVaR(rets, alpha)
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length * 252
      const std = Math.sqrt(rets.reduce((s, r) => s + (r - rets.reduce((a, b) => a + b, 0) / rets.length) ** 2, 0) / rets.length) * Math.sqrt(252)
      return { sym, varH, cvarH, varCF, evar, mean, std }
    })

    // Equal-weight portfolio
    const eqReturns = []
    for (let t = 0; t < T; t++) {
      let r = 0
      for (let i = 0; i < nAssets; i++) r += allReturns[i][t] / nAssets
      eqReturns.push(r)
    }
    const eqVaR = historicalVaR(eqReturns, alpha)
    const eqCVaR = historicalCVaR(eqReturns, alpha)

    // CVaR-optimized portfolio
    let optResult = null
    if (optimize) {
      optResult = cvarOptimize(allReturns, alpha, 200, 0.01)
    }

    // Signal: compare CVaR to VaR ratio (tail risk indicator)
    const currentCVaR = optimize ? optResult.portCVaR : eqCVaR
    const currentVaR = optimize ? optResult.portVaR : eqVaR
    const tailRatio = currentVaR !== 0 ? currentCVaR / currentVaR : 0

    let signal = 'NEUTRAL'
    let reason = ''
    if (tailRatio > 1.5) {
      signal = 'HIGH_TAIL_RISK'
      reason = `CVaR/VaR = ${tailRatio.toFixed(2)} (fat tails, extreme losses likely)`
    } else if (tailRatio > 1.2) {
      signal = 'MODERATE_TAIL'
      reason = `CVaR/VaR = ${tailRatio.toFixed(2)} (moderate tail risk)`
    } else {
      signal = 'LOW_TAIL_RISK'
      reason = `CVaR/VaR = ${tailRatio.toFixed(2)} (thin tails, well-behaved distribution)`
    }

    return {
      validSymbols, perAsset, eqVaR, eqCVaR,
      optResult, signal, reason, tailRatio,
      alpha, nAssets,
    }
  }, [candles, exchange, symbols, alpha, lookback, optimize])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 2 symbols with {lookback + 1}+ candles on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'HIGH_TAIL_RISK' ? '#ef4444' : data.signal === 'MODERATE_TAIL' ? '#f59e0b' : '#22c55e'

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Conditional VaR (Expected Shortfall) — {exchange}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">α (confidence):</span>
          <input type="number" step="0.01" value={alpha} onChange={e => setAlpha(Math.max(0.5, Math.min(0.999, +e.target.value)))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(30, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={optimize} onChange={e => setOptimize(e.target.checked)} />
          <span className="text-slate-400">CVaR optimization (Rockafellar-Uryasev)</span>
        </label>
      </div>

      {/* Per-asset risk metrics */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Per-Asset Risk Metrics (α = {(data.alpha * 100).toFixed(1)}%)</div>
        <div className="space-y-1">
          {data.perAsset.map((a, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-20 truncate">{a.sym}</span>
              <span className="text-red-400 font-mono w-24">VaR: {(a.varH * 100).toFixed(3)}%</span>
              <span className="text-amber-400 font-mono w-24">CVaR: {(a.cvarH * 100).toFixed(3)}%</span>
              <span className="text-purple-400 font-mono w-24">CF-VaR: {(a.varCF * 100).toFixed(3)}%</span>
              <span className="text-cyan-400 font-mono w-24">EVaR: {(a.evar * 100).toFixed(3)}%</span>
              <span className="text-slate-500 font-mono w-20">σ: {(a.std * 100).toFixed(2)}%</span>
              <span className="text-slate-500 font-mono w-20">μ: {(a.mean * 100).toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* CVaR-optimized weights */}
      {data.optResult && (
        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-2">CVaR-Optimal Portfolio Weights (Rockafellar-Uryasev)</div>
          <div className="space-y-1">
            {data.validSymbols.map((sym, i) => (
              <div key={sym} className="flex items-center gap-3 text-xs">
                <span className="text-slate-400 w-20 truncate">{sym}</span>
                <div className="flex-1 bg-slate-900 rounded h-4 relative">
                  <div className="h-full rounded" style={{ width: `${data.optResult.w[i] * 100}%`, background: '#06b6d4' }} />
                </div>
                <span className="text-cyan-400 font-mono w-16">{(data.optResult.w[i] * 100).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Portfolio comparison */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Portfolio Risk Comparison</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          {(() => {
            const allVars = [
              ...data.perAsset.map(a => Math.abs(a.varH)),
              Math.abs(data.eqVaR),
              data.optResult ? Math.abs(data.optResult.portVaR) : 0,
            ]
            const allCvars = [
              ...data.perAsset.map(a => Math.abs(a.cvarH)),
              Math.abs(data.eqCVaR),
              data.optResult ? Math.abs(data.optResult.portCVaR) : 0,
            ]
            const maxVal = Math.max(...allVars, ...allCvars, 0.001)
            const sy = (v) => H - P - (Math.abs(v) / maxVal) * (H - 2 * P)
            const barW = 40
            const x0 = P + 20
            return (
              <g>
                <rect x={x0} y={sy(data.eqVaR)} width={barW / 2 - 1} height={H - P - sy(data.eqVaR)} fill="#64748b" opacity={0.6} />
                <rect x={x0 + barW / 2 + 1} y={sy(data.eqCVaR)} width={barW / 2 - 1} height={H - P - sy(data.eqCVaR)} fill="#f59e0b" opacity={0.6} />
                <text x={x0 + barW / 2} y={H - P + 12} textAnchor="middle" fill="#94a3b8" fontSize={8}>Equal</text>
                {data.optResult && (
                  <g>
                    <rect x={x0 + 80} y={sy(data.optResult.portVaR)} width={barW / 2 - 1} height={H - P - sy(data.optResult.portVaR)} fill="#22c55e" opacity={0.6} />
                    <rect x={x0 + 80 + barW / 2 + 1} y={sy(data.optResult.portCVaR)} width={barW / 2 - 1} height={H - P - sy(data.optResult.portCVaR)} fill="#06b6d4" opacity={0.6} />
                    <text x={x0 + 80 + barW / 2} y={H - P + 12} textAnchor="middle" fill="#94a3b8" fontSize={8}>CVaR Opt</text>
                  </g>
                )}
              </g>
            )
          })()}
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Eq Wt VaR</div>
          <div className="text-red-400 font-mono">{(data.eqVaR * 100).toFixed(3)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Eq Wt CVaR</div>
          <div className="text-amber-400 font-mono">{(data.eqCVaR * 100).toFixed(3)}%</div>
        </div>
        {data.optResult && (
          <>
            <div className="bg-slate-800 rounded p-2">
              <div className="text-slate-400">Opt VaR</div>
              <div className="text-emerald-400 font-mono">{(data.optResult.portVaR * 100).toFixed(3)}%</div>
            </div>
            <div className="bg-slate-800 rounded p-2">
              <div className="text-slate-400">Opt CVaR</div>
              <div className="text-cyan-400 font-mono">{(data.optResult.portCVaR * 100).toFixed(3)}%</div>
            </div>
            <div className="bg-slate-800 rounded p-2">
              <div className="text-slate-400">Opt Sharpe</div>
              <div className="text-purple-400 font-mono">{data.optResult.sharpe.toFixed(3)}</div>
            </div>
          </>
        )}
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> α:</strong> {(data.alpha * 100).toFixed(1)}% |
        <strong> Methods:</strong> Historical VaR/CVaR, Cornish-Fisher VaR (skew+kurt adjusted), Entropic VaR |
        <strong> Optimization:</strong> Rockafellar-Uryasev (gradient descent, long-only constraint)
      </div>
    </div>
  )
}
