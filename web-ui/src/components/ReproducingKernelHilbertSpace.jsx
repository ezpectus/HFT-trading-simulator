import React, { useMemo, useState } from 'react'

// ─── Reproducing Kernel Hilbert Space (RKHS) ────────────────────────────────
// Uses kernel methods to map financial time series into a high-dimensional
// feature space implicitly, enabling non-linear analysis without explicit
// feature engineering.
//
// Mathematical foundation:
//   Kernel function: k(x, y) = <φ(x), φ(y)>_H
//   where φ maps to Hilbert space H
//
//   Common kernels:
//   RBF: k(x,y) = exp(-||x-y||²/(2σ²))
//   Polynomial: k(x,y) = (x·y + c)^d
//   Laplacian: k(x,y) = exp(-||x-y||/σ)
//
//   Kernel trick: operations in H without computing φ explicitly
//
//   Kernel PCA: eigendecomposition of kernel matrix K
//   K = ΦΦᵀ, eigenvalues λ_i, eigenvectors α_i
//   Projection: PC_i(x) = Σ_j α_{ij}·k(x_j, x)
//
//   Maximum Mean Discrepancy (MMD):
//   MMD(P, Q) = ||μ_P - μ_Q||_H = sup_f ||E_P[f] - E_Q[f]||
//   Empirical: MMD² = (1/n²)Σk(x_i,x_j) + (1/m²)Σk(y_i,y_j) - (2/nm)Σk(x_i,y_j)
//
//   Kernel ridge regression: f(x) = Σ α_i·k(x_i, x)
//   α = (K + λI)⁻¹·y

// Kernels
const rbfKernel = (x, y, sigma) => {
  let dist2 = 0
  for (let i = 0; i < x.length; i++) dist2 += (x[i] - y[i]) ** 2
  return Math.exp(-dist2 / (2 * sigma * sigma))
}

const laplacianKernel = (x, y, sigma) => {
  let dist = 0
  for (let i = 0; i < x.length; i++) dist += Math.abs(x[i] - y[i])
  return Math.exp(-dist / sigma)
}

// Build kernel matrix
const kernelMatrix = (X, kernel, sigma) => {
  const n = X.length
  const K = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      K[i][j] = kernel(X[i], X[j], sigma)
      K[j][i] = K[i][j]
    }
  }
  return K
}

// Center kernel matrix: K_c = H·K·H where H = I - (1/n)·11ᵀ
const centerKernel = (K) => {
  const n = K.length
  const rowMeans = K.map(row => row.reduce((a, b) => a + b, 0) / n)
  const grandMean = rowMeans.reduce((a, b) => a + b, 0) / n
  return K.map((row, i) => row.map((v, j) => v - rowMeans[i] - rowMeans[j] + grandMean))
}

// Jacobi eigendecomposition (for small matrices)
const jacobiEig = (A, maxIter = 50, tol = 1e-8) => {
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
  const eigenvalues = D.map((row, i) => row[i])
  const eigenvectors = eigenvalues.map((_, j) => V.map(row => row[j]))
  return { eigenvalues, eigenvectors }
}

// MMD (Maximum Mean Discrepancy)
const computeMMD = (X, Y, kernel, sigma) => {
  const n = X.length, m = Y.length
  let sumXX = 0, sumYY = 0, sumXY = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) sumXX += kernel(X[i], X[j], sigma)
  }
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) sumYY += kernel(Y[i], Y[j], sigma)
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) sumXY += kernel(X[i], Y[j], sigma)
  }
  return Math.sqrt(Math.max(0, sumXX / (n * n) + sumYY / (m * m) - 2 * sumXY / (n * m)))
}

// Kernel ridge regression
const kernelRidgeRegression = (X, y, kernel, sigma, lambda) => {
  const n = X.length
  const K = kernelMatrix(X, kernel, sigma)
  // (K + λI) α = y
  const A = K.map((row, i) => row.map((v, j) => v + (i === j ? lambda : 0)))
  // Gaussian elimination
  const aug = A.map((row, i) => [...row, y[i]])
  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]
    if (Math.abs(aug[col][col]) < 1e-10) continue
    for (let r = col + 1; r < n; r++) {
      const factor = aug[r][col] / aug[col][col]
      for (let c = col; c <= n; c++) aug[r][c] -= factor * aug[col][c]
    }
  }
  const alpha = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    alpha[i] = aug[i][n]
    for (let j = i + 1; j < n; j++) alpha[i] -= aug[i][j] * alpha[j]
    alpha[i] /= (Math.abs(aug[i][i]) > 1e-10 ? aug[i][i] : 1)
  }
  return alpha
}

const predictKRR = (alpha, X_train, x_new, kernel, sigma) => {
  let sum = 0
  for (let i = 0; i < X_train.length; i++) {
    sum += alpha[i] * kernel(X_train[i], x_new, sigma)
  }
  return sum
}

export default function ReproducingKernelHilbertSpace({ candles, symbol, exchange }) {
  const [kernelType, setKernelType] = useState('rbf')
  const [sigma, setSigma] = useState(0.5)
  const [lambda, setLambda] = useState(0.01)
  const [lookback, setLookback] = useState(60)
  const [nComponents, setNComponents] = useState(3)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // Normalize
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length)
    const normR = returns.map(r => std > 0 ? (r - mean) / std : 0)

    // Create feature vectors: [r_t, r_{t-1}, r_{t-2}] (3D embedding)
    const embedDim = 3
    const X = []
    for (let i = embedDim - 1; i < normR.length; i++) {
      X.push([normR[i], normR[i - 1], normR[i - 2]])
    }

    if (X.length < 5) return null

    const kernel = kernelType === 'rbf' ? rbfKernel : laplacianKernel

    // Kernel PCA
    const K = kernelMatrix(X, kernel, sigma)
    const Kc = centerKernel(K)
    const { eigenvalues, eigenvectors } = jacobiEig(Kc, 50)

    // Sort by eigenvalue (descending)
    const sortedIdx = eigenvalues.map((v, i) => i).sort((a, b) => eigenvalues[b] - eigenvalues[a])
    const topEigs = sortedIdx.slice(0, nComponents).map(i => ({
      eigenvalue: eigenvalues[i],
      eigenvector: eigenvectors[i],
    }))

    // Projections onto top kernel PCs
    const projections = X.map((x, i) => {
      const pcs = topEigs.map(eig => {
        let proj = 0
        for (let j = 0; j < X.length; j++) {
          proj += eig.eigenvector[j] * K[i][j]
        }
        return proj / Math.sqrt(Math.max(1e-10, eig.eigenvalue))
      })
      return pcs
    })

    // MMD: compare first half vs second half of returns (regime shift)
    const halfIdx = Math.floor(X.length / 2)
    const X1 = X.slice(0, halfIdx)
    const X2 = X.slice(halfIdx)
    const mmd = computeMMD(X1, X2, kernel, sigma)

    // Kernel ridge regression: predict next return
    const yKRR = normR.slice(embedDim) // next return
    const XKRR = X.slice(0, -1) // remove last (no target)
    if (XKRR.length < 5 || yKRR.length < 5) return null

    const alpha = kernelRidgeRegression(XKRR, yKRR, kernel, sigma, lambda)

    // Predictions
    const predictions = XKRR.map(x => predictKRR(alpha, XKRR, x, kernel, sigma))
    const actualNext = yKRR

    // MSE
    const mse = predictions.reduce((s, p, i) => s + (p - actualNext[i]) ** 2, 0) / predictions.length
    const r2 = 1 - mse / (yKRR.reduce((s, v) => s + (v - mean) ** 2, 0) / yKRR.length + 1e-10)

    // Current prediction
    const currentPred = predictions[predictions.length - 1]

    // Signal
    let signal = 'NEUTRAL'
    let reason = ''
    if (currentPred > 0.3) {
      signal = 'BUY'
      reason = `RKHS prediction = ${currentPred.toFixed(4)} (positive)`
    } else if (currentPred < -0.3) {
      signal = 'SELL'
      reason = `RKHS prediction = ${currentPred.toFixed(4)} (negative)`
    } else {
      reason = `RKHS prediction = ${currentPred.toFixed(4)} (neutral)`
    }

    if (mmd > 0.3) {
      signal = 'REGIME_SHIFT'
      reason = `MMD = ${mmd.toFixed(4)} (distribution shift detected)`
    }

    return {
      topEigs, projections, mmd,
      predictions, actualNext, mse, r2, currentPred,
      signal, reason, X, nSamples: X.length,
    }
  }, [candles, exchange, symbol, kernelType, sigma, lambda, lookback, nComponents])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : data.signal === 'REGIME_SHIFT' ? '#a855f7' : '#94a3b8'
  const pcColors = ['#06b6d4', '#f59e0b', '#a855f7']

  // KPCA scatter (PC1 vs PC2)
  const allPC1 = data.projections.map(p => p[0])
  const allPC2 = data.projections.map(p => p[1] || 0)
  const minPC1 = Math.min(...allPC1), maxPC1 = Math.max(...allPC1)
  const minPC2 = Math.min(...allPC2), maxPC2 = Math.max(...allPC2)
  const sxPC1 = (v) => P + ((v - minPC1) / (maxPC1 - minPC1 + 0.001)) * (W - 2 * P)
  const syPC2 = (v) => H - P - ((v - minPC2) / (maxPC2 - minPC2 + 0.001)) * (H - 2 * P)

  // Predictions vs actual
  const maxPred = Math.max(...data.predictions.map(Math.abs), ...data.actualNext.map(Math.abs), 0.1)
  const sxPred = (i) => P + (i / data.predictions.length) * (W - 2 * P)
  const syPred = (v) => H - P - ((v + maxPred) / (2 * maxPred)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">RKHS (Kernel Methods) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Kernel:</span>
          <select value={kernelType} onChange={e => setKernelType(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="rbf">RBF (Gaussian)</option>
            <option value="laplacian">Laplacian</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">σ (bandwidth):</span>
          <input type="number" step="0.1" value={sigma} onChange={e => setSigma(Math.max(0.1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">λ (ridge):</span>
          <input type="number" step="0.001" value={lambda} onChange={e => setLambda(Math.max(0.001, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">PCs:</span>
          <input type="number" value={nComponents} onChange={e => setNComponents(Math.max(1, Math.min(5, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(30, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Kernel PCA scatter */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Kernel PCA: PC1 vs PC2 (implicit feature space)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" strokeDasharray="2,2" />
          <line x1={W / 2} y1={P} x2={W / 2} y2={H - P} stroke="#334155" strokeDasharray="2,2" />

          {data.projections.map((p, i) => {
            const halfIdx = Math.floor(data.projections.length / 2)
            const color = i < halfIdx ? '#06b6d4' : '#f59e0b'
            return <circle key={i} cx={sxPC1(p[0])} cy={syPC2(p[1] || 0)} r={4} fill={color} opacity={0.7} />
          })}

          <text x={W - P} y={20} textAnchor="end" fill="#06c6d4" fontSize={9}>First half (regime 1)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>Second half (regime 2)</text>
          <text x={W - P} y={48} textAnchor="end" fill="#a855f7" fontSize={9}>MMD = {data.mmd.toFixed(4)}</text>
        </svg>
      </div>

      {/* KRR predictions */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Kernel Ridge Regression: Predicted vs Actual Next Return</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Actual */}
          <path d={data.actualNext.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxPred(i)} ${syPred(v)}`).join(' ')} fill="none" stroke="#64748b" strokeWidth={1.5} opacity={0.7} />

          {/* Predicted */}
          <path d={data.predictions.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxPred(i)} ${syPred(v)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#64748b" fontSize={9}>Actual</text>
          <text x={W - P} y={34} textAnchor="end" fill="#06b6d4" fontSize={9}>KRR predicted</text>
          <text x={W - P} y={48} textAnchor="end" fill="#22c55e" fontSize={9}>R² = {data.r2.toFixed(4)}</text>
        </svg>
      </div>

      {/* Eigenvalue spectrum */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Kernel Eigenvalue Spectrum (top {nComponents})</div>
        <div className="space-y-1">
          {data.topEigs.map((eig, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-16">PC{i + 1}</span>
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="h-full rounded" style={{ width: `${(eig.eigenvalue / data.topEigs[0].eigenvalue) * 100}%`, background: pcColors[i] }} />
              </div>
              <span className="font-mono w-20" style={{ color: pcColors[i] }}>λ={eig.eigenvalue.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Samples</div>
          <div className="text-cyan-400 font-mono">{data.nSamples}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">MMD</div>
          <div className="text-amber-400 font-mono">{data.mmd.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">R² (KRR)</div>
          <div className="text-emerald-400 font-mono">{data.r2.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">MSE</div>
          <div className="text-purple-400 font-mono">{data.mse.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Prediction</div>
          <div className="font-mono" style={{ color: sigColor }}>{data.currentPred.toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Kernel:</strong> {kernelType === 'rbf' ? 'k(x,y)=exp(-||x-y||²/2σ²)' : 'k(x,y)=exp(-||x-y||/σ)'} |
        <strong> KPCA:</strong> eigendecomposition of centered kernel matrix |
        <strong> MMD:</strong> ||μ_P - μ_Q||_H (distribution comparison) |
        <strong> KRR:</strong> f(x) = Σ α_i·k(x_i, x), α = (K+λI)⁻¹y
      </div>
    </div>
  )
}
