import { useMemo } from 'react'
import { Gauge, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { calcWilliamsR } from '../utils/indicators'

export default function WilliamsRIndicator({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 15) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const wr = calcWilliamsR(highs, lows, closes, 14)

    const validWr = wr.filter(v => !isNaN(v))
    if (validWr.length === 0) return null

    const last = validWr[validWr.length - 1]
    const prev = validWr[validWr.length - 2] || last

    // Signal: >-20 overbought, <-80 oversold
    let signal = 'Neutral'
    let signalColor = 'text-gray-400'
    if (last >= -20) { signal = 'Overbought'; signalColor = 'text-accent-red' }
    else if (last <= -80) { signal = 'Oversold'; signalColor = 'text-accent-green' }

    const trend = last > prev ? 'up' : last < prev ? 'down' : 'flat'

    // Sparkline (scale -100..0 to 0..100)
    const wrSlice = wr.slice(-30)
    const points = wrSlice.map((v, i) => ({
      x: (i / (wrSlice.length - 1)) * 100,
      y: -v, // -(-100) = 100, -0 = 0
    }))
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

    return { last, prev, trend, signal, signalColor, path }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Gauge size={12} className="text-accent-purple" />
          Williams %R
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { last, trend, signal, signalColor, path } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Gauge size={12} className="text-accent-purple" />
        Williams %R
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">%R Value</span>
          <div className="text-lg font-mono font-bold text-gray-200">{last.toFixed(2)}</div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Signal</span>
          <div className={'text-[10px] font-medium ' + signalColor}>{signal}</div>
        </div>
      </div>

      {/* Sparkline with zones */}
      <svg viewBox="0 0 100 100" className="w-full h-[40px]" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="20" fill="#ef4444" opacity="0.08" />
        <rect x="0" y="80" width="100" height="20" fill="#22c55e" opacity="0.08" />
        <line x1="0" y1="20" x2="100" y2="20" stroke="#ef4444" strokeWidth="0.3" strokeDasharray="2 2" opacity="0.4" />
        <line x1="0" y1="80" x2="100" y2="80" stroke="#22c55e" strokeWidth="0.3" strokeDasharray="2 2" opacity="0.4" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="#64748b" strokeWidth="0.3" strokeDasharray="1 3" opacity="0.3" />
        <path d={path} fill="none" stroke="#a855f7" strokeWidth="1.5" />
      </svg>

      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-0.5">
          {trend === 'up' && <TrendingUp size={9} className="text-accent-green" />}
          {trend === 'down' && <TrendingDown size={9} className="text-accent-red" />}
          {trend === 'flat' && <Minus size={9} className="text-gray-500" />}
          <span className="text-[8px] text-gray-600">{trend}</span>
        </div>
        <div className="text-[8px] text-gray-600">
          <span className="text-accent-red">-20</span> / <span className="text-accent-green">-80</span>
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Momentum oscillator. &gt;-20 overbought, &lt;-80 oversold.
      </div>
    </div>
  )
}
