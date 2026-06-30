import React, { useMemo, useState } from 'react'

// ─── Bayesian Structural Time Series (BSTS) ─────────────────────────────────
// State-space model with Kalman filter for decomposing time series into
// trend, seasonality, regression, and irregular components.
//
// Mathematical foundation:
//   State equation: x_t = T·x_{t-1} + R·η_t,  η_t ~ N(0, Q)
//   Observation: y_t = Z·x_t + ε_t,  ε_t ~ N(0, H)
//
//   Local linear trend:
//   μ_t = μ_{t-1} + δ_{t-1} + η^μ_t
//   δ_t = δ_{t-1} + η^δ_t
//
//   Kalman filter:
//   Prediction: x_{t|t-1} = T·x_{t-1|t-1}, P_{t|t-1} = T·P_{t-1|t-1}·Tᵀ + R·Q·Rᵀ
//   Update: x_{t|t} = x_{t|t-1} + K_t·(y_t - Z·x_{t|t-1})
//   K_t = P_{t|t-1}·Zᵀ / (Z·P_{t|t-1}·Zᵀ + H)
//   P_{t|t} = (I - K_t·Z)·P_{t|t-1}
//
//   Log-likelihood: Σ log N(y_t | Z·x_{t|t-1}, F_t)

const kalmanFilterBSTS = (y, params) => {
  const { sigmaLevel, sigmaSlope, sigmaSeasonal, sigmaIrregular, period } = params
  const n = y.length

  // State: [level, slope, seasonal_1, ..., seasonal_{period-1}]
  const stateDim = 2 + (period - 1)
  const T = Array.from({ length: stateDim }, () => new Array(stateDim).fill(0))

  // Trend transition
  T[0][0] = 1; T[0][1] = 1  // level = level + slope
  T[1][1] = 1               // slope = slope (random walk)

  // Seasonal transition (dummy seasonal)
  for (let i = 2; i < stateDim - 1; i++) T[i][i + 1] = 1
  if (stateDim > 2) {
    for (let i = 2; i < stateDim; i++) T[stateDim - 1][i] = -1
  }

  // Observation matrix
  const Z = new Array(stateDim).fill(0)
  Z[0] = 1 // level
  if (stateDim > 2) Z[2] = 1 // seasonal

  // Process noise
  const Q = Array.from({ length: stateDim }, () => new Array(stateDim).fill(0))
  Q[0][0] = sigmaLevel * sigmaLevel
  Q[1][1] = sigmaSlope * sigmaSlope
  for (let i = 2; i < stateDim; i++) Q[i][i] = sigmaSeasonal * sigmaSeasonal

  const H = sigmaIrregular * sigmaIrregular

  // Initialize
  let x = new Array(stateDim).fill(0)
  x[0] = y[0] || 0
  let P = Array.from({ length: stateDim }, (_, i) => Array.from({ length: stateDim }, (_, j) => i === j ? 1e6 : 0))

  const filtered = []
  const trend = []
  const slope = []
  const seasonal = []
  const logLik = []

  for (let t = 0; t < n; t++) {
    // Prediction
    const xPred = new Array(stateDim).fill(0)
    for (let i = 0; i < stateDim; i++) {
      for (let j = 0; j < stateDim; j++) xPred[i] += T[i][j] * x[j]
    }

    const PPred = Array.from({ length: stateDim }, () => new Array(stateDim).fill(0))
    for (let i = 0; i < stateDim; i++) {
      for (let j = 0; j < stateDim; j++) {
        for (let k = 0; k < stateDim; k++) PPred[i][j] += T[i][k] * P[k][j]
        PPred[i][j] += Q[i][j]
      }
    }

    // Prediction error
    const yPred = Z.reduce((s, z, i) => s + z * xPred[i], 0)
    const v = y[t] - yPred

    // Prediction variance
    let F = 0
    for (let i = 0; i < stateDim; i++) for (let j = 0; j < stateDim; j++) F += Z[i] * PPred[i][j] * Z[j]
    F += H

    // Kalman gain
    const K = new Array(stateDim).fill(0)
    for (let i = 0; i < stateDim; i++) {
      for (let j = 0; j < stateDim; j++) K[i] += PPred[i][j] * Z[j]
      K[i] = F > 0 ? K[i] / F : 0
    }

    // Update
    for (let i = 0; i < stateDim; i++) x[i] = xPred[i] + K[i] * v

    for (let i = 0; i < stateDim; i++) {
      for (let j = 0; j < stateDim; j++) {
        P[i][j] = PPred[i][j] - K[i] * Z[j] * PPred[i][j] // simplified
      }
    }

    // Log-likelihood
    if (F > 0) {
      logLik.push(-0.5 * (Math.log(2 * Math.PI * F) + (v * v) / F))
    }

    filtered.push(yPred)
    trend.push(x[0])
    slope.push(x[1])
    seasonal.push(stateDim > 2 ? x[2] : 0)
  }

  // Forecast
  const forecasts = []
  let xForecast = x.slice()
  for (let h = 1; h <= 10; h++) {
    const xNext = new Array(stateDim).fill(0)
    for (let i = 0; i < stateDim; i++) {
      for (let j = 0; j < stateDim; j++) xNext[i] += T[i][j] * xForecast[j]
    }
    xForecast = xNext
    const yForecast = Z.reduce((s, z, i) => s + z * xForecast[i], 0)
    forecasts.push(yForecast)
  }

  const totalLogLik = logLik.reduce((a, b) => a + b, 0)

  return { filtered, trend, slope, seasonal, forecasts, totalLogLik }
}

// Optimize variance parameters via grid search
const optimizeBSTS = (y, period) => {
  let best = { sigmaLevel: 0.1, sigmaSlope: 0.01, sigmaSeasonal: 0.05, sigmaIrregular: 0.1, period, logLik: -Infinity }

  for (let sl = 0.01; sl <= 0.5; sl += 0.05) {
    for (let ss = 0.001; ss <= 0.1; ss += 0.01) {
      for (let si = 0.01; si <= 0.3; si += 0.03) {
        const params = { sigmaLevel: sl, sigmaSlope: ss, sigmaSeasonal: 0.05, sigmaIrregular: si, period }
        const { totalLogLik } = kalmanFilterBSTS(y, params)
        if (totalLogLik > best.logLik) {
          best = { ...params, logLik: totalLogLik }
        }
      }
    }
  }

  return best
}

export default function BayesianStructuralTimeSeries({ candles, symbol, exchange }) {
  const [period, setPeriod] = useState(7)
  const [lookback, setLookback] = useState(100)
  const [autoOptimize, setAutoOptimize] = useState(true)
  const [sigmaLevel, setSigmaLevel] = useState(0.1)
  const [sigmaIrregular, setSigmaIrregular] = useState(0.1)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)

    // Use log prices for stability
    const logPrices = prices.map(p => Math.log(Math.max(0.01, p)))

    let params = { sigmaLevel, sigmaSlope: 0.01, sigmaSeasonal: 0.05, sigmaIrregular, period }
    if (autoOptimize) {
      params = optimizeBSTS(logPrices, period)
      setSigmaLevel(params.sigmaLevel)
      setSigmaIrregular(params.sigmaIrregular)
    }

    const result = kalmanFilterBSTS(logPrices, params)

    // Convert back from log
    const trendExp = result.trend.map(Math.exp)
    const filteredExp = result.filtered.map(Math.exp)
    const seasonalExp = result.seasonal.map(Math.exp)
    const forecastsExp = result.forecasts.map(Math.exp)

    // Residuals
    const residuals = logPrices.map((lp, i) => lp - result.filtered[i])

    // Forecast signal
    const currentPrice = prices[prices.length - 1]
    const forecastPrice = forecastsExp[0]
    const forecastReturn = (forecastPrice - currentPrice) / currentPrice

    let signal = 'NEUTRAL'
    if (forecastReturn > 0.005) signal = 'BUY'
    else if (forecastReturn < -0.005) signal = 'SELL'

    // Component contributions
    const trendContribution = trendExp[trendExp.length - 1] - currentPrice
    const seasonalContribution = seasonalExp[seasonalExp.length - 1]

    return {
      ...result,
      prices, trendExp, filteredExp, seasonalExp, forecastsExp,
      residuals, params, currentPrice, forecastPrice, forecastReturn,
      signal, trendContribution, seasonalContribution,
    }
  }, [candles, exchange, symbol, period, lookback, autoOptimize, sigmaLevel, sigmaIrregular])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'

  // Price + trend + forecast
  const allPrices = [...data.prices, ...data.forecastsExp]
  const minP = Math.min(...allPrices), maxP = Math.max(...allPrices)
  const sxP = (i) => P + (i / (allPrices.length - 1)) * (W - 2 * P)
  const syP = (p) => H - P - ((p - minP) / (maxP - minP + 0.001)) * (H - 2 * P)

  // Seasonal component
  const maxSeasonal = Math.max(...data.seasonalExp.map(Math.abs), 0.01)
  const syS = (v) => H / 2 - (Math.log(Math.max(0.01, v)) / maxSeasonal) * (H / 2 - P)

  // Residuals
  const maxRes = Math.max(...data.residuals.map(Math.abs), 0.001)
  const syR = (v) => H / 2 - (v / maxRes) * (H / 2 - P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Bayesian Structural Time Series — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Seasonal period:</span>
          <input type="number" value={period} onChange={e => setPeriod(Math.max(2, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(30, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={autoOptimize} onChange={e => setAutoOptimize(e.target.checked)} />
          <span className="text-slate-400">Auto-optimize</span>
        </label>
      </div>

      {/* Price decomposition: trend + forecast */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Price + Trend + Forecast (10-step ahead)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Actual price */}
          <path d={data.prices.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sxP(i)} ${syP(p)}`).join(' ')} fill="none" stroke="#64748b" strokeWidth={1.5} opacity={0.7} />

          {/* Trend (filtered) */}
          <path d={data.trendExp.map((t, i) => `${i === 0 ? 'M' : 'L'} ${sxP(i)} ${syP(t)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {/* Forecast */}
          <line x1={sxP(data.prices.length - 1)} y1={P} x2={sxP(data.prices.length - 1)} y2={H - P} stroke="#475569" strokeDasharray="4,3" />
          <path d={data.forecastsExp.map((f, i) => `${i === 0 ? 'M' : 'L'} ${sxP(data.prices.length - 1 + i)} ${syP(f)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4,2" />

          {/* Forecast points */}
          {data.forecastsExp.map((f, i) => (
            <circle key={i} cx={sxP(data.prices.length - 1 + i)} cy={syP(f)} r={3} fill="#f59e0b" />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#64748b" fontSize={9}>Actual</text>
          <text x={W - P} y={34} textAnchor="end" fill="#06b6d4" fontSize={9}>Trend (Kalman)</text>
          <text x={W - P} y={48} textAnchor="end" fill="#f59e0b" fontSize={9}>Forecast</text>
        </svg>
      </div>

      {/* Seasonal component */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Seasonal Component (period = {period})</div>
        <svg width={W} height={120} className="bg-slate-900 rounded">
          <line x1={P} y1={60} x2={W - P} y2={60} stroke="#334155" />
          <path d={data.seasonalExp.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxP(i)} ${60 - (Math.log(s) * 100)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={1.5} />
        </svg>
      </div>

      {/* Residuals */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Residuals (irregular component)</div>
        <svg width={W} height={120} className="bg-slate-900 rounded">
          <line x1={P} y1={60} x2={W - P} y2={60} stroke="#334155" />
          {data.residuals.map((r, i) => (
            <line key={i} x1={sxP(i)} y1={60} x2={sxP(i)} y2={60 - r * 500} stroke={r > 0 ? '#22c55e' : '#ef4444'} strokeWidth={1} opacity={0.6} />
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Log-likelihood</div>
          <div className="text-cyan-400 font-mono">{data.totalLogLik.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">σ_level</div>
          <div className="text-amber-400 font-mono">{data.params.sigmaLevel.toFixed(3)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">σ_irregular</div>
          <div className="text-purple-400 font-mono">{data.params.sigmaIrregular.toFixed(3)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Forecast</div>
          <div className="text-emerald-400 font-mono">${data.forecastPrice.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Pred return</div>
          <div className="font-mono" style={{ color: sigColor }}>{(data.forecastReturn * 100).toFixed(3)}%</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Model:</strong> Local linear trend + seasonal (period={period}) |
        <strong> State:</strong> [level, slope, seasonal₁...seasonal_{period - 1}] |
        <strong> Kalman:</strong> prediction → update cycle |
        <strong> Current:</strong> ${data.currentPrice.toFixed(2)} → ${data.forecastPrice.toFixed(2)}
      </div>
    </div>
  )
}
