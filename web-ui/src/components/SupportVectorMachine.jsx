import React, { useMemo, useState } from 'react'

// ─── Support Vector Machine (SVM) Classifier ────────────────────────────────
// Implements a linear SVM using Stochastic Gradient Descent (SGD) with
// hinge loss for binary classification of price direction (up/down).
// Also implements a kernel SVM (RBF kernel) using the SMO algorithm
// (Sequential Minimal Optimization) for non-linear classification.
//
// Mathematical foundation:
//   Linear SVM: minimize ½||w||² + C·Σ max(0, 1 - y_i·(w·x_i + b))
//   Hinge loss: L(y, f(x)) = max(0, 1 - y·f(x))
//   Sub-gradient: ∂L/∂w = -y·x if 1 - y·f(x) > 0, else 0
//
//   RBF kernel: K(x, x') = exp(-γ||x - x'||²)
//   Decision: f(x) = Σ α_i·y_i·K(x_i, x) + b
//
//   SMO algorithm:
//   1. Select two Lagrange multipliers α_i, α_j to optimize
//   2. Fix all others, solve the 2-variable subproblem analytically
//   3. Update α_i, α_j, b, and error cache
//   4. Repeat until KKT conditions satisfied

// Feature extraction from candle window
const extractSVMFeatures = (returns, windowSize = 20) => {
  const features = []
  const labels = []
  for (let i = windowSize; i < returns.length - 1; i++) {
    const window = returns.slice(i - windowSize, i)
    const n = window.length

    // Features
    const mean = window.reduce((a, b) => a + b, 0) / n
    const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / n
    const vol = Math.sqrt(variance)
    const skew = vol > 0 ? window.reduce((s, r) => s + ((r - mean) / vol) ** 3, 0) / n : 0
    const kurt = vol > 0 ? window.reduce((s, r) => s + ((r - mean) / vol) ** 4, 0) / n - 3 : 0
    const lastRet = window[n - 1]
    const momentum = window[n - 1] - window[0]

    // RSI
    let gains = 0, losses = 0
    for (const r of window) {
      if (r > 0) gains += r
      else losses -= r
    }
    const rsi = gains + losses > 0 ? 50 + 50 * (gains - losses) / (gains + losses) : 50

    // Autocorrelation lag-1
    let ac1Num = 0, ac1Den = 0
    for (let j = 1; j < n; j++) {
      ac1Num += (window[j] - mean) * (window[j - 1] - mean)
      ac1Den += (window[j] - mean) ** 2
    }
    const ac1 = ac1Den > 0 ? ac1Num / ac1Den : 0

    // Normalize features
    features.push([
      mean * 100,
      vol * 100,
      skew,
      kurt,
      lastRet * 100,
      momentum * 100,
      (rsi - 50) / 50,
      ac1,
    ])
    // Label: +1 if next return > 0, -1 otherwise
    labels.push(returns[i + 1] > 0 ? 1 : -1)
  }
  return { features, labels }
}

// Standardize features
const standardize = (features) => {
  const n = features.length
  const d = features[0].length
  const means = new Array(d).fill(0)
  const stds = new Array(d).fill(0)

  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) means[j] += features[i][j]
  for (let j = 0; j < d; j++) means[j] /= n

  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) stds[j] += (features[i][j] - means[j]) ** 2
  for (let j = 0; j < d; j++) stds[j] = Math.sqrt(stds[j] / n)

  const standardized = features.map(f => f.map((v, j) => stds[j] > 0 ? (v - means[j]) / stds[j] : 0))
  return { standardized, means, stds }
}

// Linear SVM via SGD with hinge loss
const linearSVM = (X, y, C = 1.0, epochs = 200, lr = 0.01) => {
  const n = X.length
  const d = X[0].length
  let w = new Array(d).fill(0)
  let b = 0

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Shuffle
    const indices = Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5)
    const eta = lr / (1 + epoch * 0.01) // Learning rate decay

    for (const i of indices) {
      const margin = y[i] * (dot(w, X[i]) + b)
      if (margin < 1) {
        // Sub-gradient: w -= eta * (w / (n*C) - y_i * x_i)
        for (let j = 0; j < d; j++) {
          w[j] = w[j] - eta * (w[j] / (n * C) - y[i] * X[i][j])
        }
        b = b + eta * y[i]
      } else {
        // Only regularization gradient
        for (let j = 0; j < d; j++) {
          w[j] = w[j] - eta * w[j] / (n * C)
        }
      }
    }
  }

  // Training accuracy
  let correct = 0
  const predictions = []
  for (let i = 0; i < n; i++) {
    const pred = dot(w, X[i]) + b > 0 ? 1 : -1
    predictions.push(pred)
    if (pred === y[i]) correct++
  }

  return { w, b, accuracy: correct / n, predictions }
}

// RBF kernel
const rbfKernel = (x1, x2, gamma) => {
  let dist2 = 0
  for (let i = 0; i < x1.length; i++) dist2 += (x1[i] - x2[i]) ** 2
  return Math.exp(-gamma * dist2)
}

// Simplified SMO for kernel SVM
const smo = (X, y, C = 1.0, gamma = 0.5, maxPasses = 10, tol = 1e-3) => {
  const n = X.length
  const alpha = new Array(n).fill(0)
  let b = 0
  const errors = new Array(n).fill(0)

  // Precompute kernel matrix
  const K = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      K[i][j] = rbfKernel(X[i], X[j], gamma)
    }
  }

  let passes = 0
  while (passes < maxPasses) {
    let numChanged = 0
    for (let i = 0; i < n; i++) {
      const Ei = SVMPredict(X, y, alpha, b, X[i], gamma, K, i) - y[i]
      errors[i] = Ei

      if ((y[i] * Ei < -tol && alpha[i] < C) || (y[i] * Ei > tol && alpha[i] > 0)) {
        // Select j randomly ≠ i
        let j = Math.floor(Math.random() * n)
        while (j === i) j = Math.floor(Math.random() * n)

      const Ej = SVMPredict(X, y, alpha, b, X[j], gamma, K, j) - y[j]
      errors[j] = Ej

      const alphaIold = alpha[i]
      const alphaJold = alpha[j]

      // Compute L and H
      let L, H
      if (y[i] !== y[j]) {
        L = Math.max(0, alpha[j] - alpha[i])
        H = Math.min(C, C + alpha[j] - alpha[i])
      } else {
        L = Math.max(0, alpha[i] + alpha[j] - C)
        H = Math.min(C, alpha[i] + alpha[j])
      }
      if (L === H) continue

      const eta = 2 * K[i][j] - K[i][i] - K[j][j]
      if (eta >= 0) continue

      alpha[j] = alpha[j] - y[j] * (Ei - Ej) / eta
      alpha[j] = Math.max(L, Math.min(H, alpha[j]))

      if (Math.abs(alpha[j] - alphaJold) < 1e-5) continue

      alpha[i] = alpha[i] + y[i] * y[j] * (alphaJold - alpha[j])

      // Update b
      const b1 = b - Ei - y[i] * (alpha[i] - alphaIold) * K[i][i] - y[j] * (alpha[j] - alphaJold) * K[i][j]
      const b2 = b - Ej - y[i] * (alpha[i] - alphaIold) * K[i][j] - y[j] * (alpha[j] - alphaJold) * K[j][j]

      if (0 < alpha[i] && alpha[i] < C) b = b1
      else if (0 < alpha[j] && alpha[j] < C) b = b2
      else b = (b1 + b2) / 2

      numChanged++
      }
    }
    if (numChanged === 0) passes++
    else passes = 0
  }

  // Support vectors
  const svIndices = alpha.map((a, i) => a > 1e-5 ? i : -1).filter(i => i >= 0)

  // Training accuracy
  let correct = 0
  const predictions = []
  for (let i = 0; i < n; i++) {
    const pred = SVMPredict(X, y, alpha, b, X[i], gamma, K, i) > 0 ? 1 : -1
    predictions.push(pred)
    if (pred === y[i]) correct++
  }

  return { alpha, b, svIndices, accuracy: correct / n, predictions, gamma }
}

const SVMPredict = (X, y, alpha, b, x, gamma, K, idx) => {
  // Use precomputed kernel if available
  let sum = 0
  for (let i = 0; i < X.length; i++) {
    if (alpha[i] > 0) {
      const k = idx !== undefined && K ? K[i][idx] : rbfKernel(X[i], x, gamma)
      sum += alpha[i] * y[i] * k
    }
  }
  return sum + b
}

const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)

export default function SupportVectorMachine({ candles, symbol, exchange }) {
  const [kernelType, setKernelType] = useState('linear')
  const [C, setC] = useState(1.0)
  const [gamma, setGamma] = useState(0.5)
  const [windowSize, setWindowSize] = useState(20)
  const [epochs, setEpochs] = useState(200)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 50) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    const { features, labels } = extractSVMFeatures(returns, windowSize)
    if (features.length < 20) return null

    const { standardized, means, stds } = standardize(features)

    // Train/test split (80/20)
    const splitIdx = Math.floor(features.length * 0.8)
    const XTrain = standardized.slice(0, splitIdx)
    const yTrain = labels.slice(0, splitIdx)
    const XTest = standardized.slice(splitIdx)
    const yTest = labels.slice(splitIdx)

    let model
    if (kernelType === 'linear') {
      model = linearSVM(XTrain, yTrain, C, epochs, 0.01)
    } else {
      model = smo(XTrain, yTrain, C, gamma, 10, 1e-3)
    }

    // Test predictions
    let testCorrect = 0
    const testPreds = []
    for (let i = 0; i < XTest.length; i++) {
      let pred
      if (kernelType === 'linear') {
        pred = dot(model.w, XTest[i]) + model.b > 0 ? 1 : -1
      } else {
        pred = SVMPredict(XTrain, yTrain, model.alpha, model.b, XTest[i], model.gamma) > 0 ? 1 : -1
      }
      testPreds.push(pred)
      if (pred === yTest[i]) testCorrect++
    }

    // Current prediction
    const lastFeatures = standardized[standardized.length - 1]
    let currentPred
    if (kernelType === 'linear') {
      currentPred = dot(model.w, lastFeatures) + model.b
    } else {
      currentPred = SVMPredict(XTrain, yTrain, model.alpha, model.b, lastFeatures, model.gamma)
    }

    // Feature importance (linear SVM only)
    let featureImportance = null
    if (kernelType === 'linear') {
      const featureNames = ['Mean Ret', 'Volatility', 'Skewness', 'Kurtosis', 'Last Ret', 'Momentum', 'RSI', 'Autocorr']
      featureImportance = model.w.map((w, i) => ({ name: featureNames[i], weight: w, absWeight: Math.abs(w) }))
      featureImportance.sort((a, b) => b.absWeight - a.absWeight)
    }

    // Signal
    const signal = currentPred > 0 ? 'BUY' : 'SELL'
    const confidence = Math.min(100, Math.abs(currentPred) * 50 + 50)

    return {
      model, trainAccuracy: model.accuracy,
      testAccuracy: XTest.length > 0 ? testCorrect / XTest.length : 0,
      currentPred, signal, confidence,
      featureImportance,
      nTrain: XTrain.length, nTest: XTest.length,
      nSV: model.svIndices?.length || 0,
      yTrain, testPreds, yTest,
    }
  }, [candles, exchange, symbol, kernelType, C, gamma, windowSize, epochs])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 50 candles for {symbol} on {exchange}</div>
  }

  const sigColor = data.signal === 'BUY' ? '#22c55e' : '#ef4444'

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Support Vector Machine — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal} ({data.confidence.toFixed(0)}%)
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Kernel:</span>
          <select value={kernelType} onChange={e => setKernelType(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="linear">Linear</option>
            <option value="rbf">RBF (Gaussian)</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">C (reg):</span>
          <input type="number" step="0.1" value={C} onChange={e => setC(Math.max(0.01, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        {kernelType === 'rbf' && (
          <label className="flex items-center gap-1">
            <span className="text-slate-400">γ (gamma):</span>
            <input type="number" step="0.1" value={gamma} onChange={e => setGamma(Math.max(0.01, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
          </label>
        )}
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(5, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        {kernelType === 'linear' && (
          <label className="flex items-center gap-1">
            <span className="text-slate-400">Epochs:</span>
            <input type="number" value={epochs} onChange={e => setEpochs(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
          </label>
        )}
      </div>

      {/* Feature importance (linear only) */}
      {data.featureImportance && (
        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-2">Feature Importance (|w| weights)</div>
          <div className="space-y-1">
            {data.featureImportance.map((fi, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 w-24">{fi.name}</span>
                <div className="flex-1 bg-slate-900 rounded h-4 relative">
                  <div
                    className="h-full rounded absolute"
                    style={{
                      width: `${(fi.absWeight / data.featureImportance[0].absWeight) * 100}%`,
                      background: fi.weight >= 0 ? '#22c55e' : '#ef4444',
                      left: fi.weight >= 0 ? '50%' : `${50 - (fi.absWeight / data.featureImportance[0].absWeight) * 50}%`
                    }}
                  />
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
                </div>
                <span className="text-slate-500 font-mono w-16">{fi.weight.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confusion matrix */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Test Set Confusion Matrix</div>
        {(() => {
          const tp = data.testPreds.filter((p, i) => p === 1 && data.yTest[i] === 1).length
          const tn = data.testPreds.filter((p, i) => p === -1 && data.yTest[i] === -1).length
          const fp = data.testPreds.filter((p, i) => p === 1 && data.yTest[i] === -1).length
          const fn = data.testPreds.filter((p, i) => p === -1 && data.yTest[i] === 1).length
          return (
            <div className="grid grid-cols-3 gap-1 text-xs text-center">
              <div></div>
              <div className="text-emerald-400">Actual UP</div>
              <div className="text-red-400">Actual DOWN</div>
              <div className="text-emerald-400">Pred UP</div>
              <div className="bg-emerald-900/40 rounded p-2 font-mono">{tp}</div>
              <div className="bg-red-900/40 rounded p-2 font-mono">{fp}</div>
              <div className="text-red-400">Pred DOWN</div>
              <div className="bg-red-900/40 rounded p-2 font-mono">{fn}</div>
              <div className="bg-emerald-900/40 rounded p-2 font-mono">{tn}</div>
            </div>
          )
        })()}
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Train Accuracy</div>
          <div className="text-cyan-400 font-mono">{(data.trainAccuracy * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Test Accuracy</div>
          <div className="text-emerald-400 font-mono">{(data.testAccuracy * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Train/Test</div>
          <div className="text-slate-300 font-mono">{data.nTrain}/{data.nTest}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Support Vectors</div>
          <div className="text-amber-400 font-mono">{data.nSV}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.signal} (f(x)={data.currentPred.toFixed(4)}, confidence={data.confidence.toFixed(0)}%) |
        <strong> Kernel:</strong> {kernelType}{kernelType === 'rbf' ? ` (γ=${gamma})` : ''} |
        <strong> C:</strong> {C}
      </div>
    </div>
  )
}
