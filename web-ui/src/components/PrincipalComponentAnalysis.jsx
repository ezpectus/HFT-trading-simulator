import React, { useMemo, useState } from 'react'

// ─── Principal Component Analysis (PCA) ──────────────────────────────────────
// Extracts latent factors from multi-asset return matrix using PCA.
// Implements covariance-based PCA with eigendecomposition via Jacobi rotation.
//
// Mathematical foundation:
//   1. Center returns: X_c = X - mean(X)
//   2. Covariance: Σ = (1/n) X_cᵀ X_c
//   3. Eigendecomposition: Σ = V Λ Vᵀ  (Jacobi rotation)
//   4. Sort eigenvalues descending → principal components
//   5. Project: scores = X_c V
//   6. Explained variance ratio: λ_i / Σλ_j
//
//   Applications:
//   - Factor extraction: PC1 = market factor, PC2 = style factor, etc.
//   - Yield curve decomposition: level, slope, curvature
//   - Risk decomposition: systematic vs idiosyncratic
//   - Portfolio construction: eigenportfolio weights

// Jacobi eigenvalue algorithm for symmetric matrices
const jacobiEigendecomposition = (A, maxIter = 100, tol = 1e-10) => {
  const n = A.length
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0))
  const D = A.map(row => row.slice())

  for (let iter = 0; iter < maxIter; iter++) {
    // Find largest off-diagonal element
    let maxVal = 0, p = 0, q = 0
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(D[i][j]) > maxVal) {
          maxVal = Math.abs(D[i][j])
          p = i; q = j
        }
      }
    }

    if (maxVal < tol) break

    // Compute rotation angle
    const theta = (D[q][q] - D[p][p]) / (2 * D[p][q])
    const t = Math.sign(theta) * (Math.abs(theta) + Math.sqrt(theta * theta + 1))
    const c = 1 / Math.sqrt(t * t + 1)
    const s = t * c

    // Apply rotation
    for (let i = 0; i < n; i++) {
      const dip = D[i][p], diq = D[i][q]
      D[i][p] = c * dip - s * diq
      D[i][q] = s * dip + c * diq
    }
    for (let j = 0; j < n; j++) {
      const dpj = D[p][j], dqj = D[q][j]
      D[p][j] = c * dpj - s * dqj
      D[q][j] = s * dpj + c * dqj
    }
    D[p][q] = 0
    D[q][p] = 0

    // Update eigenvectors
    for (let i = 0; i < n; i++) {
      const vip = V[i][p], viq = V[i][q]
      V[i][p] = c * vip - s * viq
      V[i][q] = s * vip + c * viq
    }
  }

  // Extract eigenvalues and sort
  const eigenvalues = D.map((row, i) => row[i])
  const indices = eigenvalues.map((v, i) => i).sort((a, b) => eigenvalues[b] - eigenvalues[a])

  const sortedValues = indices.map(i => eigenvalues[i])
  const sortedVectors = indices.map(i => V.map(row => row[i]))

  return { eigenvalues: sortedValues, eigenvectors: sortedVectors }
}

const computePCA = (returns) => {
  const n = returns.length
  const m = returns[0].length

  // Center
  const means = new Array(m).fill(0)
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) means[j] += returns[i][j]
  for (let j = 0; j < m; j++) means[j] /= n

  const centered = returns.map(row => row.map((v, j) => v - means[j]))

  // Covariance matrix
  const cov = Array.from({ length: m }, () => new Array(m).fill(0))
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let s = 0
      for (let k = 0; k < n; k++) s += centered[k][i] * centered[k][j]
      cov[i][j] = s / (n - 1)
    }
  }

  // Eigendecomposition
  const { eigenvalues, eigenvectors } = jacobiEigendecomposition(cov)

  // Explained variance
  const totalVar = eigenvalues.reduce((a, b) => a + b, 0)
  const explainedRatio = eigenvalues.map(v => v / (totalVar + 1e-10))
  const cumulative = []
  let cumSum = 0
  for (const r of explainedRatio) {
    cumSum += r
    cumulative.push(cumSum)
  }

  // Scores (project data onto PCs)
  const scores = centered.map(row =>
    eigenvectors.map(vec => row.reduce((s, v, j) => s + v * vec[j], 0))
  )

  // Eigenportfolios: weights ∝ eigenvector / σ
  const eigenportfolios = eigenvectors.map(vec => {
    const stds = cov.map((row, i) => Math.sqrt(Math.abs(row[i])))
    const weights = vec.map((v, i) => stds[i] > 0 ? v / stds[i] : 0)
    const sum = weights.reduce((a, b) => a + Math.abs(b), 0)
    return sum > 0 ? weights.map(w => w / sum) : weights
  })

  return {
    eigenvalues, eigenvectors, explainedRatio, cumulative,
    scores, means, eigenportfolios, cov,
    nComponents: eigenvalues.length,
  }
}

export default function PrincipalComponentAnalysis({ candles, symbols, exchange }) {
  const [nComponents, setNComponents] = useState(3)
  const [lookback, setLookback] = useState(50)

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
      for (let i = 1; i < prices.length; i++) {
        rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
      }
      allReturns.push(rets)
      validSymbols.push(sym)
    }

    if (validSymbols.length < 2 || allReturns[0].length < 10) return null

    // Transpose: rows = time, cols = symbols
    const T = allReturns[0].length
    const S = validSymbols.length
    const returnMatrix = Array.from({ length: T }, (_, t) =>
      allReturns.map(rets => rets[t] || 0)
    )

    const pca = computePCA(returnMatrix)

    // Factor interpretation
    const pc1 = pca.eigenvectors[0]
    const allSameSign = pc1.every(v => v >= 0) || pc1.every(v => v <= 0)
    const factorLabels = []
    factorLabels.push(allSameSign ? 'Market Factor' : 'Spread Factor')
    if (pca.eigenvalues.length > 1) {
      const pc2 = pca.eigenvectors[1]
      const half = Math.floor(S / 2)
      const firstHalf = pc2.slice(0, half).reduce((a, b) => a + b, 0)
      const secondHalf = pc2.slice(half).reduce((a, b) => a + b, 0)
      factorLabels.push(Math.sign(firstHalf) !== Math.sign(secondHalf) ? 'Slope Factor' : 'Style Factor')
    }
    if (pca.eigenvalues.length > 2) factorLabels.push('Curvature Factor')
    for (let i = factorLabels.length; i < pca.eigenvalues.length; i++) {
      factorLabels.push(`PC${i + 1}`)
    }

    // Current factor scores
    const lastScores = pca.scores[pca.scores.length - 1]

    // Signal from PC1 (market factor)
    const pc1Score = lastScores[0]
    let signal = 'NEUTRAL'
    let reason = ''
    if (pc1Score > 0 && pca.explainedRatio[0] > 0.4) {
      signal = 'BUY'
      reason = `${factorLabels[0]} positive (+${pc1Score.toFixed(5)}), explains ${(pca.explainedRatio[0] * 100).toFixed(1)}%`
    } else if (pc1Score < 0 && pca.explainedRatio[0] > 0.4) {
      signal = 'SELL'
      reason = `${factorLabels[0]} negative (${pc1Score.toFixed(5)}), explains ${(pca.explainedRatio[0] * 100).toFixed(1)}%`
    } else {
      reason = `${factorLabels[0]} = ${pc1Score.toFixed(5)}, explains ${(pca.explainedRatio[0] * 100).toFixed(1)}%`
    }

    return {
      pca, validSymbols, factorLabels, lastScores,
      signal, reason, pc1Score,
      returns: returnMatrix.slice(-30),
    }
  }, [candles, exchange, symbols, lookback])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 2 symbols with {lookback + 1}+ candles on {exchange}</div>
  }

  const { pca, validSymbols, factorLabels, lastScores, signal, reason } = data
  const W = 700, H = 250, P = 40
  const colors = ['#06b6d4', '#f59e0b', '#22c55e', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316']
  const sigColor = signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#94a3b8'

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Principal Component Analysis — {exchange}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(20, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Scree plot + cumulative */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Scree Plot — Explained Variance Ratio</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {pca.eigenvalues.map((val, i) => {
            const x = P + 20 + i * 60
            const barH = pca.explainedRatio[i] * (H - 2 * P)
            const cumY = H - P - pca.cumulative[i] * (H - 2 * P)
            return (
              <g key={i}>
                <rect x={x} y={H - P - barH} width={30} height={barH} fill={colors[i % colors.length]} opacity={0.7} />
                <text x={x + 15} y={H - P + 15} textAnchor="middle" fill="#94a3b8" fontSize={9}>PC{i + 1}</text>
                <text x={x + 15} y={H - P - barH - 5} textAnchor="middle" fill={colors[i % colors.length]} fontSize={9}>
                  {(pca.explainedRatio[i] * 100).toFixed(1)}%
                </text>
                {i > 0 && (
                  <line
                    x1={P + 20 + (i - 1) * 60 + 15}
                    y1={H - P - pca.cumulative[i - 1] * (H - 2 * P)}
                    x2={x + 15}
                    y2={cumY}
                    stroke="#f59e0b"
                    strokeWidth={2}
                  />
                )}
                <circle cx={x + 15} cy={cumY} r={3} fill="#f59e0b" />
                <text x={x + 15} y={cumY - 8} textAnchor="middle" fill="#f59e0b" fontSize={8}>
                  {(pca.cumulative[i] * 100).toFixed(0)}%
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Eigenvector loadings */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Eigenvector Loadings (first 3 PCs)</div>
        <div className="overflow-x-auto">
          <table className="text-xs font-mono">
            <thead>
              <tr>
                <th className="text-slate-500 px-2">Symbol</th>
                {factorLabels.slice(0, 3).map((label, i) => (
                  <th key={i} className="px-3" style={{ color: colors[i] }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {validSymbols.map((sym, si) => (
                <tr key={sym}>
                  <td className="text-slate-300 px-2">{sym}</td>
                  {[0, 1, 2].map(pi => (
                    <td key={pi} className="px-3 text-slate-400">
                      <span style={{ color: pca.eigenvectors[pi]?.[si] >= 0 ? '#22c55e' : '#ef4444' }}>
                        {(pca.eigenvectors[pi]?.[si] || 0).toFixed(4)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Factor scores over time */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Factor Scores Over Time (last 30 periods)</div>
        <svg width={W} height={150} className="bg-slate-900 rounded">
          <line x1={P} y1={75} x2={W - P} y2={75} stroke="#334155" strokeDasharray="3,3" />
          {[0, 1, 2].map(pi => {
            if (!pca.scores[0]?.[pi]) return null
            const scores = pca.scores.map(s => s[pi]).slice(-30)
            const maxAbs = Math.max(0.001, ...scores.map(Math.abs))
            const sx = (i) => P + (i / Math.max(1, scores.length - 1)) * (W - 2 * P)
            const sy = (v) => 75 - (v / maxAbs) * 60
            const path = scores.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sy(v)}`).join(' ')
            return (
              <g key={pi}>
                <path d={path} fill="none" stroke={colors[pi]} strokeWidth={1.5} />
                <text x={W - P} y={15 + pi * 12} textAnchor="end" fill={colors[pi]} fontSize={9}>
                  {factorLabels[pi]}: {lastScores[pi]?.toFixed(5)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">PC1 Variance</div>
          <div className="text-cyan-400 font-mono">{(pca.explainedRatio[0] * 100).toFixed(2)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">PC1+2+3 Cumul.</div>
          <div className="text-amber-400 font-mono">{((pca.cumulative[2] || 0) * 100).toFixed(2)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Symbols</div>
          <div className="text-slate-300 font-mono">{validSymbols.length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">PC1 Label</div>
          <div className="text-emerald-400 font-mono">{factorLabels[0]}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {reason}
      </div>
    </div>
  )
}
