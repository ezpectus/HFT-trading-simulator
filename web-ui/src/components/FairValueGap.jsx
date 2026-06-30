import { useMemo } from 'react'
import { Zap, TrendingUp, TrendingDown } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function FairValueGap({ candles, symbol, exchange }) {
  const gaps = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)

    if (symCandles.length < 3) return null

    const found = []
    for (let i = 2; i < symCandles.length; i++) {
      const c1 = symCandles[i - 2]
      const c2 = symCandles[i - 1]
      const c3 = symCandles[i]

      // Bullish FVG: c1.high < c3.low (gap up)
      if (c1.high < c3.low) {
        const gapLow = c1.high
        const gapHigh = c3.low
        const gapSize = gapHigh - gapLow
        const gapSizePct = gapLow > 0 ? (gapSize / gapLow) * 100 : 0

        // Check if gap is filled (any subsequent candle trades through it)
        let filled = false
        let fillTime = null
        for (let j = i + 1; j < symCandles.length; j++) {
          if (symCandles[j].low <= gapHigh && symCandles[j].high >= gapLow) {
            filled = true
            fillTime = symCandles[j].time
            break
          }
        }

        found.push({
          type: 'bullish',
          gapLow,
          gapHigh,
          gapSize,
          gapSizePct,
          time: c2.time,
          filled,
          fillTime,
          age: symCandles.length - i,
        })
      }

      // Bearish FVG: c1.low > c3.high (gap down)
      if (c1.low > c3.high) {
        const gapLow = c3.high
        const gapHigh = c1.low
        const gapSize = gapHigh - gapLow
        const gapSizePct = gapLow > 0 ? (gapSize / gapLow) * 100 : 0

        let filled = false
        let fillTime = null
        for (let j = i + 1; j < symCandles.length; j++) {
          if (symCandles[j].low <= gapHigh && symCandles[j].high >= gapLow) {
            filled = true
            fillTime = symCandles[j].time
            break
          }
        }

        found.push({
          type: 'bearish',
          gapLow,
          gapHigh,
          gapSize,
          gapSizePct,
          time: c2.time,
          filled,
          fillTime,
          age: symCandles.length - i,
        })
      }
    }

    // Sort by age (most recent first) and take unfilled first
    found.sort((a, b) => {
      if (a.filled !== b.filled) return a.filled ? 1 : -1
      return a.age - b.age
    })

    return found.slice(0, 8)
  }, [candles, symbol, exchange])

  if (!gaps) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Zap size={12} className="text-accent-yellow" />
          Fair Value Gaps
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const unfilled = gaps.filter(g => !g.filled)
  const filled = gaps.filter(g => g.filled)

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Zap size={12} className="text-accent-yellow" />
        Fair Value Gaps
        <span className="text-gray-600 ml-auto">{unfilled.length} unfilled</span>
      </div>

      {gaps.length === 0 ? (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No FVGs detected</div>
      ) : (
        <>
          {/* Unfilled gaps */}
          {unfilled.length > 0 && (
            <div className="mb-2">
              <div className="text-[8px] text-accent-yellow uppercase mb-1">Unfilled (magnet zones)</div>
              <div className="space-y-0.5">
                {unfilled.map((g, i) => (
                  <GapRow key={i} gap={g} />
                ))}
              </div>
            </div>
          )}

          {/* Filled gaps */}
          {filled.length > 0 && (
            <div>
              <div className="text-[8px] text-gray-600 uppercase mb-1">Filled</div>
              <div className="space-y-0.5">
                {filled.slice(0, 4).map((g, i) => (
                  <GapRow key={i} gap={g} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-2 pt-1.5 border-t border-bg-600 text-[8px] text-gray-600">
        FVG = 3-candle imbalance where wick 1 and wick 3 don't overlap. Unfilled gaps act as magnet zones.
      </div>
    </div>
  )
}

function GapRow({ gap }) {
  const isBull = gap.type === 'bullish'
  return (
    <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-bg-600/50 text-[9px]">
      <span className={isBull ? 'text-accent-green' : 'text-accent-red'}>
        {isBull ? <TrendingUp size={9} className="inline" /> : <TrendingDown size={9} className="inline" />}
      </span>
      <span className="text-gray-400 font-mono">${formatPrice(gap.gapLow)}–${formatPrice(gap.gapHigh)}</span>
      <span className="text-gray-600">{gap.gapSizePct.toFixed(2)}%</span>
      <span className="ml-auto">
        {gap.filled ? (
          <span className="text-gray-600">filled</span>
        ) : (
          <span className="text-accent-yellow">{gap.age}p ago</span>
        )}
      </span>
    </div>
  )
}
