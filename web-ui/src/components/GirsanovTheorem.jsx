import React, { useMemo, useState } from 'react'

// --- Girsanov Theorem (Measure Change for Drift Estimation) ---
// Applies the Girsanov theorem to change the drift of an Ito process
// via an equivalent measure change, enabling likelihood-based regime
// detection and drift estimation.
//
// Mathematical foundation:
//   Under P: dX_t = mu_t dt + sigma dW_t
//   Under Q (Girsanov): dX_t = nu_t dt + sigma dW^Q_t
//   where W^Q_t = W_t - integral_0^t (mu_s - nu_s)/sigma ds
//
//   Radon-Nikodym derivative:
//   dQ/dP = exp(-integral_0^T theta_s dW_s - 1/2 integral_0^T theta_s^2 ds)
//   where theta_t = (mu_t - nu_t) / sigma
//
//   Likelihood ratio: L = dQ/dP = exp(-integral theta dW - 1/2 integral theta^2 dt)
//
//   Applications: drift change detection, regime classification,
//   likelihood ratio tests for market regime shifts

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

export default function GirsanovTheorem({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(120)
  const [windowSize, setWindowSize] = useState(30)
  const [sigma, setSigma] = useState(0.02)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    const n = returns.length
    if (n < windowSize * 2) return null

    // Estimate sigma from data
    const meanR = returns.reduce((a, b) => a + b, 0) / n
    const varR = returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / n
    const sigmaEst = Math.sqrt(varR)
    const sig = sigma || sigmaEst

    // Sliding window drift estimation
    const drifts = []
    for (let i = 0; i + windowSize <= n; i++) {
      const window = returns.slice(i, i + windowSize)
      const mu = window.reduce((a, b) => a + b, 0) / windowSize
      drifts.push({ idx: i, mu, muAnnual: mu * 252 })
    }

    // Girsanov likelihood ratio test: compare consecutive windows
    // H0: mu_1 = mu_2 (no drift change)
    // H1: mu_1 != mu_2 (drift change)
    // Log-likelihood ratio: LLR = sum log(dQ/dP)
    // Under H0: LLR ~ chi^2(1)
    const llrTests = []
    for (let i = 1; i < drifts.length; i++) {
      const mu1 = drifts[i - 1].mu
      const mu2 = drifts[i].mu
      // Girsanov theta = (mu1 - mu2) / sig
      const theta = (mu1 - mu2) / sig
      // Log likelihood ratio (simplified)
      const llr = 0.5 * theta * theta * windowSize
      // p-value approximation (chi^2 with 1 df)
      const pValue = Math.exp(-llr / 2)
      llrTests.push({
        idx: drifts[i].idx,
        llr,
        pValue,
        theta,
        driftChange: mu2 - mu1,
        significant: pValue < 0.05,
      })
    }

    // Cumulative log-likelihood ratio (measure change trajectory)
    let cumLLR = 0
    const cumTrajectory = []
    for (let i = 0; i < returns.length; i++) {
      const theta = (returns[i] - meanR) / sig
      cumLLR += -theta * returns[i] / sig - 0.5 * theta * theta * sig * sig
      cumTrajectory.push({ idx: i, cumLLR })
    }

    // Current regime
    const currentDrift = drifts[drifts.length - 1].mu
    const prevDrift = drifts[drifts.length - 2]?.mu || currentDrift
    const driftChange = currentDrift - prevDrift
    const currentLLR = llrTests[llrTests.length - 1]?.llr || 0
    const currentPValue = llrTests[llrTests.length - 1]?.pValue || 1

    // Signal
    let signal = 'STABLE_DRIFT'
    let reason = ''
    if (currentPValue < 0.01) {
      signal = 'DRIFT_CHANGE_STRONG'
      reason = `Strong drift change detected (LLR=${currentLLR.toFixed(4)}, p=${currentPValue.toExponential(2)}), delta_mu=${driftChange.toFixed(6)}`
    } else if (currentPValue < 0.05) {
      signal = 'DRIFT_CHANGE'
      reason = `Drift change detected (LLR=${currentLLR.toFixed(4)}, p=${currentPValue.toFixed(4)}), delta_mu=${driftChange.toFixed(6)}`
    } else {
      reason = `No significant drift change (LLR=${currentLLR.toFixed(4)}, p=${currentPValue.toFixed(4)})`
    }

    // Regime classification
    const regime = currentDrift > 0.001 ? 'BULLISH' : currentDrift < -0.001 ? 'BEARISH' : 'NEUTRAL'

    return {
      drifts, llrTests, cumTrajectory,
      currentDrift, driftChange, currentLLR, currentPValue,
      signal, reason, regime, meanR, sigmaEst: sig,
      n, returns,
    }
  }, [candles, exchange, symbol, lookback, windowSize, sigma])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'DRIFT_CHANGE_STRONG' ? '#ef4444' : data.signal === 'DRIFT_CHANGE' ? '#f59e0b' : '#22c55e'
  const regimeColor = data.regime === 'BULLISH' ? '#22c55e' : data.regime === 'BEARISH' ? '#ef4444' : '#94a3b8'

  // Drift trajectory
  const allMu = data.drifts.map(d => d.mu)
  const maxMu = Math.max(...allMu.map(Math.abs), 0.001)
  const sxMu = (i) => P + (i / data.drifts.length) * (W - 2 * P)
  const syMu = (v) => H - P - ((v + maxMu) / (2 * maxMu)) * (H - 2 * P)

  // LLR tests
  const maxLLR = Math.max(...data.llrTests.map(t => t.llr), 0.1)
  const sxLLR = (i) => P + (i / data.llrTests.length) * (W - 2 * P)
  const syLLR = (v) => H - P - (v / maxLLR) * (H - 2 * P)

  // Cumulative LLR
  const maxCum = Math.max(...data.cumTrajectory.map(c => Math.abs(c.cumLLR)), 0.1)
  const sxCum = (i) => P + (i / data.cumTrajectory.length) * (W - 2 * P)
  const syCum = (v) => H - P - ((v + maxCum) / (2 * maxCum)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Girsanov Theorem (Measure Change) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: regimeColor + '22', color: regimeColor }}>
          {data.regime}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Window:</span>
          <input type="number" value={windowSize} onChange={e => setWindowSize(Math.max(10, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Sigma:</span>
          <input type="number" step="0.005" value={sigma} onChange={e => setSigma(Math.max(0.001, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Lookback:</span>
          <input type="number" value={lookback} onChange={e => setLookback(Math.max(60, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Drift trajectory */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Sliding Window Drift mu(t) (annualized x252)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.drifts.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sxMu(i)} ${syMu(d.mu)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {data.drifts.map((d, i) => (
            <circle key={i} cx={sxMu(i)} cy={syMu(d.mu)} r={2} fill={d.mu > 0 ? '#22c55e' : '#ef4444'} opacity={0.6} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>mu(t) drift estimate</text>
        </svg>
      </div>

      {/* LLR tests */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Girsanov Log-Likelihood Ratio Test (red = significant drift change, p&lt;0.05)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Significance threshold line (chi^2 1df, p=0.05 -> LLR=3.84) */}
          <line x1={P} y1={syLLR(3.84)} x2={W - P} y2={syLLR(3.84)} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4,3" />
          <text x={P + 5} y={syLLR(3.84) - 4} fill="#f59e0b" fontSize={9}>p=0.05 (LLR=3.84)</text>

          {data.llrTests.map((t, i) => (
            <line key={i} x1={sxLLR(i)} y1={H - P} x2={sxLLR(i)} y2={syLLR(t.llr)} stroke={t.significant ? '#ef4444' : '#06b6d4'} strokeWidth={t.significant ? 3 : 1.5} opacity={t.significant ? 1 : 0.5} />
          ))}

          <text x={W - P} y={20} textAnchor="end" fill="#ef4444" fontSize={9}>significant (p&lt;0.05)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#06b6d4" fontSize={9}>not significant</text>
        </svg>
      </div>

      {/* Cumulative LLR */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Cumulative Log-Likelihood Ratio (measure change trajectory dQ/dP)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.cumTrajectory.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxCum(i)} ${syCum(c.cumLLR)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>cum LLR (measure change)</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Current mu</div>
          <div className="text-cyan-400 font-mono">{data.currentDrift.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Delta mu</div>
          <div className="text-amber-400 font-mono">{data.driftChange.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">LLR</div>
          <div className="text-purple-400 font-mono">{data.currentLLR.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">p-value</div>
          <div className="text-red-400 font-mono">{data.currentPValue.toExponential(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Regime</div>
          <div className="font-mono" style={{ color: regimeColor }}>{data.regime}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Girsanov:</strong> dQ/dP = exp(-int theta dW - 1/2 int theta^2 dt) |
        <strong> Theta:</strong> theta = (mu_P - mu_Q) / sigma (market price of risk) |
        <strong> Test:</strong> LLR ~ chi^2(1) under H0 (no drift change) |
        <strong> Regime:</strong> {data.regime} (mu={'>'}0 bullish, mu{'<'}0 bearish)
      </div>
    </div>
  )
}
