import React, { useMemo, useState } from 'react'

// ─── Autoencoder (Deep Learning Anomaly Detection) ──────────────────────────
// Implements a shallow autoencoder with tied weights for unsupervised
// feature learning and anomaly detection. The autoencoder compresses
// input into a lower-dimensional latent space and reconstructs it;
// high reconstruction error indicates anomalies.
//
// Mathematical foundation:
//   Encoder: h = σ(W_e·x + b_e)
//   Decoder: x̂ = σ(W_d·h + b_d)
//   Loss: L = Σ(x_i - x̂_i)² + λ·||W||²  (MSE + L2 regularization)
//
//   Training: gradient descent via backpropagation
//   ∂L/∂W_d = (x - x̂) ⊙ σ'(x̂) · hᵀ
//   ∂L/∂W_e = [(x - x̂) ⊙ σ'(x̂) · W_d] ⊙ σ'(h) · xᵀ
//
//   Anomaly score: ||x - x̂||² (reconstruction error)
//   Sparse autoencoder: L += ρ·log(ρ/ρ̂) + (1-ρ)·log((1-ρ)/(1-ρ̂))

const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))))
const dsigmoid = (y) => y * (1 - y)

const xavier = (fanIn, fanOut) => (Math.random() * 2 - 1) * Math.sqrt(2 / (fanIn + fanOut))

const initWeights = (rows, cols) => {
  const W = []
  for (let i = 0; i < rows; i++) {
    const row = []
    for (let j = 0; j < cols; j++) row.push(xavier(cols, rows))
    W.push(row)
  }
  return W
}

const initBias = (size) => new Array(size).fill(0)

// Extract features from candle windows
const extractAEFeatures = (candles, windowSize = 20) => {
  const features = []
  for (let i = windowSize; i < candles.length; i++) {
    const window = candles.slice(i - windowSize, i)
    const prices = window.map(c => c.close)
    const volumes = window.map(c => c.volume || 1)

    const mean = prices.reduce((a, b) => a + b, 0) / windowSize
    const std = Math.sqrt(prices.reduce((s, p) => s + (p - mean) ** 2, 0) / windowSize)

    // 12 features
    const ret = (prices[windowSize - 1] - prices[windowSize - 2]) / prices[windowSize - 2]
    const vol = std / mean
    const range = (Math.max(...prices) - Math.min(...prices)) / mean
    const skew = std > 0 ? prices.reduce((s, p) => s + ((p - mean) / std) ** 3, 0) / windowSize : 0
    const kurt = std > 0 ? prices.reduce((s, p) => s + ((p - mean) / std) ** 4, 0) / windowSize - 3 : 0

    let gains = 0, losses = 0
    for (let j = 1; j < windowSize; j++) {
      const ch = prices[j] - prices[j - 1]
      if (ch > 0) gains += ch; else losses -= ch
    }
    const rsi = gains + losses > 0 ? 50 + 50 * (gains - losses) / (gains + losses) : 50

    const meanV = volumes.reduce((a, b) => a + b, 0) / windowSize
    const stdV = Math.sqrt(volumes.reduce((s, v) => s + (v - meanV) ** 2, 0) / windowSize)
    const volZ = stdV > 0 ? (volumes[windowSize - 1] - meanV) / stdV : 0

    const momentum = (prices[windowSize - 1] - prices[0]) / prices[0]
    const sma = mean
    const priceDev = (prices[windowSize - 1] - sma) / sma

    let ac1 = 0, ac1Den = 0
    const rets = []
    for (let j = 1; j < windowSize; j++) rets.push((prices[j] - prices[j - 1]) / prices[j - 1])
    const meanR = rets.reduce((a, b) => a + b, 0) / rets.length
    for (let j = 1; j < rets.length; j++) { ac1 += (rets[j] - meanR) * (rets[j - 1] - meanR); ac1Den += (rets[j] - meanR) ** 2 }
    ac1 = ac1Den > 0 ? ac1 / ac1Den : 0

    features.push([ret * 100, vol * 100, range * 100, skew, kurt, rsi / 100, volZ, momentum * 100, priceDev * 100, ac1, std / mean * 100, (prices[windowSize - 1] - mean) / std])
  }
  return features
}

const standardize = (features) => {
  const n = features.length, d = features[0].length
  const means = new Array(d).fill(0), stds = new Array(d).fill(0)
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) means[j] += features[i][j]
  for (let j = 0; j < d; j++) means[j] /= n
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) stds[j] += (features[i][j] - means[j]) ** 2
  for (let j = 0; j < d; j++) stds[j] = Math.sqrt(stds[j] / n)
  return {
    data: features.map(f => f.map((v, j) => stds[j] > 0 ? (v - means[j]) / stds[j] : 0)),
    means, stds,
  }
}

// Train autoencoder
const trainAutoencoder = (X, inputDim, hiddenDim, epochs = 200, lr = 0.01, lambda = 0.001) => {
  const We = initWeights(hiddenDim, inputDim)
  const be = initBias(hiddenDim)
  const Wd = initWeights(inputDim, hiddenDim)
  const bd = initBias(inputDim)

  const losses = []

  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0

    for (let i = 0; i < X.length; i++) {
      const x = X[i]

      // Forward
      const h = new Array(hiddenDim).fill(0)
      for (let k = 0; k < hiddenDim; k++) {
        let sum = be[k]
        for (let j = 0; j < inputDim; j++) sum += We[k][j] * x[j]
        h[k] = sigmoid(sum)
      }

      const xHat = new Array(inputDim).fill(0)
      for (let j = 0; j < inputDim; j++) {
        let sum = bd[j]
        for (let k = 0; k < hiddenDim; k++) sum += Wd[j][k] * h[k]
        xHat[j] = sigmoid(sum)
      }

      // Loss
      let loss = 0
      const dxHat = new Array(inputDim).fill(0)
      for (let j = 0; j < inputDim; j++) {
        const diff = xHat[j] - x[j]
        loss += diff * diff
        dxHat[j] = 2 * diff * dsigmoid(xHat[j])
      }
      totalLoss += loss / inputDim

      // Backprop decoder
      const dWd = Array.from({ length: inputDim }, () => new Array(hiddenDim).fill(0))
      const dbd = new Array(inputDim).fill(0)
      const dh = new Array(hiddenDim).fill(0)
      for (let j = 0; j < inputDim; j++) {
        dbd[j] = dxHat[j]
        for (let k = 0; k < hiddenDim; k++) {
          dWd[j][k] = dxHat[j] * h[k]
          dh[k] += dxHat[j] * Wd[j][k]
        }
      }

      // Backprop encoder
      const dWe = Array.from({ length: hiddenDim }, () => new Array(inputDim).fill(0))
      const dbe = new Array(hiddenDim).fill(0)
      for (let k = 0; k < hiddenDim; k++) {
        const dhk = dh[k] * dsigmoid(h[k])
        dbe[k] = dhk
        for (let j = 0; j < inputDim; j++) {
          dWe[k][j] = dhk * x[j]
        }
      }

      // Update with L2 regularization
      for (let j = 0; j < inputDim; j++) {
        bd[j] -= lr * dbd[j]
        for (let k = 0; k < hiddenDim; k++) {
          Wd[j][k] -= lr * (dWd[j][k] + lambda * Wd[j][k])
        }
      }
      for (let k = 0; k < hiddenDim; k++) {
        be[k] -= lr * dbe[k]
        for (let j = 0; j < inputDim; j++) {
          We[k][j] -= lr * (dWe[k][j] + lambda * We[k][j])
        }
      }
    }

    losses.push(totalLoss / X.length)
  }

  // Compute reconstruction errors
  const reconErrors = []
  const latent = []
  for (let i = 0; i < X.length; i++) {
    const x = X[i]
    const h = new Array(hiddenDim).fill(0)
    for (let k = 0; k < hiddenDim; k++) {
      let sum = be[k]
      for (let j = 0; j < inputDim; j++) sum += We[k][j] * x[j]
      h[k] = sigmoid(sum)
    }
    const xHat = new Array(inputDim).fill(0)
    for (let j = 0; j < inputDim; j++) {
      let sum = bd[j]
      for (let k = 0; k < hiddenDim; k++) sum += Wd[j][k] * h[k]
      xHat[j] = sigmoid(sum)
    }
    let err = 0
    for (let j = 0; j < inputDim; j++) err += (x[j] - xHat[j]) ** 2
    reconErrors.push(Math.sqrt(err / inputDim))
    latent.push(h)
  }

  return { We, be, Wd, bd, losses, reconErrors, latent, hiddenDim }
}

export default function Autoencoder({ candles, symbol, exchange }) {
  const [hiddenDim, setHiddenDim] = useState(4)
  const [epochs, setEpochs] = useState(200)
  const [lr, setLr] = useState(0.01)
  const [threshold, setThreshold] = useState(2.0)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 40) return null
    const cds = candles[exchange][symbol]

    const rawFeatures = extractAEFeatures(cds, 20)
    if (rawFeatures.length < 20) return null

    const { data: stdFeatures, means, stds } = standardize(rawFeatures)
    const inputDim = stdFeatures[0].length

    const model = trainAutoencoder(stdFeatures, inputDim, hiddenDim, epochs, lr, 0.001)

    // Anomaly detection
    const meanErr = model.reconErrors.reduce((a, b) => a + b, 0) / model.reconErrors.length
    const stdErr = Math.sqrt(model.reconErrors.reduce((s, e) => s + (e - meanErr) ** 2, 0) / model.reconErrors.length)
    const anomalyThreshold = meanErr + threshold * stdErr

    const anomalies = []
    for (let i = 0; i < model.reconErrors.length; i++) {
      if (model.reconErrors[i] > anomalyThreshold) {
        anomalies.push({ index: i, error: model.reconErrors[i], latent: model.latent[i] })
      }
    }

    // Current error
    const currentError = model.reconErrors[model.reconErrors.length - 1]
    const isAnomaly = currentError > anomalyThreshold
    const zScore = stdErr > 0 ? (currentError - meanErr) / stdErr : 0

    // Signal
    let signal = 'NORMAL'
    if (isAnomaly) {
      signal = zScore > 3 ? 'ANOMALY' : 'WARNING'
    }

    // Latent space (first 2 dims for visualization)
    const latent2D = model.latent.map(h => [h[0], h[1]])

    return {
      model, anomalies, meanErr, stdErr, anomalyThreshold,
      currentError, isAnomaly, zScore, signal,
      reconErrors: model.reconErrors.slice(-60),
      losses: model.losses,
      latent2D: latent2D.slice(-60),
      inputDim,
    }
  }, [candles, exchange, symbol, hiddenDim, epochs, lr, threshold])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 40 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.isAnomaly ? (data.zScore > 3 ? '#ef4444' : '#f59e0b') : '#22c55e'

  // Loss curve
  const maxLoss = Math.max(...data.losses)
  const sxLoss = (i) => P + (i / Math.max(1, data.losses.length - 1)) * (W - 2 * P)
  const syLoss = (v) => H - P - (v / maxLoss) * (H - 2 * P)

  // Reconstruction error chart
  const maxErr = Math.max(...data.reconErrors, data.anomalyThreshold)
  const sxErr = (i) => P + (i / Math.max(1, data.reconErrors.length - 1)) * (W - 2 * P)
  const syErr = (v) => H - P - (v / maxErr) * (H - 2 * P)

  // Latent space
  const latMax = Math.max(0.01, ...data.latent2D.flat().map(Math.abs))
  const sxLat = (v) => W / 2 + (v / latMax) * (W / 2 - P)
  const syLat = (v) => H / 2 - (v / latMax) * (H / 2 - P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Autoencoder Anomaly Detection — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Hidden dim:</span>
          <input type="number" value={hiddenDim} onChange={e => setHiddenDim(Math.max(2, Math.min(8, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Epochs:</span>
          <input type="number" value={epochs} onChange={e => setEpochs(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Learning rate:</span>
          <input type="number" step="0.001" value={lr} onChange={e => setLr(Math.max(0.0001, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Threshold (σ):</span>
          <input type="number" step="0.1" value={threshold} onChange={e => setThreshold(Math.max(1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Training loss */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Training Loss (MSE + L2) over Epochs</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          <path d={data.losses.map((l, i) => `${i === 0 ? 'M' : 'L'} ${sxLoss(i)} ${syLoss(l)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />
          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>Final: {data.losses[data.losses.length - 1].toFixed(6)}</text>
        </svg>
      </div>

      {/* Reconstruction error */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Reconstruction Error (last 60 points) — Anomaly Detection</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Threshold line */}
          <line x1={P} y1={syErr(data.anomalyThreshold)} x2={W - P} y2={syErr(data.anomalyThreshold)} stroke="#ef4444" strokeDasharray="4,3" />
          <text x={W - P} y={syErr(data.anomalyThreshold) - 5} textAnchor="end" fill="#ef4444" fontSize={9}>threshold={data.anomalyThreshold.toFixed(4)}</text>

          {/* Mean line */}
          <line x1={P} y1={syErr(data.meanErr)} x2={W - P} y2={syErr(data.meanErr)} stroke="#64748b" strokeDasharray="3,2" />
          <text x={W - P} y={syErr(data.meanErr) - 5} textAnchor="end" fill="#64748b" fontSize={9}>μ={data.meanErr.toFixed(4)}</text>

          {/* Error bars */}
          {data.reconErrors.map((e, i) => {
            const x = sxErr(i)
            const w = (W - 2 * P) / data.reconErrors.length
            const isAnom = e > data.anomalyThreshold
            return <rect key={i} x={x} y={syErr(e)} width={Math.max(1, w - 1)} height={H - P - syErr(e)} fill={isAnom ? '#ef4444' : '#06b6d4'} opacity={isAnom ? 0.9 : 0.4} />
          })}
        </svg>
      </div>

      {/* Latent space */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Latent Space (first 2 dimensions of {data.model.hiddenDim})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={W / 2} y1={P} x2={W / 2} y2={H - P} stroke="#334155" />
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          {data.latent2D.map((p, i) => {
            const isAnom = data.reconErrors[i] > data.anomalyThreshold
            return <circle key={i} cx={sxLat(p[0])} cy={syLat(p[1])} r={isAnom ? 5 : 2} fill={isAnom ? '#ef4444' : '#06b6d4'} opacity={isAnom ? 1 : 0.5} />
          })}
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Input dim</div>
          <div className="text-cyan-400 font-mono">{data.inputDim}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Hidden dim</div>
          <div className="text-amber-400 font-mono">{data.model.hiddenDim}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Current error</div>
          <div className="font-mono" style={{ color: sigColor }}>{data.currentError.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Z-score</div>
          <div className="font-mono" style={{ color: sigColor }}>{data.zScore.toFixed(2)}σ</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Anomalies</div>
          <div className="text-red-400 font-mono">{data.anomalies.length}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Architecture:</strong> {data.inputDim}→{data.model.hiddenDim}→{data.inputDim} (compression ratio: {(data.inputDim / data.model.hiddenDim).toFixed(1)}×) |
        <strong> Training:</strong> {epochs} epochs, lr={lr}, L2=0.001 |
        <strong> Threshold:</strong> μ + {threshold}σ = {data.anomalyThreshold.toFixed(4)}
      </div>
    </div>
  )
}
