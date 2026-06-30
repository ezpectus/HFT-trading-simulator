import React, { useMemo, useState } from 'react'

// ─── Random Matrix Theory (RMT) ─────────────────────────────────────────────
// Applies Marchenko-Pastur law to filter noise from empirical correlation
// matrices. Eigenvalues within the MP bound are considered noise; those
// outside contain genuine information.
//
// Mathematical foundation:
//   For an N×T random matrix with independent entries (T > N):
//   Eigenvalue distribution follows Marchenko-Pastur law:
//   ρ(λ) = (Q / (2π)) · √((λ₊ - λ)(λ - λ₋)) / λ
//   where Q = T/N, λ± = (1/√Q ± 1)²
//
//   Noise eigenvalues: λ ∈ [λ₋, λ₊]
//   Signal eigenvalues: λ > λ₊ (deviations from randomness)
//
//   Cleaning procedure:
//   1. Compute correlation matrix C from returns
//   2. Eigendecompose C
//   3. Replace noise eigenvalues with MP average
//   4. Reconstruct cleaned correlation matrix
//
//   Applications: portfolio optimization with denoised covariance,
//   identifying genuine correlations vs spurious ones

// Jacobi eigendecomposition
const jacobiEig = (A, maxIter = 100, tol = 1e-10) => {
  const n = A.length
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0))
  const D = A.map(row => row.slice())
  for (let iter = 0; iter < maxIter; iter++) {
    let maxVal = 0, p = 0, q = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (Math.abs(D[i][j]) > maxVal) { maxVal = Math.abs(D[i][j]); p = i; q = j }
    }
    if (maxVal < tol) break
    const theta = (D[q][q] - D[p][p]) / (2 * D[p][q])
    const t = Math.sign(theta) * (Math.abs(theta) + Math.sqrt(theta * theta + 1))
    const c = 1 / Math.sqrt(t * t + 1), s = t * c
    for (let i = 0; i < n; i++) {
      const dip = D[i][p], diq = D[i][q]
      D[i][p] = c * dip - s * diq; D[i][q] = s * dip + c * diq
    }
    for (let j = 0; j < n; j++) {
      const dpj = D[p][j], dqj = D[q][j]
      D[p][j] = c * dpj - s * dqj; D[q][j] = s * dpj + c * dqj
    }
    D[p][q] = 0; D[q][p] = 0
    for (let i = 0; i < n; i++) {
      const vip = V[i][p], viq = V[i][q]
      V[i][p] = c * vip - s * viq; V[i][q] = s * vip + c * viq
    }
  }
  return { eigenvalues: D.map((row, i) => row[i]), eigenvectors: V }
}

// Marchenko-Pastur density
const mpDensity = (lambda, Q) => {
  const lambdaMin = (1 / Math.sqrt(Q) - 1) ** 2
  const lambdaMax = (1 / Math.sqrt(Q) + 1) ** 2
  if (lambda < lambdaMin || lambda > lambdaMax) return 0
  const Qval = Q / (2 * Math.PI)
  return Qval * Math.sqrt((lambdaMax - lambda) * (lambda - lambdaMin)) / lambda
}

// MP bounds
const mpBounds = (Q) => ({
  lambdaMin: (1 / Math.sqrt(Q) - 1) ** 2,
  lambdaMax: (1 / Math.sqrt(Q) + 1) ** 2,
})

// Clean correlation matrix
const cleanCorrelation = (eigenvalues, eigenvectors, Q) => {
  const n = eigenvalues.length
  const { lambdaMin, lambdaMax } = mpBounds(Q)

  // Identify noise eigenvalues
  const cleaned = eigenvalues.slice()
  let noiseCount = 0
  let noiseSum = 0
  for (let i = 0; i < n; i++) {
    if (eigenvalues[i] >= lambdaMin && eigenvalues[i] <= lambdaMax) {
      noiseCount++
      noiseSum += eigenvalues[i]
    }
  }

  // Replace noise eigenvalues with average
  const noiseAvg = noiseCount > 0 ? noiseSum / noiseCount : 0
  for (let i = 0; i < n; i++) {
    if (eigenvalues[i] >= lambdaMin && eigenvalues[i] <= lambdaMax) {
      cleaned[i] = noiseAvg
    }
  }

  // Reconstruct: C_clean = V · diag(cleaned) · Vᵀ
  const Cclean = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        Cclean[i][j] += eigenvectors[i][k] * cleaned[k] * eigenvectors[j][k]
      }
    }
  }

  // Renormalize to unit diagonal
  for (let i = 0; i < n; i++) {
    const d = Math.sqrt(Cclean[i][i])
    if (d > 0) for (let j = 0; j < n; j++) { Cclean[i][j] /= d; Cclean[j][i] /= d }
  }

  return { Cclean, cleaned, noiseCount, signalCount: n - noiseCount }
}

export default function RandomMatrixTheory({ candles, symbols, exchange }) {
  const [lookback, setLookback] = useState(100)

  const data = useMemo(() => {
    if (!candles?.[exchange] || !symbols || symbols.length < 3) return null

    const allReturns = []
    const validSymbols = []
    for (const sym of symbols) {
      const cds = candles[exchange]?.[sym]
      if (!cds || cds.length < lookback + 1) continue
      const prices = cds.slice(-lookback - 1).map(c => c.close)
      const rets = []
      for (let i = 1; i < prices.length; i++) {
        rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
      }
      allReturns.push(rets)
      validSymbols.push(sym)
    }
    if (validSymbols.length < 3) return null

    const N = validSymbols.length
    const T = allReturns[0].length
    const Q = T / N

    // Correlation matrix
    const corr = Array.from({ length: N }, () => new Array(N).fill(0))
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const mi = allReturns[i].reduce((a, b) => a + b, 0) / T
        const mj = allReturns[j].reduce((a, b) => a + b, 0) / T
        let cov = 0, vi = 0, vj = 0
        for (let t = 0; t < T; t++) {
          const di = allReturns[i][t] - mi
          const dj = allReturns[j][t] - mj
          cov += di * dj; vi += di * di; vj += dj * dj
        }
        corr[i][j] = (vi > 0 && vj > 0) ? cov / Math.sqrt(vi * vj) : 0
      }
    }

    // Eigendecomposition
    const { eigenvalues, eigenvectors } = jacobiEig(corr)
    const sortedIdx = eigenvalues.map((v, i) => i).sort((a, b) => eigenvalues[b] - eigenvalues[a])
    const sortedEig = sortedIdx.map(i => eigenvalues[i])
    const sortedVec = sortedIdx.map(i => eigenvectors.map(row => row[i]))

    // MP bounds
    const { lambdaMin, lambdaMax } = mpBounds(Q)

    // MP density curve
    const mpCurve = []
    for (let l = Math.max(0.01, lambdaMin - 0.1); l <= lambdaMax + 0.1; l += 0.01) {
      mpCurve.push({ lambda: l, density: mpDensity(l, Q) })
    }

    // Clean correlation
    const { Cclean, cleaned, noiseCount, signalCount } = cleanCorrelation(eigenvalues, eigenvectors, Q)

    // Signal eigenvalues (deviations from MP)
    const signalEigs = sortedEig.filter(l => l > lambdaMax || l < lambdaMin)

    // Largest eigenvector (market mode)
    const marketMode = sortedVec[0]
    const marketModeContrib = validSymbols.map((sym, i) => ({ sym, weight: marketMode[i] }))

    // Signal
    let signal = 'NEUTRAL'
    let reason = ''
    if (signalEigs.length > 0) {
      const strongest = signalEigs[0]
      if (strongest > lambdaMax * 2) {
        signal = 'STRONG_SIGNAL'
        reason = `${signalEigs.length} signal eigenvalues (max λ=${strongest.toFixed(3)} > λ₊=${lambdaMax.toFixed(3)})`
      } else {
        signal = 'WEAK_SIGNAL'
        reason = `${signalEigs.length} signal eigenvalues (max λ=${strongest.toFixed(3)}, λ₊=${lambdaMax.toFixed(3)})`
      }
    } else {
      signal = 'PURE_NOISE'
      reason = `All eigenvalues within MP bounds [${lambdaMin.toFixed(3)}, ${lambdaMax.toFixed(3)}] — no genuine correlations`
    }

    return {
      validSymbols, N, T, Q,
      eigenvalues: sortedEig, eigenvectors: sortedVec,
      lambdaMin, lambdaMax, mpCurve,
      Cclean, cleaned, noiseCount, signalCount,
      signalEigs, marketModeContrib,
      corr, signal, reason,
    }
  }, [candles, exchange, symbols, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 3 symbols with {lookback + 1}+ candles on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'STRONG_SIGNAL' ? '#22c55e' : data.signal === 'WEAK_SIGNAL' ? '#f59e0b' : '#ef4444'

  // Eigenvalue spectrum
  const maxEig = Math.max(...data.eigenvalues, data.lambdaMax + 0.5)
  const sxEig = (i) => P + (i / Math.max(1, data.N - 1)) * (W - 2 * P)
  const syEig = (v) => H - P - (v / maxEig) * (H - 2 * P)

  // MP density
  const maxDens = Math.max(...data.mpCurve.map(p => p.density), 0.001)
  const sxMP = (l) => P + (l / maxEig) * (W - 2 * P)
  const syMP = (d) => H - P - (d / maxDens) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Random Matrix Theory — {exchange}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Eigenvalue spectrum */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Eigenvalue Spectrum vs Marchenko-Pastur Bounds</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* MP bounds */}
          <line x1={sxMP(data.lambdaMin)} y1={P} x2={sxMP(data.lambdaMin)} y2={H - P} stroke="#ef4444" strokeDasharray="4,3" />
          <line x1={sxMP(data.lambdaMax)} y1={P} x2={sxMP(data.lambdaMax)} y2={H - P} stroke="#ef4444" strokeDasharray="4,3" />
          <text x={sxMP(data.lambdaMin)} y={P + 10} textAnchor="middle" fill="#ef4444" fontSize={9}>λ₋={data.lambdaMin.toFixed(3)}</text>
          <text x={sxMP(data.lambdaMax)} y={P + 10} textAnchor="middle" fill="#ef4444" fontSize={9}>λ₊={data.lambdaMax.toFixed(3)}</text>

          {/* MP density curve */}
          <path d={data.mpCurve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sxMP(p.lambda)} ${syMP(p.density)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2} />

          {/* Eigenvalues */}
          {data.eigenvalues.map((eig, i) => {
            const isNoise = eig >= data.lambdaMin && eig <= data.lambdaMax
            return (
              <g key={i}>
                <circle cx={sxMP(eig)} cy={syEig(eig)} r={isNoise ? 3 : 6} fill={isNoise ? '#64748b' : '#22c55e'} opacity={isNoise ? 0.5 : 1} />
                {!isNoise && <text x={sxMP(eig)} y={syEig(eig) - 10} textAnchor="middle" fill="#22c55e" fontSize={8}>λ={eig.toFixed(2)}</text>}
              </g>
            )
          })}

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>Signal eigenvalues</text>
          <text x={W - P} y={34} textAnchor="end" fill="#64748b" fontSize={9}>Noise eigenvalues</text>
          <text x={W - P} y={48} textAnchor="end" fill="#f59e0b" fontSize={9}>MP density</text>
        </svg>
      </div>

      {/* Market mode (largest eigenvector) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Market Mode (largest eigenvector — common factor)</div>
        <div className="space-y-1">
          {data.marketModeContrib.map((m, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-20 truncate">{m.sym}</span>
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
                <div className="h-full rounded absolute" style={{
                  width: `${Math.abs(m.weight) * 50}%`,
                  background: m.weight >= 0 ? '#22c55e' : '#ef4444',
                  left: m.weight >= 0 ? '50%' : `${50 - Math.abs(m.weight) * 50}%`
                }} />
              </div>
              <span className="font-mono w-16" style={{ color: m.weight >= 0 ? '#22c55e' : '#ef4444' }}>{m.weight.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cleaned vs original correlation */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Cleaned Correlation Matrix (RMT-filtered)</div>
        <div className="grid gap-px text-[8px]" style={{ gridTemplateColumns: `auto repeat(${data.N}, 1fr)` }}>
          <div></div>
          {data.validSymbols.map((s, i) => <div key={i} className="text-slate-500 text-center truncate">{s.slice(0, 4)}</div>)}
          {data.Cclean.map((row, i) => (
            <React.Fragment key={i}>
              <div className="text-slate-500 truncate pr-1">{data.validSymbols[i].slice(0, 6)}</div>
              {row.map((c, j) => (
                <div key={j} className="text-center font-mono" style={{
                  background: c > 0 ? `rgba(34, 197, 94, ${Math.abs(c)})` : `rgba(239, 68, 68, ${Math.abs(c)})`,
                  color: Math.abs(c) > 0.5 ? '#fff' : '#94a3b8'
                }}>{c.toFixed(2)}</div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">N (assets)</div>
          <div className="text-cyan-400 font-mono">{data.N}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">T (samples)</div>
          <div className="text-emerald-400 font-mono">{data.T}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Q = T/N</div>
          <div className="text-amber-400 font-mono">{data.Q.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Noise eigenvalues</div>
          <div className="text-slate-400 font-mono">{data.noiseCount}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Signal eigenvalues</div>
          <div className="text-purple-400 font-mono">{data.signalCount}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> MP bounds:</strong> [{data.lambdaMin.toFixed(3)}, {data.lambdaMax.toFixed(3)}] |
        <strong> Cleaning:</strong> noise eigenvalues replaced with average, matrix renormalized |
        <strong> Market mode:</strong> largest eigenvector = common factor
      </div>
    </div>
  )
}
