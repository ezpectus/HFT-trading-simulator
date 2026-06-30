import React, { useMemo, useState } from 'react'

// --- Cameron-Martin Formula (Gaussian Shift Theorem for Drift) ---
// Uses the Cameron-Martin theorem to quantify how a deterministic shift
// in the drift of a Gaussian process changes the probability measure,
// enabling drift-aware signal detection.
//
// Mathematical foundation:
//   Cameron-Martin: For a Gaussian measure mu on a Hilbert space H,
//   the shifted measure mu_h(A) = mu(A - h) is absolutely continuous
//   w.r.t. mu iff h is in the Cameron-Martin space H_mu.
//
//   Radon-Nikodym derivative:
//   d(mu_h)/d(mu) = exp(<h, x>_mu - 1/2 ||h||^2_mu)
//
//   For Brownian motion: dP^(h)/dP = exp(integral h dW - 1/2 integral h^2 dt)
//   (This is the Cameron-Martin-Girsanov formula for deterministic shifts)
//
//   Applications: drift detection, signal extraction from noise,
//   optimal shift estimation, likelihood ratio for mean change

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

export default function CameronMartinFormula({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(150)
  const [windowSize, setWindowSize] = useState(30)
  const [shiftMode, setShiftMode] = useState('constant')

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    const n = returns.length
    if (n < windowSize * 3) return null

    // Estimate baseline Gaussian parameters
    const mu0 = returns.reduce((a, b) => a + b, 0) / n
    const sig0 = Math.sqrt(returns.reduce((s, r) => s + (r - mu0) ** 2, 0) / n)

    // Define shift function h(t)
    let hFunc
    if (shiftMode === 'constant') {
      hFunc = (t) => mu0 * 2 // constant drift shift
    } else if (shiftMode === 'linear') {
      hFunc = (t) => mu0 * (1 + t / n) // linearly increasing
    } else if (shiftMode === 'sinusoidal') {
      hFunc = (t) => mu0 * 2 * Math.sin(2 * Math.PI * t / 20) // periodic
    } else {
      hFunc = (t) => mu0 * (1 + Math.sin(t / 10) * 0.5) // mixed
    }

    // Cameron-Martin log-likelihood ratio for each window
    const comparisons = []
    for (let i = 0; i + windowSize <= n; i += Math.max(3, Math.floor(windowSize / 5))) {
      const window = returns.slice(i, i + windowSize)
      const muW = window.reduce((a, b) => a + b, 0) / window.length
      const sigW = Math.sqrt(window.reduce((s, r) => s + (r - muW) ** 2, 0) / window.length)

      // Cameron-Martin inner product: <h, x> = sum h_t * x_t / sigma^2
      // ||h||^2 = sum h_t^2 / sigma^2
      let innerProd = 0, hNormSq = 0
      for (let t = 0; t < windowSize; t++) {
        const h_t = hFunc(i + t)
        const x_t = window[t]
        innerProd += h_t * x_t / (sig0 * sig0)
        hNormSq += h_t * h_t / (sig0 * sig0)
      }

      // Log RN derivative: <h, x> - 1/2 ||h||^2
      const logRN = innerProd - 0.5 * hNormSq
      const rnDerivative = Math.exp(logRN)

      // Optimal shift: h* = argmax E[log dP_h/dP] = actual drift
      const optimalShift = muW
      const shiftEfficiency = muW / (hFunc(i + windowSize / 2) + 1e-10)

      comparisons.push({
        idx: i,
        logRN, rnDerivative,
        innerProd, hNormSq,
        muW, sigW, optimalShift, shiftEfficiency,
      })
    }

    // Cameron-Martin density on grid (for visualization)
    const grid = []
    for (let i = 0; i <= 80; i++) {
      const x = -5 + i * 10 / 80 // standardized x
      const h = hFunc(n / 2) // representative shift
      const logRN = h * x / sig0 - 0.5 * h * h / (sig0 * sig0)
      grid.push({ x, rn: Math.exp(logRN), logRN })
    }

    // Cumulative Cameron-Martin trajectory
    let cumLogRN = 0
    const cumTrajectory = []
    for (let i = 0; i < n; i++) {
      const h_t = hFunc(i)
      cumLogRN += h_t * returns[i] / (sig0 * sig0) - 0.5 * h_t * h_t / (sig0 * sig0)
      cumTrajectory.push({ idx: i, cumLogRN })
    }

    // Current state
    const current = comparisons[comparisons.length - 1]
    let signal = 'NO_DRIFT_SHIFT'
    let reason = ''
    if (current.logRN > 2) {
      signal = 'STRONG_DRIFT_ALIGNMENT'
      reason = `Cameron-Martin LR=${current.logRN.toFixed(4)} (shift h aligns with observed drift)`
    } else if (current.logRN > 0.5) {
      signal = 'DRIFT_PRESENT'
      reason = `Cameron-Martin LR=${current.logRN.toFixed(4)} (moderate drift alignment)`
    } else if (current.logRN < -2) {
      signal = 'ANTI_DRIFT'
      reason = `Cameron-Martin LR=${current.logRN.toFixed(4)} (shift opposes observed data)`
    } else {
      reason = `Cameron-Martin LR=${current.logRN.toFixed(4)} (no significant drift shift)`
    }

    return {
      comparisons, grid, cumTrajectory,
      current, signal, reason,
      mu0, sig0, n,
    }
  }, [candles, exchange, symbol, lookback, windowSize, shiftMode])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'STRONG_DRIFT_ALIGNMENT' ? '#22c55e' : data.signal === 'ANTI_DRIFT' ? '#ef4444' : data.signal === 'DRIFT_PRESENT' ? '#f59e0b' : '#94a3b8'

  // RN density
  const maxRN = Math.max(...data.grid.map(g => g.rn), 0.1)
  const sxG = (i) => P + (i / data.grid.length) * (W - 2 * P)
  const syRN = (v) => H - P - (v / maxRN) * (H - 2 * P)

  // Log-RN over time
  const maxAbsLog = Math.max(...data.comparisons.map(c => Math.abs(c.logRN)), 0.1)
  const sxT = (i) => P + (i / data.comparisons.length) * (W - 2 * P)
  const syLR = (v) => H - P - ((v + maxAbsLog) / (2 * maxAbsLog)) * (H - 2 * P)

  // Cumulative
  const maxCum = Math.max(...data.cumTrajectory.map(c => Math.abs(c.cumLogRN)), 0.1)
  const sxC = (i) => P + (i / data.cumTrajectory.length) * (W - 2 * P)
  const syC = (v) => H - P - ((v + maxCum) / (2 * maxCum)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Cameron-Martin Formula (Gaussian Shift) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Shift mode:</span>
          <select value={shiftMode} onChange={e => setShiftMode(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="constant">Constant h(t)=c</option>
            <option value="linear">Linear h(t)=a+bt</option>
            <option value="sinusoidal">Sinusoidal h(t)=A*sin</option>
            <option value="mixed">Mixed h(t)=a+b*sin</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(15, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(60, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* RN density */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Cameron-Martin RN Derivative: d(mu_h)/d(mu) = exp(h*x/sigma^2 - h^2/(2*sigma^2))</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <line x1={P} y1={syRN(1)} x2={W - P} y2={syRN(1)} stroke="#475569" strokeWidth={1} strokeDasharray="3,3" />

          <path d={data.grid.map((g, i) => `${i === 0 ? 'M' : 'L'} ${sxG(i)} ${syRN(g.rn)}`).join(' ')} fill="rgba(168,85,247,0.15)" stroke="#a855f7" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>d(mu_h)/d(mu) (RN derivative)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#475569" fontSize={9}>RN=1 (no shift effect)</text>
        </svg>
      </div>

      {/* Log-RN over time */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Cameron-Martin Log-Likelihood Ratio Over Time (drift alignment measure)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.comparisons.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxT(i)} ${syLR(c.logRN)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {data.comparisons.map((c, i) => (
            c.logRN > 1 ? <circle key={i} cx={sxT(i)} cy={syLR(c.logRN)} r={3} fill="#22c55e" /> : null
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>log d(mu_h)/d(mu)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#22c55e" fontSize={9}>strong alignment (LR{'>'}1)</text>
        </svg>
      </div>

      {/* Cumulative */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Cumulative Cameron-Martin Log-Likelihood (shift detection trajectory)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.cumTrajectory.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxC(i)} ${syC(c.cumLogRN)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>cumulative log-RN (Cameron-Martin)</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">log-RN</div>
          <div className="text-cyan-400 font-mono">{data.current.logRN.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">{'<h,x>'}</div>
          <div className="text-emerald-400 font-mono">{data.current.innerProd.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">{'||h||^2'}</div>
          <div className="text-amber-400 font-mono">{data.current.hNormSq.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">mu_window</div>
          <div className="text-purple-400 font-mono">{data.current.muW.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">sigma_0</div>
          <div className="text-slate-300 font-mono">{data.sig0.toFixed(6)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Cameron-Martin:</strong> d(mu_h)/d(mu) = exp({'<h,x>'} - 1/2||h||^2) |
        <strong> Inner product:</strong> {'<h,x>'} = sum h_t*x_t / sigma^2 |
        <strong> Norm:</strong> ||h||^2 = sum h_t^2 / sigma^2 (Cameron-Martin space) |
        <strong> Shift:</strong> h in H_mu implies mu_h {'<<'} mu (absolutely continuous)
      </div>
    </div>
  )
}
