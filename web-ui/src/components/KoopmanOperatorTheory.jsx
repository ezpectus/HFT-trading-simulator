import React, { useMemo, useState } from 'react'

// ─── Koopman Operator Theory (Data-Driven Dynamical Systems) ────────────────
// Lifts nonlinear dynamics into a high-dimensional linear space via the
// Koopman operator, enabling spectral analysis and forecasting of the
// underlying dynamical system from observed data.
//
// Mathematical foundation:
//   Koopman operator K: g(x_t) → g(x_{t+1}) for observable g
//   K is linear (infinite-dimensional) even for nonlinear dynamics
//
//   EDMD (Extended Dynamic Mode Decomposition):
//   Choose dictionary Ψ(x) = [ψ_1(x), ..., ψ_N(x)]
//   G = Σ Ψ(x_t) Ψ(x_t)ᵀ  (Gram matrix)
//   A = Σ Ψ(x_{t+1}) Ψ(x_t)ᵀ
//   K ≈ A·G⁻¹  (finite approximation)
//
//   Eigen-decomposition: K·φ_i = λ_i·φ_i
//   Modes: v_i = (Ψᵀ·φ_i)  (spatial patterns)
//   Forecast: Ψ(x_{t+k}) ≈ Σ λ_i^k · φ_i · (φ_iᵀ·Ψ(x_t))
//
//   Applications: nonlinear dynamics linearization, mode decomposition,
//   long-term forecasting, coherent structure detection

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Dictionary functions (polynomial + Fourier features)
const dictionary = (x, maxPoly = 2, nFourier = 3) => {
  const features = [1] // constant
  // Polynomial features
  for (let p = 1; p <= maxPoly; p++) features.push(x ** p)
  // Fourier features
  for (let f = 1; f <= nFourier; f++) {
    features.push(Math.sin(2 * Math.PI * f * x))
    features.push(Math.cos(2 * Math.PI * f * x))
  }
  return features
}

// EDMD: compute Koopman approximation
const edmd = (states, nextStates, dictFn) => {
  const n = states.length
  const dim = dictFn(states[0]).length

  // Build data matrices
  const Psi = states.map(s => dictFn(s))      // n × dim
  const PsiNext = nextStates.map(s => dictFn(s)) // n × dim

  // G = ΨᵀΨ (dim × dim)
  const G = Array.from({ length: dim }, () => new Array(dim).fill(0))
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      for (let k = 0; k < n; k++) G[i][j] += Psi[k][i] * Psi[k][j]
    }
  }

  // A = ΨNextᵀ Ψ (dim × dim)
  const A = Array.from({ length: dim }, () => new Array(dim).fill(0))
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      for (let k = 0; k < n; k++) A[i][j] += PsiNext[k][i] * Psi[k][j]
    }
  }

  // K = A · G⁻¹  (regularized)
  const lambda = 0.01 // regularization
  for (let i = 0; i < dim; i++) G[i][i] += lambda

  // Solve K·G = A → K = A·G⁻¹ via Gaussian elimination
  // Augment [G | Aᵀ] and solve Gᵀ·Kᵀ = Aᵀ → Kᵀ = G⁻¹·Aᵀ
  const aug = Array.from({ length: dim }, (_, i) =>
    [...G[i], ...A.map(row => row[i])]
  )
  for (let col = 0; col < dim; col++) {
    let maxRow = col
    for (let r = col + 1; r < dim; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]
    if (Math.abs(aug[col][col]) < 1e-12) continue
    for (let r = col + 1; r < dim; r++) {
      const factor = aug[r][col] / aug[col][col]
      for (let c = col; c < 2 * dim; c++) aug[r][c] -= factor * aug[col][c]
    }
  }
  // Back substitution for Kᵀ
  const KT = Array.from({ length: dim }, () => new Array(dim).fill(0))
  for (let i = dim - 1; i >= 0; i--) {
    for (let j = 0; j < dim; j++) {
      KT[i][j] = aug[i][dim + j]
      for (let k = i + 1; k < dim; k++) KT[i][j] -= aug[i][k] * KT[k][j]
      KT[i][j] /= (Math.abs(aug[i][i]) > 1e-12 ? aug[i][i] : 1)
    }
  }
  // K = KTᵀ
  const K = Array.from({ length: dim }, () => new Array(dim).fill(0))
  for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) K[i][j] = KT[j][i]

  return { K, Psi, PsiNext, dim }
}

// Jacobi eigenvalue decomposition (for small symmetric matrices)
// For general matrices, use power iteration for dominant eigenvalues
const powerIteration = (M, nIter = 100) => {
  const n = M.length
  let v = Array.from({ length: n }, () => Math.random() - 0.5)
  let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  v = v.map(x => x / norm)

  for (let iter = 0; iter < nIter; iter++) {
    const Mv = M.map(row => row.reduce((s, m, j) => s + m * v[j], 0))
    norm = Math.sqrt(Mv.reduce((s, x) => s + x * x, 0))
    if (norm < 1e-10) break
    v = Mv.map(x => x / norm)
  }

  const Mv = M.map(row => row.reduce((s, m, j) => s + m * v[j], 0))
  const eigenvalue = v.reduce((s, x, i) => s + x * Mv[i], 0)

  return { eigenvalue, eigenvector: v }
}

export default function KoopmanOperatorTheory({ candles, symbol, exchange }) {
  const [maxPoly, setMaxPoly] = useState(2)
  const [nFourier, setNFourier] = useState(3)
  const [lookback, setLookback] = useState(100)
  const [forecastSteps, setForecastSteps] = useState(10)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    // Normalize
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length)
    const normR = returns.map(r => std > 0 ? (r - mean) / std : 0)

    // State pairs: (x_t, x_{t+1})
    const states = normR.slice(0, -1)
    const nextStates = normR.slice(1)

    const dictFn = (x) => dictionary(x, maxPoly, nFourier)

    // EDMD
    const { K, Psi, dim } = edmd(states, nextStates, dictFn)

    // Dominant eigenvalues via power iteration (with deflation)
    const eigenvalues = []
    let M = K.map(row => row.slice())
    for (let i = 0; i < Math.min(5, dim); i++) {
      const { eigenvalue, eigenvector } = powerIteration(M, 200)
      if (Math.abs(eigenvalue) < 1e-8) break
      eigenvalues.push({ value: eigenvalue, modulus: Math.abs(eigenvalue), phase: Math.atan2(0, eigenvalue) })

      // Deflate: M = M - λ·v·vᵀ
      for (let r = 0; r < dim; r++) {
        for (let c = 0; c < dim; c++) {
          M[r][c] -= eigenvalue * eigenvector[r] * eigenvector[c]
        }
      }
    }

    // Forecast: iterate Koopman operator
    const currentPsi = dictFn(normR[normR.length - 1])
    const forecasts = []
    let psi = currentPsi.slice()
    for (let step = 0; step < forecastSteps; step++) {
      // ψ_{t+1} = K·ψ_t
      const newPsi = K.map(row => row.reduce((s, k, j) => s + k * psi[j], 0))
      psi = newPsi

      // Reconstruct observable (identity on first non-constant feature = x)
      const forecastVal = psi[1] // ψ_1 = x (first polynomial)
      forecasts.push(forecastVal * std + mean) // denormalize
    }

    // Reconstruction quality: compare K·Ψ vs ΨNext
    let reconError = 0
    for (let t = 0; t < states.length; t++) {
      const predicted = K.map(row => row.reduce((s, k, j) => s + k * Psi[t][j], 0))
      const error = predicted[1] - nextStates[t] // compare x component
      reconError += error * error
    }
    reconError /= states.length

    // Mode amplitudes
    const modeAmplitudes = eigenvalues.map(e => Math.abs(e.value))

    // Signal
    const dominantModulus = eigenvalues[0]?.modulus || 0
    let signal = 'NEUTRAL'
    let reason = ''
    if (dominantModulus > 0.95) {
      signal = 'PERSISTENT_DYNAMICS'
      reason = `Dominant eigenvalue |λ|=${dominantModulus.toFixed(4)} (near-unit, persistent dynamics)`
    } else if (dominantModulus < 0.5) {
      signal = 'FAST_DECAY'
      reason = `Dominant eigenvalue |λ|=${dominantModulus.toFixed(4)} (fast decay, mean-reverting)`
    } else {
      reason = `Dominant eigenvalue |λ|=${dominantModulus.toFixed(4)} (moderate persistence)`
    }

    // Forecast direction
    const forecastDir = forecasts.length > 0 ? forecasts[forecasts.length - 1] - (normR[normR.length - 1] * std + mean) : 0
    if (forecastDir > 0.001) {
      signal = signal === 'PERSISTENT_DYNAMICS' ? 'BULLISH_PERSISTENT' : 'BULLISH'
      reason += ` | Forecast: upward (${forecastDir.toFixed(6)})`
    } else if (forecastDir < -0.001) {
      signal = signal === 'PERSISTENT_DYNAMICS' ? 'BEARISH_PERSISTENT' : 'BEARISH'
      reason += ` | Forecast: downward (${forecastDir.toFixed(6)})`
    }

    return {
      eigenvalues, forecasts, reconError,
      signal, reason, dominantModulus,
      normR, mean, std, dim,
      actualReturns: returns.slice(-forecastSteps),
    }
  }, [candles, exchange, symbol, maxPoly, nFourier, lookback, forecastSteps])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal.includes('BULLISH') ? '#22c55e' : data.signal.includes('BEARISH') ? '#ef4444' : '#06b6d4'

  // Eigenvalue spectrum
  const maxEig = Math.max(...data.eigenvalues.map(e => e.modulus), 1)
  const sxEig = (i) => P + (i / Math.max(1, data.eigenvalues.length)) * (W - 2 * P)
  const syEig = (v) => H - P - (v / maxEig) * (H - 2 * P)

  // Forecast vs actual
  const allVals = [...data.forecasts, ...data.actualReturns]
  const maxV = Math.max(...allVals.map(Math.abs), 0.01)
  const sxF = (i) => P + (i / data.forecasts.length) * (W - 2 * P)
  const syF = (v) => H - P - ((v + maxV) / (2 * maxV)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Koopman Operator Theory (EDMD) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Poly deg:</span>
          <input type="number" value={maxPoly} onChange={e => setMaxPoly(Math.max(1, Math.min(4, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Fourier modes:</span>
          <input type="number" value={nFourier} onChange={e => setNFourier(Math.max(0, Math.min(6, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Forecast steps:</span>
          <input type="number" value={forecastSteps} onChange={e => setForecastSteps(Math.max(1, Math.min(30, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Eigenvalue spectrum */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Koopman Eigenvalue Spectrum (dominant modes, |λ| ≤ 1 = stable)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={syEig(1)} x2={W - P} y2={syEig(1)} stroke="#475569" strokeWidth={1} strokeDasharray="3,3" />

          {data.eigenvalues.map((e, i) => (
            <g key={i}>
              <line x1={sxEig(i) + 30} y1={H - P} x2={sxEig(i) + 30} y2={syEig(e.modulus)} stroke="#06b6d4" strokeWidth={2} opacity={0.7} />
              <text x={sxEig(i) + 30} y={H - P + 12} textAnchor="middle" fill="#06b6d4" fontSize={9}>λ_{i + 1}</text>
              <text x={sxEig(i) + 30} y={syEig(e.modulus) - 5} textAnchor="middle" fill="#06b6d4" fontSize={8}>{e.modulus.toFixed(4)}</text>
            </g>
          ))}

          <text x={W - P} y={syEig(1) - 5} textAnchor="end" fill="#475569" fontSize={9}>|λ| = 1 (unit circle)</text>
        </svg>
      </div>

      {/* Forecast vs actual */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Koopman Forecast vs Actual Returns ({forecastSteps} steps ahead)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Actual */}
          {data.actualReturns.map((v, i) => (
            <circle key={i} cx={sxF(i)} cy={syF(v)} r={3} fill="#64748b" opacity={0.7} />
          ))}

          {/* Forecast */}
          <path d={data.forecasts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxF(i)} ${syF(v)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />
          {data.forecasts.map((v, i) => (
            <circle key={i} cx={sxF(i)} cy={syF(v)} r={4} fill="#fbbf24" />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#fbbf24" fontSize={9}>Koopman forecast</text>
          <text x={W - P} y={34} textAnchor="end" fill="#64748b" fontSize={9}>Actual returns</text>
        </svg>
      </div>

      {/* Mode amplitudes */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Koopman Mode Amplitudes (|λ_i|)</div>
        <div className="space-y-1">
          {data.eigenvalues.slice(0, 5).map((e, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-12">Mode {i + 1}</span>
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="h-full rounded" style={{ width: `${(e.modulus / maxEig) * 100}%`, background: ['#06b6d4', '#f59e0b', '#a855f7', '#22c55e', '#ef4444'][i] }} />
              </div>
              <span className="font-mono w-20" style={{ color: ['#06b6d4', '#f59e0b', '#a855f7', '#22c55e', '#ef4444'][i] }}>λ={e.value.toFixed(6)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Dict dim</div>
          <div className="text-cyan-400 font-mono">{data.dim}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">|λ₁| dominant</div>
          <div className="text-emerald-400 font-mono">{data.dominantModulus.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Recon MSE</div>
          <div className="text-amber-400 font-mono">{data.reconError.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">N modes</div>
          <div className="text-purple-400 font-mono">{data.eigenvalues.length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Forecast dir</div>
          <div className="font-mono" style={{ color: sigColor }}>{data.forecasts[0] > 0 ? 'UP' : 'DOWN'}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> EDMD:</strong> K ≈ A·G⁻¹ (Extended DMD) |
        <strong> Dictionary:</strong> Ψ(x) = [1, x, x², sin(ωx), cos(ωx), ...] |
        <strong> Eigen:</strong> K·φ_i = λ_i·φ_i (power iteration + deflation) |
        <strong> Forecast:</strong> Ψ(x_{'{t+k}'}) ≈ K^k·Ψ(x_t) |
        <strong> |λ|≈1:</strong> persistent, |λ|{'<'}0.5: fast mean reversion
      </div>
    </div>
  )
}
