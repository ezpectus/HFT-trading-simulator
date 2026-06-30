import { useMemo } from 'react'
import { Droplets, TrendingUp, TrendingDown } from 'lucide-react'
import { calcMFI } from '../utils/indicators'

export default function MFIIndicator({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 16) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const volumes = symCandles.map(c => c.volume || 0)
    const mfi = calcMFI(highs, lows, closes, volumes, 14)

    const validMfi = mfi.filter(v => !isNaN(v))
    if (validMfi.length === 0) return null

    const last = validMfi[validMfi.length - 1]
    const prev = validMfi[validMfi.length - 2] || last
    const trend = last > prev ? 'up' : last < prev ? 'down' : 'flat'

    // Signal: >80 overbought, <20 oversold
    let signal = 'neutral'
    let signalColor = 'text-gray-400'
    if (last >= 80) { signal = 'Overbought'; signalColor = 'text-accent-red' }
    else if (last <= 20) { signal = 'Oversold'; signalColor = 'text-accent-green' }
    else if (last > 50) { signal = 'Bullish'; signalColor = 'text-accent-green' }
    else { signal = 'Bearish'; signalColor = 'text-accent-red' }

    // Sparkline
    const mfiSlice = mfi.slice(-30)
    const points = mfiSlice.map((v, i) => ({
      x: (i / (mfiSlice.length - 1)) * 100,
      y: 100 - v,
    }))
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

    return { last, prev, trend, signal, signalColor, path }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Droplets size={12} className="text-accent-blue" />
          MFI Indicator
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { last, trend, signal, signalColor, path } = data

  // Gauge arc
  const angle = (last / 100) * 180 - 90
  const rad = (angle * Math.PI) / 180
  const cx = 50, cy = 45, r = 35
  const needleX = cx + r * Math.cos(rad)
  const needleY = cy + r * Math.sin(rad)

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Droplets size={12} className="text-accent-blue" />
        Money Flow Index
      </div>

      <div className="flex items-start gap-3">
        {/* Gauge */}
        <svg viewBox="0 0 100 55" className="w-[80px] h-[44px] shrink-0">
          <path d="M 15 45 A 35 35 0 0 1 85 45" fill="none" stroke="#1e2433" strokeWidth="6" />
          <path d="M 15 45 A 35 35 0 0 1 50 10" fill="none" stroke="#22c55e" strokeWidth="3" opacity="0.5" />
          <path d="M 50 10 A 35 35 0 0 1 85 45" fill="none" stroke="#ef4444" strokeWidth="3" opacity="0.5" />
          <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="2.5" fill="#e2e8f0" />
          <text x="15" y="53" fontSize="6" fill="#64748b">0</text>
          <text x="46" y="8" fontSize="6" fill="#64748b">50</text>
          <text x="78" y="53" fontSize="6" fill="#64748b">100</text>
        </svg>

        <div className="flex-1">
          <div className="text-lg font-mono font-bold text-gray-200">{last.toFixed(1)}</div>
          <div className={'text-[10px] font-medium ' + signalColor}>{signal}</div>
          <div className="flex items-center gap-0.5 mt-0.5">
            {trend === 'up' && <TrendingUp size={9} className="text-accent-green" />}
            {trend === 'down' && <TrendingDown size={9} className="text-accent-red" />}
            <span className="text-[8px] text-gray-600">{trend}</span>
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <svg viewBox="0 0 100 100" className="w-full h-[30px] mt-1" preserveAspectRatio="none">
        <line x1="0" y1="20" x2="100" y2="20" stroke="#ef4444" strokeWidth="0.3" strokeDasharray="2 2" opacity="0.3" />
        <line x1="0" y1="80" x2="100" y2="80" stroke="#22c55e" strokeWidth="0.3" strokeDasharray="2 2" opacity="0.3" />
        <path d={path} fill="none" stroke="#3b82f6" strokeWidth="1.2" />
      </svg>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        MFI &gt;80 = overbought, &lt;20 = oversold. Volume-weighted RSI.
      </div>
    </div>
  )
}
