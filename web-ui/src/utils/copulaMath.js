// ─── Copula math — extracted from CopulaModel.jsx (S015) ─────────────────────
// Pure numerical functions: empirical/parametric copulas, rank correlations,
// special functions (erf, normInv, incomplete beta, logGamma, tCDF).
//
// Mathematical foundation:
//   Sklar's theorem: F(x,y) = C(F_X(x), F_Y(y))
//   Copula: C(u,v) = joint CDF on [0,1]² unit square
//   Kendall's τ = 4∫∫C(u,v)dC(u,v) - 1
//   Tail dependence: λ_L = lim P(U<u | V<u) as u→0
//                    λ_U = lim P(U>u | V>u) as u→1
//
//   Clayton: C(u,v) = (u^(-θ) + v^(-θ) - 1)^(-1/θ)
//           τ = θ/(θ+2), λ_L = 2^(-1/θ), λ_U = 0
//
//   Gumbel: C(u,v) = exp(-[(-ln u)^θ + (-ln v)^θ]^(1/θ))
//          τ = (θ-1)/θ, λ_U = 2 - 2^(1/θ), λ_L = 0
//
//   Gaussian: C(u,v) = Φ_ρ(Φ⁻¹(u), Φ⁻¹(v))
//            τ = (2/π)arcsin(ρ), λ_L = λ_U = 0


// Empirical CDF (rank-based)
export const empiricalCDF = (values) => {
  const n = values.length
  return values.map(v => {
    const count = values.filter(x => x <= v).length
    return count / (n + 1)
  })
}

// Inverse normal CDF (Beasley-Springer-Moro approximation)
export const normInv = (p) => {
  if (p <= 0) return -10
  if (p >= 1) return 10
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01]
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161247e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]
  const plow = 0.02425
  const phigh = 1 - plow
  let q, r
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
  } else if (p <= phigh) {
    q = p - 0.5
    r = q * q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
  }
}

// Normal CDF
export const normCDF = (x) => 0.5 * (1 + erf(x / Math.SQRT2))

// Error function approximation
export function erf(x) {
  const sign = x >= 0 ? 1 : -1
  x = Math.abs(x)
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return sign * y
}

// Kendall's tau
export const kendallTau = (x, y) => {
  const n = x.length
  let concordant = 0, discordant = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j]
      const dy = y[i] - y[j]
      if (dx * dy > 0) concordant++
      else if (dx * dy < 0) discordant++
    }
  }
  const total = n * (n - 1) / 2
  return total > 0 ? (concordant - discordant) / total : 0
}

// Spearman's rho
export const spearmanRho = (x, y) => {
  const n = x.length
  const rankX = x.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v).map((o, i) => ({ ...o, r: i + 1 }))
  const rankY = y.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v).map((o, i) => ({ ...o, r: i + 1 }))
  const rx = new Array(n), ry = new Array(n)
  rankX.forEach(o => rx[o.i] = o.r)
  rankY.forEach(o => ry[o.i] = o.r)
  const meanR = (n + 1) / 2
  let num = 0, denX = 0, denY = 0
  for (let i = 0; i < n; i++) {
    num += (rx[i] - meanR) * (ry[i] - meanR)
    denX += (rx[i] - meanR) ** 2
    denY += (ry[i] - meanR) ** 2
  }
  return denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : 0
}

// Clayton copula CDF
export const claytonCDF = (u, v, theta) => {
  if (theta <= 0) return u * v
  return Math.max(0, Math.pow(Math.pow(u, -theta) + Math.pow(v, -theta) - 1, -1 / theta))
}

// Gumbel copula CDF
export const gumbelCDF = (u, v, theta) => {
  if (theta <= 1) return u * v
  const lu = -Math.log(u), lv = -Math.log(v)
  return Math.exp(-Math.pow(Math.pow(lu, theta) + Math.pow(lv, theta), 1 / theta))
}

// Gaussian copula CDF (bivariate normal)
export const gaussianCopulaCDF = (u, v, rho) => {
  const x = normInv(u), y = normInv(v)
  return bivariateNormalCDF(x, y, rho)
}

// Drezner-Priestley bivariate normal CDF
export function bivariateNormalCDF(h, k, r) {
  if (Math.abs(r) > 0.9999) r = r > 0 ? 0.9999 : -0.9999
  const x = [0.04691008, 0.23076534, 0.5, 0.76923466, 0.95308992]
  const w = [0.018854042, 0.038088059, 0.0452707394, 0.038088059, 0.018854042]
  const h2 = h / Math.sqrt(2)
  const k2 = k / Math.sqrt(2)
  const r2 = (1 + r) / 2
  let sum = 0
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const xi = x[i]
      const xj = x[j]
      sum += w[i] * w[j] * Math.exp(h2 * Math.sqrt(2) * xi + k2 * Math.sqrt(2) * xj + r2 * 2 * xi * xj)
    }
  }
  return normCDF(h) * normCDF(k) + Math.sqrt(1 - r * r) / (2 * Math.PI) * sum
}

// Fit copula parameters from Kendall's tau
export const fitCopula = (tau) => {
  // Clayton: θ = 2τ/(1-τ)
  const claytonTheta = tau >= 1 ? 100 : tau <= -1 ? -100 : 2 * tau / (1 - tau)

  // Gumbel: θ = 1/(1-τ)
  const gumbelTheta = tau >= 1 ? 100 : 1 / (1 - tau)

  // Gaussian: ρ = sin(πτ/2)
  const gaussRho = Math.sin(Math.PI * tau / 2)

  // Student-t: same ρ as Gaussian, df estimated separately (use 5 as default)
  const tRho = gaussRho
  const tDf = 5

  // Tail dependence
  const claytonLower = claytonTheta > 0 ? Math.pow(2, -1 / claytonTheta) : 0
  const claytonUpper = 0
  const gumbelUpper = gumbelTheta > 1 ? 2 - Math.pow(2, 1 / gumbelTheta) : 0
  const gumbelLower = 0
  const gaussLower = 0
  const gaussUpper = 0
  const tLower = tDf > 0 ? 2 * tCDF(-Math.sqrt((tDf + 1) * (1 - tRho) / (1 + tRho)), tDf + 1) : 0
  const tUpper = tLower

  return {
    clayton: { theta: Math.max(0.01, claytonTheta), lower: claytonLower, upper: claytonUpper },
    gumbel: { theta: Math.max(1.01, gumbelTheta), lower: gumbelLower, upper: gumbelUpper },
    gaussian: { rho: gaussRho, lower: gaussLower, upper: gaussUpper },
    studentT: { rho: tRho, df: tDf, lower: tLower, upper: tUpper },
  }
}

// Student-t CDF approximation (via incomplete beta)
export function tCDF(t, df) {
  const x = df / (df + t * t)
  // Incomplete beta approximation
  const ib = 0.5 * regIncompleteBeta(x, df / 2, 0.5)
  return t >= 0 ? 1 - ib : ib
}

// Regularized incomplete beta I_x(a,b) — Lentz continued fraction (Numerical Recipes)
function regIncompleteBeta(x, a, b) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b)
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta)
  if (x < (a + 1) / (a + b + 2)) {
    return front * betaCF(x, a, b) / a
  } else {
    return 1 - front * betaCF(1 - x, b, a) / b
  }
}

// Lentz's method for the beta continued fraction (NR "betacf")
function betaCF(x, a, b) {
  const MAX_ITER = 200
  const EPS = 3e-14
  const FPMIN = 1e-300
  const qab = a + b, qap = a + 1, qam = a - 1
  let c = 1, d = 1 - qab * x / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    h *= d * c
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}

export const logGamma = (z) => {
  const c = [76.1800917294715, -86.5053203294168, 24.0140982408309, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  const tmp = z + 5.5 - (z + 0.5) * Math.log(z + 5.5)
  let y = z, ser = 1.000000000190015
  for (let j = 0; j < 6; j++) { y++; ser += c[j] / y }
  return -tmp + Math.log(2.506628274631 * ser / z)
}
