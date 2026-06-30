import { useMemo } from 'react'
import { Waves, TrendingUp, TrendingDown } from 'lucide-react'
import { calcAwesomeOscillator } from '../utils/indicators'

export default function AwesomeOscillator({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-80)
    if (symCandles.length < 34) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const ao = calcAwesomeOscillator(highs, lows)

    const validAo = ao.filter(v => !isNaN(v))
    if (validAo.length === 0) return null

    const last = validAo[validAo.length - 1]
    const prev = validAo[validAo.length - 2] || last

    // Saucer signal: 3 consecutive bars, first red, next two green (or vice versa)
    const last3 = validAo.slice(-3)
    let saucer = null
    if (last3.length === 3) {
      if (last3[0] < 0 && last3[1] < 0 && last3[2] < 0 && last3[1] > last3[0] && last3[2] > last3[1]) {
        saucer = 'Bullish Saucer'
      } else if (last3[0] > 0 && last3[1] > 0 && last3[2] > 0 && last3[1] < last3[0] && last3[2] < last3[1]) {
        saucer = 'Bearish Saucer'
      }
    }

    // Zero cross
    const zeroCross = (last > 0 && prev <= 0) || (last < 0 && prev >= 0)

    // Histogram bars
    const aoSlice = ao.slice(-30)
    const maxAbs = Math.max(...validAo.map(Math.abs), 1)
    const bars = aoSlice.map((v, i) => {
      if (isNaN(v)) return null
      const h = (Math.abs(v) / maxAbs) * 45
      const isUp = v > 0
      const isIncreasing = i > 0 && !isNaN(aoSlice[i - 1]) && v > aoSlice[i - 1]
      return {
        x: (i / (aoSlice.length - 1)) * 100,
        y: isUp ? 50 - h : 50,
        w: 100 / aoSlice.length * 0.7,
        h: h,
        color: isUp ? (isIncreasing ? '#22c55e' : '#16a34a') : (isIncreasing ? '#ef4444' : '#dc2626'),
      }
    }).filter(Boolean)

    return { last, prev, saucer, zeroCross, bars }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Waves size={12} className="text-accent-blue" />
          Awesome Oscillator
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 34+ candles</div>
      </div>
    )
  }

  const { last, saucer, zeroCross, bars } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Waves size={12} className="text-accent-blue" />
        Awesome Oscillator
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">AO Value</span>
          <div className={'text-sm font-mono font-bold ' + (last >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {last >= 0 ? '+' : ''}{last.toFixed(2)}
          </div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Trend</span>
          <div className={'text-[10px] font-medium ' + (last >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {last >= 0 ? 'Bullish' : 'Bearish'}
          </div>
        </div>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-[40px]" preserveAspectRatio="none">
        <line x1="0" y1="50" x2="100" y2="50" stroke="#64748b" strokeWidth="0.3" strokeDasharray="1 3" opacity="0.4" />
        {bars.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill={b.color}
            fillOpacity="0.7"
          />
        ))}
      </svg>

      <div className="mt-1.5 space-y-0.5">
        {saucer && (
          <div className="flex items-center gap-1 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-0.5">
            {saucer === 'Bullish Saucer' ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
            <span className={'text-[8px] ' + (saucer === 'Bullish Saucer' ? 'text-accent-green' : 'text-accent-red')}>{saucer}</span>
          </div>
        )}
        {zeroCross && (
          <div className="flex items-center gap-1 bg-accent-blue/10 border border-accent-blue/20 rounded px-1.5 py-0.5">
            <span className="text-[8px] text-accent-blue">Zero-line cross — momentum shift</span>
          </div>
        )}
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        AO = SMA5(midpoint) - SMA34(midpoint). Saucer & zero cross = signals.
      </div>
    </div>
  )
}
