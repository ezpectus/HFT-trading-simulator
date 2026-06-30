import { useMemo } from 'react'
import { GitBranch, TrendingUp, TrendingDown } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function KagiChart({ candles, symbol, exchange }) {
  const [reversalPct] = useMemo(() => [0.04], [])

  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-200)
    if (symCandles.length < 10) return null

    const closes = symCandles.map(c => c.close)

    // Build Kagi lines
    // Each line has: direction (up/down), startPrice, endPrice, thickness (thin/thick)
    const lines = []
    let dir = closes[1] > closes[0] ? 'up' : 'down'
    let extrema = closes[0]
    let lineStart = closes[0]

    for (let i = 1; i < closes.length; i++) {
      const price = closes[i]
      const reversalAmount = extrema * reversalPct

      if (dir === 'up') {
        if (price > extrema) {
          extrema = price
        } else if (extrema - price >= reversalAmount) {
          // Reversal
          lines.push({ dir, start: lineStart, end: extrema, thickness: extrema > lineStart ? 'thick' : 'thin' })
          dir = 'down'
          lineStart = extrema
          extrema = price
        }
      } else {
        if (price < extrema) {
          extrema = price
        } else if (price - extrema >= reversalAmount) {
          // Reversal
          lines.push({ dir, start: lineStart, end: extrema, thickness: extrema < lineStart ? 'thick' : 'thin' })
          dir = 'up'
          lineStart = extrema
          extrema = price
        }
      }
    }
    // Final line
    lines.push({ dir, start: lineStart, end: extrema, thickness: dir === 'up' ? (extrema > lineStart ? 'thick' : 'thin') : (extrema < lineStart ? 'thick' : 'thin') })

    if (lines.length < 2) return null

    // Show last 15 lines
    const visible = lines.slice(-15)
    const allPrices = visible.flatMap(l => [l.start, l.end])
    const minP = Math.min(...allPrices)
    const maxP = Math.max(...allPrices)
    const range = maxP - minP || 1
    const toY = (v) => 100 - ((v - minP) / range) * 90 - 5

    // Build SVG paths
    const segments = []
    let prevY = toY(visible[0].start)
    let prevX = 0

    visible.forEach((line, i) => {
      const x = ((i + 1) / visible.length) * 100
      const startY = toY(line.start)
      const endY = toY(line.end)

      // Vertical line from start to end
      segments.push({
        type: 'vertical',
        x: i === 0 ? 0 : x,
        y1: startY,
        y2: endY,
        thickness: line.thickness,
        dir: line.dir,
      })

      // Horizontal connector to next line
      if (i < visible.length - 1) {
        const nextStart = visible[i + 1].start
        const nextStartY = toY(nextStart)
        segments.push({
          type: 'horizontal',
          x1: x,
          x2: ((i + 2) / visible.length) * 100,
          y: endY === nextStartY ? endY : (endY + nextStartY) / 2,
          thickness: 'thin',
        })
      }
    })

    // Analysis
    const lastLine = visible[visible.length - 1]
    const prevLine = visible[visible.length - 2]
    const reversal = lastLine.dir !== prevLine.dir

    // Yang/yin: thick up = yang (bullish), thick down = yin (bearish)
    let signal = 'Neutral'
    let signalColor = 'text-gray-400'
    if (lastLine.dir === 'up' && lastLine.thickness === 'thick') { signal = 'Yang (Bullish)'; signalColor = 'text-accent-green' }
    else if (lastLine.dir === 'down' && lastLine.thickness === 'thick') { signal = 'Yin (Bearish)'; signalColor = 'text-accent-red' }
    else if (lastLine.dir === 'up') { signal = 'Thin Up'; signalColor = 'text-gray-300' }
    else { signal = 'Thin Down'; signalColor = 'text-gray-300' }

    return { segments, visible, lastLine, reversal, signal, signalColor, minP, maxP }
  }, [candles, symbol, exchange, reversalPct])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <GitBranch size={12} className="text-accent-purple" />
          Kagi Chart
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { segments, lastLine, reversal, signal, signalColor } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <GitBranch size={12} className="text-accent-purple" />
        Kagi Chart
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">Direction</span>
          <div className={'text-[10px] font-medium ' + (lastLine.dir === 'up' ? 'text-accent-green' : 'text-accent-red')}>
            {lastLine.dir === 'up' ? '↑ Up' : '↓ Down'}
          </div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Signal</span>
          <div className={'text-[10px] font-medium ' + signalColor}>{signal}</div>
        </div>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-[60px]" preserveAspectRatio="none">
        {segments.map((seg, i) => {
          const strokeColor = seg.dir === 'up' ? '#22c55e' : seg.dir === 'down' ? '#ef4444' : '#64748b'
          const strokeWidth = seg.thickness === 'thick' ? 1.5 : 0.8
          if (seg.type === 'vertical') {
            return <line key={i} x1={seg.x} y1={seg.y1} x2={seg.x} y2={seg.y2}
              stroke={strokeColor} strokeWidth={strokeWidth} />
          } else {
            return <line key={i} x1={seg.x1} y1={seg.y} x2={seg.x2} y2={seg.y}
              stroke="#64748b" strokeWidth="0.5" />
          }
        })}
      </svg>

      <div className="grid grid-cols-2 gap-1 mt-2 text-[8px]">
        <div className="flex justify-between">
          <span className="text-gray-600">Start</span>
          <span className="font-mono text-gray-400">{formatPrice(lastLine.start)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Current</span>
          <span className="font-mono text-gray-400">{formatPrice(lastLine.end)}</span>
        </div>
      </div>

      {reversal && (
        <div className="mt-1.5 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-0.5">
          <span className="text-[8px] text-accent-yellow">
            Direction reversal — Kagi flipped to {lastLine.dir}
          </span>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Kagi ignores time, shows price reversals. Thick = trend with power, thin = counter-trend.
      </div>
    </div>
  )
}
