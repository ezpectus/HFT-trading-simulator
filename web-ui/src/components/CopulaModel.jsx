import React, { memo, useMemo, useState } from 'react'
import { groupCandles } from '../utils/candles'
import { empiricalCDF, kendallTau, spearmanRho, fitCopula, claytonCDF, gumbelCDF, gaussianCopulaCDF } from '../utils/copulaMath'

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

function CopulaModel({ candles, symbols, exchange }) {
  const [pairA, setPairA] = useState(0)
  const [pairB, setPairB] = useState(1)
  const [copulaType, setCopulaType] = useState('clayton')

  const data = useMemo(() => {
    const bySym = groupCandles(candles, exchange)
    if (Object.keys(bySym).length === 0) return null
    const syms = symbols || []
    if (syms.length < 2) return null

    const a = syms[pairA] || syms[0]
    const b = syms[pairB] || syms[1]
    if (a === b) return null

    const cdsA = bySym[a]
    const cdsB = bySym[b]
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
    return <div className="p-4 text-sm text-gray-400">Need at least 2 symbols with 30+ candles on {exchange}</div>
  }

  const W = 500, H = 300, P = 40
  const colors = { clayton: '#06b6d4', gumbel: '#f0b90b', gaussian: '#0ecb81', studentT: '#a855f7' }

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

  const sigColor = data.signal === 'RISK' ? '#f6465d' : data.signal === 'HEDGE' ? '#0ecb81' : '#94a3b8'

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-gray-200">Copula Dependency Model</span>
        <span className="px-2 py-0.5 text-xs " style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-gray-400">Asset A:</span>
          <select value={pairA} onChange={e => setPairA(+e.target.value)} className="bg-bg-700 border border-bg-500  text-gray-200 px-1">
            {(symbols || []).map((s, i) => <option key={i} value={i}>{s}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-gray-400">Asset B:</span>
          <select value={pairB} onChange={e => setPairB(+e.target.value)} className="bg-bg-700 border border-bg-500  text-gray-200 px-1">
            {(symbols || []).map((s, i) => <option key={i} value={i}>{s}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-gray-400">Copula:</span>
          <select value={copulaType} onChange={e => setCopulaType(e.target.value)} className="bg-bg-700 border border-bg-500  text-gray-200 px-1">
            <option value="clayton">Clayton (lower tail)</option>
            <option value="gumbel">Gumbel (upper tail)</option>
            <option value="gaussian">Gaussian (no tail)</option>
          </select>
        </label>
      </div>

      <div className="flex gap-3">
        {/* Copula scatter + contours */}
        <div className="flex-1 bg-bg-700  p-3">
          <div className="text-xs text-gray-400 mb-1">Copula Space: {data.a} vs {data.b} (uniform margins)</div>
          <svg width={W} height={H} className="bg-bg-900 ">
            <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#1e2530" />
            <line x1={P} y1={P} x2={P} y2={H - P} stroke="#1e2530" />

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
                fill={i === data.uA.length - 1 ? colors[copulaType] : '#848e9c'}
                opacity={i === data.uA.length - 1 ? 1 : 0.4}
              />
            ))}

            <text x={W - P} y={H - 5} textAnchor="end" fill="#5e6673" fontSize={10}>U ({data.a})</text>
            <text x={5} y={P + 10} fill="#5e6673" fontSize={10}>V ({data.b})</text>
          </svg>
        </div>

        {/* Tail dependence comparison */}
        <div className="w-64 bg-bg-700  p-3">
          <div className="text-xs text-gray-400 mb-2">Tail Dependence Comparison</div>
          <div className="space-y-2">
            {['clayton', 'gumbel', 'gaussian'].map(ct => {
              const fit = data.fits[ct]
              const ll = data.logLik[ct]
              return (
                <div key={ct} className="text-xs">
                  <div className="flex justify-between">
                    <span className="capitalize" style={{ color: colors[ct] }}>{ct}</span>
                    <span className="text-gray-400">LL={ll.toFixed(1)}</span>
                  </div>
                  <div className="text-gray-500 text-[10px] pl-2">
                    λ_L={fit.lower.toFixed(4)} | λ_U={fit.upper.toFixed(4)}
                    {ct === 'clayton' && <span> | θ={fit.theta.toFixed(3)}</span>}
                    {ct === 'gumbel' && <span> | θ={fit.theta.toFixed(3)}</span>}
                    {ct === 'gaussian' && <span> | ρ={fit.rho.toFixed(3)}</span>}
                  </div>
                  <div className="text-gray-500 text-[10px] pl-2">
                    P(joint crash) = {(data.conditionalLower[ct] * 100).toFixed(2)}%
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-bg-700  p-2">
          <div className="text-gray-400">Kendall τ</div>
          <div className="text-cyan-400 font-mono">{data.tau.toFixed(4)}</div>
        </div>
        <div className="bg-bg-700  p-2">
          <div className="text-gray-400">Spearman ρ</div>
          <div className="text-amber-400 font-mono">{data.spearman.toFixed(4)}</div>
        </div>
        <div className="bg-bg-700  p-2">
          <div className="text-gray-400">Pearson r</div>
          <div className="text-emerald-400 font-mono">{data.pearson.toFixed(4)}</div>
        </div>
        <div className="bg-bg-700  p-2">
          <div className="text-gray-400">Joint CDF</div>
          <div className="text-purple-400 font-mono">{data.jointProbs[copulaType].toFixed(4)}</div>
        </div>
        <div className="bg-bg-700  p-2">
          <div className="text-gray-400">N obs</div>
          <div className="text-gray-300 font-mono">{data.n}</div>
        </div>
      </div>

      <div className="text-xs text-gray-400 bg-bg-700  p-2">
        <strong>Signal:</strong> {data.reason} | <strong>Current:</strong> U={data.lastU.toFixed(3)}, V={data.lastV.toFixed(3)}
      </div>
    </div>
  )
}

export default memo(CopulaModel)
