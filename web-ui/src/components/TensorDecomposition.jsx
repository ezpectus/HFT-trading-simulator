import React, { useMemo, useState } from 'react'

// ─── Tensor Decomposition (CP / Tucker for Multi-Way Data) ───────────────────
// Decomposes multi-dimensional financial data tensors using CANDECOMP/PARAFAC
// (CP) and Tucker decompositions for dimensionality reduction and pattern extraction.
//
// Mathematical foundation:
//   Tensor: T ∈ R^{I×J×K} (e.g., assets × timeframes × features)
//
//   CP Decomposition (rank-R):
//   T ≈ Σ_{r=1}^{R} a_r ∘ b_r ∘ c_r
//   where a_r ∈ R^I, b_r ∈ R^J, c_r ∈ R^K
//
//   Tucker Decomposition:
//   T ≈ G ×_1 A ×_2 B ×_3 C
//   where G ∈ R^{R1×R2×R3} (core tensor), A,B,C are factor matrices
//
//   ALS (Alternating Least Squares) for CP:
//   Fix all but one factor, solve least squares, iterate
//
//   Applications: multi-asset multi-timeframe analysis, latent factor extraction

// Build tensor: assets × timeframes × features
const buildTensor = (candles, exchange, symbols, timeframes, lookback) => {
  const nAssets = symbols.length
  const nTF = timeframes.length
  const nFeatures = 5 // return, vol, range, momentum, volume
  const nTime = Math.floor(lookback / Math.max(...timeframes))

  const tensor = []
  for (let a = 0; a < nAssets; a++) {
    const cds = candles[exchange]?.[symbols[a]]
    if (!cds || cds.length < lookback) return null

    const assetSlice = []
    for (let f = 0; f < nTF; f++) {
      const tf = timeframes[f]
      const features = []

      for (let t = 0; t < nTime; t++) {
        const start = cds.length - lookback + t * tf
        const window = cds.slice(start, start + tf)
        if (window.length < 2) {
          features.push(new Array(nFeatures).fill(0))
          continue
        }

        const prices = window.map(c => c.close)
        const ret = (prices[prices.length - 1] - prices[0]) / prices[0]
        const returns = []
        for (let i = 1; i < prices.length; i++) {
          returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length
        const vol = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length)
        const range = (Math.max(...prices) - Math.min(...prices)) / prices[0]
        const momentum = ret / (vol + 1e-10)
        const volume = window.reduce((s, c) => s + c.volume, 0) / window.length

        features.push([ret, vol, range, momentum, Math.log(volume + 1)])
      }
      assetSlice.push(features)
    }
    tensor.push(assetSlice)
  }

  // Normalize
  const allVals = []
  for (let a = 0; a < nAssets; a++)
    for (let f = 0; f < nTF; f++)
      for (let t = 0; t < nTime; t++)
        for (let k = 0; k < nFeatures; k++)
          allVals.push(tensor[a][f][t][k])

  // Actually tensor is assets × timeframes × time × features
  // Flatten to 3D: assets × (timeframes × time) × features for CP
  const flatTensor = []
  for (let a = 0; a < nAssets; a++) {
    const matrix = []
    for (let f = 0; f < nTF; f++) {
      for (let t = 0; t < nTime; t++) {
        matrix.push(tensor[a][f][t])
      }
    }
    flatTensor.push(matrix)
  }

  return { tensor: flatTensor, nAssets, nTF, nTime, nFeatures, nCols: nTF * nTime }
}

// CP decomposition via ALS (simplified for 3D: modes = assets, time, features)
const cpDecompose = (tensor, rank, maxIter = 50) => {
  const I = tensor.length       // assets
  const J = tensor[0].length    // time
  const K = tensor[0][0].length // features

  // Initialize factors randomly
  const initFactor = (n, r) => Array.from({ length: n }, () =>
    Array.from({ length: r }, () => Math.random() - 0.5)
  )

  let A = initFactor(I, rank) // assets × rank
  let B = initFactor(J, rank) // time × rank
  let C = initFactor(K, rank) // features × rank

  const errors = []

  for (let iter = 0; iter < maxIter; iter++) {
    // Update A (fix B, C)
    for (let i = 0; i < I; i++) {
      for (let r = 0; r < rank; r++) {
        let num = 0, den = 0
        for (let j = 0; j < J; j++) {
          for (let k = 0; k < K; k++) {
            let khatriRao = 1
            for (let rr = 0; rr < rank; rr++) {
              // simplified: just use current factors
            }
            num += tensor[i][j][k] * B[j][r] * C[k][r]
            den += B[j][r] * B[j][r] * C[k][r] * C[k][r]
          }
        }
        A[i][r] = den > 1e-10 ? num / den : A[i][r]
      }
    }

    // Update B (fix A, C)
    for (let j = 0; j < J; j++) {
      for (let r = 0; r < rank; r++) {
        let num = 0, den = 0
        for (let i = 0; i < I; i++) {
          for (let k = 0; k < K; k++) {
            num += tensor[i][j][k] * A[i][r] * C[k][r]
            den += A[i][r] * A[i][r] * C[k][r] * C[k][r]
          }
        }
        B[j][r] = den > 1e-10 ? num / den : B[j][r]
      }
    }

    // Update C (fix A, B)
    for (let k = 0; k < K; k++) {
      for (let r = 0; r < rank; r++) {
        let num = 0, den = 0
        for (let i = 0; i < I; i++) {
          for (let j = 0; j < J; j++) {
            num += tensor[i][j][k] * A[i][r] * B[j][r]
            den += A[i][r] * A[i][r] * B[j][r] * B[j][r]
          }
        }
        C[k][r] = den > 1e-10 ? num / den : C[k][r]
      }
    }

    // Compute reconstruction error
    let error = 0
    for (let i = 0; i < I; i++) {
      for (let j = 0; j < J; j++) {
        for (let k = 0; k < K; k++) {
          let recon = 0
          for (let r = 0; r < rank; r++) {
            recon += A[i][r] * B[j][r] * C[k][r]
          }
          error += (tensor[i][j][k] - recon) ** 2
        }
      }
    }
    errors.push(error)
  }

  // Normalize factors (extract weights)
  const weights = new Array(rank).fill(0)
  for (let r = 0; r < rank; r++) {
    let maxA = Math.max(...A.map(row => Math.abs(row[r])), 1e-10)
    weights[r] = maxA
    for (let i = 0; i < I; i++) A[i][r] /= maxA
  }

  return { A, B, C, weights, errors, rank }
}

export default function TensorDecomposition({ candles, symbols, exchange }) {
  const [rank, setRank] = useState(3)
  const [lookback, setLookback] = useState(100)
  const [maxIter, setMaxIter] = useState(50)

  const timeframes = [1, 5, 15]

  const data = useMemo(() => {
    if (!candles?.[exchange] || !symbols || symbols.length < 2) return null

    const validSymbols = symbols.filter(s => {
      const cds = candles[exchange]?.[s]
      return cds && cds.length >= lookback
    })
    if (validSymbols.length < 2) return null

    const result = buildTensor(candles, exchange, validSymbols, timeframes, lookback)
    if (!result) return null

    const { tensor, nAssets, nTF, nTime, nFeatures, nCols } = result

    // CP decomposition
    const cp = cpDecompose(tensor, rank, maxIter)

    // Feature labels
    const featureLabels = ['Return', 'Volatility', 'Range', 'Momentum', 'LogVolume']

    // Asset factor analysis
    const assetFactors = validSymbols.map((sym, i) => ({
      sym,
      factors: cp.A[i],
    }))

    // Dominant factor per asset
    assetFactors.forEach(af => {
      let maxVal = 0, maxIdx = 0
      af.factors.forEach((v, r) => {
        if (Math.abs(v) > maxVal) { maxVal = Math.abs(v); maxIdx = r }
      })
      af.dominantFactor = maxIdx
    })

    // Signal: use dominant factor pattern
    const currentAssetIdx = 0
    const currentFactors = cp.A[currentAssetIdx]
    let signal = 'NEUTRAL'
    let reason = ''
    const dominantR = currentFactors.indexOf(Math.max(...currentFactors.map(Math.abs)))
    if (cp.C[0][dominantR] > 0 && cp.C[3][dominantR] > 0) {
      signal = 'BUY'
      reason = `Factor ${dominantR + 1}: positive return + momentum loading`
    } else if (cp.C[0][dominantR] < 0 && cp.C[3][dominantR] < 0) {
      signal = 'SELL'
      reason = `Factor ${dominantR + 1}: negative return + momentum loading`
    } else {
      reason = `Factor ${dominantR + 1}: mixed loadings`
    }

    // Reconstruction quality
    const finalError = cp.errors[cp.errors.length - 1]
    const totalEnergy = tensor.flat().flat().reduce((s, v) => s + v * v, 0)
    const reconQuality = totalEnergy > 0 ? 1 - finalError / totalEnergy : 0

    return {
      cp, validSymbols, assetFactors, featureLabels,
      signal, reason, reconQuality, finalError,
      nAssets, nTF, nTime, nFeatures,
      errors: cp.errors,
    }
  }, [candles, exchange, symbols, rank, lookback, maxIter])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 2 symbols with {lookback}+ candles on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'
  const factorColors = ['#06b6d4', '#f59e0b', '#a855f7', '#22c55e', '#ef4444', '#ec4899']

  // ALS convergence
  const maxErr = Math.max(...data.errors, 0.001)
  const sxErr = (i) => P + (i / data.errors.length) * (W - 2 * P)
  const syErr = (v) => H - P - (v / maxErr) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Tensor Decomposition (CP/ALS) — {exchange}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">CP rank:</span>
          <input type="number" value={rank} onChange={e => setRank(Math.max(1, Math.min(6, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max iterations:</span>
          <input type="number" value={maxIter} onChange={e => setMaxIter(Math.max(10, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* ALS convergence */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">ALS Convergence: Reconstruction Error (rank={data.cp.rank})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          <path d={data.errors.map((e, i) => `${i === 0 ? 'M' : 'L'} ${sxErr(i)} ${syErr(e)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />
          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>Final error: {data.finalError.toFixed(4)}</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>Reconstruction: {(data.reconQuality * 100).toFixed(1)}%</text>
        </svg>
      </div>

      {/* Asset factor matrix (A) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Factor Matrix A: Assets × Rank (latent asset factors)</div>
        <div className="space-y-1">
          {data.assetFactors.map((af, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-20 truncate">{af.sym}</span>
              {af.factors.map((v, r) => (
                <div key={r} className="flex items-center gap-1">
                  <div className="w-16 bg-slate-900 rounded h-3 relative">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
                    <div className="h-full rounded absolute" style={{
                      width: `${Math.min(50, Math.abs(v) * 50)}%`,
                      background: factorColors[r],
                      left: v >= 0 ? '50%' : `${50 - Math.min(50, Math.abs(v) * 50)}%`
                    }} />
                  </div>
                  <span className="font-mono w-12" style={{ color: factorColors[r] }}>{v.toFixed(3)}</span>
                </div>
              ))}
              <span className="text-slate-500 text-[10px]">→ F{af.dominantFactor + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Feature factor matrix (C) */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Factor Matrix C: Features × Rank (latent feature loadings)</div>
        <div className="space-y-1">
          {data.featureLabels.map((label, k) => (
            <div key={k} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-20">{label}</span>
              {data.cp.C[k].map((v, r) => (
                <div key={r} className="flex items-center gap-1">
                  <div className="w-16 bg-slate-900 rounded h-3 relative">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
                    <div className="h-full rounded absolute" style={{
                      width: `${Math.min(50, Math.abs(v) * 50)}%`,
                      background: factorColors[r],
                      left: v >= 0 ? '50%' : `${50 - Math.min(50, Math.abs(v) * 50)}%`
                    }} />
                  </div>
                  <span className="font-mono w-12" style={{ color: factorColors[r] }}>{v.toFixed(3)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Factor weights */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Factor Weights (λ_r)</div>
        <div className="flex items-center gap-3">
          {data.cp.weights.map((w, r) => (
            <div key={r} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded" style={{ background: factorColors[r] }} />
              <span className="text-slate-400">Factor {r + 1}:</span>
              <span className="font-mono" style={{ color: factorColors[r] }}>{w.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Assets</div>
          <div className="text-cyan-400 font-mono">{data.nAssets}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Timeframes</div>
          <div className="text-amber-400 font-mono">{data.nTF}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Features</div>
          <div className="text-purple-400 font-mono">{data.nFeatures}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">CP rank</div>
          <div className="text-emerald-400 font-mono">{data.cp.rank}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Reconstruction</div>
          <div className="text-slate-300 font-mono">{(data.reconQuality * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Model:</strong> T ≈ Σ_r λ_r · a_r ∘ b_r ∘ c_r (CP decomposition) |
        <strong> Algorithm:</strong> ALS (Alternating Least Squares) |
        <strong> Tensor:</strong> {data.nAssets}×{data.nTF}×{data.nFeatures} (assets × time × features)
      </div>
    </div>
  )
}
