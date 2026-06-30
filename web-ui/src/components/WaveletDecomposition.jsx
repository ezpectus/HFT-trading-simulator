import React, { useMemo, useState } from 'react'

// ─── Wavelet Decomposition (MRA) ─────────────────────────────────────────────
// Implements Multi-Resolution Analysis using discrete wavelet transforms.
// Supports Haar and Daubechies D4 wavelets for decomposing price series into
// trend + detail components at multiple scales.
//
// Mathematical foundation:
//   Haar wavelet: scaling function φ(t) = 1 on [0,1), 0 otherwise
//   Wavelet: ψ(t) = 1 on [0,½), -1 on [½,1), 0 otherwise
//
//   Daubechies D4: 4-coefficient wavelet with compact support
//   h = [(1+√3)/4√2, (3+√3)/4√2, (3-√3)/4√2, (1-√3)/4√2]
//
//   DWT: c[j] = Σ h[k] * s[2j+k], d[j] = Σ g[k] * s[2j+k]
//   IDWT: s[2j] = Σ h[k] * c[j-k/2] + g[k] * d[j-k/2]
//
//   Modwt (maximum overlap DWT) — redundant, shift-invariant transform
//   MRA reconstruction: price = trend(J) + details(1..J)

const HAAR_H = [1 / Math.SQRT2, 1 / Math.SQRT2]
const HAAR_G = [1 / Math.SQRT2, -1 / Math.SQRT2]

const SQRT3 = Math.sqrt(3)
const DB4_H = [
  (1 + SQRT3) / (4 * Math.SQRT2),
  (3 + SQRT3) / (4 * Math.SQRT2),
  (3 - SQRT3) / (4 * Math.SQRT2),
  (1 - SQRT3) / (4 * Math.SQRT2)
]
const DB4_G = [DB4_H[3], -DB4_H[2], DB4_H[1], -DB4_H[0]]

const dwt = (signal, wavelet = 'haar') => {
  const h = wavelet === 'db4' ? DB4_H : HAAR_H
  const g = wavelet === 'db4' ? DB4_G : HAAR_G
  const lh = h.length
  const n = signal.length
  const n2 = Math.floor(n / 2)

  const approx = new Array(n2).fill(0)
  const detail = new Array(n2).fill(0)

  for (let i = 0; i < n2; i++) {
    for (let j = 0; j < lh; j++) {
      const idx = (2 * i + j) % n
      approx[i] += h[j] * signal[idx]
      detail[i] += g[j] * signal[idx]
    }
  }

  return { approx, detail }
}

const idwt = (approx, detail, wavelet = 'haar') => {
  const h = wavelet === 'db4' ? DB4_H : HAAR_H
  const g = wavelet === 'db4' ? DB4_G : HAAR_G
  const lh = h.length
  const n2 = approx.length
  const n = n2 * 2

  const signal = new Array(n).fill(0)

  for (let i = 0; i < n2; i++) {
    for (let j = 0; j < lh; j++) {
      const idx = (2 * i + j) % n
      signal[idx] += h[j] * approx[i] + g[j] * detail[i]
    }
  }

  return signal
}

// Full multi-level wavelet decomposition
const waveletDecompose = (signal, levels, wavelet = 'haar') => {
  const n = signal.length
  const maxLevels = Math.floor(Math.log2(n))
  const J = Math.min(levels, maxLevels)

  const details = []
  let current = signal.slice()

  for (let level = 0; level < J; level++) {
    const { approx, detail } = dwt(current, wavelet)
    details.push(detail)
    current = approx
    if (current.length < 2) break
  }

  return { approx: current, details, levels: details.length }
}

// MRA reconstruction: reconstruct each level's contribution
const mraReconstruct = (decomp, originalLength, wavelet = 'haar') => {
  const { approx, details, levels } = decomp
  const components = []

  // Reconstruct trend (lowest level approximation)
  let trend = approx.slice()
  for (let l = levels - 1; l >= 0; l--) {
    const dummyDetail = new Array(trend.length).fill(0)
    trend = idwt(trend, dummyDetail, wavelet)
  }
  // Pad or trim to original length
  while (trend.length < originalLength) trend.push(trend[trend.length - 1] || 0)
  components.push({ name: 'Trend', data: trend.slice(0, originalLength), color: '#06b6d4' })

  // Reconstruct each detail level
  for (let level = 0; level < levels; level++) {
    let detailComp = new Array(Math.pow(2, levels - level) * approx.length).fill(0)
    // Upsample through inverse DWT
    let currentApprox = new Array(details[level].length).fill(0)
    let currentDetail = details[level].slice()

    for (let l = levels - 1; l >= 0; l--) {
      if (l === level) {
        // Use this level's detail with zeros for approx
        currentApprox = new Array(currentDetail.length).fill(0)
        const recon = idwt(currentApprox, currentDetail, wavelet)
        currentApprox = recon
        currentDetail = new Array(recon.length).fill(0)
      } else {
        // Zero detail, just upsample
        const dummyDetail = new Array(currentApprox.length).fill(0)
        currentApprox = idwt(currentApprox, dummyDetail, wavelet)
      }
    }

    while (currentApprox.length < originalLength) currentApprox.push(currentApprox[currentApprox.length - 1] || 0)
    const colors = ['#f59e0b', '#22c55e', '#ef4444', '#a855f7', '#ec4899']
    components.push({
      name: `D${level + 1}`,
      data: currentApprox.slice(0, originalLength),
      color: colors[level % colors.length]
    })
  }

  return components
}

// Wavelet variance — energy at each scale
const waveletVariance = (decomp) => {
  const { details, approx } = decomp
  const variances = details.map(d => {
    const mean = d.reduce((a, b) => a + b, 0) / d.length
    return d.reduce((s, v) => s + (v - mean) ** 2, 0) / d.length
  })
  const approxVar = (() => {
    const mean = approx.reduce((a, b) => a + b, 0) / approx.length
    return approx.reduce((s, v) => s + (v - mean) ** 2, 0) / approx.length
  })()
  variances.push(approxVar)
  return variances
}

// Denoising: threshold detail coefficients
const denoise = (decomp, threshold, wavelet = 'haar') => {
  const { approx, details, levels } = decomp
  const newDetails = details.map(d =>
    d.map(v => Math.abs(v) < threshold ? 0 : v * (1 - threshold / Math.abs(v)))
  )
  return { approx, details: newDetails, levels }
}

// Reconstruct full signal from decomposition
const reconstruct = (decomp, wavelet = 'haar') => {
  let current = decomp.approx.slice()
  for (let l = decomp.levels - 1; l >= 0; l--) {
    current = idwt(current, decomp.details[l], wavelet)
  }
  return current
}

export default function WaveletDecomposition({ candles, symbol, exchange }) {
  const [levels, setLevels] = useState(4)
  const [wavelet, setWavelet] = useState('haar')
  const [threshold, setThreshold] = useState(0)
  const [showComponents, setShowComponents] = useState(true)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 16) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)

    // Pad to power of 2
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(prices.length)))
    const padded = prices.slice()
    while (padded.length < nextPow2) padded.push(prices[prices.length - 1])

    const decomp = waveletDecompose(padded, levels, wavelet)
    const components = mraReconstruct(decomp, prices.length, wavelet)
    const variances = waveletVariance(decomp)

    // Denoised signal
    const denoised = threshold > 0 ? denoise(decomp, threshold, wavelet) : decomp
    const reconstructed = reconstruct(denoised, wavelet)
    const denoisedSignal = reconstructed.slice(0, prices.length)

    // Energy distribution
    const totalVar = variances.reduce((a, b) => a + b, 0) + 1e-10
    const energyPct = variances.map(v => (v / totalVar) * 100)

    // Signal: compare trend direction vs detail energy
    const trendData = components[0].data
    const trendSlope = trendData.length > 1 ? trendData[trendData.length - 1] - trendData[trendData.length - 2] : 0
    const detailEnergy = variances.slice(0, -1).reduce((a, b) => a + b, 0)
    const trendEnergy = variances[variances.length - 1]
    const snr = detailEnergy > 0 ? 10 * Math.log10(trendEnergy / detailEnergy) : 999

    let signal = 'NEUTRAL'
    let reason = ''
    if (trendSlope > 0 && snr > 3) {
      signal = 'BUY'
      reason = `Trend up, SNR=${snr.toFixed(1)}dB (low noise)`
    } else if (trendSlope < 0 && snr > 3) {
      signal = 'SELL'
      reason = `Trend down, SNR=${snr.toFixed(1)}dB (low noise)`
    } else if (snr < 1) {
      signal = 'HOLD'
      reason = `High noise (SNR=${snr.toFixed(1)}dB), trend unclear`
    } else {
      reason = `Marginal: trend=${trendSlope > 0 ? 'up' : 'down'}, SNR=${snr.toFixed(1)}dB`
    }

    return {
      prices, components, variances, energyPct,
      denoisedSignal, signal, reason, snr,
      currentPrice: prices[prices.length - 1],
      denoisedPrice: denoisedSignal[denoisedSignal.length - 1],
    }
  }, [candles, exchange, symbol, levels, wavelet, threshold])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 16 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 360, P = 40
  const allVals = [...data.prices, ...data.denoisedSignal, ...data.components.flatMap(c => c.data)]
  const minV = Math.min(...allVals.filter(v => isFinite(v)))
  const maxV = Math.max(...allVals.filter(v => isFinite(v)))
  const xScale = (i) => P + (i / (data.prices.length - 1)) * (W - 2 * P)
  const yScale = (v) => H - P - ((v - minV) / (maxV - minV + 0.001)) * (H - 2 * P)
  const pathData = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`).join(' ')

  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Wavelet Decomposition (MRA) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Levels:</span>
          <input type="number" value={levels} onChange={e => setLevels(Math.max(1, Math.min(8, +e.target.value)))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Wavelet:</span>
          <select value={wavelet} onChange={e => setWavelet(e.target.value)} className="bg-slate-800 border border-slate-600 rounded text-slate-200 px-1">
            <option value="haar">Haar (D2)</option>
            <option value="db4">Daubechies D4</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Threshold:</span>
          <input type="number" step="0.01" value={threshold} onChange={e => setThreshold(Math.max(0, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showComponents} onChange={e => setShowComponents(e.target.checked)} />
          <span className="text-slate-400">Show MRA components</span>
        </label>
      </div>

      <svg width={W} height={H} className="bg-slate-900 rounded border border-slate-700">
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
        <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

        <path d={pathData(data.prices)} fill="none" stroke="#64748b" strokeWidth={1} opacity={0.3} />
        <path d={pathData(data.denoisedSignal)} fill="none" stroke="#06b6d4" strokeWidth={2} />

        {showComponents && data.components.map((comp, ci) => (
          <path key={ci} d={pathData(comp.data)} fill="none" stroke={comp.color} strokeWidth={1} opacity={0.5} strokeDasharray={ci === 0 ? '' : '3,2'} />
        ))}

        <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={10}>Denoised</text>
        <text x={W - P} y={34} textAnchor="end" fill="#64748b" fontSize={10}>Original (faded)</text>
        {showComponents && data.components.map((comp, ci) => (
          <text key={ci} x={W - P} y={48 + ci * 12} textAnchor="end" fill={comp.color} fontSize={9}>{comp.name}</text>
        ))}
      </svg>

      {/* Energy distribution */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Energy Distribution by Scale</div>
        <div className="flex items-end gap-2 h-24">
          {data.energyPct.map((pct, i) => (
            <div key={i} className="flex flex-col items-center flex-1">
              <div className="text-[10px] text-slate-400 mb-1">{pct.toFixed(1)}%</div>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${Math.max(2, pct)}%`,
                  background: i === data.energyPct.length - 1 ? '#06b6d4' : `hsl(${30 + i * 40}, 70%, 50%)`
                }}
              />
              <div className="text-[10px] text-slate-500 mt-1">{i === data.energyPct.length - 1 ? 'Trend' : `D${i + 1}`}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">SNR</div>
          <div className="text-cyan-400 font-mono">{data.snr.toFixed(2)} dB</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Price</div>
          <div className="text-slate-300 font-mono">${data.currentPrice.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Denoised</div>
          <div className="text-amber-400 font-mono">${data.denoisedPrice.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Levels</div>
          <div className="text-purple-400 font-mono">{levels} ({wavelet})</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason}
      </div>
    </div>
  )
}
