import { useMemo } from 'react'
import { Layers3, TrendingUp, TrendingDown } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function ThreeLineBreak({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-200)
    if (symCandles.length < 10) return null

    const closes = symCandles.map(c => c.close)

    // Build Three-Line Break blocks
    const blocks = []
    let prevClose = closes[0]
    blocks.push({ open: closes[0], close: closes[1], dir: closes[1] > closes[0] ? 'up' : 'down', idx: 1 })

    for (let i = 2; i < closes.length; i++) {
      const price = closes[i]
      const lastBlock = blocks[blocks.length - 1]

      if (price > lastBlock.close) {
        // Check if we need to break 3 lines down (reversal up)
        const last3 = blocks.slice(-3)
        const canReverse = last3.length === 3 && last3.every(b => b.dir === 'down')
        if (lastBlock.dir === 'up' || canReverse || last3.length < 3) {
          blocks.push({ open: lastBlock.close, close: price, dir: 'up', idx: i })
        } else {
          // Extend current up block
          lastBlock.close = price
        }
      } else if (price < lastBlock.close) {
        const last3 = blocks.slice(-3)
        const canReverse = last3.length === 3 && last3.every(b => b.dir === 'up')
        if (lastBlock.dir === 'down' || canReverse || last3.length < 3) {
          blocks.push({ open: lastBlock.close, close: price, dir: 'down', idx: i })
        } else {
          lastBlock.close = price
        }
      }
    }

    if (blocks.length < 3) return null

    const visible = blocks.slice(-20)
    const allPrices = visible.flatMap(b => [b.open, b.close])
    const minP = Math.min(...allPrices)
    const maxP = Math.max(...allPrices)
    const range = maxP - minP || 1
    const blockW = 100 / visible.length
    const toY = (v) => 100 - ((v - minP) / range) * 90 - 5

    const renderedBlocks = visible.map((b, i) => {
      const x = i * blockW + blockW * 0.1
      const w = blockW * 0.8
      const y = toY(Math.max(b.open, b.close))
      const h = Math.abs(toY(b.open) - toY(b.close)) || 1
      return { x, y, w, h, isUp: b.dir === 'up' }
    })

    const lastBlock = visible[visible.length - 1]
    const prevBlock = visible[visible.length - 2]
    const reversal = prevBlock && lastBlock.dir !== prevBlock.dir

    // Count consecutive
    let streak = 0
    for (let i = visible.length - 1; i >= 0; i--) {
      if (visible[i].dir === lastBlock.dir) streak++
      else break
    }

    const upCount = visible.filter(b => b.dir === 'up').length
    const downCount = visible.length - upCount

    return { renderedBlocks, lastBlock, reversal, streak, upCount, downCount }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Layers3 size={12} className="text-accent-teal" />
          Three-Line Break
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { renderedBlocks, lastBlock, reversal, streak, upCount, downCount } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Layers3 size={12} className="text-accent-teal" />
        Three-Line Break
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">Trend</span>
          <div className={'text-[10px] font-medium ' + (lastBlock.dir === 'up' ? 'text-accent-green' : 'text-accent-red')}>
            {lastBlock.dir === 'up' ? 'Bullish' : 'Bearish'}
          </div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Streak</span>
          <div className="text-[10px] font-mono text-gray-300">{streak} blocks</div>
        </div>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-[55px]" preserveAspectRatio="none">
        {renderedBlocks.map((b, i) => (
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

      <div className="grid grid-cols-3 gap-1 mt-2 text-[8px]">
        <div className="flex justify-between">
          <span className="text-gray-600">Up</span>
          <span className="text-accent-green font-mono">{upCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Down</span>
          <span className="text-accent-red font-mono">{downCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Ratio</span>
          <span className="text-gray-400 font-mono">{((upCount / (upCount + downCount)) * 100).toFixed(0)}%</span>
        </div>
      </div>

      {reversal && (
        <div className="mt-1.5 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-0.5">
          <span className="text-[8px] text-accent-yellow">
            Reversal: trend flipped to {lastBlock.dir === 'up' ? 'Bullish' : 'Bearish'}
          </span>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Filters noise — only reverses when price breaks 3 consecutive opposite blocks.
      </div>
    </div>
  )
}
