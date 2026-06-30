import React, { useMemo, useState } from 'react'

// ─── Empirical Dynamic Modeling (EDM) ───────────────────────────────────────
// Implements Takens' embedding theorem and Convergent Cross Mapping (CCM)
// for detecting causal relationships in dynamical systems without assuming
// parametric models.
//
// Mathematical foundation:
//   Takens' embedding: x(t) → [x(t), x(t-τ), x(t-2τ), ..., x(t-(E-1)τ)]
//   where E = embedding dimension, τ = time delay
//
//   Simplex projection (S-map):
//   1. Find E+1 nearest neighbors in embedding space
//   2. Weighted average of neighbors' future values
//   3. Weights: w_i = exp(-θ·d_i/d_min)
//
//   Convergent Cross Mapping (CCM):
//   Test if variable X causally influences Y:
//   1. Embed Y → construct shadow manifold M_Y
//   2. For each point in M_Y, find nearest neighbors
//   3. Use neighbor indices to estimate X values
//   4. Correlation ρ between estimated and actual X increases with library size
//   5. If ρ → 1, X is causally linked to Y
//
//   Sugihara CCM: "correlation does not imply causation, but causation implies correlation"

// Mutual information for optimal time delay
const mutualInfo = (x, maxTau = 20) => {
  const n = x.length
  const mis = []
  for (let tau = 1; tau <= maxTau; tau++) {
    const x1 = x.slice(0, n - tau)
    const x2 = x.slice(tau)
    // Bin into 10 bins
    const nBins = 10
    const min = Math.min(...x), max = Math.max(...x)
    const binW = (max - min) / nBins
    if (binW === 0) { mis.push(0); continue }
    const bins1 = x1.map(v => Math.min(nBins - 1, Math.floor((v - min) / binW)))
    const bins2 = x2.map(v => Math.min(nBins - 1, Math.floor((v - min) / binW)))
    let mi = 0
    for (let i = 0; i < nBins; i++) {
      for (let j = 0; j < nBins; j++) {
        const pxy = bins1.filter((b, k) => b === i && bins2[k] === j).length / x1.length
        const px = bins1.filter(b => b === i).length / x1.length
        const py = bins2.filter(b => b === j).length / x2.length
        if (pxy > 0 && px > 0 && py > 0) {
          mi += pxy * Math.log(pxy / (px * py))
        }
      }
    }
    mis.push(mi)
  }
  // First minimum
  let optTau = 1
  for (let i = 1; i < mis.length - 1; i++) {
    if (mis[i] < mis[i - 1] && mis[i] < mis[i + 1]) { optTau = i + 1; break }
  }
  return { mis, optTau }
}

// False nearest neighbors for optimal embedding dimension
const falseNearestNeighbors = (x, tau, maxE = 10) => {
  const n = x.length
  const fnnRatios = []
  for (let E = 1; E <= maxE; E++) {
    let falseCount = 0, totalPairs = 0
    const nEmbed = n - (E - 1) * tau
    for (let i = 0; i < nEmbed; i++) {
      // Find nearest neighbor in E-dim space
      let minDist = Infinity, nnIdx = -1
      for (let j = 0; j < nEmbed; j++) {
        if (j === i) continue
        let dist = 0
        for (let k = 0; k < E; k++) dist += (x[i + k * tau] - x[j + k * tau]) ** 2
        dist = Math.sqrt(dist)
        if (dist < minDist) { minDist = dist; nnIdx = j }
      }
      if (nnIdx >= 0 && minDist > 0) {
        // Check if still close in E+1 dim
        const distE1 = Math.abs(x[i + E * tau] - x[nnIdx + E * tau])
        const ratio = distE1 / minDist
        if (ratio > 10 || (distE1 / Math.sqrt(x.reduce((s, v) => s + v * v, 0) / n)) > 2) {
          falseCount++
        }
        totalPairs++
      }
    }
    fnnRatios.push(totalPairs > 0 ? falseCount / totalPairs : 0)
  }
  // Find E where FNN drops below 5%
  let optE = 2
  for (let E = 1; E <= fnnRatios.length; E++) {
    if (fnnRatios[E - 1] < 0.05) { optE = E; break }
  }
  return { fnnRatios, optE }
}

// Time delay embedding
const embed = (x, E, tau) => {
  const n = x.length
  const nEmbed = n - (E - 1) * tau
  const embedded = []
  for (let i = 0; i < nEmbed; i++) {
    const vec = []
    for (let k = 0; k < E; k++) vec.push(x[i + k * tau])
    embedded.push(vec)
  }
  return embedded
}

// Simplex projection forecast
const simplexForecast = (x, E, tau, tPred, libSize) => {
  const embedded = embed(x, E, tau)
  const n = embedded.length
  const libEnd = Math.min(libSize, n - 1)

  // Find E+1 nearest neighbors in library
  const target = embedded[tPred]
  if (!target) return null

  const distances = []
  for (let i = 0; i < libEnd; i++) {
    if (i === tPred) continue
    let dist = 0
    for (let k = 0; k < E; k++) dist += (target[k] - embedded[i][k]) ** 2
    distances.push({ idx: i, dist: Math.sqrt(dist) })
  }
  distances.sort((a, b) => a.dist - b.dist)
  const neighbors = distances.slice(0, E + 1)

  if (neighbors.length < 2) return null

  // Weighted average
  const minDist = neighbors[0].dist || 0.001
  const weights = neighbors.map(n => Math.exp(-n.dist / minDist))
  const totalW = weights.reduce((a, b) => a + b, 0)

  // Predict: weighted average of neighbors' future values
  let pred = 0
  for (let i = 0; i < neighbors.length; i++) {
    const futureIdx = neighbors[i].idx + 1
    if (futureIdx < x.length) {
      pred += (weights[i] / totalW) * x[futureIdx + (E - 1) * tau]
    }
  }

  return pred
}

// Convergent Cross Mapping
const ccm = (X, Y, E, tau, libSizes) => {
  const n = X.length
  const results = []

  for (const libSize of libSizes) {
    const actualLib = Math.min(libSize, n - E * tau)
    if (actualLib < E + 2) continue

    // Embed Y
    const embeddedY = embed(Y, E, tau)
    const nEmbed = embeddedY.length

    // For each point in Y's embedding, find nearest neighbors
    // Then use their indices to estimate X
    const estimatedX = []
    const actualX = []

    for (let t = 0; t < nEmbed; t++) {
      if (t >= actualLib) continue

      // Find E+1 nearest neighbors in Y's manifold
      const distances = []
      for (let i = 0; i < actualLib; i++) {
        if (i === t) continue
        let dist = 0
        for (let k = 0; k < E; k++) dist += (embeddedY[t][k] - embeddedY[i][k]) ** 2
        distances.push({ idx: i, dist: Math.sqrt(dist) })
      }
      distances.sort((a, b) => a.dist - b.dist)
      const neighbors = distances.slice(0, E + 1)

      if (neighbors.length < 2) continue

      // Estimate X using neighbor indices
      const minDist = neighbors[0].dist || 0.001
      const weights = neighbors.map(n => Math.exp(-n.dist / minDist))
      const totalW = weights.reduce((a, b) => a + b, 0)

      let estX = 0
      for (let i = 0; i < neighbors.length; i++) {
        const xIdx = neighbors[i].idx + (E - 1) * tau
        if (xIdx < X.length) {
          estX += (weights[i] / totalW) * X[xIdx]
        }
      }
      estimatedX.push(estX)
      actualX.push(X[t + (E - 1) * tau])
    }

    // Correlation
    if (estimatedX.length > 2) {
      const meanE = estimatedX.reduce((a, b) => a + b, 0) / estimatedX.length
      const meanA = actualX.reduce((a, b) => a + b, 0) / actualX.length
      let num = 0, denE = 0, denA = 0
      for (let i = 0; i < estimatedX.length; i++) {
        num += (estimatedX[i] - meanE) * (actualX[i] - meanA)
        denE += (estimatedX[i] - meanE) ** 2
        denA += (actualX[i] - meanA) ** 2
      }
      const rho = num / (Math.sqrt(denE) * Math.sqrt(denA) + 1e-10)
      results.push({ libSize: actualLib, rho })
    }
  }

  return results
}

export default function EmpiricalDynamicModeling({ candles, symbol, exchange, symbols }) {
  const [maxE, setMaxE] = useState(8)
  const [maxTau, setMaxTau] = useState(15)
  const [forecastSteps, setForecastSteps] = useState(5)
  const [ccmTarget, setCcmTarget] = useState(null)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 50) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // Optimal time delay via mutual information
    const { mis, optTau } = mutualInfo(returns, maxTau)

    // Optimal embedding dimension via FNN
    const { fnnRatios, optE } = falseNearestNeighbors(returns, optTau, maxE)

    // Simplex forecast
    const forecasts = []
    const n = returns.length
    const libSize = n - forecastSteps - optE * optTau
    for (let s = 0; s < forecastSteps; s++) {
      const tPred = libSize + s
      const pred = simplexForecast(returns, optE, optTau, tPred, libSize)
      if (pred !== null) {
        forecasts.push({ step: s + 1, predicted: pred, actual: returns[tPred + (optE - 1) * optTau] })
      }
    }

    // Forecast skill (correlation)
    let forecastRho = 0
    if (forecasts.length > 2) {
      const preds = forecasts.map(f => f.predicted)
      const actuals = forecasts.map(f => f.actual)
      const meanP = preds.reduce((a, b) => a + b, 0) / preds.length
      const meanA = actuals.reduce((a, b) => a + b, 0) / actuals.length
      let num = 0, denP = 0, denA = 0
      for (let i = 0; i < preds.length; i++) {
        num += (preds[i] - meanP) * (actuals[i] - meanA)
        denP += (preds[i] - meanP) ** 2
        denA += (actuals[i] - meanA) ** 2
      }
      forecastRho = num / (Math.sqrt(denP) * Math.sqrt(denA) + 1e-10)
    }

    // CCM with another symbol if available
    let ccmResults = null
    let ccmTargetSymbol = null
    if (symbols && symbols.length > 1) {
      for (const sym of symbols) {
        if (sym === symbol) continue
        const cds2 = candles[exchange]?.[sym]
        if (!cds2 || cds2.length < 50) continue
        const prices2 = cds2.map(c => c.close)
        const returns2 = []
        for (let i = 1; i < prices2.length; i++) {
          returns2.push((prices2[i] - prices2[i - 1]) / prices2[i - 1])
        }
        // Align lengths
        const minLen = Math.min(returns.length, returns2.length)
        const X = returns.slice(-minLen)
        const Y = returns2.slice(-minLen)
        const libSizes = [20, 30, 40, 50, 60, 70, 80, Math.min(100, minLen - optE * optTau)]
        const results = ccm(X, Y, optE, optTau, libSizes)
        if (results.length > 0) {
          ccmResults = results
          ccmTargetSymbol = sym
          break
        }
      }
    }

    // Signal from forecast
    const lastForecast = forecasts[forecasts.length - 1]
    let signal = 'NEUTRAL'
    let reason = ''
    if (lastForecast) {
      if (lastForecast.predicted > 0.002) {
        signal = 'BUY'
        reason = `Simplex forecast: +${(lastForecast.predicted * 100).toFixed(3)}% (E=${optE}, τ=${optTau})`
      } else if (lastForecast.predicted < -0.002) {
        signal = 'SELL'
        reason = `Simplex forecast: ${(lastForecast.predicted * 100).toFixed(3)}% (E=${optE}, τ=${optTau})`
      } else {
        reason = `Forecast: ${(lastForecast.predicted * 100).toFixed(3)}% (E=${optE}, τ=${optTau})`
      }
    }

    return {
      mis, optTau, fnnRatios, optE,
      forecasts, forecastRho,
      ccmResults, ccmTargetSymbol,
      signal, reason,
      returns, prices: prices.slice(-50),
    }
  }, [candles, exchange, symbol, symbols, maxE, maxTau, forecastSteps])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 50 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 200, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Empirical Dynamic Modeling (EDM) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max E:</span>
          <input type="number" value={maxE} onChange={e => setMaxE(Math.max(3, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Max τ:</span>
          <input type="number" value={maxTau} onChange={e => setMaxTau(Math.max(5, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Forecast steps:</span>
          <input type="number" value={forecastSteps} onChange={e => setForecastSteps(Math.max(1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Mutual information for τ */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Mutual Information → optimal τ = {data.optTau}</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          {data.mis.map((mi, i) => {
            const x = P + (i / data.mis.length) * (W - 2 * P)
            const maxMI = Math.max(...data.mis, 0.001)
            const h = (mi / maxMI) * (H - 2 * P)
            const isOpt = i === data.optTau - 1
            return <rect key={i} x={x} y={H - P - h} width={(W - 2 * P) / data.mis.length - 2} height={h} fill={isOpt ? '#22c55e' : '#06b6d4'} opacity={isOpt ? 1 : 0.5} />
          })}
        </svg>
      </div>

      {/* FNN for E */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">False Nearest Neighbors → optimal E = {data.optE}</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={H - P - 0.05 * (H - 2 * P)} x2={W - P} y2={H - P - 0.05 * (H - 2 * P)} stroke="#ef4444" strokeDasharray="3,3" />
          {data.fnnRatios.map((fnn, i) => {
            const x = P + (i / data.fnnRatios.length) * (W - 2 * P)
            const h = fnn * (H - 2 * P)
            const isOpt = i === data.optE - 1
            return (
              <g key={i}>
                <rect x={x} y={H - P - h} width={(W - 2 * P) / data.fnnRatios.length - 2} height={h} fill={isOpt ? '#22c55e' : '#f59e0b'} opacity={isOpt ? 1 : 0.5} />
                <text x={x + 5} y={H - P + 12} fill="#94a3b8" fontSize={8}>E={i + 1}</text>
              </g>
            )
          })}
          <text x={W - P} y={20} textAnchor="end" fill="#ef4444" fontSize={9}>5% threshold</text>
        </svg>
      </div>

      {/* CCM convergence */}
      {data.ccmResults && (
        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">CCM: {symbol} ← {data.ccmTargetSymbol} (causality test)</div>
          <svg width={W} height={H} className="bg-slate-900 rounded">
            <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
            <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
            <line x1={P} y1={H - P - (H - 2 * P)} x2={W - P} y2={H - P - (H - 2 * P)} stroke="#475569" strokeDasharray="3,3" />
            <path
              d={data.ccmResults.map((r, i) => `${i === 0 ? 'M' : 'L'} ${P + (r.libSize / data.ccmResults[data.ccmResults.length - 1].libSize) * (W - 2 * P)} ${H - P - Math.max(0, r.rho) * (H - 2 * P)}`).join(' ')}
              fill="none" stroke="#a855f7" strokeWidth={2}
            />
            {data.ccmResults.map((r, i) => (
              <circle key={i} cx={P + (r.libSize / data.ccmResults[data.ccmResults.length - 1].libSize) * (W - 2 * P)} cy={H - P - Math.max(0, r.rho) * (H - 2 * P)} r={3} fill="#a855f7" />
            ))}
            <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>ρ = {data.ccmResults[data.ccmResults.length - 1]?.rho.toFixed(4)}</text>
            <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={10}>Library size</text>
            <text x={5} y={P + 10} fill="#475569" fontSize={10}>ρ (correlation)</text>
          </svg>
        </div>
      )}

      {/* Forecast table */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Simplex Projection Forecast (E={data.optE}, τ={data.optTau})</div>
        <div className="space-y-1">
          {data.forecasts.map((f, i) => (
            <div key={i} className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">t+{f.step}</span>
              <span className="text-amber-400">pred: {(f.predicted * 100).toFixed(4)}%</span>
              <span className="text-slate-500">actual: {f.actual !== undefined ? (f.actual * 100).toFixed(4) + '%' : 'N/A'}</span>
              <span className="text-slate-500">err: {f.actual !== undefined ? ((f.predicted - f.actual) * 100).toFixed(4) + '%' : 'N/A'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Optimal τ</div>
          <div className="text-cyan-400 font-mono">{data.optTau}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Optimal E</div>
          <div className="text-emerald-400 font-mono">{data.optE}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Forecast ρ</div>
          <div className="text-amber-400 font-mono">{data.forecastRho.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">CCM ρ</div>
          <div className="text-purple-400 font-mono">{data.ccmResults ? data.ccmResults[data.ccmResults.length - 1]?.rho.toFixed(4) : 'N/A'}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Method:</strong> Takens embedding + simplex projection |
        <strong> CCM:</strong> {data.ccmTargetSymbol ? `${symbol} ← ${data.ccmTargetSymbol}` : 'N/A'}
      </div>
    </div>
  )
}
