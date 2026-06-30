import { useMemo } from 'react'
import { Package, TrendingUp, TrendingDown, Target } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function OrderBlocks({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-100)
    if (symCandles.length < 15) return null

    // Detect order blocks: last opposite-colored candle before a strong move
    const blocks = []
    for (let i = 3; i < symCandles.length - 1; i++) {
      const c = symCandles[i]
      const next = symCandles[i + 1]
      const isBull = c.close >= c.open
      const nextBull = next.close >= next.open
      const bodySize = Math.abs(c.close - c.open)
      const avgBody = symCandles.slice(Math.max(0, i - 10), i).reduce((s, x) => s + Math.abs(x.close - x.open), 0) / Math.min(10, i)

      // Bullish OB: last bearish candle before strong bullish move
      if (!isBull && nextBull) {
        const nextBody = Math.abs(next.close - next.open)
        if (nextBody > avgBody * 1.3) {
          blocks.push({
            type: 'bullish',
            high: c.high,
            low: c.low,
            open: c.open,
            close: c.close,
            idx: i,
            strength: nextBody / avgBody,
            mitigated: false,
          })
        }
      }

      // Bearish OB: last bullish candle before strong bearish move
      if (isBull && !nextBull) {
        const nextBody = Math.abs(next.close - next.open)
        if (nextBody > avgBody * 1.3) {
          blocks.push({
            type: 'bearish',
            high: c.high,
            low: c.low,
            open: c.open,
            close: c.close,
            idx: i,
            strength: nextBody / avgBody,
            mitigated: false,
          })
        }
      }
    }

    if (blocks.length === 0) return null

    // Check mitigation: price returned to block zone
    const lastPrice = symCandles[symCandles.length - 1].close
    for (const b of blocks) {
      if (b.type === 'bullish' && lastPrice >= b.low && lastPrice <= b.high) {
        b.mitigated = true
      }
      if (b.type === 'bearish' && lastPrice >= b.low && lastPrice <= b.high) {
        b.mitigated = true
      }
    }

    // Show last 6 blocks, most recent first
    const visible = blocks.slice(-6).reverse()
    const activeBull = blocks.filter(b => b.type === 'bullish' && !b.mitigated).slice(-2)
    const activeBear = blocks.filter(b => b.type === 'bearish' && !b.mitigated).slice(-2)

    // Zones for chart
    const chartBlocks = blocks.slice(-8)
    const allPrices = symCandles.slice(-30).flatMap(c => [c.high, c.low])
    const minP = Math.min(...allPrices)
    const maxP = Math.max(...allPrices)
    const range = maxP - minP || 1
    const toY = (v) => 100 - ((v - minP) / range) * 90 - 5

    const zones = chartBlocks.map(b => ({
      y1: toY(b.high),
      y2: toY(b.low),
      type: b.type,
      mitigated: b.mitigated,
    }))

    // Close price line
    const closeSlice = symCandles.slice(-30)
    const closePath = closeSlice.map((c, i) => {
      const x = (i / (closeSlice.length - 1)) * 100
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${toY(c.close).toFixed(1)}`
    }).join(' ')

    return { visible, activeBull, activeBear, zones, closePath, lastPrice }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Package size={12} className="text-accent-purple" />
          Order Blocks
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No blocks detected</div>
      </div>
    )
  }

  const { visible, activeBull, activeBear, zones, closePath, lastPrice } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Package size={12} className="text-accent-purple" />
        Order Block Detection
      </div>

      {/* Chart with zones */}
      <svg viewBox="0 0 100 100" className="w-full h-[50px]" preserveAspectRatio="none">
        {zones.map((z, i) => (
          <rect
            key={i}
            x="0"
            y={Math.min(z.y1, z.y2)}
            width="100"
            height={Math.abs(z.y2 - z.y1) || 1}
            fill={z.type === 'bullish' ? '#22c55e' : '#ef4444'}
            fillOpacity={z.mitigated ? 0.05 : 0.15}
            stroke={z.type === 'bullish' ? '#22c55e' : '#ef4444'}
            strokeWidth="0.2"
            strokeDasharray={z.mitigated ? '1 2' : ''}
            strokeOpacity="0.3"
          />
        ))}
        <path d={closePath} fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
      </svg>

      {/* Active zones */}
      <div className="mt-2 space-y-1">
        {activeBull.length > 0 && (
          <div className="bg-accent-green/5 border border-accent-green/15 rounded px-1.5 py-1">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingUp size={9} className="text-accent-green" />
              <span className="text-[8px] text-accent-green font-medium">Bullish OB (Demand)</span>
            </div>
            {activeBull.map((b, i) => (
              <div key={i} className="flex justify-between text-[8px] text-gray-400">
                <span className="font-mono">{formatPrice(b.low)} - {formatPrice(b.high)}</span>
                <span className="text-gray-600">str: {b.strength.toFixed(1)}x</span>
              </div>
            ))}
          </div>
        )}
        {activeBear.length > 0 && (
          <div className="bg-accent-red/5 border border-accent-red/15 rounded px-1.5 py-1">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingDown size={9} className="text-accent-red" />
              <span className="text-[8px] text-accent-red font-medium">Bearish OB (Supply)</span>
            </div>
            {activeBear.map((b, i) => (
              <div key={i} className="flex justify-between text-[8px] text-gray-400">
                <span className="font-mono">{formatPrice(b.low)} - {formatPrice(b.high)}</span>
                <span className="text-gray-600">str: {b.strength.toFixed(1)}x</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent blocks list */}
      <div className="mt-2 pt-1.5 border-t border-bg-600">
        <div className="text-[8px] text-gray-600 mb-1">Recent blocks:</div>
        <div className="space-y-0.5">
          {visible.slice(0, 4).map((b, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[8px]">
              {b.type === 'bullish' ? (
                <Target size={8} className="text-accent-green shrink-0" />
              ) : (
                <Target size={8} className="text-accent-red shrink-0" />
              )}
              <span className={'font-mono ' + (b.type === 'bullish' ? 'text-accent-green/70' : 'text-accent-red/70')}>
                {formatPrice(b.low)}-{formatPrice(b.high)}
              </span>
              {b.mitigated && <span className="text-gray-600">mitigated</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        OB = last opposite candle before strong move. Price likely to react at unmitigated zones.
      </div>
    </div>
  )
}
