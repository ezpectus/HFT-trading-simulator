import React, { useMemo, useState } from 'react'

// ─── Ehlers SuperSmoother Filter ─────────────────────────────────────────────
// John Ehlers' zero-lag digital signal processing filter.
// Uses a 2-pole super smoother that removes high-frequency noise while
// preserving trend with minimal lag. Also includes the Ehlers Roofing Filter
// (high-pass + super smoother) and the MESA Adaptive Moving Average (MAMA).
//
// Mathematical foundation:
//   SuperSmoother: a1 = exp(-π√2 / period), b1 = 2*a1*cos(√2*π/period)
//   coef2 = b1, coef3 = -a1*a1, coef1 = (1 - b1 + a1*a1) / 2
//   filter[i] = coef1*(price[i] + price[i-1]) + coef2*filter[i-1] + coef3*filter[i-2]
//
//   Roofing Filter: high-pass removes low-frequency trend before smoothing
//   alpha1 = (cos(0.707*2π/HP) + sin(0.707*2π/HP) - 1) / cos(0.707*2π/HP)
//   HP[i] = (1 - alpha1/2)^2*(price[i] - 2*price[i-1] + price[i-2]) +
//           2*(1-alpha1)*HP[i-1] - (1-alpha1)^2*HP[i-2]
//
//   MAMA: adaptive alpha based on Hilbert Transform phase rate
//   phase = atan(Q/I), delta_phase = phase[i] - phase[i-1]
//   alpha = Flimit / delta_phase (clamped to [Falpha, 1])

const SUPER_SMOOTHER = (prices, period) => {
  if (prices.length < 4) return prices.slice()
  const a1 = Math.exp(-Math.PI * Math.SQRT2 / period)
  const b1 = 2 * a1 * Math.cos(Math.SQRT2 * Math.PI / period)
  const coef2 = b1
  const coef3 = -a1 * a1
  const coef1 = (1 - b1 + a1 * a1) / 2
  const filt = new Array(prices.length)
  filt[0] = prices[0]
  filt[1] = prices[1]
  for (let i = 2; i < prices.length; i++) {
    filt[i] = coef1 * (prices[i] + prices[i - 1]) + coef2 * filt[i - 1] + coef3 * filt[i - 2]
  }
  return filt
}

const ROOFING_FILTER = (prices, hpPeriod = 48, smoothPeriod = 10) => {
  if (prices.length < 4) return prices.slice()
  const alpha1 = (Math.cos(0.707 * 2 * Math.PI / hpPeriod) + Math.sin(0.707 * 2 * Math.PI / hpPeriod) - 1) / Math.cos(0.707 * 2 * Math.PI / hpPeriod)
  const a1 = Math.exp(-Math.PI * Math.SQRT2 / smoothPeriod)
  const b1 = 2 * a1 * Math.cos(Math.SQRT2 * Math.PI / smoothPeriod)
  const coef2 = b1
  const coef3 = -a1 * a1
  const coef1 = (1 - b1 + a1 * a1) / 2
  const hp = new Array(prices.length)
  const filt = new Array(prices.length)
  hp[0] = 0; hp[1] = 0
  filt[0] = 0; filt[1] = 0
  for (let i = 2; i < prices.length; i++) {
    const c2 = i >= 2 ? prices[i] : 0
    const c1 = i >= 1 ? prices[i - 1] : 0
    const c0 = i >= 2 ? prices[i - 2] : 0
    hp[i] = Math.pow(1 - alpha1 / 2, 2) * (c2 - 2 * c1 + c0) +
            2 * (1 - alpha1) * hp[i - 1] - Math.pow(1 - alpha1, 2) * hp[i - 2]
    filt[i] = coef1 * (hp[i] + hp[i - 1]) + coef2 * filt[i - 1] + coef3 * filt[i - 2]
  }
  return filt
}

// MAMA/FAMA — MESA Adaptive Moving Average
const MAMA = (prices, fastLimit = 0.5, slowLimit = 0.05) => {
  if (prices.length < 7) return { mama: prices.slice(), fama: prices.slice() }
  const mama = new Array(prices.length).fill(0)
  const fama = new Array(prices.length).fill(0)
  const smooth = new Array(prices.length).fill(0)
  const detrender = new Array(prices.length).fill(0)
  const q1 = new Array(prices.length).fill(0)
  const i1 = new Array(prices.length).fill(0)
  const jI = new Array(prices.length).fill(0)
  const jQ = new Array(prices.length).fill(0)
  const i2 = new Array(prices.length).fill(0)
  const q2 = new Array(prices.length).fill(0)
  const re = new Array(prices.length).fill(0)
  const im = new Array(prices.length).fill(0)
  const period = new Array(prices.length).fill(0)
  const smoothPeriod = new Array(prices.length).fill(0)
  const phase = new Array(prices.length).fill(0)

  const detrenderMult = 0.046
  mama[0] = prices[0]; mama[1] = prices[1]
  fama[0] = prices[0]; fama[1] = prices[1]
  period[0] = 20; period[1] = 20

  for (let i = 6; i < prices.length; i++) {
    const p = prices[i]
    const p1 = prices[i - 1]
    const p2 = prices[i - 2]
    const p3 = prices[i - 3]
    const p4 = prices[i - 4]
    const p5 = prices[i - 5]
    const p6 = prices[i - 6]

    smooth[i] = (4 * p + 3 * p1 + 2 * p2 + p3) / 10
    detrender[i] = (0.0962 * smooth[i] + 0.5769 * smooth[i - 2] - 0.5769 * smooth[i - 4] - 0.0962 * smooth[i - 6]) * detrenderMult

    q1[i] = (0.0962 * detrender[i] + 0.5769 * detrender[i - 2] - 0.5769 * detrender[i - 4] - 0.0962 * detrender[i - 6]) * detrenderMult
    i1[i] = detrender[i - 3]

    jI[i] = (0.0962 * i1[i] + 0.5769 * i1[i - 2] - 0.5769 * i1[i - 4] - 0.0962 * i1[i - 6]) * detrenderMult
    jQ[i] = (0.0962 * q1[i] + 0.5769 * q1[i - 2] - 0.5769 * q1[i - 4] - 0.0962 * q1[i - 6]) * detrenderMult

    i2[i] = i1[i] - jQ[i]
    q2[i] = q1[i] + jI[i]
    i2[i] = 0.2 * i2[i] + 0.8 * i2[i - 1]
    q2[i] = 0.2 * q2[i] + 0.8 * q2[i - 1]

    re[i] = i2[i] * i2[i - 1] + q2[i] * q2[i - 1]
    im[i] = i2[i] * q2[i - 1] - q2[i] * i2[i - 1]

    if (re[i] !== 0 && im[i] !== 0) {
      period[i] = Math.max(6, Math.min(50, 2 * Math.PI / Math.atan(im[i] / re[i])))
    } else {
      period[i] = period[i - 1] || 20
    }

    smoothPeriod[i] = 0.2 * period[i] + 0.8 * smoothPeriod[i - 1]
    const dcPeriod = Math.round(smoothPeriod[i])

    let sumI = 0, sumQ = 0
    for (let k = 0; k < dcPeriod && i - k >= 0; k++) {
      sumI += i1[i - k]
      sumQ += q1[i - k]
    }
    if (dcPeriod > 0) {
      sumI /= dcPeriod
      sumQ /= dcPeriod
    }

    const dcPhase = sumI !== 0 ? Math.atan(sumQ / sumI) * 180 / Math.PI : 0
    phase[i] = dcPhase

    const deltaPhase = (phase[i - 1] || 0) - dcPhase
    const dp = deltaPhase > 1.0 ? 1.0 : deltaPhase < -1.0 ? -1.0 : deltaPhase

    const alpha = Math.max(fastLimit / (dp + 0.1), slowLimit)
    mama[i] = alpha * p + (1 - alpha) * mama[i - 1]
    const famaAlpha = 0.5 * alpha
    fama[i] = famaAlpha * p + (1 - famaAlpha) * fama[i - 1]
  }

  return { mama, fama }
}

// Lag calculation — cross-correlation between price and filter
const calculateLag = (prices, filter) => {
  const n = Math.min(prices.length, filter.length)
  if (n < 10) return 0
  const pRet = []
  const fRet = []
  for (let i = 1; i < n; i++) {
    pRet.push(prices[i] - prices[i - 1])
    fRet.push(filter[i] - filter[i - 1])
  }
  let bestLag = 0
  let bestCorr = -1
  for (let lag = 0; lag <= 5; lag++) {
    let corr = 0
    let count = 0
    for (let i = lag; i < pRet.length; i++) {
      corr += pRet[i] * fRet[i - lag]
      count++
    }
    corr = count > 0 ? corr / count : 0
    if (Math.abs(corr) > bestCorr) {
      bestCorr = Math.abs(corr)
      bestLag = lag
    }
  }
  return bestLag
}

// Signal generation
const generateSignal = (mama, fama) => {
  if (mama.length < 2) return { signal: 'NEUTRAL', reason: 'Insufficient data' }
  const m1 = mama[mama.length - 1]
  const m0 = mama[mama.length - 2]
  const f1 = fama[fama.length - 1]
  const f0 = fama[fama.length - 2]
  const crossUp = m0 <= f0 && m1 > f1
  const crossDown = m0 >= f0 && m1 < f1
  if (crossUp) return { signal: 'BUY', reason: 'MAMA crossed above FAMA' }
  if (crossDown) return { signal: 'SELL', reason: 'MAMA crossed below FAMA' }
  if (m1 > f1) return { signal: 'BULLISH', reason: 'MAMA > FAMA (uptrend)' }
  if (m1 < f1) return { signal: 'BEARISH', reason: 'MAMA < FAMA (downtrend)' }
  return { signal: 'NEUTRAL', reason: 'No crossover' }
}

export default function EhlersSuperSmoother({ candles, symbol, exchange }) {
  const [period, setPeriod] = useState(14)
  const [hpPeriod, setHpPeriod] = useState(48)
  const [showMAMA, setShowMAMA] = useState(true)
  const [showRoofing, setShowRoofing] = useState(true)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 10) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)
    const timestamps = cds.map(c => c.timestamp)

    const ss = SUPER_SMOOTHER(prices, period)
    const rf = ROOFING_FILTER(prices, hpPeriod, period)
    const { mama, fama } = MAMA(prices)

    const ssLag = calculateLag(prices, ss)
    const rfLag = calculateLag(prices, rf)

    // SNR: signal-to-noise ratio (variance of filter / variance of residual)
    const meanPrice = prices.reduce((a, b) => a + b, 0) / prices.length
    const ssResidual = prices.map((p, i) => p - (ss[i] || 0))
    const varPrice = prices.reduce((s, p) => s + (p - meanPrice) ** 2, 0) / prices.length
    const varResidual = ssResidual.reduce((a, b) => a + b * b, 0) / ssResidual.length
    const snr = varResidual > 0 ? 10 * Math.log10(varPrice / varResidual) : 0

    // Dominant cycle period from MAMA
    const lastMama = mama[mama.length - 1] || 0
    const lastFama = fama[fama.length - 1] || 0
    const sig = generateSignal(mama, fama)

    return {
      prices, timestamps, ss, rf, mama, fama,
      ssLag, rfLag, snr, sig,
      currentPrice: prices[prices.length - 1],
      ssValue: ss[ss.length - 1],
      rfValue: rf[rf.length - 1],
      mamaValue: lastMama,
      famaValue: lastFama,
    }
  }, [candles, exchange, symbol, period, hpPeriod])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 10 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 360, P = 40
  const allVals = [...data.prices, ...data.ss, ...data.rf, ...(data.showMAMA ? data.mama : []), ...(data.showMAMA ? data.fama : [])]
  const minV = Math.min(...allVals.filter(v => isFinite(v)))
  const maxV = Math.max(...allVals.filter(v => isFinite(v)))
  const xScale = (i) => P + (i / (data.prices.length - 1)) * (W - 2 * P)
  const yScale = (v) => H - P - ((v - minV) / (maxV - minV + 0.001)) * (H - 2 * P)

  const pathData = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`).join(' ')

  const sigColor = data.sig.signal === 'BUY' ? '#22c55e' : data.sig.signal === 'SELL' ? '#ef4444' : data.sig.signal === 'BULLISH' ? '#4ade80' : data.sig.signal === 'BEARISH' ? '#f87171' : '#94a3b8'

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Ehlers SuperSmoother — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.sig.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">SS Period:</span>
          <input type="number" value={period} onChange={e => setPeriod(Math.max(2, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">HP Period:</span>
          <input type="number" value={hpPeriod} onChange={e => setHpPeriod(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showMAMA} onChange={e => setShowMAMA(e.target.checked)} />
          <span className="text-slate-400">MAMA/FAMA</span>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showRoofing} onChange={e => setShowRoofing(e.target.checked)} />
          <span className="text-slate-400">Roofing</span>
        </label>
      </div>

      <svg width={W} height={H} className="bg-slate-900 rounded border border-slate-700">
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
        <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

        <path d={pathData(data.prices)} fill="none" stroke="#64748b" strokeWidth={1} opacity={0.4} />
        <path d={pathData(data.ss)} fill="none" stroke="#06b6d4" strokeWidth={2} />
        {showRoofing && <path d={pathData(data.rf)} fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity={0.8} />}
        {showMAMA && <path d={pathData(data.mama)} fill="none" stroke="#22c55e" strokeWidth={1.5} />}
        {showMAMA && <path d={pathData(data.fama)} fill="none" stroke="#ef4444" strokeWidth={1.5} />}

        <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={10}>SuperSmoother</text>
        {showRoofing && <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={10}>Roofing</text>}
        {showMAMA && <text x={W - P} y={48} textAnchor="end" fill="#22c55e" fontSize={10}>MAMA</text>}
        {showMAMA && <text x={W - P} y={62} textAnchor="end" fill="#ef4444" fontSize={10}>FAMA</text>}
      </svg>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">SS Lag</div>
          <div className="text-cyan-400 font-mono">{data.ssLag} bars</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">RF Lag</div>
          <div className="text-amber-400 font-mono">{data.rfLag} bars</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">SNR</div>
          <div className="text-emerald-400 font-mono">{data.snr.toFixed(2)} dB</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Signal</div>
          <div className="font-mono" style={{ color: sigColor }}>{data.sig.signal}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Reason:</strong> {data.sig.reason} | <strong>Price:</strong> ${data.currentPrice.toFixed(2)} | <strong>SS:</strong> ${data.ssValue.toFixed(2)} | <strong>MAMA:</strong> ${data.mamaValue.toFixed(2)} | <strong>FAMA:</strong> ${data.famaValue.toFixed(2)}
      </div>
    </div>
  )
}
