import { useMemo } from 'react'
import { Activity, TrendingUp, TrendingDown } from 'lucide-react'
import { calcATR } from '../utils/indicators'
import { formatPrice } from '../utils/format'

export default function ATRIndicator({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 15) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const atr = calcATR(highs, lows, closes, 14)

    const validAtr = atr.filter(v => !isNaN(v))
    if (validAtr.length === 0) return null

    const last = validAtr[validAtr.length - 1]
    const prev = validAtr[validAtr.length - 2] || last
    const price = closes[closes.length - 1]
    const atrPct = (last / price) * 100

    const trend = last > prev ? 'expanding' : 'contracting'

    // Volatility regime
    const avgAtr = validAtr.reduce((s, v) => s + v, 0) / validAtr.length
    let regime = 'Normal'
    let regimeColor = 'text-gray-400'
    if (last > avgAtr * 1.5) { regime = 'High Volatility'; regimeColor = 'text-accent-red' }
    else if (last < avgAtr * 0.6) { regime = 'Low Volatility'; regimeColor = 'text-accent-green' }

    // Sparkline
    const atrSlice = atr.slice(-30)
    const minA = Math.min(...validAtr)
    const maxA = Math.max(...validAtr)
    const range = maxA - minA || 1
    const points = atrSlice.map((v, i) => ({
      x: (i / (atrSlice.length - 1)) * 100,
      y: 100 - ((v - minA) / range) * 90 - 5,
    }))
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    const areaPath = path + ` L 100 100 L 0 100 Z`

    return { last, prev, price, atrPct, trend, regime, regimeColor, path, areaPath, avgAtr }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Activity size={12} className="text-accent-orange" />
          ATR
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { last, atrPct, trend, regime, regimeColor, path, areaPath, avgAtr } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Activity size={12} className="text-accent-orange" />
        Average True Range
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">ATR (14)</span>
          <div className="text-sm font-mono font-bold text-gray-200">{formatPrice(last)}</div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">% of Price</span>
          <div className="text-[10px] font-mono text-accent-orange">{atrPct.toFixed(2)}%</div>
        </div>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-[40px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="atr-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#atr-grad)" />
        <path d={path} fill="none" stroke="#f97316" strokeWidth="1.5" />
      </svg>

      <div className="grid grid-cols-2 gap-1 mt-2 text-[9px]">
        <div className="flex justify-between">
          <span className="text-gray-600">Avg ATR</span>
          <span className="font-mono text-gray-400">{formatPrice(avgAtr)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Regime</span>
          <span className={regimeColor}>{regime}</span>
        </div>
      </div>

      <div className="flex items-center gap-0.5 mt-1">
        {trend === 'expanding' ? <TrendingUp size={9} className="text-accent-red" /> : <TrendingDown size={9} className="text-accent-green" />}
        <span className="text-[8px] text-gray-600">Volatility {trend}</span>
      </div>
    </div>
  )
}
