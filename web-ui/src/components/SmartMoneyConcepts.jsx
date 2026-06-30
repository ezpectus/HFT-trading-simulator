import { useMemo } from 'react'
import { Brain, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function SmartMoneyConcepts({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 15) return null

    // Find swing highs and lows (pivots)
    const pivots = []
    for (let i = 2; i < symCandles.length - 2; i++) {
      const c = symCandles[i]
      const isSwingHigh = c.high > symCandles[i - 1].high && c.high > symCandles[i - 2].high &&
                          c.high > symCandles[i + 1].high && c.high > symCandles[i + 2].high
      const isSwingLow = c.low < symCandles[i - 1].low && c.low < symCandles[i - 2].low &&
                         c.low < symCandles[i + 1].low && c.low < symCandles[i + 2].low
      if (isSwingHigh) pivots.push({ idx: i, type: 'high', price: c.high, time: c.time })
      if (isSwingLow) pivots.push({ idx: i, type: 'low', price: c.low, time: c.time })
    }
    pivots.sort((a, b) => a.idx - b.idx)

    if (pivots.length < 2) return null

    // Detect Break of Structure (BOS) and Change of Character (CHoCH)
    const structures = []
    let lastHigh = null, lastLow = null
    let trend = 'ranging' // 'bullish', 'bearish', 'ranging'

    for (let i = 0; i < pivots.length; i++) {
      const p = pivots[i]
      if (p.type === 'high') {
        if (lastHigh) {
          if (p.price > lastHigh.price) {
            // Higher high
            if (trend === 'bearish') {
              structures.push({ idx: p.idx, type: 'CHoCH', direction: 'bullish', price: p.price, desc: 'CHoCH: Bearish→Bullish reversal' })
              trend = 'bullish'
            } else {
              structures.push({ idx: p.idx, type: 'BOS', direction: 'bullish', price: p.price, desc: 'BOS: Bullish continuation' })
              trend = 'bullish'
            }
          }
        }
        lastHigh = p
      } else {
        if (lastLow) {
          if (p.price < lastLow.price) {
            // Lower low
            if (trend === 'bullish') {
              structures.push({ idx: p.idx, type: 'CHoCH', direction: 'bearish', price: p.price, desc: 'CHoCH: Bullish→Bearish reversal' })
              trend = 'bearish'
            } else {
              structures.push({ idx: p.idx, type: 'BOS', direction: 'bearish', price: p.price, desc: 'BOS: Bearish continuation' })
              trend = 'bearish'
            }
          }
        }
        lastLow = p
      }
    }

    // Order blocks: last opposite candle before a strong move
    const orderBlocks = []
    for (let i = 5; i < symCandles.length - 1; i++) {
      const c = symCandles[i]
      const next = symCandles[i + 1]
      const moveSize = Math.abs(next.close - c.close) / c.close * 100
      const avgMove = symCandles.slice(Math.max(0, i - 10), i).reduce((s, x) => s + Math.abs(x.close - x.open) / x.close * 100, 0) / Math.min(10, i)

      if (moveSize > avgMove * 2) {
        // Strong move — find the last opposite candle
        const isBullMove = next.close > c.close
        for (let j = i; j >= Math.max(0, i - 3); j--) {
          const prev = symCandles[j]
          const isOpposite = isBullMove ? prev.close < prev.open : prev.close > prev.open
          if (isOpposite) {
            orderBlocks.push({
              idx: j,
              type: isBullMove ? 'bullish' : 'bearish',
              high: prev.high,
              low: prev.low,
              moveSize,
              mitigated: false,
            })
            break
          }
        }
      }
    }

    // Check mitigation (price returned to OB)
    const lastPrice = symCandles[symCandles.length - 1].close
    for (const ob of orderBlocks) {
      if (ob.type === 'bullish' && lastPrice >= ob.low && lastPrice <= ob.high) {
        ob.mitigated = true
      } else if (ob.type === 'bearish' && lastPrice >= ob.low && lastPrice <= ob.high) {
        ob.mitigated = true
      }
    }

    // Fair Value Gaps (imbalance)
    const fvgs = []
    for (let i = 2; i < symCandles.length; i++) {
      const a = symCandles[i - 2]
      const c = symCandles[i]
      // Bullish FVG: gap between a.high and c.low
      if (c.low > a.high) {
        fvgs.push({ idx: i, type: 'bullish', low: a.high, high: c.low, filled: false })
      }
      // Bearish FVG: gap between a.low and c.high
      if (c.high < a.low) {
        fvgs.push({ idx: i, type: 'bearish', low: c.high, high: a.low, filled: false })
      }
    }
    // Check fill
    for (const fvg of fvgs) {
      for (let j = fvg.idx; j < symCandles.length; j++) {
        if (fvg.type === 'bullish' && symCandles[j].low <= fvg.low) { fvg.filled = true; break }
        if (fvg.type === 'bearish' && symCandles[j].high >= fvg.high) { fvg.filled = true; break }
      }
    }

    // Current structure
    const recentStructures = structures.slice(-3)
    const lastStructure = structures[structures.length - 1]
    const currentTrend = trend

    // Unmitigated OBs (tradeable)
    const activeOBs = orderBlocks.filter(ob => !ob.mitigated).slice(-3)
    const activeFVGs = fvgs.filter(f => !f.filled).slice(-3)

    // Chart: price with structure markers
    const slice = symCandles.slice(-30)
    const prices = slice.map(c => c.close)
    const minP = Math.min(...slice.map(c => c.low))
    const maxP = Math.max(...slice.map(c => c.high))
    const range = maxP - minP || 1
    const toY = (v) => 100 - ((v - minP) / range) * 80 - 10

    const candleBars = slice.map((c, i) => {
      const x = (i / slice.length) * 100
      const w = 100 / slice.length * 0.7
      const isBull = c.close >= c.open
      return {
        x: x + (100 / slice.length) * 0.15,
        w,
        bodyY: toY(Math.max(c.open, c.close)),
        bodyH: Math.abs(toY(c.open) - toY(c.close)) || 0.5,
        wickTop: toY(c.high),
        wickBot: toY(c.low),
        isBull,
      }
    })

    // Structure markers
    const markers = recentStructures.map(s => {
      const sliceStart = symCandles.length - 30
      const relIdx = s.idx - sliceStart
      if (relIdx < 0 || relIdx >= slice.length) return null
      return {
        x: (relIdx / slice.length) * 100,
        y: toY(s.price),
        type: s.type,
        direction: s.direction,
      }
    }).filter(Boolean)

    return {
      currentTrend, lastStructure,
      recentStructures, activeOBs, activeFVGs,
      candleBars, markers, lastPrice,
      totalBOS: structures.filter(s => s.type === 'BOS').length,
      totalCHoCH: structures.filter(s => s.type === 'CHoCH').length,
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Brain size={12} className="text-accent-purple" />
          Smart Money Concepts
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 15+ candles</div>
      </div>
    )
  }

  const { currentTrend, lastStructure, recentStructures, activeOBs, activeFVGs, candleBars, markers, lastPrice, totalBOS, totalCHoCH } = data

  const trendColor = currentTrend === 'bullish' ? 'text-accent-green' : currentTrend === 'bearish' ? 'text-accent-red' : 'text-gray-400'
  const trendBg = currentTrend === 'bullish' ? 'bg-accent-green/10' : currentTrend === 'bearish' ? 'bg-accent-red/10' : 'bg-bg-800'

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Brain size={12} className="text-accent-purple" />
        Smart Money Concepts
      </div>

      {/* Current structure */}
      <div className={'rounded px-2 py-1.5 mb-2 text-center ' + trendBg}>
        <div className="text-[8px] text-gray-600">Market Structure</div>
        <div className={'text-sm font-bold capitalize ' + trendColor}>{currentTrend}</div>
        {lastStructure && (
          <div className="text-[8px] text-gray-500 mt-0.5">
            Last: {lastStructure.type} ({lastStructure.direction})
          </div>
        )}
      </div>

      {/* Chart with markers */}
      <svg viewBox="0 0 100 100" className="w-full h-[50px]" preserveAspectRatio="none">
        {candleBars.map((b, i) => (
          <g key={i}>
            <line x1={b.x + b.w / 2} y1={b.wickTop} x2={b.x + b.w / 2} y2={b.wickBot}
              stroke={b.isBull ? '#22c55e' : '#ef4444'} strokeWidth="0.3" />
            <rect x={b.x} y={b.bodyY} width={b.w} height={b.bodyH}
              fill={b.isBull ? '#22c55e' : '#ef4444'} fillOpacity="0.5" />
          </g>
        ))}
        {markers.map((m, i) => (
          <g key={'m' + i}>
            <circle cx={m.x} cy={m.y} r="1.5" fill={m.direction === 'bullish' ? '#22c55e' : '#ef4444'} />
            <text x={m.x + 2} y={m.y + 1} fontSize="2.5" fill={m.direction === 'bullish' ? '#22c55e' : '#ef4444'}>
              {m.type === 'BOS' ? 'BOS' : 'CHoCH'}
            </text>
          </g>
        ))}
      </svg>

      {/* Structure stats */}
      <div className="grid grid-cols-2 gap-1 mt-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">BOS count</span>
          <div className="font-mono text-gray-300">{totalBOS}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">CHoCH count</span>
          <div className="font-mono text-gray-300">{totalCHoCH}</div>
        </div>
      </div>

      {/* Active Order Blocks */}
      {activeOBs.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-bg-600">
          <div className="text-[8px] text-gray-600 mb-1">Unmitigated Order Blocks:</div>
          <div className="space-y-0.5">
            {activeOBs.map((ob, i) => (
              <div key={i} className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
                <span className={ob.type === 'bullish' ? 'text-accent-green' : 'text-accent-red'}>
                  {ob.type === 'bullish' ? '↑ Bull OB' : '↓ Bear OB'}
                </span>
                <span className="font-mono text-gray-400">{formatPrice(ob.low)} - {formatPrice(ob.high)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active FVGs */}
      {activeFVGs.length > 0 && (
        <div className="mt-1.5">
          <div className="text-[8px] text-gray-600 mb-1">Unfilled FVGs:</div>
          <div className="space-y-0.5">
            {activeFVGs.map((fvg, i) => (
              <div key={i} className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
                <span className={fvg.type === 'bullish' ? 'text-accent-green' : 'text-accent-red'}>
                  {fvg.type === 'bullish' ? '↑ Bull FVG' : '↓ Bear FVG'}
                </span>
                <span className="font-mono text-gray-400">{formatPrice(fvg.low)} - {formatPrice(fvg.high)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        BOS = trend continuation. CHoCH = reversal. OBs = institutional zones. FVGs = imbalance.
      </div>
    </div>
  )
}
