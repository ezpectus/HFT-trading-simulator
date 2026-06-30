import { useMemo } from 'react'
import { Split, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { calcRSI } from '../utils/indicators'

export default function DeltaDivergence({ candles, fills, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-30)
    if (symCandles.length < 10) return null

    // Calculate delta per candle from fills
    const symFills = (fills || [])
      .filter(f => f.symbol === symbol && f.exchange === exchange && f.status === 'FILLED')
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    const candleData = symCandles.map(c => {
      const cTime = c.time || c.timestamp || 0
      const cEnd = cTime + 300
      let buyVol = 0, sellVol = 0
      for (const f of symFills) {
        const fTime = f.timestamp || 0
        if (fTime >= cTime && fTime <= cEnd) {
          const qty = f.filled_quantity || f.quantity || 0
          if (f.side === 'BUY') buyVol += qty
          else sellVol += qty
        }
      }
      // Fallback: estimate from candle
      if (buyVol === 0 && sellVol === 0) {
        const vol = c.volume || 0
        if (c.close >= c.open) { buyVol = vol * 0.6; sellVol = vol * 0.4 }
        else { sellVol = vol * 0.6; buyVol = vol * 0.4 }
      }
      const delta = buyVol - sellVol
      const cumDelta = 0 // will be computed below
      return { time: cTime, close: c.close, open: c.open, high: c.high, low: c.low, buyVol, sellVol, delta }
    })

    // Cumulative delta
    let cumDelta = 0
    for (const cd of candleData) {
      cumDelta += cd.delta
      cd.cumDelta = cumDelta
    }

    // Detect divergences
    const divergences = []
    for (let i = 1; i < candleData.length; i++) {
      const prev = candleData[i - 1]
      const curr = candleData[i]
      const priceChange = curr.close - prev.close
      const deltaChange = curr.delta - prev.delta

      // Regular bullish divergence: price lower low, delta higher low
      // Regular bearish divergence: price higher high, delta lower high
      if (i >= 2) {
        const prev2 = candleData[i - 2]
        // Price LL but delta HL
        if (curr.close < prev.close && curr.delta > prev.delta && prev.close < prev2.close) {
          divergences.push({
            idx: i,
            type: 'bullish',
            label: 'Bullish: Price LL, Delta HL',
            price: curr.close,
            delta: curr.delta,
          })
        }
        // Price HH but delta LH
        if (curr.close > prev.close && curr.delta < prev.delta && prev.close > prev2.close) {
          divergences.push({
            idx: i,
            type: 'bearish',
            label: 'Bearish: Price HH, Delta LH',
            price: curr.close,
            delta: curr.delta,
          })
        }
      }
    }

    // RSI for additional divergence detection
    const closes = candleData.map(c => c.close)
    const rsi = calcRSI(closes, 14)

    // RSI divergence
    const rsiDivergences = []
    for (let i = 2; i < candleData.length; i++) {
      const prev = candleData[i - 1]
      const curr = candleData[i]
      const prevRsi = rsi[i - 1]
      const currRsi = rsi[i]
      if (isNaN(currRsi) || isNaN(prevRsi)) continue

      // Bullish: price lower low, RSI higher low
      if (curr.close < prev.close && currRsi > prevRsi) {
        rsiDivergences.push({ idx: i, type: 'bullish', label: 'RSI Bullish Divergence' })
      }
      // Bearish: price higher high, RSI lower high
      if (curr.close > prev.close && currRsi < prevRsi) {
        rsiDivergences.push({ idx: i, type: 'bearish', label: 'RSI Bearish Divergence' })
      }
    }

    // Chart: price vs cumulative delta
    const slice = candleData.slice(-20)
    const prices = slice.map(s => s.close)
    const deltas = slice.map(s => s.cumDelta)
    const minP = Math.min(...prices), maxP = Math.max(...prices)
    const pRange = maxP - minP || 1
    const minD = Math.min(...deltas), maxD = Math.max(...deltas)
    const dRange = maxD - minD || 1

    const toPY = (v) => 100 - ((v - minP) / pRange) * 80 - 10
    const toDY = (v) => 100 - ((v - minD) / dRange) * 80 - 10

    const pricePath = prices.map((p, i) => `${i === 0 ? 'M' : 'L'} ${((i / (prices.length - 1)) * 100).toFixed(1)} ${toPY(p).toFixed(1)}`).join(' ')
    const deltaPath = deltas.map((d, i) => `${i === 0 ? 'M' : 'L'} ${((i / (deltas.length - 1)) * 100).toFixed(1)} ${toDY(d).toFixed(1)}`).join(' ')

    const recentDivergences = divergences.slice(-3)
    const recentRsiDivergences = rsiDivergences.slice(-3)

    return {
      pricePath, deltaPath,
      divergences: recentDivergences,
      rsiDivergences: recentRsiDivergences,
      lastDelta: candleData[candleData.length - 1].delta,
      lastCumDelta: candleData[candleData.length - 1].cumDelta,
      lastPrice: candleData[candleData.length - 1].close,
    }
  }, [candles, fills, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Split size={12} className="text-accent-yellow" />
          Delta Divergence
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { pricePath, deltaPath, divergences, rsiDivergences, lastDelta, lastCumDelta, lastPrice } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Split size={12} className="text-accent-yellow" />
        Delta Divergence Detector
      </div>

      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Price</span>
          <div className="font-mono text-gray-300">{formatPrice(lastPrice)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Delta</span>
          <div className={'font-mono ' + (lastDelta >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {lastDelta >= 0 ? '+' : ''}{lastDelta.toFixed(0)}
          </div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Cum Δ</span>
          <div className={'font-mono ' + (lastCumDelta >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {lastCumDelta >= 0 ? '+' : ''}{lastCumDelta.toFixed(0)}
          </div>
        </div>
      </div>

      {/* Price vs Cumulative Delta chart */}
      <svg viewBox="0 0 100 100" className="w-full h-[45px]" preserveAspectRatio="none">
        <path d={pricePath} fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
        <path d={deltaPath} fill="none" stroke="#eab308" strokeWidth="1.2" strokeDasharray="1 1" />
      </svg>
      <div className="flex items-center justify-between mt-0.5 text-[7px]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-0.5 bg-gray-300" />
          <span className="text-gray-600">Price</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-0.5 bg-accent-yellow" style={{ borderTop: '1px dashed' }} />
          <span className="text-gray-600">Cum Delta</span>
        </div>
      </div>

      {/* Delta divergences */}
      <div className="mt-2">
        <div className="text-[8px] text-gray-600 mb-1">Delta Divergences:</div>
        {divergences.length === 0 ? (
          <div className="text-[8px] text-gray-700 italic">None detected</div>
        ) : (
          <div className="space-y-0.5">
            {divergences.map((d, i) => (
              <div key={i} className="flex items-center gap-1 text-[8px]">
                {d.type === 'bullish' ? <TrendingUp size={8} className="text-accent-green" /> : <TrendingDown size={8} className="text-accent-red" />}
                <span className={d.type === 'bullish' ? 'text-accent-green' : 'text-accent-red'}>{d.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RSI divergences */}
      <div className="mt-1.5">
        <div className="text-[8px] text-gray-600 mb-1">RSI Divergences:</div>
        {rsiDivergences.length === 0 ? (
          <div className="text-[8px] text-gray-700 italic">None detected</div>
        ) : (
          <div className="space-y-0.5">
            {rsiDivergences.map((d, i) => (
              <div key={i} className="flex items-center gap-1 text-[8px]">
                <AlertCircle size={8} className={d.type === 'bullish' ? 'text-accent-green' : 'text-accent-red'} />
                <span className={d.type === 'bullish' ? 'text-accent-green' : 'text-accent-red'}>{d.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Price/delta divergence = exhaustion. Bullish div = potential bottom, bearish = potential top.
      </div>
    </div>
  )
}
