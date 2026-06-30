import React, { useMemo, useState } from 'react'

// ─── Compressed Sensing (Sparse Signal Recovery) ────────────────────────────
// Recovers sparse signals from undersampled observations using L1 minimization.
// Based on the principle that sparse signals can be recovered from far fewer
// samples than Nyquist-Shannon would require.
//
// Mathematical foundation:
//   Measurement model: y = Φx  (Φ = measurement matrix, m × n, m < n)
//   Recovery: min ||x||_1  s.t.  Φx = y
//
//   RIP (Restricted Isometry Property):
//   (1-δ)||x||² ≤ ||Φx||² ≤ (1+δ)||x||²  for k-sparse x
//
//   Recovery guaranteed if m ≥ C·k·log(n/k)
//
//   Basis Pursuit (BP): solve via linear programming
//   OMP (Orthogonal Matching Pursuit): greedy algorithm
//   1. Find column of Φ most correlated with residual
//   2. Add to support set
//   3. Solve least squares on support
//   4. Update residual
//
//   Applications: sparse signal extraction, anomaly detection,
//   identifying key components from limited data

// Random Gaussian measurement matrix
const measurementMatrix = (m, n) => {
  const Phi = []
  for (let i = 0; i < m; i++) {
    const row = []
    for (let j = 0; j < n; j++) {
      row.push((Math.random() - 0.5) * Math.sqrt(2 / m))
    }
    Phi.push(row)
  }
  return Phi
}

// Matrix-vector multiply
const matVec = (A, x) => A.map(row => row.reduce((s, a, j) => s + a * x[j], 0))

// Transpose matrix-vector
const matTVec = (A, x) => {
  const n = A[0].length
  const result = new Array(n).fill(0)
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < n; j++) {
      result[j] += A[i][j] * x[i]
    }
  }
  return result
}

// Least squares via normal equations
const leastSquares = (A, b) => {
  const m = A.length, n = A[0].length
  // A^T A
  const ATA = Array.from({ length: n }, () => new Array(n).fill(0))
  const ATb = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < m; k++) ATA[i][j] += A[k][i] * A[k][j]
    }
    for (let k = 0; k < m; k++) ATb[i] += A[k][i] * b[k]
  }
  // Solve ATA x = ATb via Gaussian elimination
  const aug = ATA.map((row, i) => [...row, ATb[i]])
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
  // Back substitution
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n]
    for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j]
    x[i] /= (Math.abs(aug[i][i]) > 1e-10 ? aug[i][i] : 1)
  }
  return x
}

// Orthogonal Matching Pursuit
const omp = (Phi, y, sparsity) => {
  const m = Phi.length, n = Phi[0].length
  const support = []
  const residual = y.slice()
  const x = new Array(n).fill(0)

  for (let iter = 0; iter < sparsity; iter++) {
    // 1. Find most correlated column
    let maxCorr = 0, maxIdx = 0
    for (let j = 0; j < n; j++) {
      if (support.includes(j)) continue
      let corr = 0
      for (let i = 0; i < m; i++) corr += Phi[i][j] * residual[i]
      if (Math.abs(corr) > Math.abs(maxCorr)) { maxCorr = corr; maxIdx = j }
    }
    support.push(maxIdx)

    // 2. Solve least squares on support
    const PhiS = Phi.map(row => support.map(j => row[j]))
    const xS = leastSquares(PhiS, y)

    // 3. Update residual
    const recon = matVec(PhiS, xS)
    for (let i = 0; i < m; i++) residual[i] = y[i] - recon[i]

    // Update x
    for (let i = 0; i < support.length; i++) x[support[i]] = xS[i]
  }

  return { x, support, residual }
}

// ISTA (Iterative Shrinkage-Thresholding Algorithm) for L1 minimization
const ista = (Phi, y, lambda, maxIter = 100) => {
  const m = Phi.length, n = Phi[0].length
  // Step size: 1 / largest eigenvalue of Phi^T Phi (approximate)
  let maxEig = 0
  for (let j = 0; j < n; j++) {
    let colNorm = 0
    for (let i = 0; i < m; i++) colNorm += Phi[i][j] * Phi[i][j]
    if (colNorm > maxEig) maxEig = colNorm
  }
  const step = 1 / (maxEig + 1e-10)

  let x = new Array(n).fill(0)

  for (let iter = 0; iter < maxIter; iter++) {
    // Gradient: Phi^T (Phi x - y)
    const Phix = matVec(Phi, x)
    const grad = matTVec(Phi, Phix.map((v, i) => v - y[i]))

    // Gradient step
    const z = x.map((v, j) => v - step * grad[j])

    // Soft thresholding
    x = z.map(v => Math.sign(v) * Math.max(0, Math.abs(v) - lambda * step))
  }

  return x
}

// Compute returns and sparse representation
const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// DFT basis (sparsifying transform)
const dftBasis = (n) => {
  const Psi = []
  for (let i = 0; i < n; i++) {
    const row = []
    for (let j = 0; j < n; j++) {
      row.push(Math.cos(2 * Math.PI * i * j / n) / Math.sqrt(n))
    }
    Psi.push(row)
  }
  return Psi
}

export default function CompressedSensing({ candles, symbol, exchange }) {
  const [sparsity, setSparsity] = useState(5)
  const [sampleRatio, setSampleRatio] = useState(0.5)
  const [lambda, setLambda] = useState(0.01)
  const [lookback, setLookback] = useState(64)
  const [method, setMethod] = useState('omp')

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)
    const n = returns.length

    // Normalize
    const mean = returns.reduce((a, b) => a + b, 0) / n
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / n)
    const signal = returns.map(r => std > 0 ? (r - mean) / std : 0)

    // Sparsifying transform (DFT)
    const Psi = dftBasis(n)
    // Sparse coefficients: s = Psi^T * signal
    const sparseCoeffs = matTVec(Psi, signal)

    // Actual sparsity (count significant coefficients)
    const threshold = 0.1
    const actualSparsity = sparseCoeffs.filter(c => Math.abs(c) > threshold).length

    // Measurement: y = Phi * s (m < n)
    const m = Math.floor(n * sampleRatio)
    const Phi = measurementMatrix(m, n)
    const y = matVec(Phi, sparseCoeffs)

    // Recovery
    let recovered
    if (method === 'omp') {
      const result = omp(Phi, y, sparsity)
      recovered = result.x
    } else {
      recovered = ista(Phi, y, lambda, 200)
    }

    // Reconstruct signal: signal_hat = Psi * s_hat
    const reconSignal = matVec(Psi, recovered)

    // Recovery error
    const error = signal.map((s, i) => s - reconSignal[i])
    const mse = error.reduce((s, e) => s + e * e, 0) / n
    const snr = mse > 0 ? 10 * Math.log10(signal.reduce((s, v) => s + v * v, 0) / n / mse) : Infinity

    // Support set (non-zero coefficients)
    const support = recovered.map((v, i) => ({ idx: i, val: v })).filter(v => Math.abs(v.val) > 0.01).sort((a, b) => Math.abs(b.val) - Math.abs(a.val))

    // Anomaly detection: large sparse coefficients = anomalies
    const anomalies = support.filter(s => Math.abs(s.val) > 0.3)

    // Signal
    let sig = 'NEUTRAL'
    let reason = ''
    if (anomalies.length > 3) {
      sig = 'ANOMALY_DETECTED'
      reason = `${anomalies.length} anomalous frequency components detected (|coeff| > 0.3)`
    } else if (snr > 15) {
      sig = 'SPARSE_RECOVERED'
      reason = `High-quality recovery (SNR = ${snr.toFixed(1)} dB, ${support.length} components)`
    } else if (snr > 5) {
      sig = 'MODERATE_RECOVERY'
      reason = `Moderate recovery (SNR = ${snr.toFixed(1)} dB)`
    } else {
      sig = 'POOR_RECOVERY'
      reason = `Poor recovery (SNR = ${snr.toFixed(1)} dB) — signal not sparse enough`
    }

    return {
      signal, sparseCoeffs, recovered, reconSignal,
      mse, snr, support, anomalies,
      actualSparsity, n, m, sig, reason,
    }
  }, [candles, exchange, symbol, sparsity, sampleRatio, lambda, lookback, method])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.sig === 'ANOMALY_DETECTED' ? '#ef4444' : data.sig === 'SPARSE_RECOVERED' ? '#22c55e' : data.sig === 'MODERATE_RECOVERY' ? '#f59e0b' : '#94a3b8'

  // Signal comparison
  const maxSig = Math.max(...data.signal.map(Math.abs), ...data.reconSignal.map(Math.abs), 0.1)
  const sxSig = (i) => P + (i / data.n) * (W - 2 * P)
  const sySig = (v) => H - P - (v / maxSig) * (H - 2 * P) * 0.45 + H / 4

  // Sparse coefficients
  const maxCoeff = Math.max(...data.sparseCoeffs.map(Math.abs), ...data.recovered.map(Math.abs), 0.1)
  const syCoeff = (v) => H - P - (v / maxCoeff) * (H - 2 * P) * 0.45 + H / 4

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Compressed Sensing (Sparse Recovery) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.sig}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Method:</span>
          <select value={method} onChange={e => setMethod(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="omp">OMP (Orthogonal Matching Pursuit)</option>
            <option value="ista">ISTA (Iterative Shrinkage)</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Sparsity k:</span>
          <input type="number" value={sparsity} onChange={e => setSparsity(Math.max(1, Math.min(20, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Sample ratio m/n:</span>
          <input type="number" step="0.1" value={sampleRatio} onChange={e => setSampleRatio(Math.max(0.1, Math.min(0.9, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        {method === 'ista' && (
          <label className="flex items-center gap-1">
            <span className="text-slate-400">λ (regularization):</span>
            <input type="number" step="0.001" value={lambda} onChange={e => setLambda(Math.max(0.001, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
          </label>
        )}
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(16, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Original vs recovered signal */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Original vs Recovered Signal (n={data.n}, m={data.m})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Original */}
          <path d={data.signal.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxSig(i)} ${sySig(s)}`).join(' ')} fill="none" stroke="#64748b" strokeWidth={1.5} opacity={0.7} />

          {/* Recovered */}
          <path d={data.reconSignal.map((s, i) => `${i === 0 ? 'M' : 'L'} ${sxSig(i)} ${sySig(s)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#64748b" fontSize={9}>Original signal</text>
          <text x={W - P} y={34} textAnchor="end" fill="#06b6d4" fontSize={9}>Recovered (CS)</text>
        </svg>
      </div>

      {/* Sparse coefficients */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Sparse Coefficients (DFT domain): Original vs Recovered</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Original coefficients (stems) */}
          {data.sparseCoeffs.map((c, i) => (
            <line key={`o-${i}`} x1={sxSig(i)} y1={H / 2} x2={sxSig(i)} y2={syCoeff(c)} stroke="#475569" strokeWidth={1} opacity={0.4} />
          ))}

          {/* Recovered coefficients */}
          {data.recovered.map((c, i) => (
            <line key={`r-${i}`} x1={sxSig(i)} y1={H / 2} x2={sxSig(i)} y2={syCoeff(c)} stroke="#f59e0b" strokeWidth={2} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#475569" fontSize={9}>Original (DFT)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>Recovered ({data.support.length} non-zero)</text>
        </svg>
      </div>

      {/* Support set */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Recovered Support Set (top coefficients)</div>
        <div className="space-y-1">
          {data.support.slice(0, 10).map((s, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-16">Index {s.idx}</span>
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
                <div className="h-full rounded absolute" style={{
                  width: `${Math.min(50, Math.abs(s.val) / maxCoeff * 50)}%`,
                  background: Math.abs(s.val) > 0.3 ? '#ef4444' : '#06b6d4',
                  left: s.val >= 0 ? '50%' : `${50 - Math.min(50, Math.abs(s.val) / maxCoeff * 50)}%`
                }} />
              </div>
              <span className="font-mono w-16" style={{ color: Math.abs(s.val) > 0.3 ? '#ef4444' : '#06b6d4' }}>{s.val.toFixed(4)}</span>
              {Math.abs(s.val) > 0.3 && <span className="text-red-400 text-[10px]">ANOMALY</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">n (signal length)</div>
          <div className="text-cyan-400 font-mono">{data.n}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">m (measurements)</div>
          <div className="text-amber-400 font-mono">{data.m}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Actual sparsity</div>
          <div className="text-purple-400 font-mono">{data.actualSparsity}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">SNR (dB)</div>
          <div className="text-emerald-400 font-mono">{data.snr.toFixed(1)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Anomalies</div>
          <div className="text-red-400 font-mono">{data.anomalies.length}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Model:</strong> y = Φ·s, recover s via {method === 'omp' ? 'OMP (greedy)' : 'ISTA (L1 min)'} |
        <strong> Sparsifying:</strong> DFT basis |
        <strong> Sampling:</strong> m/n = {(data.m / data.n).toFixed(2)} ({((1 - data.m / data.n) * 100).toFixed(0)}% compression) |
        <strong> RIP:</strong> m ≥ C·k·log(n/k)
      </div>
    </div>
  )
}
