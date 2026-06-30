import { useMemo } from 'react'
import { Gauge, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { calcADX } from '../utils/indicators'

export default function ADXIndicator({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-60)
    if (symCandles.length < 28) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const { adx, pdi, mdi } = calcADX(highs, lows, closes, 14)

    const validAdx = adx.filter(v => !isNaN(v))
    if (validAdx.length === 0) return null

    const lastAdx = validAdx[validAdx.length - 1]
    const lastPdi = pdi[pdi.length - 1]
    const lastMdi = mdi[mdi.length - 1]

    if (isNaN(lastPdi) || isNaN(lastMdi)) return null

    // Trend strength
    let strength = 'Weak'
    let strengthColor = 'text-gray-400'
    if (lastAdx >= 50) { strength = 'Very Strong'; strengthColor = 'text-accent-purple' }
    else if (lastAdx >= 25) { strength = 'Strong'; strengthColor = 'text-accent-green' }
    else if (lastAdx >= 20) { strength = 'Developing'; strengthColor = 'text-accent-yellow' }

    // Direction
    const direction = lastPdi > lastMdi ? 'Bullish' : 'Bearish'
    const directionColor = lastPdi > lastMdi ? 'text-accent-green' : 'text-accent-red'

    // DI cross
    const prevPdi = pdi[pdi.length - 2]
    const prevMdi = mdi[mdi.length - 2]
    const diCross = (lastPdi > lastMdi) !== (prevPdi > prevMdi)

    // Sparklines
    const sliceLen = Math.min(30, validAdx.length)
    const adxSlice = adx.slice(-sliceLen)
    const pdiSlice = pdi.slice(-sliceLen)
    const mdiSlice = mdi.slice(-sliceLen)

    const toY = (v) => 100 - (isNaN(v) ? 50 : Math.min(v, 60) / 60 * 100)

    const adxPath = adxSlice.map((v, i) => `${i === 0 ? 'M' : 'L'} ${((i / (sliceLen - 1)) * 100).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')
    const pdiPath = pdiSlice.map((v, i) => `${i === 0 ? 'M' : 'L'} ${((i / (sliceLen - 1)) * 100).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')
    const mdiPath = mdiSlice.map((v, i) => `${i === 0 ? 'M' : 'L'} ${((i / (sliceLen - 1)) * 100).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')

    return { lastAdx, lastPdi, lastMdi, strength, strengthColor, direction, directionColor, diCross, adxPath, pdiPath, mdiPath }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Gauge size={12} className="text-accent-purple" />
          ADX / DI
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 28+ candles</div>
      </div>
    )
  }

  const { lastAdx, lastPdi, lastMdi, strength, strengthColor, direction, directionColor, diCross, adxPath, pdiPath, mdiPath } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Gauge size={12} className="text-accent-purple" />
        ADX / DI Indicator
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-3">
          <div>
            <span className="text-[8px] text-gray-600">ADX</span>
            <div className="text-sm font-mono font-bold text-purple-400">{lastAdx.toFixed(1)}</div>
          </div>
          <div>
            <span className="text-[8px] text-gray-600">+DI</span>
            <div className="text-[11px] font-mono text-green-400">{lastPdi.toFixed(1)}</div>
          </div>
          <div>
            <span className="text-[8px] text-gray-600">-DI</span>
            <div className="text-[11px] font-mono text-red-400">{lastMdi.toFixed(1)}</div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Strength</span>
          <div className={'text-[10px] font-medium ' + strengthColor}>{strength}</div>
        </div>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-[40px]" preserveAspectRatio="none">
        <line x1="0" y1="58" x2="100" y2="58" stroke="#eab308" strokeWidth="0.3" strokeDasharray="2 2" opacity="0.3" />
        <line x1="0" y1="67" x2="100" y2="67" stroke="#64748b" strokeWidth="0.2" strokeDasharray="1 3" opacity="0.3" />
        <path d={mdiPath} fill="none" stroke="#ef4444" strokeWidth="0.8" />
        <path d={pdiPath} fill="none" stroke="#22c55e" strokeWidth="0.8" />
        <path d={adxPath} fill="none" stroke="#a855f7" strokeWidth="1.5" />
      </svg>

      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1">
          {direction === 'Bullish' ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
          <span className={'text-[8px] ' + directionColor}>{direction}</span>
        </div>
        <span className="text-[8px] text-gray-600">ADX&gt;25 = trending</span>
      </div>

      {diCross && (
        <div className="mt-1 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-0.5">
          <span className="text-[8px] text-accent-yellow">DI cross detected — momentum shift</span>
        </div>
      )}
    </div>
  )
}
