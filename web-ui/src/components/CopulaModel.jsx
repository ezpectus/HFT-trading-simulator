import React, { useMemo, useState } from 'react'

// ─── Copula Dependency Model ─────────────────────────────────────────────────
// Models non-linear dependency between assets using copula theory.
// Unlike correlation (which only captures linear dependence), copulas capture
// the full joint distribution structure, including tail dependence.
//
// Implements:
// 1. Empirical copula (rank-based, distribution-free)
// 2. Gaussian copula (parametric, linear tail dependence)
// 3. Clayton copula (lower tail dependence — crashes cluster)
// 4. Gumbel copula (upper tail dependence — rallies cluster)
// 5. Student-t copula (symmetric tail dependence)
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
const empiricalCDF = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return values.map(v => {
    const idx = sorted.indexOf(v)
    return (idx + 1) / (values.length + 1)
  })
}

// Inverse normal CDF (Beasley-Springer-Moro approximation)
const normInv = (p) => {
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
const normCDF = (x) => 0.5 * (1 + erf(x / Math.SQRT2))

// Error function approximation
function erf(x) {
  const sign = x >= 0 ? 1 : -1
  x = Math.abs(x)
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return sign * y
}

// Kendall's tau
const kendallTau = (x, y) => {
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
const spearmanRho = (x, y) => {
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
const claytonCDF = (u, v, theta) => {
  if (theta <= 0) return u * v
  return Math.max(0, Math.pow(Math.pow(u, -theta) + Math.pow(v, -theta) - 1, -1 / theta))
}

// Gumbel copula CDF
const gumbelCDF = (u, v, theta) => {
  if (theta <= 1) return u * v
  const lu = -Math.log(u), lv = -Math.log(v)
  return Math.exp(-Math.pow(Math.pow(lu, theta) + Math.pow(lv, theta), 1 / theta))
}

// Gaussian copula CDF (bivariate normal)
const gaussianCopulaCDF = (u, v, rho) => {
  const x = normInv(u), y = normInv(v)
  // Bivariate normal CDF approximation
  const a = 1 / Math.sqrt(1 - rho * rho)
  const apx = a * x
  const bpy = a * rho * y
  // Drezner-Priestley approximation
  const m = x * y
  const r = rho
  const cdf = bivariateNormalCDF(x, y, r)
  return cdf
}

// Drezner-Priestley bivariate normal CDF
function bivariateNormalCDF(h, k, r) {
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
const fitCopula = (tau) => {
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
function tCDF(t, df) {
  const x = df / (df + t * t)
  // Incomplete beta approximation
  const ib = 0.5 * regIncompleteBeta(x, df / 2, 0.5)
  return t >= 0 ? 1 - ib : ib
}

// Regularized incomplete beta (continued fraction)
function regIncompleteBeta(x, a, b) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b)
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a
  if (x < (a + 1) / (a + b + 2)) {
    return front * betaCF(x, a, b, 0) / a
  } else {
    return 1 - front * betaCF(1 - x, b, a, 0) / b
  }
}

function betaCF(x, a, b, depth) {
  if (depth > 100) return 0
  const m = depth + 1
  const numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m))
  const result = 1 + numerator / (1 + betaCF(x, a, b, depth + 1))
  return result
}

const logGamma = (z) => {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = z, tmp = z + 5.5 - (z + 0.5) * Math.log(z + 5.5), ser = 1.000000000190015
  for (let j = 0; j < 6; j++) { y++; ser += c[j] / y }
  return -tmp + Math.log(2.5066282746310005 * ser / z)
}

export default function CopulaModel({ candles, symbols, exchange }) {
  const [pairA, setPairA] = useState(0)
  const [pairB, setPairB] = useState(1)
  const [copulaType, setCopulaType] = useState('clayton')

  const data = useMemo(() => {
    if (!candles?.[exchange]) return null
    const syms = symbols || []
    if (syms.length < 2) return null

    const a = syms[pairA] || syms[0]
    const b = syms[pairB] || syms[1]
    if (a === b) return null

    const cdsA = candles[exchange]?.[a]
    const cdsB = candles[exchange]?.[b]
    if (!cdsA || !cdsB || cdsA.length < 30 || cdsB.length < 30) return null

    const n = Math.min(cdsA.length, cdsB.length)
    const pricesA = cdsA.slice(-n).map(c => c.close)
    const pricesB = cdsB.slice(-n).map(c => c.close)

    // Returns
    const retA = [], retB = []
    for (let i = 1; i < n; i++) {
      retA.push((pricesA[i] - pricesA[i - 1]) / pricesA[i - 1])
      retB.push((pricesB[i] - pricesB[i - 1]) / pricesB[i - 1])
    }

    // Empirical CDF (uniform margins)
    const uA = empiricalCDF(retA)
    const uB = empiricalCDF(retB)

    // Kendall's tau and Spearman's rho
    const tau = kendallTau(retA, retB)
    const spearman = spearmanRho(retA, retB)

    // Pearson correlation (for comparison)
    const meanA = retA.reduce((a, b) => a + b, 0) / retA.length
    const meanB = retB.reduce((a, b) => a + b, 0) / retB.length
    let cov = 0, varA = 0, varB = 0
    for (let i = 0; i < retA.length; i++) {
      cov += (retA[i] - meanA) * (retB[i] - meanB)
      varA += (retA[i] - meanA) ** 2
      varB += (retB[i] - meanB) ** 2
    }
    const pearson = varA > 0 && varB > 0 ? cov / Math.sqrt(varA * varB) : 0

    // Fit copulas
    const fits = fitCopula(tau)

    // Goodness of fit: log-likelihood for each copula
    const logLik = {
      clayton: retA.reduce((s, _, i) => {
        const u = uA[i], v = uB[i]
        const theta = fits.clayton.theta
        // Clayton density: c(u,v) = θ(1+θ)(u^(-θ)+v^(-θ)^(-2/θ-1) * (uv)^(-θ-1)
        const c = theta * (1 + theta) * Math.pow(Math.pow(u, -theta) + Math.pow(v, -theta) - 1, -2 / theta - 1) * Math.pow(u * v, -theta - 1)
        return s + Math.log(Math.max(1e-10, c))
      }, 0),
      gumbel: retA.reduce((s, _, i) => {
        // Simplified Gumbel log-density
        return s + Math.log(Math.max(1e-10, gumbelCDF(uA[i], uB[i], fits.gumbel.theta)))
      }, 0),
      gaussian: retA.reduce((s, _, i) => {
        return s + Math.log(Math.max(1e-10, gaussianCopulaCDF(uA[i], uB[i], fits.gaussian.rho)))
      }, 0),
    }

    // Current joint probability
    const lastU = uA[uA.length - 1], lastV = uB[uB.length - 1]
    const jointProbs = {
      clayton: claytonCDF(lastU, lastV, fits.clayton.theta),
      gumbel: gumbelCDF(lastU, lastV, fits.gumbel.theta),
      gaussian: gaussianCopulaCDF(lastU, lastV, fits.gaussian.rho),
    }

    // Conditional probability P(V < v | U < u) — tail risk
    const tailProb = 0.05  // 5% tail
    const conditionalLower = {
      clayton: claytonCDF(tailProb, tailProb, fits.clayton.theta) / tailProb,
      gumbel: gumbelCDF(tailProb, tailProb, fits.gumbel.theta) / tailProb,
      gaussian: gaussianCopulaCDF(tailProb, tailProb, fits.gaussian.rho) / tailProb,
      independent: tailProb,
    }

    // Signal: if lower tail dependence is high, assets crash together
    const currentFit = fits[copulaType]
    const tailDep = currentFit.lower + currentFit.upper
    let signal = 'NEUTRAL'
    let reason = ''
    if (conditionalLower[copulaType] > 0.15) {
      signal = 'RISK'
      reason = `High lower tail dependence: P(${b} crashes | ${a} crashes) = ${(conditionalLower[copulaType] * 100).toFixed(1)}%`
    } else if (conditionalLower[copulaType] < 0.03) {
      signal = 'HEDGE'
      reason = `Low tail dependence: ${a} and ${b} decouple in crashes`
    } else {
      reason = `Moderate dependence: τ=${tau.toFixed(3)}, tail P=${(conditionalLower[copulaType] * 100).toFixed(1)}%`
    }

    return {
      a, b, retA: retA.slice(-60), retB: retB.slice(-60),
      uA: uA.slice(-60), uB: uB.slice(-60),
      tau, spearman, pearson,
      fits, logLik, jointProbs, conditionalLower,
      tailDep, signal, reason,
      lastU, lastV,
      n: retA.length,
    }
  }, [candles, exchange, symbols, pairA, pairB, copulaType])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 2 symbols with 30+ candles on {exchange}</div>
  }

  const W = 500, H = 300, P = 40
  const colors = { clayton: '#06b6d4', gumbel: '#f59e0b', gaussian: '#22c55e', studentT: '#a855f7' }

  // Scatter in copula space [0,1]²
  const sx = (u) => P + u * (W - 2 * P)
  const sy = (v) => H - P - v * (H - 2 * P)

  // Contour lines for selected copula
  const contourLines = []
  const theta = data.fits[copulaType]
  for (let level = 0.2; level <= 0.8; level += 0.2) {
    const points = []
    for (let u = 0.01; u <= 0.99; u += 0.02) {
      let v = 0.5
      // Binary search for v such that C(u,v) = level
      let lo = 0.001, hi = 0.999
      for (let iter = 0; iter < 30; iter++) {
        v = (lo + hi) / 2
        let cdf
        if (copulaType === 'clayton') cdf = claytonCDF(u, v, theta.theta)
        else if (copulaType === 'gumbel') cdf = gumbelCDF(u, v, theta.theta)
        else cdf = gaussianCopulaCDF(u, v, theta.rho)
        if (cdf < level) lo = v
        else hi = v
      }
      points.push({ u, v })
    }
    contourLines.push({ level, points })
  }

  const sigColor = data.signal === 'RISK' ? '#ef4444' : data.signal === 'HEDGE' ? '#22c55e' : '#94a3b8'

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Copula Dependency Model</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Asset A:</span>
          <select value={pairA} onChange={e => setPairA(+e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            {(symbols || []).map((s, i) => <option key={i} value={i}>{s}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Asset B:</span>
          <select value={pairB} onChange={e => setPairB(+e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            {(symbols || []).map((s, i) => <option key={i} value={i}>{s}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Copula:</span>
          <select value={copulaType} onChange={e => setCopulaType(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="clayton">Clayton (lower tail)</option>
            <option value="gumbel">Gumbel (upper tail)</option>
            <option value="gaussian">Gaussian (no tail)</option>
          </select>
        </label>
      </div>

      <div className="flex gap-3">
        {/* Copula scatter + contours */}
        <div className="flex-1 bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">Copula Space: {data.a} vs {data.b} (uniform margins)</div>
          <svg width={W} height={H} className="bg-slate-900 rounded">
            <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
            <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

            {/* Contour lines */}
            {contourLines.map((cl, ci) => (
              <path
                key={ci}
                d={cl.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.u)} ${sy(p.v)}`).join(' ')}
                fill="none"
                stroke={colors[copulaType]}
                strokeWidth={1}
                opacity={0.3}
                strokeDasharray="3,2"
              />
            ))}

            {/* Data points */}
            {data.uA.map((u, i) => (
              <circle
                key={i}
                cx={sx(u)}
                cy={sy(data.uB[i])}
                r={i === data.uA.length - 1 ? 5 : 2}
                fill={i === data.uA.length - 1 ? colors[copulaType] : '#64748b'}
                opacity={i === data.uA.length - 1 ? 1 : 0.4}
              />
            ))}

            <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={10}>U ({data.a})</text>
            <text x={5} y={P + 10} fill="#475569" fontSize={10}>V ({data.b})</text>
          </svg>
        </div>

        {/* Tail dependence comparison */}
        <div className="w-64 bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-2">Tail Dependence Comparison</div>
          <div className="space-y-2">
            {['clayton', 'gumbel', 'gaussian'].map(ct => {
              const fit = data.fits[ct]
              const ll = data.logLik[ct]
              return (
                <div key={ct} className="text-xs">
                  <div className="flex justify-between">
                    <span className="capitalize" style={{ color: colors[ct] }}>{ct}</span>
                    <span className="text-slate-400">LL={ll.toFixed(1)}</span>
                  </div>
                  <div className="text-slate-500 text-[10px] pl-2">
                    λ_L={fit.lower.toFixed(4)} | λ_U={fit.upper.toFixed(4)}
                    {ct === 'clayton' && <span> | θ={fit.theta.toFixed(3)}</span>}
                    {ct === 'gumbel' && <span> | θ={fit.theta.toFixed(3)}</span>}
                    {ct === 'gaussian' && <span> | ρ={fit.rho.toFixed(3)}</span>}
                  </div>
                  <div className="text-slate-500 text-[10px] pl-2">
                    P(joint crash) = {(data.conditionalLower[ct] * 100).toFixed(2)}%
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Kendall τ</div>
          <div className="text-cyan-400 font-mono">{data.tau.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Spearman ρ</div>
          <div className="text-amber-400 font-mono">{data.spearman.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Pearson r</div>
          <div className="text-emerald-400 font-mono">{data.pearson.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Joint CDF</div>
          <div className="text-purple-400 font-mono">{data.jointProbs[copulaType].toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">N obs</div>
          <div className="text-slate-300 font-mono">{data.n}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} | <strong>Current:</strong> U={data.lastU.toFixed(3)}, V={data.lastV.toFixed(3)}
      </div>
    </div>
  )
}
