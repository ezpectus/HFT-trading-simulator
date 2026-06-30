import React, { useMemo, useState } from 'react'

// ─── Affine Arithmetic for Interval Uncertainty Propagation ──────────────────
// Uses affine arithmetic (AA) to propagate uncertainty through financial
// calculations. Unlike interval arithmetic, AA tracks correlations between
// quantities, avoiding the dependency problem.
//
// Mathematical foundation:
//   Affine form: â = a₀ + Σ_{i=1}^{n} a_i·ε_i
//   where ε_i ∈ [-1, 1] are noise symbols
//
//   Operations:
//   â + b̂ = (a₀ + b₀) + Σ(a_i + b_i)·ε_i
//   c·â = c·a₀ + Σ(c·a_i)·ε_i
//   â·b̂ = (a₀·b₀) + Σ(a₀·b_i + b₀·a_i)·ε_i + Σ_{i,j} a_i·b_j·ε_i·ε_j
//         (nonlinear term approximated with new noise symbol)
//
//   exp(â): approximate with Chebyshev min-max + new noise symbol
//   Interval: [a₀ - Σ|a_i|, a₀ + Σ|a_i|]
//
//   Applications: robust pricing, risk bounds with correlated uncertainties

class Affine {
  constructor(center, coeffs = {}) {
    this.center = center
    this.coeffs = coeffs // { noiseSymbolId: coefficient }
  }

  static fromInterval(lo, hi) {
    const center = (lo + hi) / 2
    const radius = (hi - lo) / 2
    const id = Affine.nextId++
    return new Affine(center, radius > 0 ? { [id]: radius } : {})
  }

  static variable(name, lo, hi) {
    return Affine.fromInterval(lo, hi)
  }

  add(other) {
    if (typeof other === 'number') return new Affine(this.center + other, { ...this.coeffs })
    const newCoeffs = { ...this.coeffs }
    for (const [id, c] of Object.entries(other.coeffs)) {
      newCoeffs[id] = (newCoeffs[id] || 0) + c
    }
    return new Affine(this.center + other.center, newCoeffs)
  }

  sub(other) {
    if (typeof other === 'number') return new Affine(this.center - other, { ...this.coeffs })
    const newCoeffs = { ...this.coeffs }
    for (const [id, c] of Object.entries(other.coeffs)) {
      newCoeffs[id] = (newCoeffs[id] || 0) - c
    }
    return new Affine(this.center - other.center, newCoeffs)
  }

  mul(other) {
    if (typeof other === 'number') {
      const newCoeffs = {}
      for (const [id, c] of Object.entries(this.coeffs)) newCoeffs[id] = c * other
      return new Affine(this.center * other, newCoeffs)
    }
    // Linear part
    const newCoeffs = {}
    for (const [id, c] of Object.entries(this.coeffs)) newCoeffs[id] = c * other.center
    for (const [id, c] of Object.entries(other.coeffs)) newCoeffs[id] = (newCoeffs[id] || 0) + c * this.center

    // Nonlinear part: new noise symbol
    let quadError = 0
    for (const c1 of Object.values(this.coeffs)) {
      for (const c2 of Object.values(other.coeffs)) {
        quadError += Math.abs(c1 * c2)
      }
    }
    if (quadError > 0) {
      const id = Affine.nextId++
      newCoeffs[id] = quadError
    }

    return new Affine(this.center * other.center, newCoeffs)
  }

  scale(s) {
    return this.mul(s)
  }

  // exp(â) ≈ affine approximation
  exp() {
    const lo = this.lower()
    const hi = this.upper()
    const expLo = Math.exp(lo)
    const expHi = Math.exp(hi)

    // Chebyshev linear approximation
    const a = (expHi - expLo) / (hi - lo + 1e-10)
    const alpha = a
    const beta = (expLo + expHi) / 2 - a * (lo + hi) / 2

    // Error bound
    const maxErr = (expHi - expLo) / 2 - a * (hi - lo) / 4

    const newCoeffs = {}
    for (const [id, c] of Object.entries(this.coeffs)) newCoeffs[id] = alpha * c

    if (maxErr > 0) {
      const newId = Affine.nextId++
      newCoeffs[newId] = maxErr
    }

    return new Affine(beta + alpha * this.center, newCoeffs)
  }

  lower() {
    let sum = 0
    for (const c of Object.values(this.coeffs)) sum += Math.abs(c)
    return this.center - sum
  }

  upper() {
    let sum = 0
    for (const c of Object.values(this.coeffs)) sum += Math.abs(c)
    return this.center + sum
  }

  radius() {
    let sum = 0
    for (const c of Object.values(this.coeffs)) sum += Math.abs(c)
    return sum
  }
}
Affine.nextId = 0

// Compute returns
const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Robust portfolio value with uncertain returns
const robustPortfolioValue = (weights, returns, uncertainties) => {
  let portfolio = new Affine(0)
  for (let i = 0; i < weights.length; i++) {
    const r = Affine.fromInterval(returns[i] - uncertainties[i], returns[i] + uncertainties[i])
    portfolio = portfolio.add(r.mul(weights[i]))
  }
  return portfolio
}

// Robust Black-Scholes with uncertain volatility
const robustOptionPrice = (S, K, T, r, sigmaLo, sigmaHi) => {
  // Simplified: use affine arithmetic for sigma
  const sigma = Affine.fromInterval(sigmaLo, sigmaHi)

  // d1 = (ln(S/K) + (r + σ²/2)T) / (σ√T)
  const sigmaVal = sigma.center
  const d1Center = (Math.log(S / K) + (r + sigmaVal * sigmaVal / 2) * T) / (sigmaVal * Math.sqrt(T))

  // Approximate option price range
  const sigmaLow = sigmaLo
  const sigmaHigh = sigmaHi
  const d1Low = (Math.log(S / K) + (r + sigmaLow * sigmaLow / 2) * T) / (sigmaLow * Math.sqrt(T))
  const d1High = (Math.log(S / K) + (r + sigmaHigh * sigmaHigh / 2) * T) / (sigmaHigh * Math.sqrt(T))

  // N(d1) approximation
  const normCdf = (x) => 0.5 * (1 + erf(x / Math.sqrt(2)))
  const erf = (x) => {
    const t = 1 / (1 + 0.3275911 * Math.abs(x))
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
    return x >= 0 ? y : -y
  }

  const priceLow = S * normCdf(d1Low) - K * Math.exp(-r * T) * normCdf(d1Low - sigmaLow * Math.sqrt(T))
  const priceHigh = S * normCdf(d1High) - K * Math.exp(-r * T) * normCdf(d1High - sigmaHigh * Math.sqrt(T))

  return {
    priceLo: Math.min(priceLow, priceHigh),
    priceHi: Math.max(priceLow, priceHigh),
    priceCenter: (priceLow + priceHigh) / 2,
    d1Center, d1Low, d1High,
  }
}

export default function AffineArithmetic({ candles, symbol, exchange }) {
  const [uncertaintyPct, setUncertaintyPct] = useState(0.5)
  const [lookback, setLookback] = useState(50)
  const [strikePct, setStrikePct] = useState(1.0)
  const [T_days, setT_days] = useState(30)
  const [riskFreeRate, setRiskFreeRate] = useState(0.05)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    const S0 = prices[prices.length - 1]
    const K = S0 * strikePct
    const T = T_days / 365

    // Estimate volatility
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length
    const stdR = Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length)
    const sigma = stdR * Math.sqrt(252)

    // Uncertainty bounds
    const sigmaUncertainty = sigma * uncertaintyPct / 100
    const sigmaLo = Math.max(0.01, sigma - sigmaUncertainty)
    const sigmaHi = sigma + sigmaUncertainty

    // Robust option pricing
    const option = robustOptionPrice(S0, K, T, riskFreeRate, sigmaLo, sigmaHi)

    // Interval arithmetic comparison (ignores correlations)
    const intervalPriceLo = Math.min(
      S0 * 0.5 * (1 + erf((option.d1Low) / Math.sqrt(2))) - K * Math.exp(-riskFreeRate * T) * 0.5 * (1 + erf((option.d1Low - sigmaLo * Math.sqrt(T)) / Math.sqrt(2))),
      S0 * 0.5 * (1 + erf((option.d1High) / Math.sqrt(2))) - K * Math.exp(-riskFreeRate * T) * 0.5 * (1 + erf((option.d1High - sigmaHi * Math.sqrt(T)) / Math.sqrt(2)))
    )

    // Robust portfolio: equal-weight with uncertain returns
    const recentRets = returns.slice(-20)
    const meanRecent = recentRets.reduce((a, b) => a + b, 0) / recentRets.length
    const stdRecent = Math.sqrt(recentRets.reduce((s, r) => s + (r - meanRecent) ** 2, 0) / recentRets.length)

    const retUncertainty = stdRecent * uncertaintyPct / 100
    const portfolio = robustPortfolioValue(
      [0.5, 0.5],
      [meanRecent, meanRecent * 0.8],
      [retUncertainty, retUncertainty * 1.2]
    )

    // Affine propagation through multiple operations
    Affine.nextId = 0
    const price = Affine.fromInterval(S0 * 0.99, S0 * 1.01)
    const quantity = Affine.fromInterval(0.95, 1.05)
    const positionValue = price.mul(quantity)
    const withReturn = positionValue.mul(Affine.fromInterval(1 + meanRecent - retUncertainty, 1 + meanRecent + retUncertainty))

    // Signal: uncertainty-adjusted
    const optionSpread = (option.priceHi - option.priceLo) / option.priceCenter
    let signal = 'NEUTRAL'
    let reason = ''
    if (optionSpread > 0.3) {
      signal = 'HIGH_UNCERTAINTY'
      reason = `Option price spread = ${(optionSpread * 100).toFixed(1)}% (high uncertainty)`
    } else if (optionSpread > 0.1) {
      signal = 'MODERATE_UNCERTAINTY'
      reason = `Option price spread = ${(optionSpread * 100).toFixed(1)}%`
    } else {
      signal = 'LOW_UNCERTAINTY'
      reason = `Option price spread = ${(optionSpread * 100).toFixed(1)}% (well-defined)`
    }

    return {
      S0, K, T, sigma, sigmaLo, sigmaHi, sigmaUncertainty,
      option, portfolio, positionValue, withReturn,
      signal, reason, optionSpread,
      meanRecent, stdRecent, retUncertainty,
    }
  }, [candles, exchange, symbol, uncertaintyPct, lookback, strikePct, T_days, riskFreeRate])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'HIGH_UNCERTAINTY' ? '#ef4444' : data.signal === 'MODERATE_UNCERTAINTY' ? '#f59e0b' : '#22c55e'

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Affine Arithmetic (Uncertainty Propagation) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Uncertainty (%):</span>
          <input type="number" step="5" value={uncertaintyPct} onChange={e => setUncertaintyPct(Math.max(0, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Strike (%):</span>
          <input type="number" step="0.05" value={strikePct} onChange={e => setStrikePct(Math.max(0.5, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">T (days):</span>
          <input type="number" value={T_days} onChange={e => setT_days(Math.max(1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">r (risk-free):</span>
          <input type="number" step="0.01" value={riskFreeRate} onChange={e => setRiskFreeRate(+e.target.value)} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(20, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Robust option price */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Robust Black-Scholes Option Price (uncertain σ)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {(() => {
            const minP = data.option.priceLo * 0.9
            const maxP = data.option.priceHi * 1.1
            const sy = (v) => H - P - ((v - minP) / (maxP - minP + 0.001)) * (H - 2 * P)
            const cx = W / 2

            return (
              <g>
                {/* Uncertainty interval */}
                <rect x={cx - 30} y={sy(data.option.priceHi)} width={60} height={sy(data.option.priceLo) - sy(data.option.priceHi)} fill="#06b6d4" opacity={0.2} />
                <line x1={cx - 30} y1={sy(data.option.priceHi)} x2={cx + 30} y2={sy(data.option.priceHi)} stroke="#06b6d4" strokeWidth={2} />
                <line x1={cx - 30} y1={sy(data.option.priceLo)} x2={cx + 30} y2={sy(data.option.priceLo)} stroke="#06b6d4" strokeWidth={2} />
                <line x1={cx} y1={sy(data.option.priceHi)} x2={cx} y2={sy(data.option.priceLo)} stroke="#06b6d4" strokeWidth={1} strokeDasharray="3,2" />

                {/* Center */}
                <circle cx={cx} cy={sy(data.option.priceCenter)} r={5} fill="#f59e0b" />

                {/* Labels */}
                <text x={cx + 40} y={sy(data.option.priceHi) + 4} fill="#06b6d4" fontSize={10}>Upper: ${data.option.priceHi.toFixed(4)}</text>
                <text x={cx + 40} y={sy(data.option.priceCenter) + 4} fill="#f59e0b" fontSize={10}>Center: ${data.option.priceCenter.toFixed(4)}</text>
                <text x={cx + 40} y={sy(data.option.priceLo) + 4} fill="#06b6d4" fontSize={10}>Lower: ${data.option.priceLo.toFixed(4)}</text>

                {/* Spread indicator */}
                <text x={cx - 100} y={H / 2} fill="#a855f7" fontSize={10}>Spread: {(data.optionSpread * 100).toFixed(1)}%</text>
              </g>
            )
          })()}
        </svg>
      </div>

      {/* Affine propagation chain */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Affine Propagation Chain</div>
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400 w-32">Price (±1%)</span>
            <span className="text-cyan-400 font-mono">[{data.positionValue.lower().toFixed(2)}, {data.positionValue.upper().toFixed(2)}]</span>
            <span className="text-slate-500">center={data.positionValue.center.toFixed(2)}, radius={data.positionValue.radius().toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400 w-32">× Quantity (±5%)</span>
            <span className="text-amber-400 font-mono">[{data.positionValue.lower().toFixed(2)}, {data.positionValue.upper().toFixed(2)}]</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400 w-32">× Return (±{uncertaintyPct}%)</span>
            <span className="text-purple-400 font-mono">[{data.withReturn.lower().toFixed(2)}, {data.withReturn.upper().toFixed(2)}]</span>
            <span className="text-slate-500">center={data.withReturn.center.toFixed(2)}, radius={data.withReturn.radius().toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400 w-32">Portfolio value</span>
            <span className="text-emerald-400 font-mono">[{data.portfolio.lower().toFixed(6)}, {data.portfolio.upper().toFixed(6)}]</span>
            <span className="text-slate-500">center={data.portfolio.center.toFixed(6)}, radius={data.portfolio.radius().toFixed(6)}</span>
          </div>
        </div>
      </div>

      {/* Volatility uncertainty */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Volatility Uncertainty Bounds</div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-400 w-24">σ estimate:</span>
          <span className="text-cyan-400 font-mono">{(data.sigma * 100).toFixed(2)}%</span>
          <span className="text-slate-400 w-24">σ range:</span>
          <span className="text-amber-400 font-mono">[{(data.sigmaLo * 100).toFixed(2)}%, {(data.sigmaHi * 100).toFixed(2)}%]</span>
          <span className="text-slate-400 w-24">Uncertainty:</span>
          <span className="text-purple-400 font-mono">±{(data.sigmaUncertainty * 100).toFixed(2)}%</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">S₀</div>
          <div className="text-cyan-400 font-mono">${data.S0.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">K (strike)</div>
          <div className="text-amber-400 font-mono">${data.K.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">σ (vol)</div>
          <div className="text-purple-400 font-mono">{(data.sigma * 100).toFixed(2)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Option spread</div>
          <div className="text-emerald-400 font-mono">{(data.optionSpread * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Noise symbols</div>
          <div className="text-slate-300 font-mono">{Affine.nextId}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Method:</strong> Affine form â = a₀ + Σ a_i·ε_i, ε_i ∈ [-1,1] |
        <strong> Advantage:</strong> Tracks correlations (vs interval arithmetic dependency problem) |
        <strong> Nonlinear:</strong> Chebyshev min-max approximation for exp()
      </div>
    </div>
  )
}
