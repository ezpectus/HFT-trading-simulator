import React, { useMemo, useState } from 'react'

// --- Malliavin-Stein Sensitivity (Greeks via Integration by Parts) ---
// Combines Malliavin calculus with Stein's method to compute
// sensitivities (Greeks) of option prices without finite differences,
// using integration by parts on the Wiener space.
//
// Mathematical foundation:
//   Malliavin derivative: D_t F = derivative of F w.r.t. Brownian path at t
//   Skorohod integral: delta (adjoint of D)
//
//   Stein's identity: E[F(Z)g(Z)] = E[F'(Z)] for Z~N(0,1)
//
//   Integration by parts (Malliavin-Stein):
//   E[phi(F) * (D_t F / ||DF||^2)] = E[phi'(F)] (for suitable phi)
//
//   Delta: dC/dS = E[phi(C_T) * H_1] where H_1 = D_T C / sigma * S
//   Gamma: d^2C/dS^2 = E[phi(C_T) * H_2] (second-order IBP)
//
//   Advantage: no bias from finite differences, lower variance

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Box-Muller normal random
const randNormal = () => {
  const u1 = Math.random(), u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
}

// Monte Carlo option pricing with Malliavin-Stein Greeks
const priceAndGreeks = (S0, K, T, r, sigma, nSims, method) => {
  let priceSum = 0, deltaSum = 0, gammaSum = 0, vegaSum = 0
  let priceSqSum = 0, deltaSqSum = 0, gammaSqSum = 0
  const payoffs = []

  for (let s = 0; s < nSims; s++) {
    const Z = randNormal()
    const ST = S0 * Math.exp((r - 0.5 * sigma * sigma) * T + sigma * Math.sqrt(T) * Z)

    // Call payoff
    const payoff = Math.max(ST - K, 0)
    const discounted = Math.exp(-r * T) * payoff
    priceSum += discounted
    priceSqSum += discounted * discounted
    payoffs.push(discounted)

    if (method === 'malliavin') {
      // Malliavin-Stein integration by parts
      // D_T ST = ST * sigma (Malliavin derivative of terminal price)
      // ||D ST||^2 = sigma^2 * ST^2 * T
      // Delta = E[exp(-rT) * phi(ST) * Z / (S0 * sigma * sqrt(T))]
      const weight = Z / (S0 * sigma * Math.sqrt(T))
      const deltaWeight = discounted * weight
      deltaSum += deltaWeight
      deltaSqSum += deltaWeight * deltaWeight

      // Gamma (second-order IBP)
      // Gamma = E[exp(-rT) * phi(ST) * (Z^2 - 1) / (S0^2 * sigma^2 * T)]
      const gammaWeight = discounted * (Z * Z - 1) / (S0 * S0 * sigma * sigma * T)
      gammaSum += gammaWeight
      gammaSqSum += gammaWeight * gammaWeight

      // Vega
      const vegaWeight = discounted * Z * Math.sqrt(T) / sigma
      vegaSum += vegaWeight
    } else {
      // Finite difference (for comparison)
      const dS = S0 * 0.01
      const ST_up = (S0 + dS) * Math.exp((r - 0.5 * sigma * sigma) * T + sigma * Math.sqrt(T) * Z)
      const ST_dn = (S0 - dS) * Math.exp((r - 0.5 * sigma * sigma) * T + sigma * Math.sqrt(T) * Z)
      const deltaFD = (Math.exp(-r * T) * (Math.max(ST_up - K, 0) - Math.max(ST_dn - K, 0))) / (2 * dS)
      deltaSum += deltaFD
      deltaSqSum += deltaFD * deltaFD

      const gammaFD = (Math.exp(-r * T) * (Math.max(ST_up - K, 0) - 2 * payoff + Math.max(ST_dn - K, 0))) / (dS * dS)
      gammaSum += gammaFD
      gammaSqSum += gammaFD * gammaFD
    }
  }

  const price = priceSum / nSims
  const delta = deltaSum / nSims
  const gamma = gammaSum / nSims
  const vega = method === 'malliavin' ? vegaSum / nSims : 0

  // Standard errors
  const priceSE = Math.sqrt(Math.max(0, (priceSqSum / nSims - price * price)) / nSims)
  const deltaSE = Math.sqrt(Math.max(0, (deltaSqSum / nSims - delta * delta)) / nSims)
  const gammaSE = Math.sqrt(Math.max(0, (gammaSqSum / nSims - gamma * gamma)) / nSims)

  // Black-Scholes analytical
  const d1 = (Math.log(S0 / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)
  const bsPrice = S0 * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2)
  const bsDelta = normalCDF(d1)
  const bsGamma = normalPDF(d1) / (S0 * sigma * Math.sqrt(T))
  const bsVega = S0 * normalPDF(d1) * Math.sqrt(T)

  return {
    price, delta, gamma, vega,
    priceSE, deltaSE, gammaSE,
    bsPrice, bsDelta, bsGamma, bsVega,
    payoffs,
  }
}

const normalPDF = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return x >= 0 ? y : -y
}
const normalCDF = (x) => 0.5 * (1 + erf(x / Math.sqrt(2)))

export default function MalliavinSteinSensitivity({ candles, symbol, exchange }) {
  const [lookback] = useState(100)
  const [nSims, setNSims] = useState(10000)
  const [K, setK] = useState(1.0)
  const [T, setT] = useState(0.25)
  const [r, setR] = useState(0.05)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    const S0 = prices[prices.length - 1]
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length
    const stdR = Math.sqrt(returns.reduce((s, v) => s + (v - meanR) ** 2, 0) / returns.length)
    const sigma = stdR * Math.sqrt(252) // annualized

    // Malliavin-Stein method
    const ms = priceAndGreeks(S0, K, T, r, sigma, nSims, 'malliavin')
    // Finite difference method
    const fd = priceAndGreeks(S0, K, T, r, sigma, nSims, 'fd')

    // Strike sweep
    const strikeSweep = []
    const strikes = [0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2].map(k => k * S0)
    for (const k of strikes) {
      const msK = priceAndGreeks(S0, k, T, r, sigma, Math.min(5000, nSims), 'malliavin')
      const fdK = priceAndGreeks(S0, k, T, r, sigma, Math.min(5000, nSims), 'fd')
      strikeSweep.push({
        K: k,
        msDelta: msK.delta, fdDelta: fdK.delta, bsDelta: msK.bsDelta,
        msGamma: msK.gamma, fdGamma: fdK.gamma, bsGamma: msK.bsGamma,
        msDeltaSE: msK.deltaSE, fdDeltaSE: fdK.deltaSE,
        msGammaSE: msK.gammaSE, fdGammaSE: fdK.gammaSE,
      })
    }

    // Efficiency comparison
    const deltaEfficiency = (fd.deltaSE * fd.deltaSE) / (ms.deltaSE * ms.deltaSE + 1e-20)
    const gammaEfficiency = (fd.gammaSE * fd.gammaSE) / (ms.gammaSE * ms.gammaSE + 1e-20)

    // Signal
    let signal = 'GREEKS_VALID'
    let reason = ''
    const deltaErr = Math.abs(ms.delta - ms.bsDelta)
    const gammaErr = Math.abs(ms.gamma - ms.bsGamma)
    if (deltaErr > 0.1) {
      signal = 'DELTA_MISMATCH'
      reason = `Malliavin delta error: ${deltaErr.toFixed(4)} (MC noise, increase nSims)`
    } else if (gammaErr > 0.1) {
      signal = 'GAMMA_NOISY'
      reason = `Malliavin gamma error: ${gammaErr.toFixed(4)} (high variance, increase nSims)`
    } else {
      reason = `Greeks match BS: delta err=${deltaErr.toFixed(4)}, gamma err=${gammaErr.toFixed(4)}, efficiency gain x${deltaEfficiency.toFixed(1)}`
    }

    return {
      S0, sigma, ms, fd,
      strikeSweep, deltaEfficiency, gammaEfficiency,
      signal, reason,
    }
  }, [candles, exchange, symbol, lookback, nSims, K, T, r])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'GREEKS_VALID' ? '#22c55e' : data.signal === 'DELTA_MISMATCH' ? '#ef4444' : '#f59e0b'

  // Delta vs strike
  const allDeltas = data.strikeSweep.flatMap(s => [s.msDelta, s.fdDelta, s.bsDelta])
  const maxDelta = Math.max(...allDeltas, 0.1)
  const minDelta = Math.min(...allDeltas, -0.1)
  const sxK = (i) => P + (i / data.strikeSweep.length) * (W - 2 * P)
  const syDelta = (v) => H - P - ((v - minDelta) / (maxDelta - minDelta + 0.001)) * (H - 2 * P)

  // Gamma vs strike
  const allGammas = data.strikeSweep.flatMap(s => [s.msGamma, s.fdGamma, s.bsGamma])
  const maxGamma = Math.max(...allGammas, 0.1)
  const minGamma = Math.min(...allGammas, 0)
  const syGamma = (v) => H - P - ((v - minGamma) / (maxGamma - minGamma + 0.001)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Malliavin-Stein Sensitivity (Greeks via IBP) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">K (strike):</span>
          <input type="number" step="0.05" value={K} onChange={e => setK(Math.max(0.01, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">T (expiry):</span>
          <input type="number" step="0.05" value={T} onChange={e => setT(Math.max(0.01, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">r (rate):</span>
          <input type="number" step="0.01" value={r} onChange={e => setR(+e.target.value)} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Sims:</span>
          <input type="number" value={nSims} onChange={e => setNSims(Math.max(1000, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Delta comparison */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Delta dC/dK: Malliavin-Stein (IBP) vs Finite Difference vs Black-Scholes</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* BS analytical */}
          <path d={data.strikeSweep.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxK(i)} ${syDelta(s.bsDelta)}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth={2.5} />

          {/* Malliavin-Stein */}
          <path d={data.strikeSweep.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxK(i)} ${syDelta(s.msDelta)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="4,2" />

          {/* Finite difference */}
          <path d={data.strikeSweep.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxK(i)} ${syDelta(s.fdDelta)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="2,2" />

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>BS analytical</text>
          <text x={W - P} y={34} textAnchor="end" fill="#06b6d4" fontSize={9}>Malliavin-Stein (IBP)</text>
          <text x={W - P} y={48} textAnchor="end" fill="#ef4444" fontSize={9}>Finite difference</text>
        </svg>
      </div>

      {/* Gamma comparison */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Gamma d^2C/dK^2: Malliavin-Stein vs Finite Difference vs Black-Scholes</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.strikeSweep.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxK(i)} ${syGamma(s.bsGamma)}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth={2.5} />
          <path d={data.strikeSweep.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxK(i)} ${syGamma(s.msGamma)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="4,2" />
          <path d={data.strikeSweep.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxK(i)} ${syGamma(s.fdGamma)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="2,2" />

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>BS analytical</text>
          <text x={W - P} y={34} textAnchor="end" fill="#06b6d4" fontSize={9}>Malliavin-Stein (IBP)</text>
          <text x={W - P} y={48} textAnchor="end" fill="#ef4444" fontSize={9}>Finite difference</text>
        </svg>
      </div>

      {/* Standard error comparison */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Standard Error Comparison (Malliavin-Stein vs Finite Difference)</div>
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400 w-16">Delta SE</span>
            <span className="text-cyan-400 font-mono w-24">MS: {data.ms.deltaSE.toFixed(6)}</span>
            <span className="text-red-400 font-mono w-24">FD: {data.fd.deltaSE.toFixed(6)}</span>
            <span className="text-emerald-400 font-mono">efficiency: {data.deltaEfficiency.toFixed(1)}x</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400 w-16">Gamma SE</span>
            <span className="text-cyan-400 font-mono w-24">MS: {data.ms.gammaSE.toFixed(6)}</span>
            <span className="text-red-400 font-mono w-24">FD: {data.fd.gammaSE.toFixed(6)}</span>
            <span className="text-emerald-400 font-mono">efficiency: {data.gammaEfficiency.toFixed(1)}x</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">MS Delta</div>
          <div className="text-cyan-400 font-mono">{data.ms.delta.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">BS Delta</div>
          <div className="text-emerald-400 font-mono">{data.ms.bsDelta.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">MS Gamma</div>
          <div className="text-cyan-400 font-mono">{data.ms.gamma.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">BS Gamma</div>
          <div className="text-emerald-400 font-mono">{data.ms.bsGamma.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">S0 / sigma</div>
          <div className="text-amber-400 font-mono">{data.S0.toFixed(2)} / {data.sigma.toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Malliavin-Stein:</strong> E[phi(F) * D_tF/||DF||^2] = E[phi'(F)] (integration by parts) |
        <strong> Delta:</strong> weight = Z / (S0 * sigma * sqrt(T)) |
        <strong> Gamma:</strong> weight = (Z^2-1) / (S0^2 * sigma^2 * T) |
        <strong> Advantage:</strong> no finite-difference bias, variance reduction
      </div>
    </div>
  )
}
