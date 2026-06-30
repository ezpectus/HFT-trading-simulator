import React, { useMemo, useState } from 'react'

// --- Prokhorov Metric (Weak Convergence of Measures) ---
// Computes the Prokhorov metric between empirical distributions to
// detect regime shifts via weak convergence analysis.
//
// Mathematical foundation:
//   Prokhorov metric: d_P(mu, nu) = inf{eps > 0 : mu(A) <= nu(A^eps) + eps for all Borel A}
//   where A^eps = {x : dist(x, A) < eps}
//
//   Properties:
//   - d_P(mu, nu) = 0 iff mu = nu
//   - Metrizes weak convergence: mu_n -> mu iff d_P(mu_n, mu) -> 0
//   - Triangle inequality
//   - Bounded by total variation: d_P <= TV(mu, nu)
//
//   For empirical measures: sort and compare CDFs
//   d_P(F, G) = inf{eps : F(x) <= G(x+eps) + eps and G(x) <= F(x+eps) + eps}
//
//   Applications: distribution shift detection, regime change testing,
//   convergence monitoring for Monte Carlo, multi-timeframe comparison

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Empirical CDF
const empiricalCDF = (sortedData, x) => {
  let count = 0
  for (let i = 0; i < sortedData.length; i++) {
    if (sortedData[i] <= x) count++
    else break
  }
  return count / sortedData.length
}

// Prokhorov distance between two empirical distributions
const prokhorovDistance = (data1, data2) => {
  const s1 = [...data1].sort((a, b) => a - b)
  const s2 = [...data2].sort((a, b) => a - b)
  const allVals = [...new Set([...s1, ...s2])].sort((a, b) => a - b)

  // Grid of epsilon values to search
  const range = allVals[allVals.length - 1] - allVals[0]
  const epsGrid = []
  for (let i = 0; i <= 100; i++) {
    epsGrid.push((i / 100) * range + 0.0001)
  }

  let bestEps = range
  for (const eps of epsGrid) {
    let valid = true
    // Check F(x) <= G(x+eps) + eps for all x
    for (const x of allVals) {
      const f = empiricalCDF(s1, x)
      const g = empiricalCDF(s2, x + eps)
      if (f > g + eps + 1e-10) { valid = false; break }
    }
    if (valid) {
      // Also check G(x) <= F(x+eps) + eps
      for (const x of allVals) {
        const g = empiricalCDF(s2, x)
        const f = empiricalCDF(s1, x + eps)
        if (g > f + eps + 1e-10) { valid = false; break }
      }
    }
    if (valid) { bestEps = eps; break }
  }

  return bestEps
}

// Levy-Prokhorov metric (symmetric)
const levyProkhorov = (data1, data2) => {
  return prokhorovDistance(data1, data2)
}

// Wasserstein-1 distance (for comparison)
const wasserstein1 = (data1, data2) => {
  const s1 = [...data1].sort((a, b) => a - b)
  const s2 = [...data2].sort((a, b) => a - b)
  const n = Math.min(s1.length, s2.length)
  let sum = 0
  for (let i = 0; i < n; i++) {
    sum += Math.abs(s1[Math.floor(i * s1.length / n)] - s2[Math.floor(i * s2.length / n)])
  }
  return sum / n
}

// Kolmogorov-Smirnov statistic
const ksStatistic = (data1, data2) => {
  const s1 = [...data1].sort((a, b) => a - b)
  const s2 = [...data2].sort((a, b) => a - b)
  const allVals = [...new Set([...s1, ...s2])].sort((a, b) => a - b)
  let maxDiff = 0
  for (const x of allVals) {
    const d = Math.abs(empiricalCDF(s1, x) - empiricalCDF(s2, x))
    if (d > maxDiff) maxDiff = d
  }
  return maxDiff
}

export default function ProkhorovMetric({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(200)
  const [windowSize, setWindowSize] = useState(50)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    const n = returns.length
    if (n < windowSize * 3) return null

    // Sliding window comparison: consecutive windows
    const comparisons = []
    for (let i = 0; i + 2 * windowSize <= n; i += Math.max(5, Math.floor(windowSize / 4))) {
      const w1 = returns.slice(i, i + windowSize)
      const w2 = returns.slice(i + windowSize, i + 2 * windowSize)
      const dp = prokhorovDistance(w1, w2)
      const w1dist = wasserstein1(w1, w2)
      const ks = ksStatistic(w1, w2)
      comparisons.push({ idx: i, prokhorov: dp, wasserstein: w1dist, ks })
    }

    // Current vs baseline (first window)
    const baseline = returns.slice(0, windowSize)
    const current = returns.slice(n - windowSize)
    const currentDP = prokhorovDistance(baseline, current)
    const currentW1 = wasserstein1(baseline, current)
    const currentKS = ksStatistic(baseline, current)

    // CDFs for visualization
    const sBaseline = [...baseline].sort((a, b) => a - b)
    const sCurrent = [...current].sort((a, b) => a - b)
    const allVals = [...new Set([...sBaseline, ...sCurrent])].sort((a, b) => a - b)
    const cdfBaseline = allVals.map(x => ({ x, cdf: empiricalCDF(sBaseline, x) }))
    const cdfCurrent = allVals.map(x => ({ x, cdf: empiricalCDF(sCurrent, x) }))

    // Prokhorov tube: F(x) +- eps
    const eps = currentDP
    const tubeUpper = allVals.map(x => ({ x, cdf: Math.min(1, empiricalCDF(sBaseline, x) + eps) }))
    const tubeLower = allVals.map(x => ({ x, cdf: Math.max(0, empiricalCDF(sBaseline, x) - eps) }))

    // Signal
    let signal = 'DISTRIBUTION_STABLE'
    let reason = ''
    if (currentDP > 0.02) {
      signal = 'DISTRIBUTION_SHIFT'
      reason = `Prokhorov distance = ${currentDP.toFixed(6)} (significant distribution shift detected)`
    } else if (currentDP > 0.01) {
      signal = 'DISTRIBUTION_DRIFT'
      reason = `Prokhorov distance = ${currentDP.toFixed(6)} (moderate distribution drift)`
    } else {
      reason = `Prokhorov distance = ${currentDP.toFixed(6)} (distributions similar, no shift)`
    }

    // Trend in Prokhorov distance
    const recentDPs = comparisons.slice(-5).map(c => c.prokhorov)
    const avgRecent = recentDPs.reduce((a, b) => a + b, 0) / recentDPs.length
    const isIncreasing = avgRecent > comparisons[0].prokhorov * 1.5

    return {
      comparisons, currentDP, currentW1, currentKS,
      cdfBaseline, cdfCurrent, tubeUpper, tubeLower, eps,
      signal, reason, isIncreasing, allVals,
    }
  }, [candles, exchange, symbol, lookback, windowSize])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'DISTRIBUTION_SHIFT' ? '#ef4444' : data.signal === 'DISTRIBUTION_DRIFT' ? '#f59e0b' : '#22c55e'

  // CDF plot
  const xMin = data.allVals[0]
  const xMax = data.allVals[data.allVals.length - 1]
  const sxCDF = (x) => P + ((x - xMin) / (xMax - xMin + 0.001)) * (W - 2 * P)
  const syCDF = (v) => H - P - v * (H - 2 * P)

  // Prokhorov distance over time
  const maxDP = Math.max(...data.comparisons.map(c => c.prokhorov), 0.001)
  const maxW1 = Math.max(...data.comparisons.map(c => c.wasserstein), 0.001)
  const maxKS = Math.max(...data.comparisons.map(c => c.ks), 0.001)
  const sxT = (i) => P + (i / data.comparisons.length) * (W - 2 * P)
  const syDP = (v) => H - P - (v / maxDP) * (H - 2 * P)
  const syW1 = (v) => H - P - (v / maxW1) * (H - 2 * P)
  const syKS = (v) => H - P - (v / maxKS) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Prokhorov Metric (Weak Convergence) — {symbol}</span>
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

      {/* CDF comparison with Prokhorov tube */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Empirical CDFs: Baseline vs Current with Prokhorov tube (eps={data.eps.toFixed(6)})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Prokhorov tube */}
          <path d={data.tubeUpper.map((t, i) => `${i === 0 ? 'M' : 'L'} ${sxCDF(t.x)} ${syCDF(t.cdf)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
          <path d={data.tubeLower.map((t, i) => `${i === 0 ? 'M' : 'L'} ${sxCDF(t.x)} ${syCDF(t.cdf)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />

          {/* Baseline CDF */}
          <path d={data.cdfBaseline.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxCDF(c.x)} ${syCDF(c.cdf)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />

          {/* Current CDF */}
          <path d={data.cdfCurrent.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxCDF(c.x)} ${syCDF(c.cdf)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={2} />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>baseline CDF</text>
          <text x={W - P} y={34} textAnchor="end" fill="#ef4444" fontSize={9}>current CDF</text>
          <text x={W - P} y={48} textAnchor="end" fill="#f59e0b" fontSize={9}>Prokhorov tube (+/-eps)</text>
        </svg>
      </div>

      {/* Distance metrics over time */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Distribution Distance Metrics Over Time: Prokhorov, Wasserstein-1, KS</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          <path d={data.comparisons.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxT(i)} ${syDP(c.prokhorov)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={2} />
          <path d={data.comparisons.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxT(i)} ${syW1(c.wasserstein)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={1.5} opacity={0.7} />
          <path d={data.comparisons.map((c, i) => `${i === 0 ? 'M' : 'L'} ${sxT(i)} ${syKS(c.ks)}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth={1.5} opacity={0.7} />

          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>Prokhorov d_P</text>
          <text x={W - P} y={34} textAnchor="end" fill="#06b6d4" fontSize={9}>Wasserstein W_1</text>
          <text x={W - P} y={48} textAnchor="end" fill="#22c55e" fontSize={9}>Kolmogorov-Smirnov</text>
        </svg>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Prokhorov d_P</div>
          <div className="text-purple-400 font-mono">{data.currentDP.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Wasserstein W_1</div>
          <div className="text-cyan-400 font-mono">{data.currentW1.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">KS statistic</div>
          <div className="text-emerald-400 font-mono">{data.currentKS.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Trend</div>
          <div className="font-mono" style={{ color: data.isIncreasing ? '#ef4444' : '#22c55e' }}>{data.isIncreasing ? 'increasing' : 'stable'}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Prokhorov:</strong> d_P(mu,nu) = inf{'{eps : mu(A) <= nu(A^eps)+eps}'} |
        <strong> Weak conv:</strong> mu_n -{'>'} mu iff d_P -{'>'} 0 |
        <strong> Tube:</strong> F(x)-eps {'<='} G(x) {'<='} F(x)+eps (Prokhorov neighborhood) |
        <strong> Comparison:</strong> d_P {'<='} W_1, d_P {'<='} TV
      </div>
    </div>
  )
}
