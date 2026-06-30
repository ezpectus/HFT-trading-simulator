import React, { useMemo, useState } from 'react'

// ─── Gaussian Process Regression ────────────────────────────────────────────
// Non-parametric Bayesian regression using Gaussian Processes.
// Provides full posterior distribution (mean + uncertainty) for price prediction.
//
// Mathematical foundation:
//   Prior: f ~ GP(m(x), k(x, x'))
//   Posterior: f|D ~ GP(m_post(x), k_post(x, x'))
//
//   Kernel: k(x, x') = σ_f² · exp(-||x - x'||² / (2l²))  (RBF / Squared Exponential)
//   + σ_n² · δ(x, x')  (noise term)
//
//   Posterior mean: μ(x*) = k(x*, X)·(K + σ_n²·I)⁻¹·y
//   Posterior variance: σ²(x*) = k(x*, x*) - k(x*, X)·(K + σ_n²·I)⁻¹·k(X, x*)
//
//   Marginal likelihood:
//   log p(y|X) = -½·yᵀ·(K + σ_n²·I)⁻¹·y - ½·log|K + σ_n²·I| - (n/2)·log(2π)
//
//   Hyperparameter optimization: maximize log marginal likelihood
//   via gradient descent on (σ_f, l, σ_n)

const rbfKernel = (x1, x2, sigmaF, lengthScale) => {
  const diff = x1 - x2
  return sigmaF * sigmaF * Math.exp(-(diff * diff) / (2 * lengthScale * lengthScale))
}

const matern52Kernel = (x1, x2, sigmaF, lengthScale) => {
  const r = Math.abs(x1 - x2) / lengthScale
  const sqrt5 = Math.sqrt(5)
  return sigmaF * sigmaF * (1 + sqrt5 * r + (5 * r * r) / 3) * Math.exp(-sqrt5 * r)
}

const periodicKernel = (x1, x2, sigmaF, lengthScale, period) => {
  const s = Math.sin(Math.PI * Math.abs(x1 - x2) / period)
  return sigmaF * sigmaF * Math.exp(-2 * s * s / (lengthScale * lengthScale))
}

// Build kernel matrix
const buildKernelMatrix = (X1, X2, kernel, params) => {
  const n1 = X1.length, n2 = X2.length
  const K = Array.from({ length: n1 }, () => new Array(n2).fill(0))
  for (let i = 0; i < n1; i++) {
    for (let j = 0; j < n2; j++) {
      K[i][j] = kernel(X1[i], X2[j], params.sigmaF, params.lengthScale, params.period)
    }
  }
  return K
}

// Cholesky decomposition
const cholesky = (A) => {
  const n = A.length
  const L = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j]
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k]
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(1e-10, sum))
      } else {
        L[i][j] = L[j][j] > 0 ? sum / L[j][j] : 0
      }
    }
  }
  return L
}

// Solve L·x = b (forward substitution)
const forwardSolve = (L, b) => {
  const n = L.length
  const x = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    let sum = b[i]
    for (let j = 0; j < i; j++) sum -= L[i][j] * x[j]
    x[i] = L[i][i] > 0 ? sum / L[i][i] : 0
  }
  return x
}

// Solve Lᵀ·x = b (backward substitution)
const backwardSolve = (L, b) => {
  const n = L.length
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i]
    for (let j = i + 1; j < n; j++) sum -= L[j][i] * x[j]
    x[i] = L[i][i] > 0 ? sum / L[i][i] : 0
  }
  return x
}

// GP posterior
const gpPredict = (XTrain, yTrain, XTest, kernel, params) => {
  const n = XTrain.length
  const m = XTest.length

  // K + σ_n²·I
  const Knn = buildKernelMatrix(XTrain, XTrain, kernel, params)
  for (let i = 0; i < n; i++) Knn[i][i] += params.sigmaN * params.sigmaN

  // Cholesky: K + σ_n²I = L·Lᵀ
  const L = cholesky(Knn)

  // α = (K + σ_n²I)⁻¹·y = L⁻ᵀ·L⁻¹·y
  const Ly = forwardSolve(L, yTrain)
  const alpha = backwardSolve(L, Ly)

  // Predictions
  const means = new Array(m)
  const variances = new Array(m)

  for (let i = 0; i < m; i++) {
    // k(x*, X)
    const kStar = new Array(n)
    for (let j = 0; j < n; j++) {
      kStar[j] = kernel(XTest[i], XTrain[j], params.sigmaF, params.lengthScale, params.period)
    }

    // μ(x*) = k(x*, X)·α
    means[i] = kStar.reduce((s, k, j) => s + k * alpha[j], 0)

    // σ²(x*) = k(x*, x*) - k(x*, X)·(K + σ_n²I)⁻¹·k(X, x*)
    const kSelf = kernel(XTest[i], XTest[i], params.sigmaF, params.lengthScale, params.period)
    const Lv = forwardSolve(L, kStar)
    const v = backwardSolve(L, Lv)
    const kInvK = kStar.reduce((s, k, j) => s + k * v[j], 0)
    variances[i] = Math.max(0, kSelf - kInvK)
  }

  // Log marginal likelihood
  let logML = 0
  for (let i = 0; i < n; i++) logML += Math.log(L[i][i])
  logML = -yTrain.reduce((s, y, i) => s + y * alpha[i], 0) / 2 - logML - (n / 2) * Math.log(2 * Math.PI)

  return { means, variances, logML, alpha, L }
}

// Optimize hyperparameters via grid search
const optimizeHyperparams = (XTrain, yTrain, kernel) => {
  let best = { sigmaF: 1, lengthScale: 1, sigmaN: 0.1, logML: -Infinity }

  for (let sf = 0.1; sf <= 3; sf += 0.3) {
    for (let ls = 1; ls <= 20; ls += 2) {
      for (let sn = 0.01; sn <= 0.5; sn += 0.05) {
        const params = { sigmaF: sf, lengthScale: ls, sigmaN: sn, period: 10 }
        const { logML } = gpPredict(XTrain, yTrain, [], kernel, params)
        if (logML > best.logML) {
          best = { ...params, logML }
        }
      }
    }
  }

  // Fine-tune
  for (let sf = best.sigmaF - 0.2; sf <= best.sigmaF + 0.2; sf += 0.05) {
    for (let ls = best.lengthScale - 2; ls <= best.lengthScale + 2; ls += 0.5) {
      for (let sn = best.sigmaN - 0.05; sn <= best.sigmaN + 0.05; sn += 0.01) {
        if (sf <= 0 || ls <= 0 || sn <= 0) continue
        const params = { sigmaF: sf, lengthScale: ls, sigmaN: sn, period: 10 }
        const { logML } = gpPredict(XTrain, yTrain, [], kernel, params)
        if (logML > best.logML) {
          best = { ...params, logML }
        }
      }
    }
  }

  return best
}

export default function GaussianProcessRegression({ candles, symbol, exchange }) {
  const [kernelType, setKernelType] = useState('rbf')
  const [sigmaF, setSigmaF] = useState(1.0)
  const [lengthScale, setLengthScale] = useState(5.0)
  const [sigmaN, setSigmaN] = useState(0.1)
  const [autoOptimize, setAutoOptimize] = useState(true)
  const [nTrain, setNTrain] = useState(40)
  const [nPredict, setNPredict] = useState(10)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < nTrain + nPredict + 5) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)

    // Use last nTrain+nPredict prices
    const N = nTrain + nPredict
    const recentPrices = prices.slice(-N)

    // Normalize
    const mean = recentPrices.reduce((a, b) => a + b, 0) / N
    const std = Math.sqrt(recentPrices.reduce((s, p) => s + (p - mean) ** 2, 0) / N)
    const normPrices = recentPrices.map(p => std > 0 ? (p - mean) / std : 0)

    // Train/test split
    const XTrain = Array.from({ length: nTrain }, (_, i) => i)
    const yTrain = normPrices.slice(0, nTrain)
    const XTest = Array.from({ length: N }, (_, i) => i)

    const kernel = kernelType === 'rbf' ? rbfKernel : kernelType === 'matern' ? matern52Kernel : periodicKernel

    let params = { sigmaF, lengthScale, sigmaN, period: 10 }
    if (autoOptimize) {
      params = optimizeHyperparams(XTrain, yTrain, kernel)
      setSigmaF(params.sigmaF)
      setLengthScale(params.lengthScale)
      setSigmaN(params.sigmaN)
    }

    const { means, variances, logML } = gpPredict(XTrain, yTrain, XTest, kernel, params)

    // Denormalize
    const denorm = (v) => v * std + mean
    const meanPred = means.map(denorm)
    const upperBound = means.map((m, i) => denorm(m + 2 * Math.sqrt(variances[i])))
    const lowerBound = means.map((m, i) => denorm(m - 2 * Math.sqrt(variances[i])))
    const actualPrices = recentPrices

    // Prediction for future
    const futureX = Array.from({ length: nPredict }, (_, i) => nTrain + i)
    const futureResult = gpPredict(XTrain, yTrain, futureX, kernel, params)
    const futureMeans = futureResult.means.map(denorm)
    const futureUpper = futureResult.means.map((m, i) => denorm(m + 2 * Math.sqrt(futureResult.variances[i])))
    const futureLower = futureResult.means.map((m, i) => denorm(m - 2 * Math.sqrt(futureResult.variances[i])))

    // Signal from future prediction
    const currentPrice = prices[prices.length - 1]
    const predictedPrice = futureMeans[0]
    const predictedReturn = (predictedPrice - currentPrice) / currentPrice
    const uncertainty = (futureUpper[0] - futureLower[0]) / (2 * currentPrice)

    let signal = 'NEUTRAL'
    if (predictedReturn > 0.005 && uncertainty < 0.05) {
      signal = 'BUY'
    } else if (predictedReturn < -0.005 && uncertainty < 0.05) {
      signal = 'SELL'
    }

    // RMSE on training fit
    let rmse = 0
    for (let i = 0; i < nTrain; i++) {
      rmse += (meanPred[i] - actualPrices[i]) ** 2
    }
    rmse = Math.sqrt(rmse / nTrain)

    return {
      meanPred, upperBound, lowerBound, actualPrices,
      futureMeans, futureUpper, futureLower,
      logML, params, rmse,
      predictedPrice, predictedReturn, uncertainty,
      signal, currentPrice,
      XTrain: XTrain.length, N,
    }
  }, [candles, exchange, symbol, kernelType, sigmaF, lengthScale, sigmaN, autoOptimize, nTrain, nPredict])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {nTrain + nPredict + 5} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 300, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'

  // Chart
  const allPrices = [...data.actualPrices, ...data.futureMeans, ...data.upperBound, ...data.lowerBound, ...data.futureUpper, ...data.futureLower]
  const minP = Math.min(...allPrices)
  const maxP = Math.max(...allPrices)
  const sx = (i) => P + (i / (data.N - 1)) * (W - 2 * P)
  const sy = (p) => H - P - ((p - minP) / (maxP - minP + 0.001)) * (H - 2 * P)

  // Confidence band path (training region)
  const bandPath = `M ${sx(0)} ${sy(data.upperBound[0])} ` +
    data.upperBound.map((u, i) => `L ${sx(i)} ${sy(u)}`).join(' ') +
    ` L ${sx(data.N - 1)} ${sy(data.lowerBound[data.N - 1])} ` +
    data.lowerBound.slice().reverse().map((l, i) => `L ${sx(data.N - 1 - i)} ${sy(l)}`).join(' ') + ' Z'

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Gaussian Process Regression — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Kernel:</span>
          <select value={kernelType} onChange={e => setKernelType(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="rbf">RBF (Squared Exp)</option>
            <option value="matern">Matérn 5/2</option>
            <option value="periodic">Periodic</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={autoOptimize} onChange={e => setAutoOptimize(e.target.checked)} />
          <span className="text-slate-400">Auto-optimize</span>
        </label>
        {!autoOptimize && (
          <>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">σ_f:</span>
              <input type="number" step="0.1" value={sigmaF} onChange={e => setSigmaF(Math.max(0.01, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">l (length):</span>
              <input type="number" step="0.5" value={lengthScale} onChange={e => setLengthScale(Math.max(0.1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">σ_n (noise):</span>
              <input type="number" step="0.01" value={sigmaN} onChange={e => setSigmaN(Math.max(0.001, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
            </label>
          </>
        )}
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Train points:</span>
          <input type="number" value={nTrain} onChange={e => setNTrain(Math.max(10, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Predict ahead:</span>
          <input type="number" value={nPredict} onChange={e => setNPredict(Math.max(1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* GP prediction chart */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">GP Posterior: Mean ± 2σ Confidence Band</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Confidence band */}
          <path d={bandPath} fill="#06b6d4" opacity={0.15} />

          {/* GP mean */}
          <path d={data.meanPred.map((m, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sy(m)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {/* Actual prices */}
          <path d={data.actualPrices.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sy(p)}`).join(' ')} fill="none" stroke="#64748b" strokeWidth={1.5} opacity={0.7} />

          {/* Future prediction */}
          <line x1={sx(data.XTrain - 1)} y1={P} x2={sx(data.XTrain - 1)} y2={H - P} stroke="#475569" strokeDasharray="4,3" />
          <text x={sx(data.XTrain - 1) - 5} y={P + 10} textAnchor="end" fill="#475569" fontSize={9}>train</text>
          <text x={sx(data.XTrain - 1) + 5} y={P + 10} fill="#475569" fontSize={9}>predict</text>

          {/* Future mean */}
          {data.futureMeans.map((m, i) => {
            const idx = data.XTrain + i
            if (idx >= data.N) return null
            return <circle key={i} cx={sx(idx)} cy={sy(m)} r={3} fill="#f59e0b" />
          })}

          {/* Future confidence */}
          {data.futureMeans.map((_, i) => {
            const idx = data.XTrain + i
            if (idx >= data.N) return null
            return (
              <line key={i} x1={sx(idx)} y1={sy(data.futureUpper[i])} x2={sx(idx)} y2={sy(data.futureLower[i])} stroke="#f59e0b" strokeWidth={1} opacity={0.5} />
            )
          })}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>GP posterior mean</text>
          <text x={W - P} y={34} textAnchor="end" fill="#64748b" fontSize={9}>Actual price</text>
          <text x={W - P} y={48} textAnchor="end" fill="#f59e0b" fontSize={9}>Future prediction</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Log ML</div>
          <div className="text-cyan-400 font-mono">{data.logML.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">RMSE</div>
          <div className="text-amber-400 font-mono">{data.rmse.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Pred Price</div>
          <div className="text-emerald-400 font-mono">${data.predictedPrice.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Pred Return</div>
          <div className="font-mono" style={{ color: sigColor }}>{(data.predictedReturn * 100).toFixed(3)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Uncertainty</div>
          <div className="text-purple-400 font-mono">{(data.uncertainty * 100).toFixed(2)}%</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Hyperparams:</strong> σ_f={data.params.sigmaF.toFixed(3)}, l={data.params.lengthScale.toFixed(2)}, σ_n={data.params.sigmaN.toFixed(4)} |
        <strong> Kernel:</strong> {kernelType} |
        <strong> Cholesky:</strong> O(n³) decomposition |
        <strong> Current:</strong> ${data.currentPrice.toFixed(2)} → ${data.predictedPrice.toFixed(2)}
      </div>
    </div>
  )
}
