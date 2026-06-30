import { useMemo } from 'react'
import { CandlestickChart, TrendingUp, TrendingDown, Flame } from 'lucide-react'
import { calcRSI, calcSMA, calcATR } from '../utils/indicators'

export default function PriceActionScore({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-30)
    if (symCandles.length < 10) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const opens = symCandles.map(c => c.open)

    const scores = []

    // 1. Engulfing pattern
    const last = symCandles[symCandles.length - 1]
    const prev = symCandles[symCandles.length - 2]
    const bullEngulf = prev.close < prev.open && last.close > last.open && last.close > prev.open && last.open < prev.close
    const bearEngulf = prev.close > prev.open && last.close < last.open && last.close < prev.open && last.open > prev.close
    scores.push({
      name: 'Engulfing',
      score: bullEngulf ? 100 : bearEngulf ? 0 : 50,
      direction: bullEngulf ? 'bull' : bearEngulf ? 'bear' : 'neutral',
      detail: bullEngulf ? 'Bullish engulfing' : bearEngulf ? 'Bearish engulfing' : 'None',
    })

    // 2. Pin bar / hammer
    const body = Math.abs(last.close - last.open)
    const upperWick = last.high - Math.max(last.close, last.open)
    const lowerWick = Math.min(last.close, last.open) - last.low
    const totalRange = last.high - last.low || 1
    const isHammer = lowerWick > body * 2 && upperWick < body * 0.5 && body / totalRange < 0.4
    const isShootingStar = upperWick > body * 2 && lowerWick < body * 0.5 && body / totalRange < 0.4
    scores.push({
      name: 'Pin Bar',
      score: isHammer ? 90 : isShootingStar ? 10 : 50,
      direction: isHammer ? 'bull' : isShootingStar ? 'bear' : 'neutral',
      detail: isHammer ? 'Hammer' : isShootingStar ? 'Shooting star' : 'None',
    })

    // 3. Inside bar / outside bar
    const isInside = last.high < prev.high && last.low > prev.low
    const isOutside = last.high > prev.high && last.low < prev.low
    scores.push({
      name: 'Bar Pattern',
      score: isOutside ? 70 : isInside ? 40 : 50,
      direction: isOutside ? (last.close > last.open ? 'bull' : 'bear') : 'neutral',
      detail: isOutside ? 'Outside bar (breakout)' : isInside ? 'Inside bar (consolidation)' : 'Normal',
    })

    // 4. Consecutive candles
    let bullStreak = 0, bearStreak = 0
    for (let i = symCandles.length - 1; i >= 0; i--) {
      if (symCandles[i].close > symCandles[i].open) { bullStreak++; bearStreak = 0 }
      else if (symCandles[i].close < symCandles[i].open) { bearStreak++; bullStreak = 0 }
      else break
    }
    scores.push({
      name: 'Consecutive',
      score: bullStreak >= 3 ? 80 : bearStreak >= 3 ? 20 : 50,
      direction: bullStreak > bearStreak ? 'bull' : bearStreak > bullStreak ? 'bear' : 'neutral',
      detail: `${bullStreak}↑ / ${bearStreak}↓`,
    })

    // 5. Higher highs / higher lows
    const recent5 = symCandles.slice(-5)
    const hh = recent5[recent5.length - 1].high > recent5[0].high
    const hl = recent5[recent5.length - 1].low > recent5[0].low
    const ll = recent5[recent5.length - 1].low < recent5[0].low
    const lh = recent5[recent5.length - 1].high < recent5[0].high
    scores.push({
      name: 'HH/HL pattern',
      score: hh && hl ? 85 : ll && lh ? 15 : 50,
      direction: hh && hl ? 'bull' : ll && lh ? 'bear' : 'neutral',
      detail: hh && hl ? 'HH + HL' : ll && lh ? 'LL + LH' : 'Mixed',
    })

    // 6. Body efficiency
    const avgBody = symCandles.slice(-10).reduce((s, c) => s + Math.abs(c.close - c.open), 0) / 10
    const avgRange = symCandles.slice(-10).reduce((s, c) => s + (c.high - c.low), 0) / 10
    const efficiency = avgRange > 0 ? avgBody / avgRange : 0
    scores.push({
      name: 'Body Efficiency',
      score: Math.min(efficiency * 120, 100),
      direction: last.close > last.open ? 'bull' : 'bear',
      detail: `${(efficiency * 100).toFixed(0)}% body/range`,
    })

    // 7. RSI
    const rsi = calcRSI(closes, 14)
    const lastRsi = rsi[rsi.length - 1] || 50
    scores.push({
      name: 'RSI',
      score: lastRsi > 50 ? Math.min(50 + (lastRsi - 50), 100) : Math.max(50 - (50 - lastRsi), 0),
      direction: lastRsi > 50 ? 'bull' : 'bear',
      detail: `RSI ${lastRsi.toFixed(0)}`,
    })

    // 8. Trend (SMA)
    const sma = calcSMA(closes, Math.min(20, closes.length))
    const lastSma = sma[sma.length - 1]
    const priceVsSma = closes[closes.length - 1] - lastSma
    scores.push({
      name: 'Price vs SMA20',
      score: priceVsSma > 0 ? 75 : priceVsSma < 0 ? 25 : 50,
      direction: priceVsSma > 0 ? 'bull' : priceVsSma < 0 ? 'bear' : 'neutral',
      detail: priceVsSma > 0 ? 'Above' : 'Below',
    })

    // 9. Rejection at key level
    const atr = calcATR(highs, lows, closes, 14)
    const validAtr = atr.filter(v => !isNaN(v))
    const lastAtr = validAtr.length > 0 ? validAtr[validAtr.length - 1] : 0
    const rejectionFromHigh = (last.high - last.close) > body * 2 && last.close < last.open
    const rejectionFromLow = (last.close - last.low) > body * 2 && last.close > last.open
    scores.push({
      name: 'Rejection',
      score: rejectionFromLow ? 85 : rejectionFromHigh ? 15 : 50,
      direction: rejectionFromLow ? 'bull' : rejectionFromHigh ? 'bear' : 'neutral',
      detail: rejectionFromLow ? 'Rejected lows' : rejectionFromHigh ? 'Rejected highs' : 'None',
    })

    // 10. Momentum (ROC)
    const roc = closes.length > 5 ? ((closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5]) * 100 : 0
    scores.push({
      name: 'Momentum',
      score: roc > 0.5 ? Math.min(50 + roc * 10, 100) : roc < -0.5 ? Math.max(50 + roc * 10, 0) : 50,
      direction: roc > 0 ? 'bull' : roc < 0 ? 'bear' : 'neutral',
      detail: `${roc.toFixed(2)}%`,
    })

    // Composite
    const avgScore = scores.reduce((s, sc) => s + sc.score, 0) / scores.length
    const bullCount = scores.filter(s => s.direction === 'bull').length
    const bearCount = scores.filter(s => s.direction === 'bear').length

    let label = 'Neutral'
    let labelColor = 'text-gray-400'
    if (avgScore > 65) { label = 'Strong Bullish'; labelColor = 'text-accent-green' }
    else if (avgScore > 55) { label = 'Bullish'; labelColor = 'text-accent-green' }
    else if (avgScore < 35) { label = 'Strong Bearish'; labelColor = 'text-accent-red' }
    else if (avgScore < 45) { label = 'Bearish'; labelColor = 'text-accent-red' }

    return { scores, avgScore, label, labelColor, bullCount, bearCount }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <CandlestickChart size={12} className="text-accent-orange" />
          Price Action Score
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 10+ candles</div>
      </div>
    )
  }

  const { scores, avgScore, label, labelColor, bullCount, bearCount } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <CandlestickChart size={12} className="text-accent-orange" />
        Price Action Score
      </div>

      {/* Score */}
      <div className="bg-bg-800 rounded px-2 py-2 mb-2 text-center">
        <div className="text-[8px] text-gray-600">Composite Score</div>
        <div className={'text-xl font-bold ' + labelColor}>{avgScore.toFixed(0)}</div>
        <div className={'text-[10px] font-medium ' + labelColor}>{label}</div>
        <div className="text-[8px] text-gray-500 mt-0.5">{bullCount} bull / {bearCount} bear</div>
      </div>

      {/* Score bar */}
      <div className="relative h-2 bg-bg-800 rounded-full overflow-hidden mb-3">
        <div className="absolute inset-0 flex">
          <div className="flex-1 bg-accent-red/20" />
          <div className="flex-1 bg-gray-600/20" />
          <div className="flex-1 bg-accent-green/20" />
        </div>
        <div
          className={'absolute top-0 bottom-0 rounded-full ' + (avgScore > 55 ? 'bg-accent-green' : avgScore < 45 ? 'bg-accent-red' : 'bg-gray-500')}
          style={{ width: `${avgScore}%` }}
        />
      </div>

      {/* Pattern scores */}
      <div className="space-y-0.5">
        {scores.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
            {s.direction === 'bull' ? <TrendingUp size={7} className="text-accent-green shrink-0" /> :
             s.direction === 'bear' ? <TrendingDown size={7} className="text-accent-red shrink-0" /> :
             <Flame size={7} className="text-gray-500 shrink-0" />}
            <span className="text-gray-400 w-20 truncate">{s.name}</span>
            <div className="flex-1 h-1 bg-bg-600 rounded-full overflow-hidden">
              <div
                className={'h-full rounded-full ' + (s.score > 60 ? 'bg-accent-green' : s.score < 40 ? 'bg-accent-red' : 'bg-gray-500')}
                style={{ width: `${s.score}%` }}
              />
            </div>
            <span className="font-mono text-gray-500 w-6 text-right">{s.score.toFixed(0)}</span>
            <span className="text-gray-700 w-16 text-right truncate">{s.detail}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        10 candlestick patterns scored. &gt;65 = strong bullish, &lt;35 = strong bearish. Pure price action, no volume.
      </div>
    </div>
  )
}
