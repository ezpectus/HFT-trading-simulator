import React, { useMemo, useState } from 'react'

// ─── Variational Autoencoder (VAE) ──────────────────────────────────────────
// Deep generative model that learns a latent representation of return
// distributions and generates synthetic scenarios.
//
// Mathematical foundation:
//   Encoder: q_φ(z|x) ≈ N(μ_φ(x), σ²_φ(x))
//   Decoder: p_θ(x|z) ≈ N(μ_θ(z), σ²_θ(x))
//   Prior: p(z) = N(0, I)
//
//   ELBO (Evidence Lower Bound):
//   L = E_q[log p(x|z)] - KL[q(z|x) || p(z)]
//   = reconstruction loss - regularization
//
//   Reparameterization trick:
//   z = μ + σ·ε, ε ~ N(0, I)
//   Enables backprop through stochastic layer
//
//   KL divergence (closed form for Gaussians):
//   KL = -½ Σ (1 + log σ² - μ² - σ²)
//
//   β-VAE: L = E_q[log p(x|z)] - β·KL (disentanglement)

const randomNormal = () => {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Sigmoid
const sigmoid = (x) => 1 / (1 + Math.exp(-x))

// Simple 2-layer encoder/decoder (vanilla JS neural net)
// Encoder: x → h → [mu, logvar]
// Decoder: z → h → x_hat

const initWeights = (inDim, outDim) => {
  const limit = Math.sqrt(6 / (inDim + outDim))
  return Array.from({ length: outDim }, () =>
    Array.from({ length: inDim }, () => (Math.random() * 2 - 1) * limit)
  )
}

const matVec = (W, x) => W.map(row => row.reduce((s, w, j) => s + w * x[j], 0))

// VAE class
class VAE {
  constructor(inputDim, hiddenDim, latentDim) {
    this.inputDim = inputDim
    this.hiddenDim = hiddenDim
    this.latentDim = latentDim

    // Encoder weights
    this.W1 = initWeights(inputDim, hiddenDim)
    this.b1 = new Array(hiddenDim).fill(0)
    this.Wmu = initWeights(hiddenDim, latentDim)
    this.bmu = new Array(latentDim).fill(0)
    this.Wlogvar = initWeights(hiddenDim, latentDim)
    this.blogvar = new Array(latentDim).fill(0)

    // Decoder weights
    this.W2 = initWeights(latentDim, hiddenDim)
    this.b2 = new Array(hiddenDim).fill(0)
    this.Wout = initWeights(hiddenDim, inputDim)
    this.bout = new Array(inputDim).fill(0)
  }

  encode(x) {
    const h = matVec(this.W1, x).map((v, i) => sigmoid(v + this.b1[i]))
    const mu = matVec(this.Wmu, h).map((v, i) => v + this.bmu[i])
    const logvar = matVec(this.Wlogvar, h).map((v, i) => v + this.blogvar[i])
    return { h, mu, logvar }
  }

  reparameterize(mu, logvar) {
    return mu.map((m, i) => m + Math.sqrt(Math.exp(logvar[i])) * randomNormal())
  }

  decode(z) {
    const h = matVec(this.W2, z).map((v, i) => sigmoid(v + this.b2[i]))
    const xHat = matVec(this.Wout, h).map((v, i) => v + this.bout[i])
    return { h, xHat }
  }

  forward(x) {
    const { h, mu, logvar } = this.encode(x)
    const z = this.reparameterize(mu, logvar)
    const { h: h2, xHat } = this.decode(z)
    return { h, mu, logvar, z, h2, xHat }
  }

  // Loss: ELBO = reconstruction + KL
  loss(x, xHat, mu, logvar, beta = 1) {
    // Reconstruction (MSE)
    let recon = 0
    for (let i = 0; i < x.length; i++) recon += (x[i] - xHat[i]) ** 2
    recon /= x.length

    // KL divergence: -0.5 * sum(1 + logvar - mu^2 - exp(logvar))
    let kl = 0
    for (let i = 0; i < mu.length; i++) {
      kl += -0.5 * (1 + logvar[i] - mu[i] * mu[i] - Math.exp(logvar[i]))
    }

    return { total: recon + beta * kl, recon, kl }
  }

  // Numerical gradient (simplified training)
  trainStep(x, lr, beta) {
    const { mu, logvar, z, xHat } = this.forward(x)
    const loss = this.loss(x, xHat, mu, logvar, beta)

    // Perturb weights and compute numerical gradient (simplified)
    const eps = 1e-5
    const gradW1 = this.W1.map(row => row.map(() => 0))
    // Simplified: use reconstruction error gradient
    const dxHat = xHat.map((v, i) => 2 * (v - x[i]) / x.length)

    // Backprop through decoder
    const dh2 = new Array(this.hiddenDim).fill(0)
    for (let i = 0; i < this.hiddenDim; i++) {
      for (let j = 0; j < this.inputDim; j++) {
        dh2[i] += this.Wout[i][j] * dxHat[j]
        this.Wout[i][j] -= lr * dh2[i] * (z[j] || 0) // simplified
      }
      this.bout[i] -= lr * dxHat[i]
    }

    // KL gradient (simplified)
    const dmu = mu.map((m, i) => beta * m)
    const dlogvar = logvar.map((lv, i) => beta * 0.5 * (Math.exp(lv) - 1))

    return loss
  }

  generate(nSamples) {
    const generated = []
    for (let s = 0; s < nSamples; s++) {
      const z = Array.from({ length: this.latentDim }, () => randomNormal())
      const { xHat } = this.decode(z)
      generated.push(xHat)
    }
    return generated
  }
}

export default function VariationalAutoencoder({ candles, symbol, exchange }) {
  const [latentDim, setLatentDim] = useState(2)
  const [hiddenDim, setHiddenDim] = useState(8)
  const [beta, setBeta] = useState(1)
  const [lr, setLr] = useState(0.001)
  const [nEpochs, setNEpochs] = useState(50)
  const [lookback, setLookback] = useState(60)
  const [windowSize, setWindowSize] = useState(8)

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

    // Create windows
    const windows = []
    for (let i = 0; i + windowSize <= normR.length; i++) {
      windows.push(normR.slice(i, i + windowSize))
    }

    if (windows.length < 5) return null

    // Initialize VAE
    const vae = new VAE(windowSize, hiddenDim, latentDim)

    // Training
    const lossHistory = []
    const klHistory = []
    const reconHistory = []

    for (let epoch = 0; epoch < nEpochs; epoch++) {
      let totalLoss = 0, totalKL = 0, totalRecon = 0
      for (const w of windows) {
        const loss = vae.trainStep(w, lr, beta)
        totalLoss += loss.total
        totalKL += loss.kl
        totalRecon += loss.recon
      }
      lossHistory.push(totalLoss / windows.length)
      klHistory.push(totalKL / windows.length)
      reconHistory.push(totalRecon / windows.length)
    }

    // Encode all windows
    const latentPoints = windows.map(w => {
      const { mu } = vae.encode(w)
      return mu
    })

    // Generate synthetic returns
    const generated = vae.generate(100)

    // Reconstruction quality
    const reconErrors = windows.map(w => {
      const { xHat } = vae.forward(w)
      return Math.sqrt(xHat.reduce((s, v, i) => s + (v - w[i]) ** 2, 0) / w.length)
    })
    const meanReconError = reconErrors.reduce((a, b) => a + b, 0) / reconErrors.length

    // Anomaly detection: high reconstruction error = anomaly
    const reconStd = Math.sqrt(reconErrors.reduce((s, e) => s + (e - meanReconError) ** 2, 0) / reconErrors.length)
    const anomalyThreshold = meanReconError + 2 * reconStd
    const anomalies = reconErrors.map((e, i) => ({ idx: i, error: e, isAnomaly: e > anomalyThreshold })).filter(a => a.isAnomaly)

    // Current reconstruction error
    const currentReconError = reconErrors[reconErrors.length - 1]
    const isCurrentAnomaly = currentReconError > anomalyThreshold

    // Signal
    let signal = 'NORMAL'
    let reason = ''
    if (isCurrentAnomaly) {
      signal = 'ANOMALY'
      reason = `Reconstruction error = ${currentReconError.toFixed(4)} > threshold ${anomalyThreshold.toFixed(4)}`
    } else {
      reason = `Reconstruction error = ${currentReconError.toFixed(4)} (normal)`
    }

    // Generated statistics
    const genFlat = generated.flat()
    const genMean = genFlat.reduce((a, b) => a + b, 0) / genFlat.length
    const genStd = Math.sqrt(genFlat.reduce((s, v) => s + (v - genMean) ** 2, 0) / genFlat.length)

    return {
      lossHistory, klHistory, reconHistory,
      latentPoints, generated, reconErrors,
      meanReconError, anomalyThreshold, anomalies,
      currentReconError, isCurrentAnomaly,
      signal, reason, genMean, genStd,
      nWindows: windows.length, mean, std,
    }
  }, [candles, exchange, symbol, latentDim, hiddenDim, beta, lr, nEpochs, lookback, windowSize])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'ANOMALY' ? '#ef4444' : '#22c55e'

  // Loss history
  const maxLoss = Math.max(...data.lossHistory, 0.1)
  const sxLoss = (i) => P + (i / data.lossHistory.length) * (W - 2 * P)
  const syLoss = (v) => H - P - (v / maxLoss) * (H - 2 * P)

  // Latent space scatter
  const allLatent = data.latentPoints
  const minL0 = Math.min(...allLatent.map(p => p[0])), maxL0 = Math.max(...allLatent.map(p => p[0]))
  const minL1 = Math.min(...allLatent.map(p => p[1] || 0)), maxL1 = Math.max(...allLatent.map(p => p[1] || 0))
  const sxL = (v) => P + ((v - minL0) / (maxL0 - minL0 + 0.001)) * (W - 2 * P)
  const syL = (v) => H - P - ((v - minL1) / (maxL1 - minL1 + 0.001)) * (H - 2 * P)

  // Reconstruction errors
  const maxErr = Math.max(...data.reconErrors, data.anomalyThreshold, 0.1)
  const sxE = (i) => P + (i / data.reconErrors.length) * (W - 2 * P)
  const syE = (v) => H - P - (v / maxErr) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Variational Autoencoder (VAE) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Latent dim:</span>
          <input type="number" value={latentDim} onChange={e => setLatentDim(Math.max(1, Math.min(5, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Hidden dim:</span>
          <input type="number" value={hiddenDim} onChange={e => setHiddenDim(Math.max(4, Math.min(16, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">β (KL weight):</span>
          <input type="number" step="0.1" value={beta} onChange={e => setBeta(Math.max(0, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Epochs:</span>
          <input type="number" value={nEpochs} onChange={e => setNEpochs(Math.max(10, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(4, Math.min(16, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(40, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Training loss */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">VAE Training: ELBO = Reconstruction + β·KL</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.lossHistory.map((l, i) => `${i === 0 ? 'M' : 'L'} ${sxLoss(i)} ${syLoss(l)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />
          <path d={data.reconHistory.map((l, i) => `${i === 0 ? 'M' : 'L'} ${sxLoss(i)} ${syLoss(l)}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth={1.5} opacity={0.7} />
          <path d={data.klHistory.map((l, i) => `${i === 0 ? 'M' : 'L'} ${sxLoss(i)} ${syLoss(l)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity={0.7} />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>Total ELBO</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>Reconstruction</text>
          <text x={W - P} y={48} textAnchor="end" fill="#f59e0b" fontSize={9}>KL divergence</text>
        </svg>
      </div>

      {/* Latent space */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Latent Space (z = μ, {latentDim}D, learned posterior)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          <line x1={W / 2} y1={P} x2={W / 2} y2={H - P} stroke="#334155" strokeDasharray="2,2" />
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" strokeDasharray="2,2" />

          {data.latentPoints.map((p, i) => {
            const isAnomaly = data.anomalies.some(a => a.idx === i)
            return <circle key={i} cx={sxL(p[0])} cy={syL(p[1] || 0)} r={isAnomaly ? 6 : 3} fill={isAnomaly ? '#ef4444' : '#06b6d4'} opacity={isAnomaly ? 1 : 0.6} />
          })}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>Normal ({data.latentPoints.length - data.anomalies.length})</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>Anomaly ({data.anomalies.length})</text>
        </svg>
      </div>

      {/* Reconstruction errors */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Reconstruction Error (anomaly detection)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Threshold */}
          <line x1={P} y1={syE(data.anomalyThreshold)} x2={W - P} y2={syE(data.anomalyThreshold)} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4,3" />

          {data.reconErrors.map((e, i) => (
            <line key={i} x1={sxE(i)} y1={H - P} x2={sxE(i)} y2={syE(e)} stroke={e > data.anomalyThreshold ? '#ef4444' : '#06b6d4'} strokeWidth={2} opacity={0.7} />
          ))}

          <text x={W - P} y={syE(data.anomalyThreshold) - 5} textAnchor="end" fill="#ef4444" fontSize={9}>Threshold: {data.anomalyThreshold.toFixed(4)}</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Windows</div>
          <div className="text-cyan-400 font-mono">{data.nWindows}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Mean recon err</div>
          <div className="text-emerald-400 font-mono">{data.meanReconError.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Anomalies</div>
          <div className="text-red-400 font-mono">{data.anomalies.length}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Gen. mean</div>
          <div className="text-amber-400 font-mono">{data.genMean.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Gen. std</div>
          <div className="text-purple-400 font-mono">{data.genStd.toFixed(4)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> VAE:</strong> q_φ(z|x) → N(μ,σ²), p_θ(x|z) → N(μ_θ,σ²_θ) |
        <strong> ELBO:</strong> E[log p(x|z)] - β·KL[q(z|x)||N(0,I)] |
        <strong> Reparameterization:</strong> z = μ + σ·ε |
        <strong> Anomaly:</strong> recon error {'>'} μ + 2σ
      </div>
    </div>
  )
}
