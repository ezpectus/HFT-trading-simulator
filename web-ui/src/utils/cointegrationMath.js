// Cointegration math (Engle-Granger): OLS, ADF, half-life, correlation.
// Extracted from CointegrationScanner.jsx — shared by the component and its tests.

// Augmented Dickey-Fuller (ADF) test on OLS residuals:
// Δε_t = ρ·ε_{t-1} + u_t,  H0: ρ = 0 (unit root, not cointegrated)
// t-statistic = ρ / SE(ρ), compare to critical values
// If t < -2.86 (5% level), reject H0 → residuals stationary → cointegrated
export function calcADF(residuals) {
  if (residuals.length < 30) return null
  const n = residuals.length
  const lag = 1

  const deltaY = []
  const lagY = []
  for (let i = lag; i < n; i++) {
    deltaY.push(residuals[i] - residuals[i - 1])
    lagY.push(residuals[i - 1])
  }

  const m = deltaY.length
  const meanY = deltaY.reduce((s, v) => s + v, 0) / m
  const meanLag = lagY.reduce((s, v) => s + v, 0) / m

  let num = 0, den = 0
  for (let i = 0; i < m; i++) {
    num += (lagY[i] - meanLag) * (deltaY[i] - meanY)
    den += (lagY[i] - meanLag) ** 2
  }
  const rho = den > 0 ? num / den : 0

  const residuals2 = []
  for (let i = 0; i < m; i++) {
    residuals2.push(deltaY[i] - meanY - rho * (lagY[i] - meanLag))
  }
  const rss = residuals2.reduce((s, v) => s + v * v, 0)
  const se = den > 0 ? Math.sqrt(rss / (m - 2) / den) : 0
  const tStat = se > 0 ? rho / se : 0

  const criticalValues = { '1%': -3.43, '5%': -2.86, '10%': -2.57 }
  let isStationary = false
  let significance = 'none'
  if (tStat < criticalValues['1%']) { isStationary = true; significance = '99%' }
  else if (tStat < criticalValues['5%']) { isStationary = true; significance = '95%' }
  else if (tStat < criticalValues['10%']) { isStationary = true; significance = '90%' }

  return { tStat, criticalValues, isStationary, significance, rho }
}

// Half-life of mean reversion (Ornstein-Uhlenbeck):
// Δε_t = φ·ε_{t-1} + u_t,  half-life = -ln(2) / ln(1 + φ)
// φ < 0 → mean-reverting; φ ≥ 0 → no mean reversion (half-life = ∞)
export function calcHalfLife(residuals) {
  if (residuals.length < 20) return null
  const n = residuals.length
  const deltaY = []
  const lagY = []
  for (let i = 1; i < n; i++) {
    deltaY.push(residuals[i] - residuals[i - 1])
    lagY.push(residuals[i - 1])
  }
  const m = deltaY.length
  const meanY = deltaY.reduce((s, v) => s + v, 0) / m
  const meanLag = lagY.reduce((s, v) => s + v, 0) / m

  let num = 0, den = 0
  for (let i = 0; i < m; i++) {
    num += (lagY[i] - meanLag) * (deltaY[i] - meanY)
    den += (lagY[i] - meanLag) ** 2
  }
  const phi = den > 0 ? num / den : 0

  if (phi >= 0) return Infinity
  const halfLife = -Math.log(2) / Math.log(1 + phi)
  return Math.max(0, halfLife)
}

// Engle-Granger Step 1: OLS regression y = α + β·x + ε
// ε_t = y_t - (α + β·x_t)  → residuals for ADF test
// R² = 1 - SS_res/SS_tot,  Z-score = ε_last / σ_ε
export function linearRegression(y, x) {
  const n = Math.min(y.length, x.length)
  if (n < 5) return null

  const meanX = x.slice(0, n).reduce((s, v) => s + v, 0) / n
  const meanY = y.slice(0, n).reduce((s, v) => s + v, 0) / n

  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (x[i] - meanX) * (y[i] - meanY)
    den += (x[i] - meanX) ** 2
  }
  const beta = den > 0 ? num / den : 0
  const alpha = meanY - beta * meanX

  const residuals = []
  for (let i = 0; i < n; i++) {
    residuals.push(y[i] - (alpha + beta * x[i]))
  }

  const ssRes = residuals.reduce((s, v) => s + v * v, 0)
  const ssTot = y.slice(0, n).reduce((s, v) => s + (v - meanY) ** 2, 0)
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0

  const stdResidual = Math.sqrt(ssRes / Math.max(n - 2, 1))
  const zScore = stdResidual > 0 ? residuals[residuals.length - 1] / stdResidual : 0

  return { alpha, beta, residuals, rSquared, stdResidual, zScore, n }
}

// Pearson correlation: ρ = Cov(A,B) / (σ_A · σ_B)
export function calcCorrelation(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 5) return 0
  const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n
  const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n
  let num = 0, denA = 0, denB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    num += da * db
    denA += da * da
    denB += db * db
  }
  const den = Math.sqrt(denA * denB)
  return den > 0 ? num / den : 0
}
