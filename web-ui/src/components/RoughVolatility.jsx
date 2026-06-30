import React, { useMemo, useState } from 'react'

// ─── Rough Volatility (Bergomi Model) ───────────────────────────────────────
// Implements the rough Bergomi (rBergomi) model where volatility follows
// a fractional Brownian motion (fBm) with Hurst exponent H < 1/2,
// capturing the roughness observed in real volatility surfaces.
//
// Mathematical foundation:
//   Volatility: v(t) = ξ₀(t) · exp(η·W^H(t) - ½η²·t^(2H))
//   where W^H is fractional Brownian motion with Hurst H
//
//   Fractional Brownian motion:
//   W^H(t) = ∫₀ᵗ K(t,s)·dW(s)
//   K(t,s) = √(2H) · [((t-s)^(H-1/2)) / Γ(H+1/2) - ...]
//
//   Power spectrum: E[|v(t+τ) - v(t)|²] ~ τ^(2H)
//   For H < 1/2: rough (anti-persistent), H > 1/2: smooth (persistent)
//
//   Variance swap: E[∫₀ᵀ v(t)dt] = ∫₀ᵀ ξ₀(t)dt
//
//   Implied volatility skew: ψ(τ) ~ τ^(H - 1/2)
//   For rough vol (H ≈ 0.1): steep short-dated skew

// Fractional Gaussian noise via Cholesky method
const fracGaussianNoise = (n, H) => {
  // Covariance: C(i,j) = ½(|i+1|^(2H) + |i-1|^(2H) - 2|i|^(2H))
  const C = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const diff = Math.abs(i - j)
      C[i][j] = 0.5 * (Math.pow(Math.abs(i - j + 1), 2 * H) + Math.pow(Math.abs(i - j - 1), 2 * H) - 2 * Math.pow(diff, 2 * H))
    }
  }

  // Cholesky decomposition
  const L = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = C[i][j]
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k]
      if (i === j) L[i][j] = Math.sqrt(Math.max(1e-10, sum))
      else L[i][j] = L[j][j] > 0 ? sum / L[j][j] : 0
    }
  }

  // Generate fGn: L · z (z ~ N(0,1))
  const fGn = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const z = randomNormal()
    for (let j = 0; j <= i; j++) {
      fGn[i] += L[i][j] * z
    }
  }

  return fGn
}

// Fractional Brownian motion (cumulative sum of fGn)
const fBm = (n, H) => {
  const gn = fracGaussianNoise(n, H)
  const bm = [0]
  for (let i = 0; i < n - 1; i++) {
    bm.push(bm[i] + gn[i])
  }
  return bm
}

const randomNormal = () => {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Simulate rBergomi model
const simulateRBergomi = (H, eta, rho, xi0, T, nSteps, nPaths = 50) => {
  const dt = T / nSteps
  const paths = []
  const volPaths = []
  const varSwaps = []

  for (let p = 0; p < nPaths; p++) {
    // Generate correlated Brownian motions
    const W1 = new Array(nSteps).fill(0)
    const W2 = new Array(nSteps).fill(0)
    for (let t = 1; t < nSteps; t++) {
      const z1 = randomNormal()
      const z2 = rho * z1 + Math.sqrt(1 - rho * rho) * randomNormal()
      W1[t] = W1[t - 1] + Math.sqrt(dt) * z1
      W2[t] = W2[t - 1] + Math.sqrt(dt) * z2
    }

    // fBm for volatility
    const W_H = fBm(nSteps, H)

    // Volatility: v(t) = ξ₀ · exp(η·W^H(t) - ½η²·t^(2H))
    const vol = new Array(nSteps)
    const price = new Array(nSteps)
    price[0] = 100
    vol[0] = xi0

    for (let t = 1; t < nSteps; t++) {
      const tH = Math.pow(t * dt, 2 * H)
      vol[t] = xi0 * Math.exp(eta * W_H[t] * Math.sqrt(dt) - 0.5 * eta * eta * tH)

      // Price: dS = S·√v·dW
      const volT = Math.sqrt(Math.max(0, vol[t]))
      price[t] = price[t - 1] * (1 + volT * (W1[t] - W1[t - 1]))
    }

    // Variance swap: ∫₀ᵀ v(t)dt
    let varSwap = 0
    for (let t = 0; t < nSteps; t++) varSwap += vol[t] * dt

    paths.push(price)
    volPaths.push(vol)
    varSwaps.push(varSwap / T)
  }

  // Statistics
  const finalPrices = paths.map(p => p[p.length - 1])
  finalPrices.sort((a, b) => a - b)
  const meanPrice = finalPrices.reduce((a, b) => a + b, 0) / finalPrices.length
  const p5 = finalPrices[Math.floor(finalPrices.length * 0.05)]
  const p95 = finalPrices[Math.floor(finalPrices.length * 0.95)]

  // Mean vol path
  const meanVol = new Array(nSteps).fill(0)
  for (let t = 0; t < nSteps; t++) {
    for (let p = 0; p < nPaths; p++) meanVol[t] += volPaths[p][t]
    meanVol[t] /= nPaths
  }

  // Mean price path
  const meanPricePath = new Array(nSteps).fill(0)
  for (let t = 0; t < nSteps; t++) {
    for (let p = 0; p < nPaths; p++) meanPricePath[t] += paths[p][t]
    meanPricePath[t] /= nPaths
  }

  // Implied vol skew (simplified: ATM vol - 1SD vol)
  const atmVol = Math.sqrt(meanVol[nSteps - 1])
  const skew = eta * Math.pow(T, H - 0.5) // Theoretical skew scaling

  return {
    paths, volPaths, meanVol, meanPricePath,
    finalPrices, meanPrice, p5, p95,
    varSwaps, atmVol, skew,
    nSteps, nPaths,
  }
}

// Estimate Hurst exponent from realized volatility
const estimateHurst = (returns) => {
  // Compute realized volatility at different aggregation scales
  const scales = [1, 2, 5, 10, 20]
  const logReturns = []
  const logScales = []

  for (const scale of scales) {
    if (returns.length < scale * 4) continue
    const aggReturns = []
    for (let i = 0; i < returns.length - scale; i += scale) {
      const sum = returns.slice(i, i + scale).reduce((a, b) => a + b, 0)
      aggReturns.push(sum)
    }
    const rv = Math.sqrt(aggReturns.reduce((s, r) => s + r * r, 0) / aggReturns.length)
    if (rv > 0) {
      logReturns.push(Math.log(rv))
      logScales.push(Math.log(scale))
    }
  }

  if (logReturns.length < 2) return 0.1

  // Linear regression: log(RV) = c + hurst·log(scale)
  const n = logReturns.length
  const meanX = logScales.reduce((a, b) => a + b, 0) / n
  const meanY = logReturns.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (logScales[i] - meanX) * (logReturns[i] - meanY)
    den += (logScales[i] - meanX) ** 2
  }
  const hurst = den > 0 ? num / den : 0.1
  return Math.max(0.01, Math.min(0.99, hurst))
}

export default function RoughVolatility({ candles, symbol, exchange }) {
  const [hurstExp, setHurstExp] = useState(0.1)
  const [eta, setEta] = useState(1.5)
  const [rho, setRho] = useState(-0.7)
  const [T, setT] = useState(30 / 365)
  const [nSteps, setNSteps] = useState(50)
  const [nPaths, setNPaths] = useState(50)
  const [autoHurst, setAutoHurst] = useState(true)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 40) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // Estimate Hurst from realized vol
    const estH = estimateHurst(returns)
    const usedH = autoHurst ? estH : hurstExp

    // Estimate xi0 from recent volatility
    const recentRets = returns.slice(-30)
    const xi0 = Math.sqrt(recentRets.reduce((s, r) => s + r * r, 0) / recentRets.length) * Math.sqrt(252)

    const sim = simulateRBergomi(usedH, eta, rho, xi0, T, nSteps, nPaths)

    // Current price
    const currentPrice = prices[prices.length - 1]

    // Signal from simulated distribution
    const expectedPrice = sim.meanPrice
    const expectedReturn = (expectedPrice - currentPrice) / currentPrice

    let signal = 'NEUTRAL'
    if (expectedReturn > 0.01) signal = 'BUY'
    else if (expectedReturn < -0.01) signal = 'SELL'

    // Volatility regime
    const currentVol = xi0
    const longVol = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length) * Math.sqrt(252)
    const volRegime = currentVol > longVol * 1.5 ? 'HIGH' : currentVol < longVol * 0.7 ? 'LOW' : 'NORMAL'

    return {
      ...sim, estH, usedH, xi0, currentPrice,
      expectedReturn, signal, volRegime,
      currentVol, longVol,
    }
  }, [candles, exchange, symbol, H, eta, rho, T, nSteps, nPaths, autoHurst])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 40 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'

  // Price paths
  const allPrices = data.paths.flat()
  const minP = Math.min(...allPrices)
  const maxP = Math.max(...allPrices)
  const sxP = (t) => P + (t / data.nSteps) * (W - 2 * P)
  const syP = (p) => H - P - ((p - minP) / (maxP - minP + 0.001)) * (H - 2 * P)

  // Vol paths
  const allVols = data.volPaths.flat()
  const maxV = Math.max(...allVols)
  const syV = (v) => H - P - (v / maxV) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Rough Volatility (rBergomi) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={autoHurst} onChange={e => setAutoHurst(e.target.checked)} />
          <span className="text-slate-400">Auto Hurst (est: {data.estH.toFixed(3)})</span>
        </label>
        {!autoHurst && (
          <label className="flex items-center gap-1">
            <span className="text-slate-400">H (Hurst):</span>
            <input type="number" step="0.01" value={hurstExp} onChange={e => setHurstExp(Math.max(0.01, Math.min(0.99, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
          </label>
        )}
        <label className="flex items-center gap-1">
          <span className="text-slate-400">η (vol of vol):</span>
          <input type="number" step="0.1" value={eta} onChange={e => setEta(Math.max(0.1, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">ρ (correlation):</span>
          <input type="number" step="0.1" value={rho} onChange={e => setRho(Math.max(-0.99, Math.min(0.99, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">T (days):</span>
          <input type="number" value={Math.round(T * 365)} onChange={e => setT(Math.max(1, +e.target.value) / 365)} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Paths:</span>
          <input type="number" value={nPaths} onChange={e => setNPaths(Math.max(10, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Price paths */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Simulated Price Paths (rBergomi, {data.nPaths} paths)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Individual paths (sample) */}
          {data.paths.slice(0, 20).map((path, i) => (
            <path key={i} d={path.map((p, t) => `${t === 0 ? 'M' : 'L'} ${sxP(t)} ${syP(p)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={0.5} opacity={0.2} />
          ))}

          {/* Mean path */}
          <path d={data.meanPricePath.map((p, t) => `${t === 0 ? 'M' : 'L'} ${sxP(t)} ${syP(p)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2} />

          {/* P5/P95 */}
          <line x1={sxP(data.nSteps - 1)} y1={syP(data.p5)} x2={sxP(data.nSteps - 1)} y2={syP(data.p95)} stroke="#22c55e" strokeWidth={2} />
          <text x={sxP(data.nSteps - 1) + 5} y={syP(data.p95)} fill="#22c55e" fontSize={9}>P95: ${data.p95.toFixed(2)}</text>
          <text x={sxP(data.nSteps - 1) + 5} y={syP(data.p5)} fill="#22c55e" fontSize={9}>P5: ${data.p5.toFixed(2)}</text>
          <text x={W - P} y={20} textAnchor="end" fill="#f59e0b" fontSize={9}>Mean: ${data.meanPrice.toFixed(2)}</text>
        </svg>
      </div>

      {/* Volatility paths */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Volatility Paths (fractional Brownian motion, H={data.usedH.toFixed(3)})</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.volPaths.slice(0, 20).map((vol, i) => (
            <path key={i} d={vol.map((v, t) => `${t === 0 ? 'M' : 'L'} ${sxP(t)} ${syV(v)}`).join(' ')} fill="none" stroke="#a855f7" strokeWidth={0.5} opacity={0.2} />
          ))}

          <path d={data.meanVol.map((v, t) => `${t === 0 ? 'M' : 'L'} ${sxP(t)} ${syV(v)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2} />
          <text x={W - P} y={20} textAnchor="end" fill="#a855f7" fontSize={9}>Vol paths (purple)</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>Mean vol (amber)</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Hurst H</div>
          <div className="text-cyan-400 font-mono">{data.usedH.toFixed(3)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">ξ₀ (init vol)</div>
          <div className="text-amber-400 font-mono">{(data.xi0 * 100).toFixed(2)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">ATM vol</div>
          <div className="text-purple-400 font-mono">{(data.atmVol * 100).toFixed(2)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Vol skew</div>
          <div className="text-emerald-400 font-mono">{data.skew.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Vol regime</div>
          <div className="font-mono" style={{ color: data.volRegime === 'HIGH' ? '#ef4444' : data.volRegime === 'LOW' ? '#22c55e' : '#f59e0b' }}>{data.volRegime}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Model:</strong> rBergomi (H={data.usedH.toFixed(3)}, η={eta}, ρ={rho}) |
        <strong> Roughness:</strong> {data.usedH < 0.5 ? 'ROUGH (anti-persistent)' : 'SMOOTH (persistent)'} |
        <strong> Expected:</strong> ${data.meanPrice.toFixed(2)} ({(data.expectedReturn * 100).toFixed(2)}%) |
        <strong> Skew scaling:</strong> τ^(H-½) = τ^{(data.usedH - 0.5).toFixed(2)}
      </div>
    </div>
  )
}
