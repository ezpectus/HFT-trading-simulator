import { useMemo } from 'react'
import { Activity, TrendingUp, Minus, Waves, AlertTriangle } from 'lucide-react'

export default function MarketRegime({ candles, symbol, exchange }) {
  const regime = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)

    if (symCandles.length < 20) return null

    const closes = symCandles.map(c => c.close)
    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const volumes = symCandles.map(c => c.volume)

    // ADX-like trend strength
    const periods = 14
    let plusDM = 0, minusDM = 0, tr = 0
    for (let i = 1; i <= periods; i++) {
      const upMove = highs[i] - highs[i - 1]
      const downMove = lows[i - 1] - lows[i]
      if (upMove > downMove && upMove > 0) plusDM += upMove
      if (downMove > upMove && downMove > 0) minusDM += downMove
      const t = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
      tr += t
    }
    const plusDI = (plusDM / tr) * 100
    const minusDI = (minusDM / tr) * 100
    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1) * 100

    // Volatility (ATR-like)
    const recentRanges = symCandles.slice(-10).map(c => (c.high - c.low) / c.close)
    const avgRange = recentRanges.reduce((s, v) => s + v, 0) / recentRanges.length
    const volPct = avgRange * 100

    // Linear regression slope for trend direction
    const n = closes.length
    const xMean = (n - 1) / 2
    const yMean = closes.reduce((s, v) => s + v, 0) / n
    let num = 0, den = 0
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (closes[i] - yMean)
      den += (i - xMean) ** 2
    }
    const slope = den > 0 ? num / den : 0
    const slopePct = (slope / yMean) * 100

    // Volume trend
    const recentVol = volumes.slice(-10).reduce((s, v) => s + v, 0) / 10
    const olderVol = volumes.slice(-20, -10).reduce((s, v) => s + v, 0) / 10
    const volTrend = olderVol > 0 ? ((recentVol - olderVol) / olderVol) * 100 : 0

    // Determine regime
    let regimeType, regimeColor, regimeIcon
    if (dx > 25 && Math.abs(slopePct) > 0.05) {
      regimeType = slopePct > 0 ? 'STRONG UPTREND' : 'STRONG DOWNTREND'
      regimeColor = slopePct > 0 ? 'text-accent-green' : 'text-accent-red'
      regimeIcon = TrendingUp
    } else if (dx > 20) {
      regimeType = slopePct > 0 ? 'UPTREND' : 'DOWNTREND'
      regimeColor = slopePct > 0 ? 'text-accent-green' : 'text-accent-red'
      regimeIcon = TrendingUp
    } else if (volPct > 2.5) {
      regimeType = 'VOLATILE'
      regimeColor = 'text-accent-yellow'
      regimeIcon = AlertTriangle
    } else {
      regimeType = 'RANGING'
      regimeColor = 'text-gray-400'
      regimeIcon = Minus
    }

    // Confidence
    const trendStrength = Math.min(100, dx * 2)
    const confidence = regimeType === 'RANGING' ? 100 - trendStrength : trendStrength

    return {
      type: regimeType,
      color: regimeColor,
      Icon: regimeIcon,
      dx: dx.toFixed(1),
      plusDI: plusDI.toFixed(1),
      minusDI: minusDI.toFixed(1),
      volPct: volPct.toFixed(2),
      slopePct: slopePct.toFixed(3),
      volTrend: volTrend.toFixed(1),
      confidence: confidence.toFixed(0),
      trendStrength: trendStrength.toFixed(0),
    }
  }, [candles, symbol, exchange])

  if (!regime) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Activity size={12} className="text-accent-blue" />
          Market Regime
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { type, color, Icon, dx, plusDI, minusDI, volPct, slopePct, volTrend, confidence, trendStrength } = regime

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Activity size={12} className="text-accent-blue" />
        Market Regime
      </div>

      {/* Regime badge */}
      <div className="flex items-center gap-2 mb-2">
        <div className={'flex items-center gap-1.5 px-2 py-1 rounded ' + (color === 'text-accent-green' ? 'bg-accent-green/20' : color === 'text-accent-red' ? 'bg-accent-red/20' : color === 'text-accent-yellow' ? 'bg-accent-yellow/20' : 'bg-bg-600')}>
          <Icon size={14} className={color} />
          <span className={'text-[11px] font-bold ' + color}>{type}</span>
        </div>
        <div className="text-[9px] text-gray-500">
          {confidence}% confidence
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 text-[9px]">
        <Metric label="ADX (Trend)" value={dx} color={dx > 25 ? 'text-accent-green' : 'text-gray-400'} />
        <Metric label="Volatility" value={`${volPct}%`} color={volPct > 2.5 ? 'text-accent-yellow' : 'text-gray-400'} />
        <Metric label="+DI" value={plusDI} color="text-accent-green" />
        <Metric label="-DI" value={minusDI} color="text-accent-red" />
        <Metric label="Slope" value={`${slopePct}%`} color={slopePct > 0 ? 'text-accent-green' : 'text-accent-red'} />
        <Metric label="Vol Trend" value={`${volTrend > 0 ? '+' : ''}${volTrend}%`} color={volTrend > 0 ? 'text-accent-blue' : 'text-gray-400'} />
      </div>

      {/* Trend strength bar */}
      <div className="mt-2">
        <div className="flex justify-between text-[8px] text-gray-600 mb-0.5">
          <span>Trend Strength</span>
          <span>{trendStrength}%</span>
        </div>
        <div className="h-1.5 bg-bg-600 rounded-full overflow-hidden">
          <div
            className={'h-full rounded-full transition-all ' + (trendStrength > 50 ? 'bg-accent-green' : trendStrength > 25 ? 'bg-accent-yellow' : 'bg-gray-500')}
            style={{ width: `${trendStrength}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, color }) {
  return (
    <div className="bg-bg-600/50 rounded px-2 py-1">
      <div className="text-[8px] text-gray-600 uppercase">{label}</div>
      <div className={`text-[10px] font-mono ${color}`}>{value}</div>
    </div>
  )
}
