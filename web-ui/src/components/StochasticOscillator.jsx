import { useMemo } from 'react'
import { Shuffle, TrendingUp, TrendingDown } from 'lucide-react'
import { calcStochastic } from '../utils/indicators'

export default function StochasticOscillator({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 17) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const { k, d } = calcStochastic(highs, lows, closes, 14, 3)

    const validK = k.filter(v => !isNaN(v))
    if (validK.length === 0) return null

    const lastK = validK[validK.length - 1]
    const lastD = d[d.length - 1]
    const prevK = validK[validK.length - 2] || lastK

    let signal = 'Neutral'
    let signalColor = 'text-gray-400'
    if (lastK > 80) { signal = 'Overbought'; signalColor = 'text-accent-red' }
    else if (lastK < 20) { signal = 'Oversold'; signalColor = 'text-accent-green' }
    else if (lastK > lastD && lastK < 80) { signal = 'Bullish Cross'; signalColor = 'text-accent-green' }
    else if (lastK < lastD && lastK > 20) { signal = 'Bearish Cross'; signalColor = 'text-accent-red' }

    const trend = lastK > prevK ? 'up' : 'down'

    const kSlice = k.slice(-30)
    const dSlice = d.slice(-30)
    const points = kSlice.map((v, i) => ({
      x: (i / (kSlice.length - 1)) * 100,
      y: 100 - (isNaN(v) ? 50 : v),
    }))
    const dPoints = dSlice.map((v, i) => ({
      x: (i / (dSlice.length - 1)) * 100,
      y: 100 - (isNaN(v) ? 50 : v),
    }))
    const kPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    const dPath = dPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

    return { lastK, lastD, signal, signalColor, trend, kPath, dPath }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Shuffle size={12} className="text-accent-blue" />
          Stochastic
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { lastK, lastD, signal, signalColor, trend, kPath, dPath } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Shuffle size={12} className="text-accent-blue" />
        Stochastic Oscillator
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-3">
          <div>
            <span className="text-[8px] text-gray-600">%K</span>
            <div className="text-sm font-mono font-bold text-blue-400">{lastK.toFixed(1)}</div>
          </div>
          <div>
            <span className="text-[8px] text-gray-600">%D</span>
            <div className="text-sm font-mono font-bold text-yellow-400">{isNaN(lastD) ? '--' : lastD.toFixed(1)}</div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Signal</span>
          <div className={'text-[10px] font-medium ' + signalColor}>{signal}</div>
        </div>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-[40px]" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="20" fill="#ef4444" opacity="0.08" />
        <rect x="0" y="80" width="100" height="20" fill="#22c55e" opacity="0.08" />
        <line x1="0" y1="20" x2="100" y2="20" stroke="#ef4444" strokeWidth="0.3" strokeDasharray="2 2" opacity="0.4" />
        <line x1="0" y1="80" x2="100" y2="80" stroke="#22c55e" strokeWidth="0.3" strokeDasharray="2 2" opacity="0.4" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="#64748b" strokeWidth="0.2" strokeDasharray="1 3" opacity="0.3" />
        <path d={dPath} fill="none" stroke="#eab308" strokeWidth="1" />
        <path d={kPath} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
      </svg>

      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-0.5">
          {trend === 'up' ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
          <span className="text-[8px] text-gray-600">{trend}</span>
        </div>
        <div className="text-[8px] text-gray-600">%K(14) / %D(3) — 80/20 zones</div>
      </div>
    </div>
  )
}
