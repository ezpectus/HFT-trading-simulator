import { useMemo, useState } from 'react'
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'

export default function VolumeClockChart({ candles, symbol, exchange }) {
  const [targetVolume, setTargetVolume] = useState(1000)

  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-100)
    if (symCandles.length < 5) return null

    // Build constant-volume bars: accumulate candles until target volume reached
    const bars = []
    let currentBar = { open: symCandles[0].open, high: symCandles[0].high, low: symCandles[0].low, close: symCandles[0].close, volume: 0, candleCount: 0 }

    for (const c of symCandles) {
      currentBar.volume += c.volume || 0
      currentBar.high = Math.max(currentBar.high, c.high)
      currentBar.low = Math.min(currentBar.low, c.low)
      currentBar.close = c.close
      currentBar.candleCount++

      if (currentBar.volume >= targetVolume) {
        bars.push({ ...currentBar })
        currentBar = { open: c.close, high: c.high, low: c.low, close: c.close, volume: 0, candleCount: 0 }
      }
    }
    if (currentBar.candleCount > 0 && currentBar.volume > 0) {
      bars.push({ ...currentBar })
    }

    if (bars.length < 3) return null

    const visible = bars.slice(-20)
    const allPrices = visible.flatMap(b => [b.high, b.low])
    const minP = Math.min(...allPrices)
    const maxP = Math.max(...allPrices)
    const range = maxP - minP || 1
    const barW = 100 / visible.length
    const toY = (v) => 100 - ((v - minP) / range) * 85 - 7.5

    const renderedBars = visible.map((b, i) => {
      const x = i * barW + barW * 0.15
      const w = barW * 0.7
      const isBull = b.close >= b.open
      const bodyY = toY(Math.max(b.open, b.close))
      const bodyH = Math.abs(toY(b.open) - toY(b.close)) || 0.5
      const wickX = x + w / 2
      const wickTop = toY(b.high)
      const wickBot = toY(b.low)
      return { x, y: bodyY, w, h: bodyH, isBull, wickX, wickTop, wickBot, candleCount: b.candleCount }
    })

    const upCount = visible.filter(b => b.close >= b.open).length
    const downCount = visible.length - upCount
    const lastBar = visible[visible.length - 1]
    const prevBar = visible[visible.length - 2]
    const reversal = prevBar && (lastBar.close >= lastBar.open) !== (prevBar.close >= prevBar.open)

    // Average candles per bar
    const avgCandles = visible.reduce((s, b) => s + b.candleCount, 0) / visible.length

    return { renderedBars, upCount, downCount, lastBar, reversal, avgCandles, barCount: bars.length }
  }, [candles, symbol, exchange, targetVolume])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <BarChart3 size={12} className="text-accent-orange" />
          Volume Clock
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough volume data</div>
      </div>
    )
  }

  const { renderedBars, upCount, downCount, lastBar, reversal, avgCandles, barCount } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <BarChart3 size={12} className="text-accent-orange" />
        Volume Clock Chart
      </div>

      {/* Volume target control */}
      <div className="flex items-center gap-2 mb-2 text-[8px]">
        <span className="text-gray-600">Vol/bar:</span>
        <input
          type="number"
          value={targetVolume}
          onChange={e => setTargetVolume(Number(e.target.value) || 1000)}
          className="w-20 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 font-mono outline-none focus:border-accent-blue"
        />
        <span className="text-gray-600">{barCount} bars</span>
      </div>

      {/* Chart */}
      <svg viewBox="0 0 100 100" className="w-full h-[50px]" preserveAspectRatio="none">
        {renderedBars.map((b, i) => (
          <g key={i}>
            <line x1={b.wickX} y1={b.wickTop} x2={b.wickX} y2={b.wickBot}
              stroke={b.isBull ? '#22c55e' : '#ef4444'} strokeWidth="0.4" />
            <rect x={b.x} y={b.y} width={b.w} height={b.h}
              fill={b.isBull ? '#22c55e' : '#ef4444'}
              fillOpacity="0.6"
              stroke={b.isBull ? '#22c55e' : '#ef4444'}
              strokeWidth="0.2" />
          </g>
        ))}
      </svg>

      <div className="grid grid-cols-3 gap-1 mt-2 text-[8px]">
        <div className="flex justify-between">
          <span className="text-gray-600">Bull</span>
          <span className="text-accent-green font-mono">{upCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Bear</span>
          <span className="text-accent-red font-mono">{downCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Avg Candles</span>
          <span className="text-gray-400 font-mono">{avgCandles.toFixed(1)}</span>
        </div>
      </div>

      {reversal && (
        <div className="mt-1.5 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-0.5">
          <span className="text-[8px] text-accent-yellow">
            Bar color reversal — momentum shift
          </span>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Each bar = {formatVolume(targetVolume)} volume. Removes time distortion — only volume matters.
      </div>
    </div>
  )
}
