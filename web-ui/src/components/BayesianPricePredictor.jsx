import React, { useMemo, useState } from 'react'

// ─── Bayesian Price Predictor ────────────────────────────────────────────────
// Uses Bayesian inference with conjugate priors to estimate the probability
// of price direction (up/down) and magnitude. Models include:
//
// 1. Beta-Binomial model: P(up tomorrow) with Beta prior, updated by observed
//    up/down days → posterior Beta(α + ups, β + downs)
//
// 2. Normal-Inverse-Gamma model: posterior distribution of mean return
//    given observed returns. Conjugate updating of μ and σ².
//
// 3. Bayesian regime change detection: online changepoint detection using
//    the Bayesian online changepoint algorithm (BOCPD) with hazard function.
//
// 4. Bayesian linear regression: predict next return from recent features
//    with Bayesian coefficient uncertainty (Bayesian Ridge).

// Beta distribution PDF (approximation)
const betaPDF = (x, alpha, beta) => {
  if (x <= 0 || x >= 1) return 0
  // B(alpha, beta) = Gamma(alpha)*Gamma(beta)/Gamma(alpha+beta)
  const logB = logGamma(alpha) + logGamma(beta) - logGamma(alpha + beta)
  return Math.exp((alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - logB)
}

// Stirling's approximation for log(Gamma)
const logGamma = (z) => {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
  ]
  let y = z
  let tmp = z + 5.5 - (z + 0.5) * Math.log(z + 5.5)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) {
    y += 1
    ser += c[j] / y
  }
  return -tmp + Math.log(2.5066282746310005 * ser / z)
}

// Normal PDF
const normalPDF = (x, mu, sigma) => {
  if (sigma <= 0) return 0
  return Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI))
}

// BOCPD — Bayesian Online Changepoint Detection
const bocpd = (returns, hazard = 1 / 100) => {
  const n = returns.length
  if (n < 5) return { changepoints: [], runLengths: [], probabilities: [] }

  const runLengths = new Array(n).fill(0)
  const probabilities = new Array(n).fill(0)

  // Simplified: track most likely run length at each step
  // Using Gaussian predictive probability with running stats
  let bestRun = 0
  const changepoints = []

  for (let t = 1; t < n; t++) {
    // Predictive probability under current run
    const window = returns.slice(Math.max(0, t - bestRun - 1), t)
    const mean = window.reduce((a, b) => a + b, 0) / Math.max(1, window.length)
    const variance = window.length > 1 ? window.reduce((s, r) => s + (r - mean) ** 2, 0) / window.length : 0.0001
    const sigma = Math.sqrt(variance + 1e-8)

    // Predictive probability of current observation
    const predProb = normalPDF(returns[t], mean, sigma)
    // Changepoint probability
    const cpProb = hazard

    // Compare: continue run vs changepoint
    if (predProb < 0.01 || cpProb > predProb * 0.5) {
      // Likely changepoint
      if (bestRun > 5) changepoints.push(t)
      bestRun = 0
    } else {
      bestRun++
    }

    runLengths[t] = bestRun
    probabilities[t] = predProb
  }

  return { changepoints, runLengths, probabilities }
}

// Bayesian Linear Regression (Bayesian Ridge)
const bayesianRidge = (X, y, nIter = 50) => {
  const n = X.length
  const d = X[0]?.length || 0
  if (n < 5 || d === 0) return { weights: new Array(d).fill(0), sigma: 1, predictions: [] }

  // Prior: w ~ N(0, α⁻²I), noise ~ N(0, β⁻²)
  let alpha = 1.0  // precision of weights
  let beta = 1.0   // precision of noise

  let weights = new Array(d).fill(0)
  const predictions = new Array(n).fill(0)

  for (let iter = 0; iter < nIter; iter++) {
    // Compute XᵀX and Xᵀy
    const XtX = Array.from({ length: d }, () => new Array(d).fill(0))
    const Xty = new Array(d).fill(0)
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < d; a++) {
        Xty[a] += X[i][a] * y[i]
        for (let b = 0; b < d; b++) {
          XtX[a][b] += X[i][a] * X[i][b]
        }
      }
    }

    // Posterior: Σ = (αI + βXᵀX)⁻¹, μ = βΣXᵀy
    // Solve (αI + βXᵀX)w = βXᵀy via Gaussian elimination
    const A = XtX.map((row, a) => row.map((v, b) => beta * v + (a === b ? alpha : 0)))
    const rhs = Xty.map(v => beta * v)

    // Gaussian elimination
    for (let col = 0; col < d; col++) {
      let maxRow = col
      for (let r = col + 1; r < d; r++) {
        if (Math.abs(A[r][col]) > Math.abs(A[maxRow][col])) maxRow = r
      }
      [A[col], A[maxRow]] = [A[maxRow], A[col]]
      ;[rhs[col], rhs[maxRow]] = [rhs[maxRow], rhs[col]]
      if (Math.abs(A[col][col]) < 1e-12) continue
      for (let r = col + 1; r < d; r++) {
        const factor = A[r][col] / A[col][col]
        for (let c = col; c < d; c++) A[r][c] -= factor * A[col][c]
        rhs[r] -= factor * rhs[col]
      }
    }
    // Back-substitution
    weights = new Array(d).fill(0)
    for (let r = d - 1; r >= 0; r--) {
      let sum = rhs[r]
      for (let c = r + 1; c < d; c++) sum -= A[r][c] * weights[c]
      weights[r] = Math.abs(A[r][r]) > 1e-12 ? sum / A[r][r] : 0
    }

    // Update alpha and beta (EM)
    let residualSS = 0
    for (let i = 0; i < n; i++) {
      let pred = 0
      for (let j = 0; j < d; j++) pred += X[i][j] * weights[j]
      predictions[i] = pred
      residualSS += (y[i] - pred) ** 2
    }
    const weightSS = weights.reduce((s, w) => s + w * w, 0)
    const newAlpha = d / (weightSS + 1e-8)
    const newBeta = n / (residualSS + 1e-8)
    alpha = 0.5 * (alpha + newAlpha)
    beta = 0.5 * (beta + newBeta)
  }

  return { weights, sigma: 1 / Math.sqrt(beta), predictions, alpha, beta }
}

export default function BayesianPricePredictor({ candles, symbol, exchange }) {
  const [priorStrength, setPriorStrength] = useState(10)
  const [lookback, setLookback] = useState(20)
  const [hazardRate, setHazardRate] = useState(100)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 30) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)
    const n = prices.length

    // Returns
    const returns = []
    for (let i = 1; i < n; i++) returns.push((prices[i] - prices[i - 1]) / prices[i - 1])

    // ── 1. Beta-Binomial: P(up) ──
    let ups = 0, downs = 0
    for (const r of returns) {
      if (r > 0) ups++
      else if (r < 0) downs++
    }
    const alpha = priorStrength / 2 + ups
    const beta = priorStrength / 2 + downs
    const pUp = alpha / (alpha + beta)
    const pDown = beta / (alpha + beta)

    // Credible interval (Beta distribution)
    const ciLow = betaCDFInv(0.025, alpha, beta)
    const ciHigh = betaCDFInv(0.975, alpha, beta)

    // ── 2. Normal-Inverse-Gamma: posterior mean return ──
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length
    const varReturn = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length
    const mu0 = 0  // Prior mean
    const kappa0 = priorStrength
    const a0 = priorStrength / 2
    const b0 = priorStrength * varReturn / 2

    const kappaN = kappa0 + n - 1
    const muN = (kappa0 * mu0 + (n - 1) * meanReturn) / kappaN
    const aN = a0 + (n - 1) / 2
    const bN = b0 + 0.5 * (n - 1) * varReturn + 0.5 * kappa0 * (n - 1) * (meanReturn - mu0) ** 2 / kappaN
    const postMean = muN
    const postStd = Math.sqrt(bN / (aN - 1))  // Student-t scale

    // ── 3. BOCPD ──
    const { changepoints, runLengths } = bocpd(returns, 1 / hazardRate)

    // ── 4. Bayesian Ridge Regression ──
    // Features: [1, lag_return_1, lag_return_2, rsi_proxy, volatility]
    const X = []
    const y = []
    for (let i = lookback; i < returns.length - 1; i++) {
      const lag1 = returns[i - 1]
      const lag2 = returns[i - 2]
      const window = returns.slice(i - lookback, i)
      const wmean = window.reduce((a, b) => a + b, 0) / window.length
      const wvar = window.reduce((s, r) => s + (r - wmean) ** 2, 0) / window.length
      const wstd = Math.sqrt(wvar)
      // Simple RSI proxy
      let gains = 0, losses = 0
      for (let j = i - Math.min(14, lookback); j < i; j++) {
        if (returns[j] > 0) gains += returns[j]
        else losses -= returns[j]
      }
      const rsi = gains + losses > 0 ? 50 + 50 * (gains - losses) / (gains + losses) : 50
      X.push([1, lag1, lag2, (rsi - 50) / 50, wstd * 100])
      y.push(returns[i + 1])
    }

    const { weights, sigma: noiseSigma, predictions } = bayesianRidge(X, y)

    // Next prediction
    const lastIdx = returns.length - 1
    const lastLag1 = returns[lastIdx - 1]
    const lastLag2 = returns[lastIdx - 2]
    const lastWindow = returns.slice(Math.max(0, lastIdx - lookback), lastIdx)
    const lastMean = lastWindow.reduce((a, b) => a + b, 0) / lastWindow.length
    const lastVar = lastWindow.reduce((s, r) => s + (r - lastMean) ** 2, 0) / lastWindow.length
    const lastStd = Math.sqrt(lastVar)
    let lastGains = 0, lastLosses = 0
    for (let j = Math.max(0, lastIdx - 14); j < lastIdx; j++) {
      if (returns[j] > 0) lastGains += returns[j]
      else lastLosses -= returns[j]
    }
    const lastRSI = lastGains + lastLosses > 0 ? 50 + 50 * (lastGains - lastLosses) / (lastGains + lastLosses) : 50
    const nextFeatures = [1, lastLag1, lastLag2, (lastRSI - 50) / 50, lastStd * 100]
    const nextPred = weights.reduce((s, w, i) => s + w * nextFeatures[i], 0)
    const nextCI = 1.96 * noiseSigma  // 95% credible interval

    // Model accuracy (in-sample R²)
    let ssTot = 0, ssRes = 0
    const yMean = y.reduce((a, b) => a + b, 0) / y.length
    for (let i = 0; i < y.length; i++) {
      ssTot += (y[i] - yMean) ** 2
      ssRes += (y[i] - (predictions[i] || 0)) ** 2
    }
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0

    // Signal
    let signal = 'NEUTRAL'
    let signalReason = ''
    if (pUp > 0.6 && nextPred > 0) {
      signal = 'BUY'
      signalReason = `P(up)=${(pUp * 100).toFixed(0)}%, predicted return=+${(nextPred * 100).toFixed(3)}%`
    } else if (pDown > 0.6 && nextPred < 0) {
      signal = 'SELL'
      signalReason = `P(down)=${(pDown * 100).toFixed(0)}%, predicted return=${(nextPred * 100).toFixed(3)}%`
    } else {
      signalReason = `Uncertain: P(up)=${(pUp * 100).toFixed(0)}%, pred=${(nextPred * 100).toFixed(3)}%`
    }

    return {
      pUp, pDown, alpha, beta, ciLow, ciHigh,
      postMean, postStd, muN, kappaN,
      changepoints, runLengths,
      weights, noiseSigma, predictions: predictions.slice(-50), y: y.slice(-50),
      nextPred, nextCI, rSquared, signal, signalReason,
      currentPrice: prices[n - 1],
      predictedPrice: prices[n - 1] * (1 + nextPred),
      predictedLow: prices[n - 1] * (1 + nextPred - nextCI),
      predictedHigh: prices[n - 1] * (1 + nextPred + nextCI),
      returns: returns.slice(-50),
    }
  }, [candles, exchange, symbol, priorStrength, lookback, hazardRate])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 30 candles for {symbol} on {exchange}</div>
  }

  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'

  // Beta distribution visualization
  const W = 400, H = 120, P = 20
  const betaPath = useMemo(() => {
    if (!data) return ''
    const points = []
    for (let i = 0; i <= 100; i++) {
      const x = i / 100
      const y = betaPDF(x, data.alpha, data.beta)
      points.push(`${P + x * (W - 2 * P)},${H - P - y * (H - 2 * P) * 5}`)
    }
    return points.length > 0 ? `M ${points.join(' L ')}` : ''
  }, [data])

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Bayesian Price Predictor — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Prior Strength:</span>
          <input type="number" value={priorStrength} onChange={e => setPriorStrength(Math.max(1, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(5, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Hazard (1/H):</span>
          <input type="number" value={hazardRate} onChange={e => setHazardRate(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Beta-Binomial posterior */}
        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">Beta-Binomial Posterior: P(price up)</div>
          <svg width={W} height={H} className="bg-slate-900 rounded">
            <path d={betaPath} fill="none" stroke="#06b6d4" strokeWidth={2} />
            <line x1={P + data.pUp * (W - 2 * P)} y1={P} x2={P + data.pUp * (W - 2 * P)} y2={H - P} stroke="#22c55e" strokeDasharray="3,2" />
            <line x1={P + data.ciLow * (W - 2 * P)} y1={P} x2={P + data.ciLow * (W - 2 * P)} y2={H - P} stroke="#64748b" strokeDasharray="2,2" />
            <line x1={P + data.ciHigh * (W - 2 * P)} y1={P} x2={P + data.ciHigh * (W - 2 * P)} y2={H - P} stroke="#64748b" strokeDasharray="2,2" />
          </svg>
          <div className="text-xs text-slate-300 mt-1">
            P(up) = <span className="text-emerald-400 font-mono">{(data.pUp * 100).toFixed(1)}%</span>
            <span className="text-slate-500"> | 95% CI: [{(data.ciLow * 100).toFixed(1)}%, {(data.ciHigh * 100).toFixed(1)}%]</span>
          </div>
          <div className="text-xs text-slate-500">α={data.alpha.toFixed(1)}, β={data.beta.toFixed(1)}</div>
        </div>

        {/* Bayesian Ridge predictions */}
        <div className="bg-slate-800 rounded p-3">
          <div className="text-xs text-slate-400 mb-1">Bayesian Ridge: Predicted vs Actual Returns</div>
          <svg width={W} height={H} className="bg-slate-900 rounded">
            {(() => {
              const allVals = [...data.y, ...data.predictions]
              const maxV = Math.max(0.01, ...allVals.map(Math.abs))
              const sc = (v) => H / 2 - (v / maxV) * (H / 2 - 5)
              const xp = (i) => P + (i / Math.max(1, data.y.length - 1)) * (W - 2 * P)
              const actualPath = data.y.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xp(i)} ${sc(v)}`).join(' ')
              const predPath = data.predictions.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xp(i)} ${sc(v)}`).join(' ')
              return <>
                <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
                <path d={actualPath} fill="none" stroke="#64748b" strokeWidth={1} opacity={0.5} />
                <path d={predPath} fill="none" stroke="#f59e0b" strokeWidth={1.5} />
              </>
            })()}
          </svg>
          <div className="text-xs text-slate-300 mt-1">
            R² = <span className="text-amber-400 font-mono">{(data.rSquared * 100).toFixed(1)}%</span>
            <span className="text-slate-500"> | σ = {(data.noiseSigma * 100).toFixed(4)}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Posterior Mean Return</div>
          <div className="font-mono" style={{ color: data.postMean >= 0 ? '#22c55e' : '#ef4444' }}>
            {(data.postMean * 100).toFixed(4)}%
          </div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Next Prediction</div>
          <div className="font-mono" style={{ color: data.nextPred >= 0 ? '#22c55e' : '#ef4444' }}>
            {(data.nextPred * 100).toFixed(4)}%
          </div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Predicted Price</div>
          <div className="text-cyan-400 font-mono">${data.predictedPrice.toFixed(2)}</div>
          <div className="text-slate-500 text-[10px]">[${data.predictedLow.toFixed(2)}, ${data.predictedHigh.toFixed(2)}]</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Changepoints</div>
          <div className="text-amber-400 font-mono">{data.changepoints.length} detected</div>
        </div>
      </div>

      {/* Regression weights */}
      <div className="bg-slate-800 rounded p-2 text-xs">
        <div className="text-slate-400 mb-1">Bayesian Ridge Weights:</div>
        <div className="flex gap-3 font-mono text-slate-300">
          <span>β₀={data.weights[0]?.toFixed(5)}</span>
          <span>β₁(lag1)={data.weights[1]?.toFixed(5)}</span>
          <span>β₂(lag2)={data.weights[2]?.toFixed(5)}</span>
          <span>β₃(rsi)={data.weights[3]?.toFixed(5)}</span>
          <span>β₄(vol)={data.weights[4]?.toFixed(5)}</span>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.signalReason} | <strong>Current:</strong> ${data.currentPrice.toFixed(2)} → <strong>Predicted:</strong> ${data.predictedPrice.toFixed(2)}
      </div>
    </div>
  )
}

// Inverse CDF for Beta distribution (bisection)
function betaCDFInv(p, alpha, beta) {
  if (p <= 0) return 0
  if (p >= 1) return 1
  let lo = 0, hi = 1
  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2
    // Approximate CDF via sum of PDF
    let cdf = 0
    const steps = 200
    for (let i = 1; i <= steps; i++) {
      const x = (i / steps) * mid
      cdf += betaPDF(x, alpha, beta) * (mid / steps)
    }
    if (cdf < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
