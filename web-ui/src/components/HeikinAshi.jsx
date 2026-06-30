import { useMemo, useState } from 'react'
import { Flame, TrendingUp, TrendingDown } from 'lucide-react'
import { toHeikinAshi } from '../utils/indicators'
import { formatPrice } from '../utils/format'

export default function HeikinAshi({ candles, symbol, exchange }) {
  const [showCount, setShowCount] = useState(30)

  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-showCount)
    if (symCandles.length < 3) return null

    const ha = toHeikinAshi(symCandles)
    if (ha.length < 3) return null

    // Trend analysis
    let bullCount = 0, bearCount = 0
    let consecutiveBull = 0, consecutiveBear = 0
    let maxBull = 0, maxBear = 0

    for (const c of ha) {
      if (c.close > c.open) {
        bullCount++
        consecutiveBull++
        consecutiveBear = 0
        maxBull = Math.max(maxBull, consecutiveBull)
      } else {
        bearCount++
        consecutiveBear++
        consecutiveBull = 0
        maxBear = Math.max(maxBear, consecutiveBear)
      }
    }

    const last = ha[ha.length - 1]
    const prev = ha[ha.length - 2]
    const isBull = last.close > last.open
    const reversal = prev && (last.close > last.open) !== (prev.close > prev.open)

    // Doji detection (small body)
    const body = Math.abs(last.close - last.open)
    const range = last.high - last.low || 1
    const isDoji = body / range < 0.1

    // Chart rendering
    const allPrices = ha.flatMap(c => [c.high, c.low])
    const minP = Math.min(...allPrices)
    const maxP = Math.max(...allPrices)
    const chartRange = maxP - minP || 1
    const candleW = 100 / ha.length
    const toY = (v) => 100 - ((v - minP) / chartRange) * 90 - 5

    const renderedCandles = ha.map((c, i) => {
      const x = i * candleW + candleW * 0.15
      const w = candleW * 0.7
      const isGreen = c.close > c.open
      const bodyY = toY(Math.max(c.open, c.close))
      const bodyH = Math.abs(toY(c.open) - toY(c.close)) || 0.5
      const wickX = x + w / 2
      const wickTop = toY(c.high)
      const wickBot = toY(c.low)
      return { x, y: bodyY, w, h: bodyH, isGreen, wickX, wickTop, wickBot }
    })

    return {
      last, prev, isBull, reversal, isDoji,
      bullCount, bearCount, maxBull, maxBear,
      renderedCandles,
    }
  }, [candles, symbol, exchange, showCount])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Flame size={12} className="text-accent-orange" />
          Heikin-Ashi
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { last, isBull, reversal, isDoji, bullCount, bearCount, maxBull, maxBear, renderedCandles } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Flame size={12} className="text-accent-orange" />
        Heikin-Ashi Chart
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-2">
          <span className={'text-[10px] font-medium ' + (isBull ? 'text-accent-green' : 'text-accent-red')}>
            {isBull ? 'Bullish' : 'Bearish'}
          </span>
          {isDoji && <span className="text-[10px] text-accent-yellow">Doji</span>}
        </div>
        <select
          value={showCount}
          onChange={e => setShowCount(Number(e.target.value))}
          className="bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[8px] text-gray-300 outline-none"
        >
          <option value={20}>20</option>
          <option value={30}>30</option>
          <option value={50}>50</option>
        </select>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-[60px]" preserveAspectRatio="none">
        {renderedCandles.map((c, i) => (
          <g key={i}>
            <line x1={c.wickX} y1={c.wickTop} x2={c.wickX} y2={c.wickBot}
              stroke={c.isGreen ? '#22c55e' : '#ef4444'} strokeWidth="0.4" />
            <rect x={c.x} y={c.y} width={c.w} height={c.h}
              fill={c.isGreen ? '#22c55e' : '#ef4444'}
              fillOpacity="0.7"
              stroke={c.isGreen ? '#22c55e' : '#ef4444'}
              strokeWidth="0.2" />
          </g>
        ))}
      </svg>

      <div className="grid grid-cols-4 gap-1 mt-2 text-[8px]">
        <div className="flex justify-between">
          <span className="text-gray-600">Bull</span>
          <span className="text-accent-green font-mono">{bullCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Bear</span>
          <span className="text-accent-red font-mono">{bearCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Max B</span>
          <span className="text-accent-green font-mono">{maxBull}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Max S</span>
          <span className="text-accent-red font-mono">{maxBear}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 mt-1 text-[8px]">
        <div className="flex justify-between">
          <span className="text-gray-600">HA Open</span>
          <span className="font-mono text-gray-400">{formatPrice(last.open)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">HA Close</span>
          <span className="font-mono text-gray-400">{formatPrice(last.close)}</span>
        </div>
      </div>

      {reversal && (
        <div className="mt-1.5 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-0.5">
          <span className="text-[8px] text-accent-yellow">
            Candle color change — potential reversal
          </span>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Smoothed candles. Consecutive green = uptrend, red = downtrend. Small body + wick = indecision.
      </div>
    </div>
  )
}
