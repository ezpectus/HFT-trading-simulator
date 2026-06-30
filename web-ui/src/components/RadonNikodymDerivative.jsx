import React, { useMemo, useState } from 'react'

// --- Radon-Nikodym Derivative (Likelihood Ratio for Regime Detection) ---
// Computes the Radon-Nikodym derivative between two probability
// measures to detect regime changes via likelihood ratio analysis.
//
// Mathematical foundation:
//   Radon-Nikodym: dQ/dP = L(X) where Q << P (Q absolutely continuous w.r.t. P)
//   For Gaussians: dQ/dP = exp(-1/2 * sum [(x-mu_Q)^2/sigma_Q^2 - (x-mu_P)^2/sigma_P^2])
//                   + n*log(sigma_P/sigma_Q)
//
//   Likelihood ratio test: reject H0 (P=Q) if L > threshold
//   Neyman-Pearson: most powerful test at fixed alpha
//
//   Kullback-Leibler: D_KL(P||Q) = E_P[log(dP/dQ)]
//   = log(sigma_Q/sigma_P) + (sigma_P^2 + (mu_P-mu_Q)^2)/(2*sigma_Q^2) - 1/2
//
//   Applications: regime detection, anomaly detection, model validation,
//   change-point detection, signal-to-noise ratio estimation

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Gaussian log-likelihood
const gaussianLogLik = (data, mu, sigma) => {
  const n = data.length
  let ll = -n * 0.5 * Math.log(2 * Math.PI * sigma * sigma)
  for (const x of data) {
    ll += -0.5 * ((x - mu) ** 2) / (sigma * sigma)
  }
  return ll
}

// Radon-Nikodym derivative (log) for Gaussian measures
const logRadonNikodym = (x, muP, sigP, muQ, sigQ) => {
  const term1 = Math.log(sigP / sigQ)
  const term2 = 0.5 * ((x - muQ) ** 2 / (sigQ * sigQ) - (x - muP) ** 2 / (sigP * sigP))
  return term1 + term2
}

// KL divergence between two Gaussians
const klDivergenceGaussian = (muP, sigP, muQ, sigQ) => {
  return Math.log(sigQ / sigP) + (sigP * sigP + (muP - muQ) ** 2) / (2 * sigQ * sigQ) - 0.5
}

export default function RadonNikodymDerivative({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(200)
  const [windowSize, setWindowSize] = useState(40)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    const n = returns.length
    if (n < windowSize * 3) return null

    // Estimate baseline distribution (first window)
    const baseline = returns.slice(0, windowSize)
    const muP = baseline.reduce((a, b) => a + b, 0) / windowSize
    const sigP = Math.sqrt(baseline.reduce((s, r) => s + (r - muP) ** 2, 0) / windowSize)

    // Sliding window: compare each window to baseline
    const comparisons = []
    for (let i = 0; i + windowSize <= n; i += Math.max(3, Math.floor(windowSize / 5))) {
      const window = returns.slice(i, i + windowSize)
      const muQ = window.reduce((a, b) => a + b, 0) / windowSize
      const sigQ = Math.sqrt(window.reduce((s, r) => s + (r - muQ) ** 2, 0) / windowSize)

      // Log Radon-Nikodym derivative (sum over window)
      let logRN = 0
      for (const x of window) {
        logRN += logRadonNikodym(x, muP, sigP, muQ, sigQ)
      }

      // KL divergence
      const klPQ = klDivergenceGaussian(muP, sigP, muQ, sigQ)
      const klQP = klDivergenceGaussian(muQ, sigQ, muP, sigP)

      // Likelihood ratio test statistic: -2 * log(L) ~ chi^2(2) under H0
      const lrStat = -2 * (gaussianLogLik(window, muP, sigP) - gaussianLogLik(window, muQ, sigQ))
      const pValue = Math.exp(-lrStat / 2) // approximation for chi^2(2)

      // Per-point RN derivative
      const rnPerPoint = window.map(x => Math.exp(logRadonNikodym(x, muP, sigP, muQ, sigQ)))

      comparisons.push({
        idx: i,
        logRN, muQ, sigQ,
        klPQ, klQP, klSym: (klPQ + klQP) / 2,
        lrStat, pValue,
        meanRN: rnPerPoint.reduce((a, b) => a + b, 0) / rnPerPoint.length,
        significant: pValue < 0.05,
      })
    }

    // Current window
    const current = comparisons[comparisons.length - 1]
    const currentWindow = returns.slice(n - windowSize)
    const rnTrajectory = currentWindow.map(x => ({
      idx: n - windowSize,
      rn: Math.exp(logRadonNikodym(x, muP, sigP, current.muQ, current.sigQ)),
      x,
    }))

    // RN derivative density on grid
    const xMin = muP - 4 * sigP
    const xMax = muP + 4 * sigP
    const grid = []
    for (let i = 0; i <= 80; i++) {
      const x = xMin + (i / 80) * (xMax - xMin)
      grid.push({
        x,
        rn: Math.exp(logRadonNikodym(x, muP, sigP, current.muQ, current.sigQ)),
        logRN: logRadonNikodym(x, muP, sigP, current.muQ, current.sigQ),
      })
    }

    // Signal
    let signal = 'SAME_REGIME'
    let reason = ''
    if (current.pValue < 0.01) {
      signal = 'REGIME_CHANGE_STRONG'
      reason = `Strong regime change (LR=${current.lrStat.toFixed(2)}, p=${current.pValue.toExponential(2)}), KL=${current.klSym.toFixed(6)}`
    } else if (current.pValue < 0.05) {
      signal = 'REGIME_CHANGE'
      reason = `Regime change detected (LR=${current.lrStat.toFixed(2)}, p=${current.pValue.toFixed(4)}), KL=${current.klSym.toFixed(6)}`
    } else {
      reason = `Same regime (LR=${current.lrStat.toFixed(2)}, p=${current.pValue.toFixed(4)}), KL=${current.klSym.toFixed(6)}`
    }

    return {
      comparisons, current, rnTrajectory, grid,
      muP, sigP, signal, reason,
      klPQ: current.klPQ, klQP: current.klQP,
    }
  }, [candles, exchange, symbol, lookback, windowSize])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'REGIME_CHANGE_STRONG' ? '#ef4444' : data.signal === 'REGIME_CHANGE' ? '#f59e0b' : '#22c55e'

  // RN derivative density
  const maxRN = Math.max(...data.grid.map(g => g.rn), 0.1)
  const minLogRN = Math.min(...data.grid.map(g => g.logRN))
  const maxLogRN = Math.max(...data.grid.map(g => g.logRN))
  const xMin = data.grid[0].x
  const xMax = data.grid[data.grid.length - 1].x
  const sxG = (x) => P + ((x - xMin) / (xMax - xMin)) * (W - 2 * P)
  const syRN = (v) => H - P - (v / maxRN) * (H - 2 * P)
  const syLogRN = (v) => H - P - ((v - minLogRN) / (maxLogRN - minLogRN + 0.1)) * (H - 2 * P)

  // Log-RN over time
  const maxLogRNTime = Math.max(...data.comparisons.map(c => Math.abs(c.logRN)), 0.1)
  const sxT = (i) => P + (i / data.comparisons.length) * (W - 2 * P)
  const syT = (v) => H - P - ((v + maxLogRNTime) / (2 * maxLogRNTime)) * (H - 2 * P)

  // KL divergence over time
  const maxKL = Math.max(...data.comparisons.map(c => c.klSym), 0.001)
  const syKL = (v) => H - P - (v / maxKL) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Radon-Nikodym Derivative (Regime Detection) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(20, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(80, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* RN derivative density */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Radon-Nikodym Derivative dQ/dP(x): ratio of current to baseline density</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* RN = 1 line (equal measures) */}
          <line x1={P} y1={syRN(1)} x2={W - P} y2={syRN(1)} stroke="#475569" strokeWidth={1} strokeDasharray="3,3" />

          <path d={data.grid.map((g, i) => `${i === 0 ? 'M' : 'L'} ${sxG(g.x)} ${syRN(g.rn)}`).join(' ')} fill="rgba(168,85,247,0.15)" stroke="#a855f7" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>dQ/dP(x) (RN derivative)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#475569" fontSize={9}>RN=1 (equal measures)</text>
        </svg>
      </div>

      {/* Log-RN over time */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Log Radon-Nikodym Derivative Over Time (measure change trajectory)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.comparisons.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxT(i)} ${syT(c.logRN)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {/* Significant points */}
          {data.comparisons.map((c, i) => c.significant ? (
            <circle key={i} cx={sxT(i)} cy={syT(c.logRN)} r={4} fill="#ef4444" />
          ) : null)}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>log(dQ/dP) cumulative</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>significant (p&lt;0.05)</text>
        </svg>
      </div>

      {/* KL divergence over time */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Symmetric KL Divergence (Jensen-Shannon-like) Over Time</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.comparisons.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxT(i)} ${syKL(c.klSym)}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#22c55e" fontSize={9}>KL_sym = (KL(P||Q) + KL(Q||P)) / 2</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">log(dQ/dP)</div>
          <div className="text-cyan-400 font-mono">{data.current.logRN.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">LR stat</div>
          <div className="text-amber-400 font-mono">{data.current.lrStat.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">p-value</div>
          <div className="text-red-400 font-mono">{data.current.pValue.toExponential(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">KL(P||Q)</div>
          <div className="text-emerald-400 font-mono">{data.klPQ.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">KL(Q||P)</div>
          <div className="text-purple-400 font-mono">{data.klQP.toFixed(6)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> RN:</strong> dQ/dP = exp(sum log(f_Q(x)/f_P(x))) (likelihood ratio) |
        <strong> KL:</strong> D_KL(P||Q) = E_P[log(dP/dQ)] (information gain) |
        <strong> Test:</strong> -2*log(L) ~ chi^2(k) under H0 (Neyman-Pearson) |
        <strong> Baseline:</strong> mu_P={data.muP.toFixed(6)}, sigma_P={data.sigP.toFixed(6)}
      </div>
    </div>
  )
}
