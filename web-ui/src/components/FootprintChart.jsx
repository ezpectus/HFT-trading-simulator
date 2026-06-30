import { useMemo } from 'react'
import { Grid3x3, TrendingUp, TrendingDown } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'

export default function FootprintChart({ candles, fills, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-15)
    if (symCandles.length < 5) return null

    // Get fills for each candle period
    const symFills = (fills || [])
      .filter(f => f.symbol === symbol && f.exchange === exchange && f.status === 'FILLED')
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    // Build footprint for each candle: volume at each price level
    const footprints = symCandles.map(c => {
      const range = c.high - c.low
      const numLevels = Math.min(8, Math.max(3, Math.floor(range / (c.close * 0.001))))
      const levelSize = range / numLevels

      const levels = []
      for (let i = 0; i < numLevels; i++) {
        const levelLow = c.low + i * levelSize
        const levelHigh = levelLow + levelSize
        const levelMid = (levelLow + levelHigh) / 2

        // Estimate buy/sell volume at this level
        // Simplified: fills near this price level contribute
        let buyVol = 0, sellVol = 0
        const candleTime = c.time || c.timestamp || 0
        const candleEnd = candleTime + 300 // 5min candle

        for (const f of symFills) {
          const fTime = f.timestamp || 0
          if (fTime >= candleTime && fTime <= candleEnd) {
            const fPrice = f.filled_price || f.price || 0
            if (fPrice >= levelLow && fPrice < levelHigh) {
              if (f.side === 'BUY') buyVol += f.filled_quantity || f.quantity || 0
              else sellVol += f.filled_quantity || f.quantity || 0
            }
          }
        }

        // If no fills at this level, estimate from candle data
        if (buyVol === 0 && sellVol === 0) {
          const isUpperHalf = levelMid > (c.low + c.high) / 2
          const estVol = (c.volume || 0) / numLevels
          if (c.close >= c.open) {
            buyVol = isUpperHalf ? estVol * 0.6 : estVol * 0.4
            sellVol = estVol - buyVol
          } else {
            sellVol = isUpperHalf ? estVol * 0.6 : estVol * 0.4
            buyVol = estVol - sellVol
          }
        }

        levels.push({
          levelLow, levelHigh, levelMid,
          buyVol, sellVol,
          total: buyVol + sellVol,
          delta: buyVol - sellVol,
        })
      }

      const totalBuy = levels.reduce((s, l) => s + l.buyVol, 0)
      const totalSell = levels.reduce((s, l) => s + l.sellVol, 0)
      const delta = totalBuy - totalSell
      const isBull = c.close >= c.open

      return { candle: c, levels, totalBuy, totalSell, delta, isBull }
    })

    // Show last 6 footprints
    const visible = footprints.slice(-6)
    const maxLevelVol = Math.max(...visible.flatMap(f => f.levels.map(l => l.total)), 1)

    // Delta divergence: price up but delta negative (or vice versa)
    const divergences = []
    for (let i = 1; i < footprints.length; i++) {
      const prev = footprints[i - 1]
      const curr = footprints[i]
      const priceUp = curr.candle.close > prev.candle.close
      const deltaUp = curr.delta > prev.delta
      if (priceUp && curr.delta < 0) {
        divergences.push({ idx: i, type: 'bearish', desc: 'Price up, delta negative' })
      } else if (!priceUp && curr.delta > 0) {
        divergences.push({ idx: i, type: 'bullish', desc: 'Price down, delta positive' })
      }
    }

    const lastDivergence = divergences.length > 0 ? divergences[divergences.length - 1] : null

    return { visible, maxLevelVol, divergences, lastDivergence, footprints }
  }, [candles, fills, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Grid3x3 size={12} className="text-accent-orange" />
          Footprint Chart
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { visible, maxLevelVol, lastDivergence, footprints } = data
  const lastFootprint = footprints[footprints.length - 1]

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Grid3x3 size={12} className="text-accent-orange" />
        Footprint Chart
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Buy Vol</span>
          <div className="font-mono text-accent-green">{formatVolume(lastFootprint.totalBuy)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Sell Vol</span>
          <div className="font-mono text-accent-red">{formatVolume(lastFootprint.totalSell)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Delta</span>
          <div className={'font-mono ' + (lastFootprint.delta >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {lastFootprint.delta >= 0 ? '+' : ''}{formatVolume(Math.abs(lastFootprint.delta))}
          </div>
        </div>
      </div>

      {/* Footprint columns */}
      <div className="flex gap-1 overflow-x-auto scrollbar-thin pb-1">
        {visible.map((fp, i) => (
          <div key={i} className="shrink-0 w-[55px]">
            {/* Candle header */}
            <div className={'text-center text-[7px] font-mono mb-0.5 ' + (fp.isBull ? 'text-accent-green' : 'text-accent-red')}>
              {formatPrice(fp.candle.close)}
            </div>
            {/* Price levels */}
            <div className="space-y-px">
              {fp.levels.slice().reverse().map((level, j) => {
                const buyPct = level.total > 0 ? (level.buyVol / level.total) * 100 : 50
                const sellPct = 100 - buyPct
                return (
                  <div key={j} className="text-[6px] font-mono leading-tight">
                    <div className="flex h-[10px] bg-bg-800 rounded-sm overflow-hidden">
                      <div className="bg-accent-green/30 flex items-center justify-center" style={{ width: `${buyPct}%` }}>
                        {level.buyVol > maxLevelVol * 0.15 && <span className="text-accent-green">{level.buyVol.toFixed(0)}</span>}
                      </div>
                      <div className="bg-accent-red/30 flex items-center justify-center" style={{ width: `${sellPct}%` }}>
                        {level.sellVol > maxLevelVol * 0.15 && <span className="text-accent-red">{level.sellVol.toFixed(0)}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Delta footer */}
            <div className={'text-center text-[7px] font-mono mt-0.5 ' + (fp.delta >= 0 ? 'text-accent-green' : 'text-accent-red')}>
              Δ{fp.delta >= 0 ? '+' : ''}{fp.delta.toFixed(0)}
            </div>
          </div>
        ))}
      </div>

      {/* Divergence */}
      {lastDivergence && (
        <div className="mt-2 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-1 flex items-center gap-1">
          {lastDivergence.type === 'bullish' ? (
            <TrendingUp size={9} className="text-accent-green shrink-0" />
          ) : (
            <TrendingDown size={9} className="text-accent-red shrink-0" />
          )}
          <span className={'text-[8px] ' + (lastDivergence.type === 'bullish' ? 'text-accent-green' : 'text-accent-red')}>
            Delta divergence: {lastDivergence.desc}
          </span>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Volume at price inside each candle. Green=buy, Red=sell. Watch for delta divergence.
      </div>
    </div>
  )
}
