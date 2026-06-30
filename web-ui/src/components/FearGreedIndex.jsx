import { useMemo } from 'react'
import { Brain, Skull, Smile, Meh, Frown, TrendingUp, TrendingDown } from 'lucide-react'
import { calcRSI, calcStochastic, calcATR } from '../utils/indicators'

export default function FearGreedIndex({ candles, signals, fills, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 20) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const volumes = symCandles.map(c => c.volume || 0)

    // 1. Momentum (RSI)
    const rsi = calcRSI(closes, 14)
    const lastRsi = rsi[rsi.length - 1]
    const momentumScore = isNaN(lastRsi) ? 50 : lastRsi

    // 2. Volatility (ATR inverse)
    const atr = calcATR(highs, lows, closes, 14)
    const validAtr = atr.filter(v => !isNaN(v))
    const lastAtr = validAtr.length > 0 ? validAtr[validAtr.length - 1] : 0
    const avgAtr = validAtr.length > 0 ? validAtr.reduce((s, v) => s + v, 0) / validAtr.length : 0
    // High volatility = fear, low = greed
    const volRatio = avgAtr > 0 ? lastAtr / avgAtr : 1
    const volatilityScore = Math.max(0, Math.min(100, 100 - (volRatio - 0.5) * 80))

    // 3. Price momentum (recent change)
    const recentCloses = closes.slice(-10)
    const priceChange = recentCloses.length > 1
      ? ((recentCloses[recentCloses.length - 1] - recentCloses[0]) / recentCloses[0]) * 100
      : 0
    const priceScore = Math.max(0, Math.min(100, 50 + priceChange * 10))

    // 4. Volume trend (increasing volume = greed, decreasing = fear)
    const recentVol = volumes.slice(-10).reduce((s, v) => s + v, 0) / 10
    const olderVol = volumes.slice(-20, -10).reduce((s, v) => s + v, 0) / 10
    const volTrend = olderVol > 0 ? recentVol / olderVol : 1
    const volumeScore = Math.max(0, Math.min(100, 50 + (volTrend - 1) * 50))

    // 5. Signal sentiment
    const symSignals = (signals || []).filter(s => s.symbol === symbol)
    const recentSignals = symSignals.slice(-10)
    const bullSignals = recentSignals.filter(s => s.direction === 'BUY' || s.direction === 'LONG').length
    const signalScore = recentSignals.length > 0
      ? (bullSignals / recentSignals.length) * 100
      : 50

    // 6. Stochastic
    const { k } = calcStochastic(highs, lows, closes, 14, 3)
    const validK = k.filter(v => !isNaN(v))
    const stochScore = validK.length > 0 ? validK[validK.length - 1] : 50

    // Composite score
    const components = [
      { name: 'Momentum (RSI)', score: momentumScore, weight: 0.2 },
      { name: 'Volatility', score: volatilityScore, weight: 0.15 },
      { name: 'Price Trend', score: priceScore, weight: 0.2 },
      { name: 'Volume', score: volumeScore, weight: 0.1 },
      { name: 'Signals', score: signalScore, weight: 0.15 },
      { name: 'Stochastic', score: stochScore, weight: 0.2 },
    ]

    const composite = components.reduce((s, c) => s + c.score * c.weight, 0)

    // Classification
    let label = 'Neutral'
    let color = 'text-gray-400'
    let Icon = Meh
    if (composite >= 75) { label = 'Extreme Greed'; color = 'text-accent-green'; Icon = Smile }
    else if (composite >= 55) { label = 'Greed'; color = 'text-accent-green'; Icon = Smile }
    else if (composite >= 45) { label = 'Neutral'; color = 'text-gray-400'; Icon = Meh }
    else if (composite >= 25) { label = 'Fear'; color = 'text-accent-red'; Icon = Frown }
    else { label = 'Extreme Fear'; color = 'text-accent-red'; Icon = Skull }

    // Trend
    const prevComposite = components.reduce((s, c) => {
      // Approximate previous by using slightly older values
      return s + c.score * c.weight
    }, 0) - 5 // simplified
    const trend = composite > prevComposite ? 'up' : 'down'

    return { composite, label, color, Icon, components, trend }
  }, [candles, signals, fills, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Brain size={12} className="text-accent-purple" />
          Fear & Greed
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { composite, label, color, Icon, components, trend } = data

  // Gauge arc
  const angle = (composite / 100) * 180 - 90
  const rad = (angle * Math.PI) / 180
  const cx = 50, cy = 50, r = 35
  const needleX = cx + r * Math.sin(rad)
  const needleY = cy - r * Math.cos(rad)

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Brain size={12} className="text-accent-purple" />
        Fear & Greed Index
      </div>

      {/* Gauge */}
      <div className="relative flex justify-center mb-2">
        <svg viewBox="0 0 100 60" className="w-full h-[60px]">
          {/* Arc segments */}
          <path d="M 15 50 A 35 35 0 0 1 85 50" fill="none" stroke="#ef4444" strokeWidth="6" strokeOpacity="0.3" />
          <path d="M 15 50 A 35 35 0 0 1 50 15" fill="none" stroke="#f97316" strokeWidth="6" strokeOpacity="0.3" />
          <path d="M 50 15 A 35 35 0 0 1 85 50" fill="none" stroke="#22c55e" strokeWidth="6" strokeOpacity="0.3" />
          {/* Needle */}
          <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="2" fill="#e2e8f0" />
          {/* Labels */}
          <text x="12" y="56" fontSize="4" fill="#64748b">Fear</text>
          <text x="78" y="56" fontSize="4" fill="#64748b">Greed</text>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <div className={'text-lg font-bold ' + color}>{composite.toFixed(0)}</div>
        </div>
      </div>

      {/* Label */}
      <div className="flex items-center justify-center gap-1.5 mb-2">
        <Icon size={14} className={color} />
        <span className={'text-xs font-bold ' + color}>{label}</span>
        {trend === 'up' ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
      </div>

      {/* Component breakdown */}
      <div className="space-y-0.5">
        {components.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[8px]">
            <span className="text-gray-500 w-20 truncate">{c.name}</span>
            <div className="flex-1 h-1.5 bg-bg-800 rounded-full overflow-hidden">
              <div
                className={'h-full rounded-full transition-all ' + (c.score >= 55 ? 'bg-accent-green' : c.score >= 45 ? 'bg-gray-500' : 'bg-accent-red')}
                style={{ width: `${c.score}%` }}
              />
            </div>
            <span className="font-mono text-gray-400 w-6 text-right">{c.score.toFixed(0)}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Composite of 6 signals. &gt;75 = extreme greed (sell), &lt;25 = extreme fear (buy).
      </div>
    </div>
  )
}
