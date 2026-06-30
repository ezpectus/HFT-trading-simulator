import React, { useMemo, useState } from 'react'

// ─── Black-Litterman Portfolio Allocation ───────────────────────────────────
// Combines market equilibrium returns (reverse-optimized from market caps)
// with investor views to produce posterior expected returns and optimal
// portfolio weights.
//
// Mathematical foundation:
//   1. equilibrium returns: π = δ·Σ·w_mkt  (reverse optimization)
//   2. Prior: N(π, τΣ)
//   3. Views: P·E[r] = Q + ε, ε ~ N(0, Ω)
//   4. Posterior returns: E[r] = π + τΣPᵀ(PτΣPᵀ + Ω)⁻¹(Q - Pπ)
//   5. Posterior covariance: Σ_post = Σ + τΣ - τΣPᵀ(PτΣPᵀ + Ω)⁻¹PτΣ
//   6. Optimal weights: w = (δ·Σ_post)⁻¹ · E[r]
//
//   where:
//   - δ = risk aversion coefficient
//   - Σ = covariance matrix of returns
//   - w_mkt = market capitalization weights
//   - τ = uncertainty scaling of prior
//   - P = picking matrix (which assets each view applies to)
//   - Q = view returns
//   - Ω = view uncertainty (diagonal)

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
    const c = 1 / Math.sqrt(t * t + 1)
    const s = t * c
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

const matrixInverse = (A) => {
  const n = A.length
  const { eigenvalues, eigenvectors } = jacobiEig(A)
  // A⁻¹ = V·D⁻¹·Vᵀ
  const invD = eigenvalues.map(v => Math.abs(v) > 1e-10 ? 1 / v : 0)
  const result = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        result[i][j] += eigenvectors[i][k] * invD[k] * eigenvectors[j][k]
      }
    }
  }
  return result
}

const matMul = (A, B) => {
  const n = A.length, m = B[0].length, k = B.length
  const C = Array.from({ length: n }, () => new Array(m).fill(0))
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) for (let l = 0; l < k; l++) C[i][j] += A[i][l] * B[l][j]
  return C
}

const matVec = (A, v) => A.map(row => row.reduce((s, a, i) => s + a * v[i], 0))

const transpose = (A) => A[0].map((_, j) => A.map(row => row[j]))

const matAdd = (A, B) => A.map((row, i) => row.map((v, j) => v + B[i][j]))

const matSub = (A, B) => A.map((row, i) => row.map((v, j) => v - B[i][j]))

const scalarMul = (s, A) => A.map(row => row.map(v => s * v))

export default function BlackLitterman({ candles, symbols, exchange }) {
  const [riskAversion, setRiskAversion] = useState(2.5)
  const [tau, setTau] = useState(0.05)
  const [lookback, setLookback] = useState(50)

  // Views: each view is { assets: [weights], return: expectedReturn, confidence: 0-1 }
  const [views, setViews] = useState([
    { assets: [1, 0, 0], return: 0.02, confidence: 0.5 },
    { assets: [0, 1, 0], return: -0.01, confidence: 0.3 },
  ])

  const data = useMemo(() => {
    if (!candles?.[exchange] || !symbols || symbols.length < 2) return null

    // Get returns for all symbols
    const allReturns = []
    const validSymbols = []
    for (const sym of symbols) {
      const cds = candles[exchange]?.[sym]
      if (!cds || cds.length < lookback + 1) continue
      const prices = cds.slice(-lookback - 1).map(c => c.close)
      const rets = []
      for (let i = 1; i < prices.length; i++) rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
      allReturns.push(rets)
      validSymbols.push(sym)
    }
    if (validSymbols.length < 2) return null

    const S = validSymbols.length
    const T = allReturns[0].length

    // Covariance matrix (annualized)
    const cov = Array.from({ length: S }, () => new Array(S).fill(0))
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < S; j++) {
        let cov_ij = 0
        const meanI = allReturns[i].reduce((a, b) => a + b, 0) / T
        const meanJ = allReturns[j].reduce((a, b) => a + b, 0) / T
        for (let t = 0; t < T; t++) cov_ij += (allReturns[i][t] - meanI) * (allReturns[j][t] - meanJ)
        cov[i][j] = (cov_ij / (T - 1)) * 252 // annualized
      }
    }

    // Market weights (equal weight as proxy)
    const wMkt = new Array(S).fill(1 / S)

    // Equilibrium returns: π = δ·Σ·w_mkt
    const pi = matVec(scalarMul(riskAversion, cov), wMkt)

    // Build views matrix
    const validViews = views.filter(v => v.assets.length === S)
    const K = validViews.length
    if (K === 0) return { validSymbols, cov, pi, wMkt, posteriorReturns: pi, posteriorWeights: wMkt, hasViews: false }

    const P = validViews.map(v => v.assets)
    const Q = validViews.map(v => v.return)
    // Ω = diag(P·(τΣ)·Pᵀ) — Idzorek's method
    const tauCov = scalarMul(tau, cov)
    const PtauCov = matMul(P, tauCov)
    const Pt = transpose(P)
    const PtauCovPt = matMul(PtauCov, Pt)
    const Omega = Array.from({ length: K }, (_, i) =>
      Array.from({ length: K }, (_, j) => i === j ? PtauCovPt[i][i] * validViews[i].confidence : 0)
    )

    // Posterior returns: E[r] = π + τΣPᵀ(PτΣPᵀ + Ω)⁻¹(Q - Pπ)
    const Ppi = matVec(P, pi)
    const QminusPpi = Q.map((q, i) => q - Ppi[i])
    const PtauCovPtPlusOmega = matAdd(PtauCovPt, Omega)
    const invTerm = matrixInverse(PtauCovPtPlusOmega)
    const middle = matVec(invTerm, QminusPpi)
    const tauCovPt = matMul(tauCov, Pt)
    const adjustment = matVec(tauCovPt, middle)
    const posteriorReturns = pi.map((p, i) => p + adjustment[i])

    // Posterior covariance: Σ_post = Σ + τΣ - τΣPᵀ(PτΣPᵀ + Ω)⁻¹PτΣ
    const PtauCov_ = matMul(P, tauCov)  // K×S
    const invPtauCov = matMul(invTerm, PtauCov_)  // K×S
    const PtInv = matMul(Pt, invPtauCov)  // S×S... wait
    // τΣPᵀ(PτΣPᵀ + Ω)⁻¹PτΣ
    const tauCovPt_ = matMul(tauCov, Pt)  // S×K
    const tauCovPtInv = matMul(tauCovPt_, invTerm)  // S×K
    const tauCovPtInvP = matMul(tauCovPtInv, P)  // S×S
    const tauCovPtInvPtauCov = matMul(tauCovPtInvP, tauCov)  // S×S
    const posteriorCov = matSub(matAdd(cov, tauCov), tauCovPtInvPtauCov)

    // Optimal weights: w = (δ·Σ_post)⁻¹ · E[r]
    const deltaSigmaPost = scalarMul(riskAversion, posteriorCov)
    const invDeltaSigmaPost = matrixInverse(deltaSigmaPost)
    const posteriorWeights = matVec(invDeltaSigmaPost, posteriorReturns)

    // Normalize weights
    const sumW = posteriorWeights.reduce((a, b) => a + b, 0)
    const normalizedWeights = posteriorWeights.map(w => sumW !== 0 ? w / sumW : 1 / S)

    // Sharpe ratio per asset
    const sharpes = posteriorReturns.map((r, i) => {
      const vol = Math.sqrt(Math.abs(cov[i][i]))
      return vol > 0 ? r / vol : 0
    })

    return {
      validSymbols, cov, pi, wMkt,
      posteriorReturns, posteriorWeights: normalizedWeights,
      posteriorCov, sharpes,
      P, Q, Omega, validViews,
      hasViews: true,
    }
  }, [candles, exchange, symbols, riskAversion, tau, lookback, views])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 2 symbols with {lookback + 1}+ candles on {exchange}</div>
  }

  const W = 600, H = 200, P = 30
  const colors = ['#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316']

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Black-Litterman Portfolio Allocation — {exchange}</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">δ (risk aversion):</span>
          <input type="number" step="0.1" value={riskAversion} onChange={e => setRiskAversion(Math.max(0.1, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">τ (prior uncertainty):</span>
          <input type="number" step="0.01" value={tau} onChange={e => setTau(Math.max(0.001, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(20, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Views editor */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Investor Views</div>
        <div className="space-y-2">
          {views.map((view, vi) => (
            <div key={vi} className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">View {vi + 1}:</span>
              {data.validSymbols.map((sym, si) => (
                <label key={sym} className="flex items-center gap-1">
                  <span className="text-slate-500">{sym}:</span>
                  <input
                    type="number" step="0.1" value={view.assets[si] || 0}
                    onChange={e => {
                      const newViews = [...views]
                      const newAssets = [...view.assets]
                      while (newAssets.length < data.validSymbols.length) newAssets.push(0)
                      newAssets[si] = +e.target.value
                      newViews[vi] = { ...view, assets: newAssets }
                      setViews(newViews)
                    }}
                    className="w-12 px-1 bg-slate-900 border border-slate-700 rounded text-slate-200"
                  />
                </label>
              ))}
              <span className="text-slate-400">ret:</span>
              <input
                type="number" step="0.001" value={view.return}
                onChange={e => {
                  const newViews = [...views]
                  newViews[vi] = { ...view, return: +e.target.value }
                  setViews(newViews)
                }}
                className="w-16 px-1 bg-slate-900 border border-slate-700 rounded text-slate-200"
              />
              <span className="text-slate-400">conf:</span>
              <input
                type="number" step="0.1" value={view.confidence}
                onChange={e => {
                  const newViews = [...views]
                  newViews[vi] = { ...view, confidence: Math.max(0.01, Math.min(1, +e.target.value)) }
                  setViews(newViews)
                }}
                className="w-12 px-1 bg-slate-900 border border-slate-700 rounded text-slate-200"
              />
              <button
                onClick={() => setViews(views.filter((_, i) => i !== vi))}
                className="text-red-400 hover:text-red-300 px-1"
              >✕</button>
            </div>
          ))}
          <button
            onClick={() => setViews([...views, { assets: new Array(data.validSymbols.length).fill(0), return: 0, confidence: 0.5 }])}
            className="text-xs text-cyan-400 hover:text-cyan-300"
          >+ Add View</button>
        </div>
      </div>

      {/* Weight comparison chart */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Portfolio Weights: Market vs Black-Litterman</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          {data.validSymbols.map((sym, si) => {
            const barW = 60
            const x = P + si * (barW + 20)
            const mktH = Math.abs(data.wMkt[si]) * 300
            const blH = Math.abs(data.posteriorWeights[si]) * 300
            const isLongBL = data.posteriorWeights[si] >= 0
            const isLongMkt = data.wMkt[si] >= 0
            return (
              <g key={sym}>
                <text x={x + barW / 2} y={H - 5} textAnchor="middle" fill="#94a3b8" fontSize={9}>{sym.slice(0, 8)}</text>
                {/* Market weight */}
                <rect x={x} y={H / 2 - (isLongMkt ? mktH : 0)} width={barW / 2 - 2} height={mktH} fill="#64748b" opacity={0.6} />
                {/* BL weight */}
                <rect x={x + barW / 2 + 2} y={H / 2 - (isLongBL ? blH : 0)} width={barW / 2 - 2} height={blH} fill={isLongBL ? '#22c55e' : '#ef4444'} opacity={0.8} />
                <text x={x + barW / 4} y={H / 2 + (isLongMkt ? 12 : -mktH - 5)} textAnchor="middle" fill="#64748b" fontSize={8}>
                  {(data.wMkt[si] * 100).toFixed(1)}%
                </text>
                <text x={x + 3 * barW / 4} y={H / 2 + (isLongBL ? 12 : -blH - 5)} textAnchor="middle" fill={isLongBL ? '#22c55e' : '#ef4444'} fontSize={8}>
                  {(data.posteriorWeights[si] * 100).toFixed(1)}%
                </text>
              </g>
            )
          })}
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#475569" />
          <text x={W - P} y={20} textAnchor="end" fill="#64748b" fontSize={9}>Market</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>BL (green=long, red=short)</text>
        </svg>
      </div>

      {/* Returns comparison */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Expected Returns: Equilibrium (π) vs Posterior</div>
        <div className="space-y-1">
          {data.validSymbols.map((sym, si) => (
            <div key={sym} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-20">{sym}</span>
              <span className="text-slate-500 font-mono w-24">π: {(data.pi[si] * 100).toFixed(3)}%</span>
              <span className="font-mono w-24" style={{ color: data.posteriorReturns[si] >= 0 ? '#22c55e' : '#ef4444' }}>
                BL: {(data.posteriorReturns[si] * 100).toFixed(3)}%
              </span>
              <span className="text-amber-400 font-mono w-24">Sharpe: {data.sharpes[si].toFixed(3)}</span>
              <span className="text-slate-500 font-mono">σ: {(Math.sqrt(Math.abs(data.cov[si][si])) * 100).toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Assets</div>
          <div className="text-cyan-400 font-mono">{data.validSymbols.length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Views</div>
          <div className="text-amber-400 font-mono">{data.validViews?.length || 0}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Long Positions</div>
          <div className="text-emerald-400 font-mono">{data.posteriorWeights.filter(w => w > 0).length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Short Positions</div>
          <div className="text-red-400 font-mono">{data.posteriorWeights.filter(w => w < 0).length}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Model:</strong> δ={riskAversion}, τ={tau} |
        <strong> Max weight:</strong> {Math.max(...data.posteriorWeights.map(Math.abs)).toFixed(4)} |
        <strong> Gross exposure:</strong> {(data.posteriorWeights.reduce((a, b) => a + Math.abs(b), 0) * 100).toFixed(1)}%
      </div>
    </div>
  )
}
