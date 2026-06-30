import { useMemo } from 'react'
import { Navigation, TrendingUp, TrendingDown } from 'lucide-react'
import { calcParabolicSAR } from '../utils/indicators'
import { formatPrice } from '../utils/format'

export default function ParabolicSAR({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 5) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const sar = calcParabolicSAR(highs, lows, 0.02, 0.2)

    const validSar = sar.filter(v => !isNaN(v))
    if (validSar.length === 0) return null

    const lastSar = validSar[validSar.length - 1]
    const price = closes[closes.length - 1]
    const isBull = price > lastSar
    const prevSar = validSar[validSar.length - 2] || lastSar
    const prevPrice = closes[closes.length - 2] || price
    const wasBull = prevPrice > prevSar
    const reversal = isBull !== wasBull

    // Count consecutive same-direction dots
    let streak = 0
    for (let i = validSar.length - 1; i >= 0; i--) {
      const idx = sar.lastIndexOf(validSar[i])
      const p = closes[idx]
      if ((isBull && p > validSar[i]) || (!isBull && p < validSar[i])) streak++
      else break
    }

    // Chart: show last 30 candles with SAR dots
    const sliceLen = Math.min(30, symCandles.length)
    const startIdx = symCandles.length - sliceLen
    const allPrices = [
      ...highs.slice(startIdx),
      ...lows.slice(startIdx),
      ...sar.slice(startIdx).filter(v => !isNaN(v)),
    ]
    const minP = Math.min(...allPrices)
    const maxP = Math.max(...allPrices)
    const range = maxP - minP || 1
    const toY = (v) => 100 - ((v - minP) / range) * 90 - 5

    const closePath = closes.slice(startIdx).map((v, i) => {
      const x = (i / (sliceLen - 1)) * 100
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${toY(v).toFixed(1)}`
    }).join(' ')

    const sarDots = []
    for (let i = startIdx; i < sar.length; i++) {
      if (!isNaN(sar[i])) {
        const x = ((i - startIdx) / (sliceLen - 1)) * 100
        const y = toY(sar[i])
        const dotIsBull = closes[i] > sar[i]
        sarDots.push({ x, y, isBull: dotIsBull })
      }
    }

    return { lastSar, price, isBull, reversal, streak, closePath, sarDots }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Navigation size={12} className="text-accent-purple" />
          Parabolic SAR
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { lastSar, price, isBull, reversal, streak, closePath, sarDots } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Navigation size={12} className="text-accent-purple" />
        Parabolic SAR
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">SAR Value</span>
          <div className="text-sm font-mono font-bold text-gray-200">{formatPrice(lastSar)}</div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Trend</span>
          <div className={'text-[10px] font-medium ' + (isBull ? 'text-accent-green' : 'text-accent-red')}>
            {isBull ? 'Bullish' : 'Bearish'}
          </div>
        </div>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-[50px]" preserveAspectRatio="none">
        <path d={closePath} fill="none" stroke="#e2e8f0" strokeWidth="1" />
        {sarDots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r="0.8"
            fill={d.isBull ? '#22c55e' : '#ef4444'}
          />
        ))}
      </svg>

      <div className="grid grid-cols-2 gap-1 mt-2 text-[9px]">
        <div className="flex justify-between">
          <span className="text-gray-600">Price</span>
          <span className="font-mono text-gray-300">{formatPrice(price)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Streak</span>
          <span className="font-mono text-gray-400">{streak} dots</span>
        </div>
      </div>

      {reversal && (
        <div className="mt-1.5 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-0.5">
          <span className="text-[8px] text-accent-yellow">
            Reversal detected: trend flipped to {isBull ? 'Bullish' : 'Bearish'}
          </span>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        SAR dots below price = uptrend. Above = downtrend. Flip = reversal signal.
      </div>
    </div>
  )
}
