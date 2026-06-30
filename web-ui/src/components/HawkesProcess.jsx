import React, { useMemo, useState } from 'react'

// ─── Hawkes Process (Self-Exciting Point Process) ───────────────────────────
// Models trade clustering and self-excitation in order flow.
// A Hawkes process has intensity λ(t) that increases after each event,
// capturing the empirical fact that trades cluster in bursts.
//
// Mathematical foundation:
//   Intensity: λ(t) = μ + Σ_{t_i < t} α·e^(-β(t - t_i))
//   where:
//   - μ: baseline intensity (exogenous arrivals)
//   - α: excitation magnitude (each event increases intensity by α)
//   - β: decay rate (exponential decay of excitation)
//
//   Branching ratio: n = α/β (n < 1 for stationary)
//   Expected number of descendants per event: n/(1-n)
//
//   Log-likelihood:
//   L(θ) = Σ log λ(t_i) - ∫₀ᵀ λ(t) dt
//   = Σ log(μ + Σ_{j<i} α·e^(-β(t_i-t_j))) - μT - (α/β)·Σ(1 - e^(-β(T-t_i)))
//
//   MLE via L-BFGS or grid search

const hawkesLogLik = (events, mu, alpha, beta, T) => {
  if (alpha >= beta) return -Infinity // Stationarity condition
  if (mu <= 0 || alpha < 0 || beta <= 0) return -Infinity

  const n = events.length
  let logLik = 0

  // Recursive computation: R(i) = Σ_{j<i} exp(-β(t_i - t_j))
  // R(i) = exp(-β(t_i - t_{i-1})) * (1 + R(i-1))
  let R = 0
  let prevT = 0
  for (let i = 0; i < n; i++) {
    const dt = i > 0 ? events[i] - events[i - 1] : 0
    R = Math.exp(-beta * dt) * (1 + R)
    const lambda = mu + alpha * R
    logLik += Math.log(Math.max(1e-10, lambda))
  }

  // Integral term: ∫₀ᵀ λ(t) dt = μT + (α/β)·Σ(1 - e^(-β(T-t_i)))
  let integralComp = mu * T
  for (let i = 0; i < n; i++) {
    integralComp += (alpha / beta) * (1 - Math.exp(-beta * (T - events[i])))
  }

  return logLik - integralComp
}

// Grid search MLE
const fitHawkes = (events, T) => {
  let bestParams = { mu: 0.1, alpha: 0.5, beta: 1.0 }
  let bestLogLik = -Infinity

  const muRange = [0.01, 0.05, 0.1, 0.2, 0.5, 1.0]
  const alphaRange = [0.1, 0.3, 0.5, 0.7, 0.9, 1.2, 1.5]
  const betaRange = [0.5, 1.0, 2.0, 3.0, 5.0, 8.0, 10.0]

  for (const mu of muRange) {
    for (const alpha of alphaRange) {
      for (const beta of betaRange) {
        if (alpha >= beta) continue // Stationarity
        const ll = hawkesLogLik(events, mu, alpha, beta, T)
        if (ll > bestLogLik) {
          bestLogLik = ll
          bestParams = { mu, alpha, beta }
        }
      }
    }
  }

  // Fine-tune around best
  const { mu: bm, alpha: ba, beta: bb } = bestParams
  for (let dm = -0.02; dm <= 0.02; dm += 0.01) {
    for (let da = -0.1; da <= 0.1; da += 0.05) {
      for (let db = -0.5; db <= 0.5; db += 0.25) {
        const mu = Math.max(0.001, bm + dm)
        const alpha = Math.max(0.01, ba + da)
        const beta = Math.max(0.1, bb + db)
        if (alpha >= beta) continue
        const ll = hawkesLogLik(events, mu, alpha, beta, T)
        if (ll > bestLogLik) {
          bestLogLik = ll
          bestParams = { mu, alpha, beta }
        }
      }
    }
  }

  return { ...bestParams, logLik: bestLogLik, branchingRatio: bestParams.alpha / bestParams.beta }
}

// Compute intensity at time t
const hawkesIntensity = (t, events, mu, alpha, beta) => {
  let intensity = mu
  for (const ti of events) {
    if (ti >= t) break
    intensity += alpha * Math.exp(-beta * (t - ti))
  }
  return intensity
}

// Simulate Hawkes process (Ogata's thinning algorithm)
const simulateHawkes = (mu, alpha, beta, T, maxEvents = 500) => {
  const events = []
  let t = 0
  let intensity = mu

  while (t < T && events.length < maxEvents) {
    // Generate next candidate time
    const u = Math.random()
    const dt = -Math.log(u) / intensity
    t += dt

    if (t >= T) break

    // Compute intensity at new time
    const newIntensity = hawkesIntensity(t, events, mu, alpha, beta)

    // Accept with probability newIntensity / intensity
    if (Math.random() < newIntensity / intensity) {
      events.push(t)
      intensity = newIntensity + alpha // Jump
    } else {
      intensity = newIntensity
    }
  }

  return events
}

export default function HawkesProcess({ candles, symbol, exchange }) {
  const [mu, setMu] = useState(0.1)
  const [alpha, setAlpha] = useState(0.5)
  const [beta, setBeta] = useState(2.0)
  const [autoFit, setAutoFit] = useState(true)
  const [simT, setSimT] = useState(100)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 30) return null
    const cds = candles[exchange][symbol]

    // Extract "events" from candles: significant price moves
    const events = []
    for (let i = 1; i < cds.length; i++) {
      const ret = Math.abs((cds[i].close - cds[i - 1].close) / cds[i - 1].close)
      if (ret > 0.003) { // threshold for "significant" move
        events.push(i)
      }
    }

    if (events.length < 5) return null

    const T = cds.length

    // Fit or use manual params
    let params
    if (autoFit) {
      params = fitHawkes(events, T)
    } else {
      params = { mu, alpha, beta, logLik: hawkesLogLik(events, mu, alpha, beta, T), branchingRatio: alpha / beta }
    }

    // Compute intensity over time
    const intensityPath = []
    const stepSize = Math.max(1, Math.floor(T / 200))
    for (let t = 0; t < T; t += stepSize) {
      intensityPath.push({ t, intensity: hawkesIntensity(t, events, params.mu, params.alpha, params.beta) })
    }

    // Simulated path
    const simulated = simulateHawkes(params.mu, params.alpha, params.beta, simT, 300)

    // Compute inter-arrival times
    const interArrivals = []
    for (let i = 1; i < events.length; i++) {
      interArrivals.push(events[i] - events[i - 1])
    }
    const meanIA = interArrivals.length > 0 ? interArrivals.reduce((a, b) => a + b, 0) / interArrivals.length : 0

    // Simulated inter-arrivals
    const simIA = []
    for (let i = 1; i < simulated.length; i++) {
      simIA.push(simulated[i] - simulated[i - 1])
    }
    const meanSimIA = simIA.length > 0 ? simIA.reduce((a, b) => a + b, 0) / simIA.length : 0

    // Clustering metric: ratio of max burst to average
    let maxBurst = 0, currentBurst = 0
    for (let i = 1; i < events.length; i++) {
      if (events[i] - events[i - 1] < meanIA * 0.5) {
        currentBurst++
        maxBurst = Math.max(maxBurst, currentBurst)
      } else {
        currentBurst = 0
      }
    }

    // Signal: high branching ratio → self-exciting → trend continuation
    const n = params.branchingRatio
    let signal = 'NEUTRAL'
    let reason = ''
    if (n > 0.7) {
      signal = 'TREND'
      reason = `High branching ratio (n=${n.toFixed(3)}): trades strongly self-excite, expect clustering`
    } else if (n > 0.4) {
      signal = 'MOMENTUM'
      reason = `Moderate branching (n=${n.toFixed(3)}): some trade clustering expected`
    } else {
      signal = 'MEAN_REVERT'
      reason = `Low branching (n=${n.toFixed(3)}): trades independent, mean-reverting`
    }

    // Current intensity vs baseline
    const currentIntensity = intensityPath[intensityPath.length - 1]?.intensity || 0
    const intensityRatio = currentIntensity / params.mu

    return {
      events, T, params, intensityPath, simulated,
      interArrivals, meanIA, meanSimIA, maxBurst,
      signal, reason, currentIntensity, intensityRatio,
      nEvents: events.length, nSimulated: simulated.length,
    }
  }, [candles, exchange, symbol, mu, alpha, beta, autoFit, simT])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 30 candles with significant moves for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'TREND' ? '#22c55e' : data.signal === 'MOMENTUM' ? '#f59e0b' : '#06b6d4'

  // Intensity chart
  const maxIntensity = Math.max(...data.intensityPath.map(d => d.intensity))
  const sx = (t) => P + (t / data.T) * (W - 2 * P)
  const sy = (v) => H - P - (v / maxIntensity) * (H - 2 * P)

  // Simulated events chart
  const simMaxT = data.simulated.length > 0 ? Math.max(...data.simulated) : 1
  const ssx = (t) => P + (t / simMaxT) * (W - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Hawkes Process — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={autoFit} onChange={e => setAutoFit(e.target.checked)} />
          <span className="text-slate-400">Auto-fit (MLE)</span>
        </label>
        {!autoFit && (
          <>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">μ (baseline):</span>
              <input type="number" step="0.01" value={mu} onChange={e => setMu(Math.max(0.001, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">α (excitation):</span>
              <input type="number" step="0.05" value={alpha} onChange={e => setAlpha(Math.max(0.01, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">β (decay):</span>
              <input type="number" step="0.1" value={beta} onChange={e => setBeta(Math.max(0.1, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
            </label>
          </>
        )}
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Sim T:</span>
          <input type="number" value={simT} onChange={e => setSimT(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Intensity over time */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Conditional Intensity λ(t) = μ + Σ α·e^(-β(t-t_i))</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Baseline */}
          <line x1={P} y1={sy(data.params.mu)} x2={W - P} y2={sy(data.params.mu)} stroke="#64748b" strokeDasharray="4,3" />
          <text x={W - P} y={sy(data.params.mu) - 5} textAnchor="end" fill="#64748b" fontSize={9}>μ={data.params.mu.toFixed(3)}</text>

          {/* Intensity path */}
          <path
            d={data.intensityPath.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(d.t)} ${sy(d.intensity)}`).join(' ')}
            fill="none" stroke="#06b6d4" strokeWidth={2}
          />

          {/* Event markers */}
          {data.events.map((t, i) => (
            <line key={i} x1={sx(t)} y1={H - P} x2={sx(t)} y2={H - P - 5} stroke="#ef4444" strokeWidth={1} />
          ))}

          <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={10}>Time (candles)</text>
          <text x={5} y={P + 10} fill="#475569" fontSize={10}>λ(t)</text>
        </svg>
      </div>

      {/* Simulated events */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Simulated Hawkes Process ({data.nSimulated} events)</div>
        <svg width={W} height={80} className="bg-slate-900 rounded">
          <line x1={P} y1={60} x2={W - P} y2={60} stroke="#334155" />
          {data.simulated.map((t, i) => (
            <line key={i} x1={ssx(t)} y1={60} x2={ssx(t)} y2={50} stroke="#22c55e" strokeWidth={1.5} />
          ))}
          <text x={W - P} y={15} textAnchor="end" fill="#22c55e" fontSize={9}>Simulated events (green ticks)</text>
        </svg>
      </div>

      {/* Inter-arrival distribution */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Inter-Arrival Time Distribution</div>
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="text-xs text-slate-500 mb-1">Observed (mean={data.meanIA.toFixed(2)})</div>
            {(() => {
              const maxIA = Math.max(...data.interArrivals, 1)
              const bins = new Array(10).fill(0)
              for (const ia of data.interArrivals) {
                const b = Math.min(9, Math.floor((ia / maxIA) * 10))
                bins[b]++
              }
              const maxBin = Math.max(...bins, 1)
              return (
                <div className="flex items-end gap-1 h-16">
                  {bins.map((b, i) => (
                    <div key={i} className="flex-1 bg-cyan-500 rounded-t" style={{ height: `${(b / maxBin) * 100}%` }} />
                  ))}
                </div>
              )
            })()}
          </div>
          <div className="flex-1">
            <div className="text-xs text-slate-500 mb-1">Simulated (mean={data.meanSimIA.toFixed(2)})</div>
            {(() => {
              const simIAs = []
              for (let i = 1; i < data.simulated.length; i++) simIAs.push(data.simulated[i] - data.simulated[i - 1])
              if (simIAs.length === 0) return <div className="text-slate-500 text-xs">No data</div>
              const maxIA = Math.max(...simIAs, 1)
              const bins = new Array(10).fill(0)
              for (const ia of simIAs) {
                const b = Math.min(9, Math.floor((ia / maxIA) * 10))
                bins[b]++
              }
              const maxBin = Math.max(...bins, 1)
              return (
                <div className="flex items-end gap-1 h-16">
                  {bins.map((b, i) => (
                    <div key={i} className="flex-1 bg-emerald-500 rounded-t" style={{ height: `${(b / maxBin) * 100}%` }} />
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">μ (baseline)</div>
          <div className="text-cyan-400 font-mono">{data.params.mu.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">α (excitation)</div>
          <div className="text-amber-400 font-mono">{data.params.alpha.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">β (decay)</div>
          <div className="text-purple-400 font-mono">{data.params.beta.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">n = α/β</div>
          <div className="text-emerald-400 font-mono">{data.params.branchingRatio.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Log-Lik</div>
          <div className="text-slate-300 font-mono">{data.params.logLik.toFixed(2)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Current λ/μ:</strong> {data.intensityRatio.toFixed(2)}× |
        <strong> Max burst:</strong> {data.maxBurst} events |
        <strong> Events:</strong> {data.nEvents} observed, {data.nSimulated} simulated
      </div>
    </div>
  )
}
