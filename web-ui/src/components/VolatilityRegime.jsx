import { useMemo } from 'react'
import { Zap, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { calcATR } from '../utils/indicators'
import { formatPrice } from '../utils/format'

export default function VolatilityRegime({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-100)
    if (symCandles.length < 30) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)

    // ATR for volatility
    const atr = calcATR(highs, lows, closes, 14)
    const validAtr = atr.filter(v => !isNaN(v))
    if (validAtr.length < 10) return null

    // GARCH-like: EWMA of squared returns
    const returns = []
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]))
    }

    const lambda = 0.94
    let ewmaVar = returns[0] * returns[0]
    const ewmaSeries = [ewmaVar]
    for (let i = 1; i < returns.length; i++) {
      ewmaVar = lambda * ewmaVar + (1 - lambda) * returns[i] * returns[i]
      ewmaSeries.push(ewmaVar)
    }

    const currentVol = Math.sqrt(ewmaSeries[ewmaSeries.length - 1]) * Math.sqrt(252) // annualized
    const avgVol = Math.sqrt(ewmaSeries.reduce((s, v) => s + v, 0) / ewmaSeries.length) * Math.sqrt(252)

    // Volatility ratio (current vs average)
    const volRatio = avgVol > 0 ? currentVol / avgVol : 1

    // Regime classification
    let regime = 'Normal'
    let regimeColor = 'text-gray-400'
    let regimeBg = 'bg-gray-600/20'
    if (volRatio > 2.0) { regime = 'Extreme'; regimeColor = 'text-accent-red'; regimeBg = 'bg-accent-red/20' }
    else if (volRatio > 1.5) { regime = 'High'; regimeColor = 'text-accent-orange'; regimeBg = 'bg-accent-orange/20' }
    else if (volRatio > 1.2) { regime = 'Elevated'; regimeColor = 'text-accent-yellow'; regimeBg = 'bg-accent-yellow/20' }
    else if (volRatio < 0.6) { regime = 'Compressed'; regimeColor = 'text-accent-green'; regimeBg = 'bg-accent-green/20' }
    else if (volRatio < 0.8) { regime = 'Low'; regimeColor = 'text-accent-blue'; regimeBg = 'bg-accent-blue/20' }

    // Trend of volatility (expanding or contracting)
    const recentVol = Math.sqrt(ewmaSeries.slice(-5).reduce((s, v) => s + v, 0) / 5) * Math.sqrt(252)
    const olderVol = Math.sqrt(ewmaSeries.slice(-10, -5).reduce((s, v) => s + v, 0) / 5) * Math.sqrt(252)
    const volTrend = recentVol > olderVol ? 'expanding' : 'contracting'

    // Sparkline of EWMA volatility
    const volSlice = ewmaSeries.slice(-30).map(v => Math.sqrt(v) * Math.sqrt(252))
    const minV = Math.min(...volSlice)
    const maxV = Math.max(...volSlice)
    const vRange = maxV - minV || 1
    const points = volSlice.map((v, i) => ({
      x: (i / (volSlice.length - 1)) * 100,
      y: 100 - ((v - minV) / vRange) * 90 - 5,
    }))
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    const areaPath = path + ` L 100 100 L 0 100 Z`

    // ATR-based support/resistance
    const lastAtr = validAtr[validAtr.length - 1]
    const price = closes[closes.length - 1]

    return {
      currentVol: currentVol * 100,
      avgVol: avgVol * 100,
      volRatio,
      regime, regimeColor, regimeBg,
      volTrend,
      path, areaPath,
      lastAtr, price,
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Zap size={12} className="text-accent-yellow" />
          Volatility Regime
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 30+ candles</div>
      </div>
    )
  }

  const { currentVol, avgVol, volRatio, regime, regimeColor, regimeBg, volTrend, path, areaPath, lastAtr, price } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Zap size={12} className="text-accent-yellow" />
        Volatility Regime
      </div>

      {/* Regime badge */}
      <div className={'rounded px-2 py-1 mb-2 text-center ' + regimeBg}>
        <span className={'text-xs font-bold ' + regimeColor}>{regime}</span>
        <span className="text-[8px] text-gray-600 ml-1.5">({volRatio.toFixed(2)}x avg)</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2 text-[9px]">
        <div>
          <span className="text-gray-600">Current Vol</span>
          <div className="text-sm font-mono font-bold text-gray-200">{currentVol.toFixed(1)}%</div>
        </div>
        <div className="text-right">
          <span className="text-gray-600">Avg Vol</span>
          <div className="text-sm font-mono text-gray-400">{avgVol.toFixed(1)}%</div>
        </div>
      </div>

      {/* Volatility sparkline */}
      <svg viewBox="0 0 100 100" className="w-full h-[35px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="vol-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eab308" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#vol-grad)" />
        <path d={path} fill="none" stroke="#eab308" strokeWidth="1.5" />
      </svg>

      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-0.5">
          {volTrend === 'expanding' ? <TrendingUp size={9} className="text-accent-red" /> : <TrendingDown size={9} className="text-accent-green" />}
          <span className="text-[8px] text-gray-600">{volTrend}</span>
        </div>
        <span className="text-[8px] text-gray-600">EWMA λ=0.94</span>
      </div>

      {/* ATR-based levels */}
      <div className="mt-2 pt-1.5 border-t border-bg-600 space-y-0.5">
        <div className="flex justify-between text-[8px]">
          <span className="text-gray-600">Resistance (P+ATR)</span>
          <span className="font-mono text-accent-red">{formatPrice(price + lastAtr)}</span>
        </div>
        <div className="flex justify-between text-[8px]">
          <span className="text-gray-600">Current Price</span>
          <span className="font-mono text-gray-300">{formatPrice(price)}</span>
        </div>
        <div className="flex justify-between text-[8px]">
          <span className="text-gray-600">Support (P-ATR)</span>
          <span className="font-mono text-accent-green">{formatPrice(price - lastAtr)}</span>
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        GARCH-like EWMA volatility. Regime = current vs historical avg. Annualized.
      </div>
    </div>
  )
}
