import React, { useMemo, useState } from 'react'

// ─── Gaussian Mixture Models (GMM) + EM Algorithm ───────────────────────────
// Fits Gaussian Mixture Models to return distributions using the
// Expectation-Maximization algorithm for regime clustering.
//
// Mathematical foundation:
//   GMM: p(x) = Σ_k π_k · N(x | μ_k, σ_k²)
//   where π_k are mixing weights (Σπ_k = 1)
//
//   EM Algorithm:
//   E-step: γ(z_k) = π_k·N(x|μ_k,σ_k²) / Σ_j π_j·N(x|μ_j,σ_j²)
//   M-step:
//     μ_k = Σ_n γ(z_nk)·x_n / Σ_n γ(z_nk)
//     σ_k² = Σ_n γ(z_nk)·(x_n - μ_k)² / Σ_n γ(z_nk)
//     π_k = Σ_n γ(z_nk) / N
//
//   Log-likelihood: L = Σ_n log[Σ_k π_k·N(x_n|μ_k,σ_k²)]
//   BIC = -2L + k·log(N) (model selection)
//   AIC = -2L + 2k

const gaussianPdf = (x, mu, sigma2) => {
  if (sigma2 <= 0) return 0
  return Math.exp(-((x - mu) ** 2) / (2 * sigma2)) / Math.sqrt(2 * Math.PI * sigma2)
}

// K-means for initialization
const kmeans = (data, k, maxIter = 50) => {
  const n = data.length
  const min = Math.min(...data), max = Math.max(...data)
  let centroids = Array.from({ length: k }, (_, i) => min + (max - min) * (i + 0.5) / k)
  
  for (let iter = 0; iter < maxIter; iter++) {
    const assignments = data.map(x => {
      let minDist = Infinity, idx = 0
      for (let i = 0; i < k; i++) {
        const d = (x - centroids[i]) ** 2
        if (d < minDist) { minDist = d; idx = i }
      }
      return idx
    })
    const newCentroids = [...centroids]
    for (let i = 0; i < k; i++) {
      const cluster = data.filter((_, j) => assignments[j] === i)
      if (cluster.length > 0) newCentroids[i] = cluster.reduce((a, b) => a + b, 0) / cluster.length
    }
    if (newCentroids.every((c, i) => Math.abs(c - centroids[i]) < 1e-6)) break
    centroids = newCentroids
  }
  return centroids
}

// EM algorithm for GMM
const fitGMM = (data, k, maxIter = 100, tol = 1e-6) => {
  const n = data.length
  const centroids = kmeans(data, k)
  
  let mus = centroids.slice()
  let sigmas2 = Array.from({ length: k }, () => {
    const v = data.reduce((s, x) => s + (x - data.reduce((a, b) => a + b, 0) / n) ** 2, 0) / n
    return Math.max(1e-10, v / k)
  })
  let pis = new Array(k).fill(1 / k)
  
  let prevLogLik = -Infinity
  const logLikHistory = []
  
  for (let iter = 0; iter < maxIter; iter++) {
    // E-step
    const gammas = Array.from({ length: n }, () => new Array(k).fill(0))
    for (let i = 0; i < n; i++) {
      let sum = 0
      const probs = new Array(k).fill(0)
      for (let j = 0; j < k; j++) {
        probs[j] = pis[j] * gaussianPdf(data[i], mus[j], sigmas2[j])
        sum += probs[j]
      }
      for (let j = 0; j < k; j++) gammas[i][j] = sum > 0 ? probs[j] / sum : 1 / k
    }
    
    // M-step
    const Nk = new Array(k).fill(0)
    for (let j = 0; j < k; j++) {
      for (let i = 0; i < n; i++) Nk[j] += gammas[i][j]
    }
    
    for (let j = 0; j < k; j++) {
      if (Nk[j] > 0) {
        mus[j] = data.reduce((s, x, i) => s + gammas[i][j] * x, 0) / Nk[j]
        sigmas2[j] = Math.max(1e-10, data.reduce((s, x, i) => s + gammas[i][j] * (x - mus[j]) ** 2, 0) / Nk[j])
        pis[j] = Nk[j] / n
      }
    }
    
    // Log-likelihood
    let logLik = 0
    for (let i = 0; i < n; i++) {
      let sum = 0
      for (let j = 0; j < k; j++) sum += pis[j] * gaussianPdf(data[i], mus[j], sigmas2[j])
      logLik += Math.log(Math.max(1e-10, sum))
    }
    logLikHistory.push(logLik)
    
    if (Math.abs(logLik - prevLogLik) < tol) break
    prevLogLik = logLik
  }
  
  // Assignments
  const assignments = data.map(x => {
    let maxProb = 0, idx = 0
    for (let j = 0; j < k; j++) {
      const p = pis[j] * gaussianPdf(x, mus[j], sigmas2[j])
      if (p > maxProb) { maxProb = p; idx = j }
    }
    return idx
  })
  
  // BIC and AIC
  const nParams = k * 3 - 1 // k means + k variances + (k-1) weights
  const bic = -2 * prevLogLik + nParams * Math.log(n)
  const aic = -2 * prevLogLik + 2 * nParams
  
  // Sort by mean
  const order = mus.map((m, i) => i).sort((a, b) => mus[a] - mus[b])
  const sortedMus = order.map(i => mus[i])
  const sortedSigmas2 = order.map(i => sigmas2[i])
  const sortedPis = order.map(i => pis[i])
  
  return {
    mus: sortedMus, sigmas2: sortedSigmas2, pis: sortedPis,
    assignments, logLik: prevLogLik, logLikHistory,
    bic, aic, k, nParams,
  }
}

export default function GaussianMixtureModel({ candles, symbol, exchange }) {
  const [maxK, setMaxK] = useState(5)
  const [lookback, setLookback] = useState(100)
  const [autoK, setAutoK] = useState(true)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback - 1).map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }
    
    // Fit GMM for k=1..maxK, select by BIC
    const models = []
    for (let k = 1; k <= maxK; k++) {
      const result = fitGMM(returns, k, 100, 1e-6)
      models.push({ k, ...result })
    }
    
    // Select best K by BIC
    const bestModel = autoK
      ? models.reduce((best, m) => m.bic < best.bic ? m : best)
      : models[Math.min(maxK - 1, models.length - 1)]
    
    // Regime labels
    const regimeLabels = bestModel.mus.map((m, i) => {
      const vol = Math.sqrt(bestModel.sigmas2[i])
      if (m > 0.001 && vol < 0.01) return 'Bull-Calm'
      if (m > 0.001 && vol >= 0.01) return 'Bull-Volatile'
      if (m < -0.001 && vol < 0.01) return 'Bear-Calm'
      if (m < -0.001 && vol >= 0.01) return 'Bear-Volatile'
      return 'Sideways'
    })
    
    // Current regime
    const currentRegime = bestModel.assignments[bestModel.assignments.length - 1]
    const currentLabel = regimeLabels[currentRegime]
    const currentProb = bestModel.pis[currentRegime]
    
    // Signal
    let signal = 'NEUTRAL'
    if (currentLabel.startsWith('Bull')) signal = 'BUY'
    else if (currentLabel.startsWith('Bear')) signal = 'SELL'
    
    // Histogram for visualization
    const nBins = 30
    const minR = Math.min(...returns), maxR = Math.max(...returns)
    const binW = (maxR - minR) / nBins
    const hist = new Array(nBins).fill(0)
    for (const r of returns) {
      const idx = Math.min(nBins - 1, Math.floor((r - minR) / binW))
      hist[idx]++
    }
    const histProbs = hist.map(h => h / returns.length)
    
    // GMM density for comparison
    const gmmDensity = []
    for (let i = 0; i < nBins * 2; i++) {
      const x = minR + (i / (nBins * 2 - 1)) * (maxR - minR)
      let density = 0
      for (let j = 0; j < bestModel.k; j++) {
        density += bestModel.pis[j] * gaussianPdf(x, bestModel.mus[j], bestModel.sigmas2[j])
      }
      gmmDensity.push({ x, density: density * binW })
    }
    
    // Regime over time
    const regimeOverTime = bestModel.assignments.slice(-60)
    
    return {
      models, bestModel, regimeLabels,
      currentRegime, currentLabel, currentProb,
      signal, returns, histProbs, gmmDensity,
      minR, maxR, binW, nBins,
      regimeOverTime, prices: prices.slice(1),
    }
  }, [candles, exchange, symbol, maxK, lookback, autoK])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'
  const regimeColors = ['#22c55e', '#ef4444', '#f59e0b', '#a855f7', '#06b6d4']

  // Histogram + GMM density
  const maxHist = Math.max(...data.histProbs, ...data.gmmDensity.map(d => d.density), 0.001)
  const sxH = (i) => P + (i / data.nBins) * (W - 2 * P)
  const syH = (v) => H - P - (v / maxHist) * (H - 2 * P)
  const sxDens = (i) => P + (i / (data.nBins * 2 - 1)) * (W - 2 * P)

  // BIC/AIC comparison
  const maxBIC = Math.max(...data.models.map(m => m.bic))
  const minBIC = Math.min(...data.models.map(m => m.bic))
  const sxBIC = (k) => P + ((k - 1) / (data.models.length - 1)) * (W - 2 * P)
  const syBIC = (v) => H - P - ((v - minBIC) / (maxBIC - minBIC + 0.001)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Gaussian Mixture Model (EM) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.currentLabel} → {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max K:</span>
          <input type="number" value={maxK} onChange={e => setMaxK(Math.max(1, Math.min(8, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={autoK} onChange={e => setAutoK(e.target.checked)} />
          <span className="text-slate-400">Auto-select K (BIC)</span>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(50, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Histogram + GMM density */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Return Distribution + GMM Fit (K={data.bestModel.k})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Histogram */}
          {data.histProbs.map((p, i) => (
            <rect key={i} x={sxH(i)} y={syH(p)} width={(W - 2 * P) / data.nBins - 1} height={H - P - syH(p)} fill="#475569" opacity={0.4} />
          ))}

          {/* GMM density */}
          <path d={data.gmmDensity.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sxDens(i)} ${syH(d.density)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {/* Component densities */}
          {data.bestModel.mus.map((mu, j) => {
            const compDensity = []
            for (let i = 0; i < data.nBins * 2; i++) {
              const x = data.minR + (i / (data.nBins * 2 - 1)) * (data.maxR - data.minR)
              compDensity.push({ x, d: data.bestModel.pis[j] * gaussianPdf(x, mu, data.bestModel.sigmas2[j]) * data.binW })
            }
            return (
              <path key={j} d={compDensity.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sxDens(i)} ${syH(d.d)}`).join(' ')} fill="none" stroke={regimeColors[j]} strokeWidth={1.5} opacity={0.5} strokeDasharray="3,2" />
            )
          })}

          {/* Regime means */}
          {data.bestModel.mus.map((mu, j) => {
            const x = P + ((mu - data.minR) / (data.maxR - data.minR)) * (W - 2 * P)
            return <line key={j} x1={x} y1={P} x2={x} y2={H - P} stroke={regimeColors[j]} strokeWidth={1} strokeDasharray="2,2" />
          })}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>GMM density</text>
          <text x={W - P} y={34} textAnchor="end" fill="#475569" fontSize={9}>Histogram</text>
        </svg>
      </div>

      {/* BIC/AIC model selection */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Model Selection: BIC / AIC vs K</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.models.map((m, i) => (
            <g key={i}>
              <circle cx={sxBIC(m.k)} cy={syBIC(m.bic)} r={m.k === data.bestModel.k ? 6 : 3} fill={m.k === data.bestModel.k ? '#22c55e' : '#06b6d4'} />
              <circle cx={sxBIC(m.k)} cy={syBIC(m.aic)} r={m.k === data.bestModel.k ? 6 : 3} fill={m.k === data.bestModel.k ? '#f59e0b' : '#a855f7'} opacity={0.6} />
              <text x={sxBIC(m.k)} y={H - P + 12} textAnchor="middle" fill="#94a3b8" fontSize={8}>K={m.k}</text>
            </g>
          ))}
          <path d={data.models.map((m, i) => `${i === 0 ? 'M' : 'L'} ${sxBIC(m.k)} ${syBIC(m.bic)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={1.5} />
          <path d={data.models.map((m, i) => `${i === 0 ? 'M' : 'L'} ${sxBIC(m.k)} ${syBIC(m.aic)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={1.5} opacity={0.6} />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>BIC (best K={data.bestModel.k})</text>
          <text x={W - P} y={34} textAnchor="end" fill="#a855f7" fontSize={9}>AIC</text>
        </svg>
      </div>

      {/* Regime over time */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Regime Assignment Over Time (last 60 bars)</div>
        <svg width={W} height={80} className="bg-slate-900 rounded">
          {data.regimeOverTime.map((r, i) => {
            const x = P + (i / data.regimeOverTime.length) * (W - 2 * P)
            return <rect key={i} x={x} y={10} width={Math.max(1, (W - 2 * P) / data.regimeOverTime.length - 0.5)} height={60} fill={regimeColors[r]} opacity={0.6} />
          })}
        </svg>
      </div>

      {/* Component details */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Mixture Components (K={data.bestModel.k})</div>
        <div className="space-y-1">
          {data.bestModel.mus.map((mu, j) => (
            <div key={j} className="flex items-center gap-3 text-xs">
              <span className="w-3 h-3 rounded" style={{ background: regimeColors[j] }} />
              <span className="text-slate-400 w-20">{data.regimeLabels[j]}</span>
              <span className="text-cyan-400 font-mono w-20">μ={(mu * 100).toFixed(4)}%</span>
              <span className="text-amber-400 font-mono w-20">σ={(Math.sqrt(data.bestModel.sigmas2[j]) * 100).toFixed(4)}%</span>
              <span className="text-purple-400 font-mono w-20">π={(data.bestModel.pis[j] * 100).toFixed(1)}%</span>
              <div className="flex-1 bg-slate-900 rounded h-3 relative">
                <div className="h-full rounded" style={{ width: `${data.bestModel.pis[j] * 100}%`, background: regimeColors[j] }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Best K</div>
          <div className="text-cyan-400 font-mono">{data.bestModel.k}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Log-likelihood</div>
          <div className="text-emerald-400 font-mono">{data.bestModel.logLik.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">BIC</div>
          <div className="text-amber-400 font-mono">{data.bestModel.bic.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Current regime</div>
          <div className="font-mono" style={{ color: regimeColors[data.currentRegime] }}>{data.currentLabel}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Regime prob</div>
          <div className="text-purple-400 font-mono">{(data.currentProb * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Algorithm:</strong> EM (E-step: posterior γ, M-step: update μ,σ²,π) |
        <strong> Init:</strong> K-means |
        <strong> Selection:</strong> BIC = -2L + k·log(N) |
        <strong> Convergence:</strong> |ΔL| {'<'} 1e-6
      </div>
    </div>
  )
}
