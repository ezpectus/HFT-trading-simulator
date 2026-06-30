import { useMemo } from 'react'
import { BarChart3, Info } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function MarketProfile({ candles, symbol, exchange }) {
  const profile = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-30)

    if (symCandles.length < 5) return null

    // Determine price range
    const allPrices = symCandles.flatMap(c => [c.high, c.low])
    const minPrice = Math.min(...allPrices)
    const maxPrice = Math.max(...allPrices)
    const range = maxPrice - minPrice || 1

    // Create price levels (rows)
    const ROWS = 20
    const rowSize = range / ROWS
    const levels = []
    for (let i = 0; i < ROWS; i++) {
      levels.push({
        low: minPrice + i * rowSize,
        high: minPrice + (i + 1) * rowSize,
        mid: minPrice + (i + 0.5) * rowSize,
        tpos: [],
      })
    }

    // Assign each candle's range to TPO letters
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    for (let ci = 0; ci < symCandles.length; ci++) {
      const c = symCandles[ci]
      const letter = letters[ci % letters.length]
      for (const lvl of levels) {
        // Candle overlaps this level if its range intersects
        if (c.high >= lvl.low && c.low <= lvl.high) {
          lvl.tpos.push(letter)
        }
      }
    }

    // Calculate volume per level (using candle body overlap approximation)
    for (const lvl of levels) {
      let vol = 0
      for (const c of symCandles) {
        if (c.high >= lvl.low && c.low <= lvl.high) {
          const overlap = Math.min(c.high, lvl.high) - Math.max(c.low, lvl.low)
          const candleRange = c.high - c.low || 1
          vol += (c.volume || 0) * (overlap / candleRange)
        }
      }
      lvl.volume = vol
    }

    // Find POC (Point of Control) — level with most TPOs
    let pocLevel = levels[0]
    for (const lvl of levels) {
      if (lvl.tpos.length > pocLevel.tpos.length) pocLevel = lvl
    }

    // Value Area: 70% of TPOs around POC
    const totalTpos = levels.reduce((s, l) => s + l.tpos.length, 0)
    const targetTpos = totalTpos * 0.7
    let vaHigh = pocLevel, vaLow = pocLevel
    let accumulated = pocLevel.tpos.length
    let pocIdx = levels.indexOf(pocLevel)

    for (let step = 1; accumulated < targetTpos && step < ROWS; step++) {
      const upIdx = pocIdx + step
      const downIdx = pocIdx - step
      const upTpos = upIdx < ROWS ? levels[upIdx].tpos.length : 0
      const downTpos = downIdx >= 0 ? levels[downIdx].tpos.length : 0

      if (upTpos >= downTpos && upIdx < ROWS) {
        vaHigh = levels[upIdx]
        accumulated += upTpos
      } else if (downIdx >= 0) {
        vaLow = levels[downIdx]
        accumulated += downTpos
      } else if (upIdx < ROWS) {
        vaHigh = levels[upIdx]
        accumulated += upTpos
      }
    }

    // Volume profile max for scaling
    const maxVol = Math.max(...levels.map(l => l.volume), 0.001)

    // Current price
    const currentPrice = symCandles[symCandles.length - 1].close

    return {
      levels: levels.reverse(), // high to low for display
      pocLevel,
      vaHigh,
      vaLow,
      maxVol,
      currentPrice,
      totalTpos,
    }
  }, [candles, symbol, exchange])

  if (!profile) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <BarChart3 size={12} className="text-accent-orange" />
          Market Profile (TPO)
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { levels, pocLevel, vaHigh, vaLow, maxVol, currentPrice, totalTpos } = profile

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <BarChart3 size={12} className="text-accent-orange" />
        Market Profile (TPO)
      </div>

      {/* TPO Grid */}
      <div className="flex gap-1">
        {/* Price axis + TPO letters */}
        <div className="flex-1 space-y-0">
          {levels.map((lvl, i) => {
            const isPOC = lvl === pocLevel
            const inVA = lvl.mid >= vaLow.low && lvl.mid <= vaHigh.high
            const nearPrice = Math.abs(lvl.mid - currentPrice) < (lvl.high - lvl.low)
            return (
              <div
                key={i}
                className={
                  'flex items-center gap-0.5 h-[10px] text-[7px] font-mono ' +
                  (isPOC ? 'bg-accent-yellow/20' : inVA ? 'bg-bg-600/30' : '')
                }
              >
                <span className="text-gray-600 w-10 text-right">{formatPrice(lvl.mid, 0)}</span>
                <span className="flex-1 text-gray-400 tracking-tight overflow-hidden">
                  {lvl.tpos.join('')}
                </span>
                {isPOC && <span className="text-accent-yellow text-[6px]">POC</span>}
                {nearPrice && <span className="text-accent-green text-[6px]">◄</span>}
              </div>
            )
          })}
        </div>

        {/* Volume profile (horizontal bars) */}
        <div className="w-16 space-y-0">
          {levels.map((lvl, i) => {
            const isPOC = lvl === pocLevel
            const inVA = lvl.mid >= vaLow.low && lvl.mid <= vaHigh.high
            const widthPct = (lvl.volume / maxVol) * 100
            return (
              <div key={i} className={'flex items-center h-[10px] ' + (isPOC ? 'bg-accent-yellow/10' : inVA ? 'bg-bg-600/20' : '')}>
                <div
                  className={'h-1.5 rounded-sm ' + (isPOC ? 'bg-accent-yellow' : inVA ? 'bg-accent-blue/60' : 'bg-gray-600')}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Value area & POC stats */}
      <div className="grid grid-cols-3 gap-2 mt-2 pt-1.5 border-t border-bg-600 text-[8px]">
        <div>
          <span className="text-gray-600">VA High</span>
          <div className="text-accent-blue font-mono">${formatPrice(vaHigh.high, 0)}</div>
        </div>
        <div>
          <span className="text-gray-600">POC</span>
          <div className="text-accent-yellow font-mono font-bold">${formatPrice(pocLevel.mid, 0)}</div>
        </div>
        <div>
          <span className="text-gray-600">VA Low</span>
          <div className="text-accent-blue font-mono">${formatPrice(vaLow.low, 0)}</div>
        </div>
      </div>

      <div className="mt-1.5 flex items-start gap-1 text-[8px] text-gray-600">
        <Info size={9} className="shrink-0 mt-0.5" />
        <span>TPO = time at price. POC = most traded level. VA = 70% of activity around POC. Yellow = POC, blue tint = value area.</span>
      </div>
    </div>
  )
}
