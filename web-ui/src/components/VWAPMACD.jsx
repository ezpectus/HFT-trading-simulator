import { useMemo } from 'react'
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react'
import { calcVWAPMACD } from '../utils/indicators'
import { formatPrice } from '../utils/format'

export default function VWAPMACD({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-80)
    if (symCandles.length < 35) return null

    const closes = symCandles.map(c => c.close)
    const volumes = symCandles.map(c => c.volume || 0)
    const { macd, signal, histogram } = calcVWAPMACD(closes, volumes, 12, 26, 9)

    const validMacd = macd.filter(v => !isNaN(v))
    if (validMacd.length === 0) return null

    const lastMacd = validMacd[validMacd.length - 1]
    const lastSignal = signal[signal.length - 1]
    const lastHist = histogram[histogram.length - 1]

    if (isNaN(lastSignal)) return null

    const prevMacd = validMacd[validMacd.length - 2] || lastMacd
    const prevSignal = signal[signal.length - 2] || lastSignal

    // Cross signals
    const bullCross = lastMacd > lastSignal && prevMacd <= prevSignal
    const bearCross = lastMacd < lastSignal && prevMacd >= prevSignal

    let signalLabel = 'Neutral'
    let signalColor = 'text-gray-400'
    if (bullCross) { signalLabel = 'Bullish Cross'; signalColor = 'text-accent-green' }
    else if (bearCross) { signalLabel = 'Bearish Cross'; signalColor = 'text-accent-red' }
    else if (lastMacd > lastSignal) { signalLabel = 'Bullish'; signalColor = 'text-accent-green' }
    else { signalLabel = 'Bearish'; signalColor = 'text-accent-red' }

    // Histogram bars
    const histSlice = histogram.slice(-30)
    const maxAbs = Math.max(...histSlice.filter(v => !isNaN(v)).map(Math.abs), 1)
    const bars = histSlice.map((v, i) => {
      if (isNaN(v)) return null
      const h = (Math.abs(v) / maxAbs) * 40
      return {
        x: (i / (histSlice.length - 1)) * 100,
        y: v >= 0 ? 50 - h : 50,
        w: 100 / histSlice.length * 0.7,
        h,
        color: v >= 0 ? '#22c55e' : '#ef4444',
      }
    }).filter(Boolean)

    // MACD and signal lines
    const macdSlice = macd.slice(-30)
    const signalSlice = signal.slice(-30)
    const lineMaxAbs = Math.max(...validMacd.map(Math.abs), ...signal.filter(v => !isNaN(v)).map(Math.abs), 1)
    const toY = (v) => 50 - (v / lineMaxAbs) * 40

    const macdPath = macdSlice.map((v, i) => {
      if (isNaN(v)) return ''
      return `${i === 0 ? 'M' : 'L'} ${((i / (macdSlice.length - 1)) * 100).toFixed(1)} ${toY(v).toFixed(1)}`
    }).filter(Boolean).join(' ')

    const signalPath = signalSlice.map((v, i) => {
      if (isNaN(v)) return ''
      return `${i === 0 ? 'M' : 'L'} ${((i / (signalSlice.length - 1)) * 100).toFixed(1)} ${toY(v).toFixed(1)}`
    }).filter(Boolean).join(' ')

    return { lastMacd, lastSignal, lastHist, signalLabel, signalColor, bars, macdPath, signalPath, bullCross, bearCross }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <BarChart3 size={12} className="text-accent-blue" />
          VWAP MACD
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 35+ candles</div>
      </div>
    )
  }

  const { lastMacd, lastSignal, lastHist, signalLabel, signalColor, bars, macdPath, signalPath, bullCross, bearCross } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <BarChart3 size={12} className="text-accent-blue" />
        Volume-Weighted MACD
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-3">
          <div>
            <span className="text-[8px] text-gray-600">MACD</span>
            <div className="text-[11px] font-mono font-bold text-blue-400">{lastMacd.toFixed(4)}</div>
          </div>
          <div>
            <span className="text-[8px] text-gray-600">Signal</span>
            <div className="text-[11px] font-mono font-bold text-yellow-400">{lastSignal.toFixed(4)}</div>
          </div>
          <div>
            <span className="text-[8px] text-gray-600">Hist</span>
            <div className={'text-[11px] font-mono font-bold ' + (lastHist >= 0 ? 'text-accent-green' : 'text-accent-red')}>
              {lastHist >= 0 ? '+' : ''}{lastHist.toFixed(4)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Signal</span>
          <div className={'text-[10px] font-medium ' + signalColor}>{signalLabel}</div>
        </div>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-[50px]" preserveAspectRatio="none">
        <line x1="0" y1="50" x2="100" y2="50" stroke="#64748b" strokeWidth="0.3" strokeDasharray="1 3" opacity="0.4" />
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.color} fillOpacity="0.5" />
        ))}
        <path d={signalPath} fill="none" stroke="#eab308" strokeWidth="0.8" />
        <path d={macdPath} fill="none" stroke="#3b82f6" strokeWidth="1.2" />
      </svg>

      {(bullCross || bearCross) && (
        <div className="mt-1.5 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-0.5">
          <span className="text-[8px] text-accent-yellow">
            {bullCross ? 'Bullish' : 'Bearish'} MACD cross — volume-weighted momentum shift
          </span>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        VW-MACD uses volume-weighted EMAs. More responsive to institutional flow than standard MACD.
      </div>
    </div>
  )
}
