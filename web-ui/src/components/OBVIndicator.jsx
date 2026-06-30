import { useMemo } from 'react'
import { Activity, TrendingUp, TrendingDown } from 'lucide-react'
import { calcOBV } from '../utils/indicators'
import { formatVolume } from '../utils/format'

export default function OBVIndicator({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 3) return null

    const closes = symCandles.map(c => c.close)
    const volumes = symCandles.map(c => c.volume || 0)
    const obv = calcOBV(closes, volumes)

    const last = obv[obv.length - 1]
    const prev = obv[obv.length - 2] || last
    const change = last - prev
    const changePct = prev !== 0 ? (change / Math.abs(prev)) * 100 : 0

    // Detect divergence: price up but OBV down (or vice versa)
    const priceUp = closes[closes.length - 1] > closes[closes.length - 2]
    const obvUp = last > prev
    const divergence = priceUp !== obvUp

    // Sparkline data (normalize to 0-100)
    const minV = Math.min(...obv)
    const maxV = Math.max(...obv)
    const range = maxV - minV || 1
    const points = obv.map((v, i) => ({
      x: (i / (obv.length - 1)) * 100,
      y: 100 - ((v - minV) / range) * 100,
    }))
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    const areaPath = path + ` L 100 100 L 0 100 Z`

    return { last, change, changePct, divergence, path, areaPath, priceUp, obvUp }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Activity size={12} className="text-accent-blue" />
          OBV Indicator
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { last, change, changePct, divergence, path, areaPath, priceUp, obvUp } = data
  const isRising = change >= 0

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Activity size={12} className="text-accent-blue" />
        On-Balance Volume
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">OBV</span>
          <div className="text-sm font-mono font-bold text-gray-200">{formatVolume(last)}</div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Change</span>
          <div className={'text-[10px] font-mono ' + (isRising ? 'text-accent-green' : 'text-accent-red')}>
            {isRising ? '+' : ''}{formatVolume(change)} ({changePct.toFixed(1)}%)
          </div>
        </div>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-[40px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="obv-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isRising ? '#22c55e' : '#ef4444'} stopOpacity="0.3" />
            <stop offset="100%" stopColor={isRising ? '#22c55e' : '#ef4444'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#obv-grad)" />
        <path d={path} fill="none" stroke={isRising ? '#22c55e' : '#ef4444'} strokeWidth="1.5" />
      </svg>

      {divergence && (
        <div className="flex items-center gap-1 mt-1.5 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-0.5">
          <TrendingUp size={9} className="text-accent-yellow" />
          <span className="text-[8px] text-accent-yellow">
            Divergence: price {priceUp ? '↑' : '↓'} but OBV {obvUp ? '↑' : '↓'}
          </span>
        </div>
      )}

      <div className="mt-1.5 pt-1.5 border-t border-bg-600 text-[8px] text-gray-600">
        OBV adds volume on up-days, subtracts on down-days. Divergence = potential reversal.
      </div>
    </div>
  )
}
