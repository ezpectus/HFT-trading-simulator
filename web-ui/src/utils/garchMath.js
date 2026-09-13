// Volatility models: log returns, GARCH(1,1) MLE fit, EWMA, Parkinson.
// Extracted from GARCHVolatility.jsx — shared by the component and its tests.

// Log returns: r_t = ln(P_t / P_{t-1})
export function calcLogReturns(closes) {
  const returns = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]))
    }
  }
  return returns
}

// GARCH(1,1): σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}
// MLE via gradient descent on log-likelihood: L = -½ Σ [ln(σ²_t) + ε²_t/σ²_t]
// Persistence = α + β (stationarity requires < 1)
// Half-life of variance shocks: h = ln(0.5) / ln(α + β)
// Unconditional variance: ω / (1 - α - β)
export function calcGARCH(returns, _p = 1, _q = 1, maxIter = 100) {
  if (returns.length < 30) return null

  const n = returns.length
  const mean = returns.reduce((s, r) => s + r, 0) / n
  const centered = returns.map(r => r - mean)
  const variance0 = centered.reduce((s, r) => s + r * r, 0) / n

  let omega = variance0 * 0.1
  let alpha = 0.1
  let beta = 0.85

  const condVar = new Array(n).fill(variance0)

  for (let iter = 0; iter < maxIter; iter++) {
    const gradOmega = new Array(n).fill(0)
    const gradAlpha = new Array(n).fill(0)
    const gradBeta = new Array(n).fill(0)

    for (let i = 1; i < n; i++) {
      const prevVar = condVar[i - 1]
      const prevRet2 = centered[i - 1] * centered[i - 1]
      condVar[i] = omega + alpha * prevRet2 + beta * prevVar

      if (condVar[i] < 1e-10) condVar[i] = 1e-10

      const invVar = 1 / condVar[i]
      const resid = centered[i]
      const dVar_dOmega = 1 + beta * (i > 1 ? gradOmega[i - 1] : 0)
      const dVar_dAlpha = prevRet2 + beta * (i > 1 ? gradAlpha[i - 1] : 0)
      const dVar_dBeta = prevVar + beta * (i > 1 ? gradBeta[i - 1] : 0)

      gradOmega[i] = dVar_dOmega
      gradAlpha[i] = dVar_dAlpha
      gradBeta[i] = dVar_dBeta

      const factor = 0.5 * (invVar - invVar * invVar * resid * resid)
      omega += 0.01 * factor * dVar_dOmega
      alpha += 0.01 * factor * dVar_dAlpha
      beta += 0.01 * factor * dVar_dBeta

      omega = Math.max(1e-8, omega)
      alpha = Math.max(1e-6, Math.min(0.999, alpha))
      beta = Math.max(1e-6, Math.min(0.999, beta))

      if (alpha + beta > 0.999) {
        const scale = 0.999 / (alpha + beta)
        alpha *= scale
        beta *= scale
      }
    }
  }

  const forecast = omega + alpha * centered[n - 1] * centered[n - 1] + beta * condVar[n - 1]
  const persistence = alpha + beta
  const halfLife = persistence > 0 && persistence < 1 ? Math.log(0.5) / Math.log(persistence) : Infinity

  const volSeries = condVar.map(v => Math.sqrt(v) * Math.sqrt(252) * 100)

  return {
    omega, alpha, beta,
    persistence,
    halfLife,
    forecastVol: Math.sqrt(forecast) * Math.sqrt(252) * 100,
    currentVol: volSeries[volSeries.length - 1],
    volSeries,
    unconditionalVar: omega / (1 - persistence),
  }
}

// EWMA volatility: σ²_t = λ·σ²_{t-1} + (1-λ)·ε²_t
// λ (decay factor) = 0.94 (RiskMetrics default)
// Annualized: σ_annual = σ_daily × √252
export function calcEWMAVol(returns, lambda = 0.94) {
  if (returns.length < 10) return null
  const n = returns.length
  const mean = returns.reduce((s, r) => s + r, 0) / n
  const centered = returns.map(r => r - mean)

  let ewmaVar = centered[0] * centered[0]
  const volSeries = [Math.sqrt(ewmaVar) * Math.sqrt(252) * 100]

  for (let i = 1; i < n; i++) {
    ewmaVar = lambda * ewmaVar + (1 - lambda) * centered[i] * centered[i]
    volSeries.push(Math.sqrt(ewmaVar) * Math.sqrt(252) * 100)
  }

  return {
    lambda,
    currentVol: volSeries[volSeries.length - 1],
    volSeries,
  }
}

// Parkinson volatility (high-low estimator):
// σ² = (1 / (4·n·ln2)) · Σ ln²(H_t / L_t)
// Less biased than close-to-close, captures intraday range
// Annualized: σ_annual = σ_daily × √252
export function calcParkinsonVol(highs, lows, period = 20) {
  if (highs.length < period) return null
  const n = highs.length
  const volSeries = []

  for (let i = period - 1; i < n; i++) {
    let sumSq = 0
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > 0 && lows[j] > 0) {
        const hl = Math.log(highs[j] / lows[j])
        sumSq += hl * hl
      }
    }
    const parkVar = sumSq / (4 * period * Math.LN2)
    volSeries.push(Math.sqrt(parkVar) * Math.sqrt(252) * 100)
  }

  return {
    currentVol: volSeries[volSeries.length - 1],
    volSeries,
  }
}
