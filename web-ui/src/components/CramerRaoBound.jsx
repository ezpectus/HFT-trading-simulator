import React, { useMemo, useState } from 'react'

// ─── Cramér-Rao Lower Bound (Information-Theoretic Estimation Limits) ───────
// Computes the Cramér-Rao lower bound (CRLB) for parameter estimation,
// providing the theoretical minimum variance of any unbiased estimator.
//
// Mathematical foundation:
//   CRLB: Var(θ̂) ≥ 1/I(θ)
//   Fisher Information: I(θ) = E[(∂/∂θ log L(x|θ))²]
//                      = -E[∂²/∂θ² log L(x|θ)]
//
//   For Gaussian: L = Π (1/√(2πσ²)) exp(-(x_i-μ)²/(2σ²))
//   I(μ) = n/σ²  →  CRLB(μ) = σ²/n
//   I(σ²) = n/(2σ⁴)  →  CRLB(σ²) = 2σ⁴/n
//
//   For GARCH(1,1): more complex Fisher information matrix
//   Efficiency: eff(θ̂) = CRLB/Var(θ̂) (1 = efficient)
//
//   Applications: estimator quality assessment, sample size planning,
//   parameter uncertainty bounds, information content of data

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Fisher information for Gaussian mean: I(μ) = n/σ²
const fisherGaussianMean = (n, sigma2) => n / sigma2

// Fisher information for Gaussian variance: I(σ²) = n/(2σ⁴)
const fisherGaussianVar = (n, sigma2) => n / (2 * sigma2 * sigma2)

// Fisher information for GARCH(1,1) parameters (simplified)
// Log-likelihood: L = -0.5 Σ [log(2π σ_t²) + r_t²/σ_t²]
// σ_t² = ω + α·r_{t-1}² + β·σ_{t-1}²
const fisherGARCH = (returns, omega, alpha, beta) => {
  const n = returns.length
  let sigma2 = omega / (1 - alpha - beta + 1e-10)

  // Compute log-likelihood and its derivatives numerically
  const eps = 1e-6
  const params = [omega, alpha, beta]
  const paramNames = ['omega', 'alpha', 'beta']

  // Hessian of negative log-likelihood (Fisher info = E[Hessian])
  const fisherMatrix = Array.from({ length: 3 }, () => new Array(3).fill(0))

  // Diagonal (simplified — just compute second derivatives)
  for (let p = 0; p < 3; p++) {
    const paramsPlus = [...params]; paramsPlus[p] += eps
    const paramsMinus = [...params]; paramsMinus[p] -= eps

    const llPlus = garchLogLik(returns, paramsPlus[0], paramsPlus[1], paramsPlus[2])
    const llMinus = garchLogLik(returns, paramsMinus[0], paramsMinus[1], paramsMinus[2])
    const ll0 = garchLogLik(returns, params[0], params[1], params[2])

    fisherMatrix[p][p] = -(llPlus - 2 * ll0 + llMinus) / (eps * eps)
  }

  // Off-diagonal
  for (let p = 0; p < 3; p++) {
    for (let q = p + 1; q < 3; q++) {
      const pp = [...params]; pp[p] += eps; pp[q] += eps
      const pm = [...params]; pm[p] += eps; pm[q] -= eps
      const mp = [...params]; mp[p] -= eps; mp[q] += eps
      const mm = [...params]; mm[p] -= eps; mm[q] -= eps

      const cross = (garchLogLik(returns, pp[0], pp[1], pp[2]) - garchLogLik(returns, pm[0], pm[1], pm[2])
        - garchLogLik(returns, mp[0], mp[1], mp[2]) + garchLogLik(returns, mm[0], mm[1], mm[2])) / (4 * eps * eps)
      fisherMatrix[p][q] = -cross
      fisherMatrix[q][p] = -cross
    }
  }

  // CRLB = inverse of Fisher information
  const crlb = invert3x3(fisherMatrix)

  return { fisherMatrix, crlb, paramNames }
}

const garchLogLik = (returns, omega, alpha, beta) => {
  if (omega <= 0 || alpha < 0 || beta < 0 || alpha + beta >= 1) return -1e10
  let sigma2 = omega / (1 - alpha - beta + 1e-10)
  let ll = 0
  for (let t = 0; t < returns.length; t++) {
    sigma2 = omega + alpha * returns[t] * returns[t] + beta * sigma2
    if (sigma2 <= 0) return -1e10
    ll += -0.5 * Math.log(2 * Math.PI * sigma2) - returns[t] * returns[t] / (2 * sigma2)
  }
  return ll
}

// 3x3 matrix inverse
const invert3x3 = (M) => {
  const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
    - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
    + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])
  if (Math.abs(det) < 1e-15) return M.map(row => row.map(() => Infinity))

  const inv = Array.from({ length: 3 }, () => new Array(3).fill(0))
  inv[0][0] = (M[1][1] * M[2][2] - M[1][2] * M[2][1]) / det
  inv[0][1] = (M[0][2] * M[2][1] - M[0][1] * M[2][2]) / det
  inv[0][2] = (M[0][1] * M[1][2] - M[0][2] * M[1][1]) / det
  inv[1][0] = (M[1][2] * M[2][0] - M[1][0] * M[2][2]) / det
  inv[1][1] = (M[0][0] * M[2][2] - M[0][2] * M[2][0]) / det
  inv[1][2] = (M[0][2] * M[1][0] - M[0][0] * M[1][2]) / det
  inv[2][0] = (M[1][0] * M[2][1] - M[1][1] * M[2][0]) / det
  inv[2][1] = (M[0][1] * M[2][0] - M[0][0] * M[2][1]) / det
  inv[2][2] = (M[0][0] * M[1][1] - M[0][1] * M[1][0]) / det
  return inv
}

export default function CramerRaoBound({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(100)
  const [nSamples, setNSamples] = useState(50)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    const n = returns.length
    const mean = returns.reduce((a, b) => a + b, 0) / n
    const varR = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / n
    const stdR = Math.sqrt(varR)

    // Gaussian CRLB
    const fisherMu = fisherGaussianMean(n, varR)
    const crlbMu = 1 / fisherMu
    const fisherVar = fisherGaussianVar(n, varR)
    const crlbVar = 1 / fisherVar

    // GARCH CRLB
    // Simple GARCH estimates
    const omega = varR * 0.05
    const alpha = 0.08
    const beta = 0.9
    const garchResult = fisherGARCH(returns, omega, alpha, beta)

    // Sample size effect: CRLB decreases as 1/n
    const sampleSizes = []
    for (let s = 10; s <= n; s += Math.max(5, Math.floor(n / 15))) {
      sampleSizes.push({
        n: s,
        crlbMu: varR / s,
        crlbVar: 2 * varR * varR / s,
        fisherMu: s / varR,
      })
    }

    // Efficiency of sample mean estimator: Var(sample mean) = σ²/n = CRLB
    // So sample mean is 100% efficient for Gaussian
    const sampleMeanVar = varR / n
    const efficiencyMu = crlbMu / sampleMeanVar

    // Efficiency of sample variance: Var(s²) = 2σ⁴/(n-1) vs CRLB = 2σ⁴/n
    const sampleVarVar = 2 * varR * varR / (n - 1)
    const efficiencyVar = crlbVar / sampleVarVar

    // Signal
    let signal = 'SUFFICIENT_DATA'
    let reason = ''
    const infoContent = fisherMu // total Fisher information
    if (infoContent < 100) {
      signal = 'LOW_INFORMATION'
      reason = `Fisher info I(μ) = ${infoContent.toFixed(2)} (low — parameter estimates uncertain)`
    } else if (infoContent > 1000) {
      signal = 'HIGH_INFORMATION'
      reason = `Fisher info I(μ) = ${infoContent.toFixed(2)} (high — reliable estimates)`
    } else {
      reason = `Fisher info I(μ) = ${infoContent.toFixed(2)} (moderate)`
    }

    // Confidence interval from CRLB
    const ciMu = 1.96 * Math.sqrt(crlbMu)
    const ciVar = 1.96 * Math.sqrt(crlbVar)

    return {
      mean, varR, stdR, n,
      fisherMu, crlbMu, fisherVar, crlbVar,
      garchResult, sampleSizes,
      efficiencyMu, efficiencyVar,
      signal, reason, ciMu, ciVar,
    }
  }, [candles, exchange, symbol, lookback, nSamples])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'LOW_INFORMATION' ? '#ef4444' : data.signal === 'HIGH_INFORMATION' ? '#22c55e' : '#f59e0b'

  // CRLB vs sample size
  const maxCRLB = Math.max(...data.sampleSizes.map(s => s.crlbMu), 0.001)
  const maxCRLBVar = Math.max(...data.sampleSizes.map(s => s.crlbVar), 0.001)
  const sxN = (n) => P + (n / data.sampleSizes[data.sampleSizes.length - 1].n) * (W - 2 * P)
  const syCRLB = (v) => H - P - (v / maxCRLB) * (H - 2 * P)

  // Fisher information matrix heatmap
  const maxFI = Math.max(...data.garchResult.fisherMatrix.flat(), 0.001)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Cramér-Rao Lower Bound — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(30, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* CRLB vs sample size */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">CRLB vs Sample Size: Var(μ̂) ≥ σ²/n (1/n decay)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* CRLB for mean */}
          <path d={data.sampleSizes.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxN(s.n)} ${syCRLB(s.crlbMu)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {/* CRLB for variance (scaled) */}
          <path d={data.sampleSizes.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxN(s.n)} ${syCRLB(s.crlbVar * maxCRLB / maxCRLBVar)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2} />

          {/* Current position */}
          <circle cx={sxN(data.n)} cy={syCRLB(data.crlbMu)} r={5} fill="#22c55e" stroke="#fff" strokeWidth={1} />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>CRLB(μ) = σ²/n</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>CRLB(σ²) = 2σ⁴/n</text>
          <text x={W - P} y={48} textAnchor="end" fill="#22c55e" fontSize={9}>Current (n={data.n})</text>
        </svg>
      </div>

      {/* Fisher information matrix (GARCH) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Fisher Information Matrix I(θ) — GARCH(1,1)</div>
        <svg width={W} height={120} className="bg-slate-900 rounded">
          {data.garchResult.fisherMatrix.map((row, i) =>
            row.map((v, j) => {
              const cellW = 100, cellH = 30
              const x = P + j * cellW, y = 10 + i * cellH
              const intensity = Math.min(1, Math.abs(v) / maxFI)
              return (
                <g key={`${i}-${j}`}>
                  <rect x={x} y={y} width={cellW - 2} height={cellH - 2} fill={`hsl(${240 - intensity * 240}, 80%, ${20 + intensity * 40}%)`} opacity={0.8} />
                  <text x={x + cellW / 2} y={y + cellH / 2 + 3} textAnchor="middle" fill="#e2e8f0" fontSize={9}>{v.toFixed(2)}</text>
                </g>
              )
            })
          )}
          {data.garchResult.paramNames.map((name, i) => (
            <text key={i} x={P + i * 100 + 49} y={5} textAnchor="middle" fill="#94a3b8" fontSize={8}>{name}</text>
          ))}
          {data.garchResult.paramNames.map((name, i) => (
            <text key={i} x={P - 5} y={10 + i * 30 + 18} textAnchor="end" fill="#94a3b8" fontSize={8}>{name}</text>
          ))}
        </svg>
      </div>

      {/* CRLB diagonal (GARCH) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">CRLB = I(θ)⁻¹ diagonal (minimum variance bounds)</div>
        <div className="space-y-1">
          {data.garchResult.paramNames.map((name, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-16">{name}</span>
              <span className="text-cyan-400 font-mono w-24">CRLB: {data.garchResult.crlb[i][i].toFixed(8)}</span>
              <span className="text-emerald-400 font-mono w-24">√CRLB: {Math.sqrt(Math.max(0, data.garchResult.crlb[i][i])).toFixed(6)}</span>
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="h-full rounded" style={{ width: `${Math.min(100, Math.abs(data.garchResult.crlb[i][i]) * 1000)}%`, background: '#06b6d4' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">I(μ) Fisher</div>
          <div className="text-cyan-400 font-mono">{data.fisherMu.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">CRLB(μ)</div>
          <div className="text-emerald-400 font-mono">{data.crlbMu.toFixed(8)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">CRLB(σ²)</div>
          <div className="text-amber-400 font-mono">{data.crlbVar.toFixed(10)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Eff. μ̂</div>
          <div className="text-purple-400 font-mono">{(data.efficiencyMu * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">95% CI μ</div>
          <div className="text-slate-300 font-mono">±{data.ciMu.toFixed(6)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> CRLB:</strong> Var(θ̂) ≥ 1/I(θ) (minimum variance bound) |
        <strong> Fisher:</strong> I(θ) = -E[∂²/∂θ² log L] (expected information) |
        <strong> Gaussian:</strong> I(μ)=n/σ², I(σ²)=n/(2σ⁴) |
        <strong> Efficiency:</strong> eff = CRLB/Var(θ̂), sample mean is 100% efficient |
        <strong> CI:</strong> μ̂ ± 1.96·√CRLB
      </div>
    </div>
  )
}
