import { useMemo } from 'react'
import { Radio, TrendingUp, TrendingDown } from 'lucide-react'
import { calcCCI } from '../utils/indicators'

export default function CCIIndicator({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 20) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const cci = calcCCI(highs, lows, closes, 20)

    const validCci = cci.filter(v => !isNaN(v))
    if (validCci.length === 0) return null

    const last = validCci[validCci.length - 1]
    const prev = validCci[validCci.length - 2] || last

    let signal = 'Neutral'
    let signalColor = 'text-gray-400'
    if (last > 100) { signal = 'Overbought'; signalColor = 'text-accent-red' }
    else if (last < -100) { signal = 'Oversold'; signalColor = 'text-accent-green' }
    else if (last > 0) { signal = 'Bullish'; signalColor = 'text-accent-green' }
    else { signal = 'Bearish'; signalColor = 'text-accent-red' }

    const trend = last > prev ? 'up' : 'down'

    // Sparkline
    const cciSlice = cci.slice(-30)
    const minC = Math.min(...validCci, -200)
    const maxC = Math.max(...validCci, 200)
    const range = maxC - minC || 1
    const toY = (v) => 100 - ((v - minC) / range) * 90 - 5

    const points = cciSlice.map((v, i) => ({
      x: (i / (cciSlice.length - 1)) * 100,
      y: isNaN(v) ? 50 : toY(v),
    }))
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

    // Zero line and ±100 lines
    const zeroY = toY(0)
    const obY = toY(100)
    const osY = toY(-100)

    return { last, prev, signal, signalColor, trend, path, zeroY, obY, osY }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Radio size={12} className="text-accent-blue" />
          CCI
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 20+ candles</div>
      </div>
    )
  }

  const { last, signal, signalColor, trend, path, zeroY, obY, osY } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Radio size={12} className="text-accent-blue" />
        Commodity Channel Index
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">CCI (20)</span>
          <div className="text-sm font-mono font-bold text-gray-200">{last.toFixed(1)}</div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Signal</span>
          <div className={'text-[10px] font-medium ' + signalColor}>{signal}</div>
        </div>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-[40px]" preserveAspectRatio="none">
        <line x1="0" y1={obY} x2="100" y2={obY} stroke="#ef4444" strokeWidth="0.3" strokeDasharray="2 2" opacity="0.4" />
        <line x1="0" y1={osY} x2="100" y2={osY} stroke="#22c55e" strokeWidth="0.3" strokeDasharray="2 2" opacity="0.4" />
        <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="#64748b" strokeWidth="0.2" strokeDasharray="1 3" opacity="0.3" />
        <path d={path} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
      </svg>

      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-0.5">
          {trend === 'up' ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
          <span className="text-[8px] text-gray-600">{trend}</span>
        </div>
        <div className="text-[8px] text-gray-600">
          <span className="text-accent-red">+100</span> / <span className="text-accent-green">-100</span>
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        CCI measures deviation from MA. &gt;100 overbought, &lt;-100 oversold.
      </div>
    </div>
  )
}
