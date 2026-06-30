import { useMemo, useState } from 'react'
import { Grid3x3, TrendingUp, TrendingDown } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function RenkoChart({ candles, symbol, exchange }) {
  const [brickSize, setBrickSize] = useState(0)

  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-200)
    if (symCandles.length < 5) return null

    const closes = symCandles.map(c => c.close)
    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)

    // Auto-calculate brick size if not set: use ATR / 2
    const atrPeriod = Math.min(14, symCandles.length - 1)
    let atr = 0
    for (let i = 1; i <= atrPeriod; i++) {
      atr += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
    }
    atr /= atrPeriod
    const autoBrick = atr / 2 || closes[0] * 0.001
    const size = brickSize > 0 ? brickSize : autoBrick

    // Build Renko bricks
    const bricks = []
    let lastBrickClose = closes[0]
    let direction = 0 // 1 = up, -1 = down

    for (let i = 1; i < closes.length; i++) {
      const diff = closes[i] - lastBrickClose
      const numBricks = Math.floor(Math.abs(diff) / size)

      for (let b = 0; b < numBricks; b++) {
        if (diff > 0) {
          const open = lastBrickClose
          const close = open + size
          bricks.push({ open, close, direction: 1, idx: bricks.length, candleIdx: i })
          lastBrickClose = close
          direction = 1
        } else {
          const open = lastBrickClose
          const close = open - size
          bricks.push({ open, close, direction: -1, idx: bricks.length, candleIdx: i })
          lastBrickClose = close
          direction = -1
        }
      }
    }

    if (bricks.length === 0) return null

    // Show last 30 bricks
    const visible = bricks.slice(-30)
    const allPrices = visible.flatMap(b => [b.open, b.close])
    const minP = Math.min(...allPrices)
    const maxP = Math.max(...allPrices)
    const range = maxP - minP || 1

    const brickW = 100 / visible.length
    const toY = (v) => 100 - ((v - minP) / range) * 90 - 5

    const svgBricks = visible.map((b, i) => {
      const x = i * brickW + brickW * 0.1
      const w = brickW * 0.8
      const y = toY(Math.max(b.open, b.close))
      const h = Math.abs(toY(b.open) - toY(b.close)) || 1
      const isUp = b.direction === 1
      return { x, y, w, h, isUp }
    })

    // Trend analysis
    const upCount = visible.filter(b => b.direction === 1).length
    const downCount = visible.length - upCount
    const lastBrick = visible[visible.length - 1]
    const prevBrick = visible[visible.length - 2]
    const reversal = prevBrick && lastBrick.direction !== prevBrick.direction

    // Support/Resistance from bricks
    const support = Math.min(...visible.map(b => b.open))
    const resistance = Math.max(...visible.map(b => b.close))

    return {
      bricks: svgBricks, size, upCount, downCount,
      lastBrick, reversal, support, resistance,
      autoBrick,
    }
  }, [candles, symbol, exchange, brickSize])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Grid3x3 size={12} className="text-accent-orange" />
          Renko Chart
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { bricks, size, upCount, downCount, lastBrick, reversal, support, resistance, autoBrick } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Grid3x3 size={12} className="text-accent-orange" />
        Renko Chart
      </div>

      {/* Brick size control */}
      <div className="flex items-center gap-2 mb-2 text-[8px]">
        <span className="text-gray-600">Brick:</span>
        <input
          type="number"
          value={brickSize || ''}
          placeholder={autoBrick.toFixed(2)}
          onChange={e => setBrickSize(Number(e.target.value) || 0)}
          className="w-16 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 font-mono outline-none focus:border-accent-blue"
        />
        <span className="text-gray-600">auto: {autoBrick.toFixed(2)}</span>
      </div>

      {/* Renko bricks */}
      <svg viewBox="0 0 100 100" className="w-full h-[60px]" preserveAspectRatio="none">
        {bricks.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill={b.isUp ? '#22c55e' : '#ef4444'}
            fillOpacity="0.6"
            stroke={b.isUp ? '#22c55e' : '#ef4444'}
            strokeWidth="0.3"
          />
        ))}
      </svg>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1 mt-2 text-[9px]">
        <div className="flex items-center gap-0.5">
          <TrendingUp size={8} className="text-accent-green" />
          <span className="text-gray-400">{upCount}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <TrendingDown size={8} className="text-accent-red" />
          <span className="text-gray-400">{downCount}</span>
        </div>
        <div className="text-right text-gray-500">
          Ratio: {(upCount / (upCount + downCount) * 100).toFixed(0)}%
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 mt-1 text-[8px]">
        <div className="flex justify-between">
          <span className="text-gray-600">Support</span>
          <span className="font-mono text-accent-green">{formatPrice(support)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Resistance</span>
          <span className="font-mono text-accent-red">{formatPrice(resistance)}</span>
        </div>
      </div>

      {reversal && (
        <div className="mt-1.5 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-0.5">
          <span className="text-[8px] text-accent-yellow">
            Reversal detected: {lastBrick.isUp ? 'Bullish' : 'Bearish'} brick after opposite trend
          </span>
        </div>
      )}

      <div className="mt-1.5 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Renko filters noise — only price moves ≥ brick size create bricks.
      </div>
    </div>
  )
}
