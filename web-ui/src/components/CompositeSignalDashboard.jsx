import { useMemo } from 'react'
import { LayoutDashboard, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { calcRSI, calcEMA, calcSMA, calcATR, calcMACD } from '../utils/indicators'

export default function CompositeSignalDashboard({ candles, signals, fills, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-60)
    if (symCandles.length < 20) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const volumes = symCandles.map(c => c.volume || 0)

    const indicators = []

    // 1. RSI
    const rsi = calcRSI(closes, 14)
    const lastRsi = rsi[rsi.length - 1]
    if (!isNaN(lastRsi)) {
      indicators.push({
        name: 'RSI(14)', value: lastRsi.toFixed(1),
        signal: lastRsi > 70 ? 'bear' : lastRsi < 30 ? 'bull' : lastRsi > 55 ? 'bull' : lastRsi < 45 ? 'bear' : 'neutral',
        strength: Math.abs(lastRsi - 50) / 50,
      })
    }

    // 2. MACD
    const macd = calcMACD(closes)
    if (macd.macd && macd.macd.length > 0) {
      const lastMacd = macd.macd[macd.macd.length - 1]
      const lastSignal = macd.signal[macd.signal.length - 1]
      const hist = lastMacd - lastSignal
      indicators.push({
        name: 'MACD', value: hist.toFixed(4),
        signal: hist > 0 ? 'bull' : hist < 0 ? 'bear' : 'neutral',
        strength: Math.min(Math.abs(hist) / Math.abs(lastMacd || 1), 1),
      })
    }

    // 3. EMA cross (9 vs 21)
    const ema9 = calcEMA(closes, 9)
    const ema21 = calcEMA(closes, 21)
    const emaDiff = ema9[ema9.length - 1] - ema21[ema21.length - 1]
    indicators.push({
      name: 'EMA 9/21', value: emaDiff.toFixed(2),
      signal: emaDiff > 0 ? 'bull' : emaDiff < 0 ? 'bear' : 'neutral',
      strength: Math.min(Math.abs(emaDiff) / closes[closes.length - 1] * 100, 1),
    })

    // 4. SMA 50 trend
    const sma50 = calcSMA(closes, Math.min(50, closes.length))
    const lastSma = sma50[sma50.length - 1]
    const priceVsSma = closes[closes.length - 1] - lastSma
    indicators.push({
      name: 'Price vs SMA50', value: priceVsSma.toFixed(2),
      signal: priceVsSma > 0 ? 'bull' : priceVsSma < 0 ? 'bear' : 'neutral',
      strength: Math.min(Math.abs(priceVsSma) / lastSma * 100, 1),
    })

    // 5. ATR volatility
    const atr = calcATR(highs, lows, closes, 14)
    const validAtr = atr.filter(v => !isNaN(v))
    const lastAtr = validAtr.length > 0 ? validAtr[validAtr.length - 1] : 0
    const avgAtr = validAtr.length > 0 ? validAtr.reduce((s, v) => s + v, 0) / validAtr.length : 0
    const volRatio = avgAtr > 0 ? lastAtr / avgAtr : 1
    indicators.push({
      name: 'ATR Volatility', value: volRatio.toFixed(2) + 'x',
      signal: volRatio > 1.5 ? 'bear' : volRatio < 0.7 ? 'bull' : 'neutral',
      strength: Math.min(Math.abs(volRatio - 1), 1),
    })

    // 6. Volume trend
    const recentVol = volumes.slice(-5).reduce((s, v) => s + v, 0) / 5
    const olderVol = volumes.slice(-15, -5).reduce((s, v) => s + v, 0) / 10
    const volTrend = olderVol > 0 ? recentVol / olderVol : 1
    indicators.push({
      name: 'Volume Trend', value: volTrend.toFixed(2) + 'x',
      signal: volTrend > 1.3 ? 'bull' : volTrend < 0.7 ? 'bear' : 'neutral',
      strength: Math.min(Math.abs(volTrend - 1), 1),
    })

    // 7. Momentum (rate of change)
    const roc = closes.length > 10 ? ((closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10]) * 100 : 0
    indicators.push({
      name: 'Momentum (ROC)', value: roc.toFixed(2) + '%',
      signal: roc > 1 ? 'bull' : roc < -1 ? 'bear' : 'neutral',
      strength: Math.min(Math.abs(roc) / 5, 1),
    })

    // 8. Bollinger position
    const sma20 = calcSMA(closes, 20)
    const lastSma20 = sma20[sma20.length - 1]
    const std20 = Math.sqrt(closes.slice(-20).reduce((s, v) => s + (v - lastSma20) ** 2, 0) / 20)
    const bbPos = std20 > 0 ? (closes[closes.length - 1] - lastSma20) / (std20 * 2) : 0
    indicators.push({
      name: 'BB Position', value: bbPos.toFixed(2),
      signal: bbPos > 0.8 ? 'bear' : bbPos < -0.8 ? 'bull' : bbPos > 0 ? 'bull' : 'bear',
      strength: Math.min(Math.abs(bbPos), 1),
    })

    // 9. Signal sentiment
    const symSignals = (signals || []).filter(s => s.symbol === symbol).slice(-10)
    const bullSignals = symSignals.filter(s => s.direction === 'BUY' || s.direction === 'LONG').length
    const signalScore = symSignals.length > 0 ? bullSignals / symSignals.length : 0.5
    indicators.push({
      name: 'Signal Sentiment', value: (signalScore * 100).toFixed(0) + '%',
      signal: signalScore > 0.6 ? 'bull' : signalScore < 0.4 ? 'bear' : 'neutral',
      strength: Math.abs(signalScore - 0.5) * 2,
    })

    // 10. Fill sentiment
    const symFills = (fills || []).filter(f => f.symbol === symbol && f.status === 'FILLED').slice(-10)
    const buyFills = symFills.filter(f => f.side === 'BUY').length
    const fillScore = symFills.length > 0 ? buyFills / symFills.length : 0.5
    indicators.push({
      name: 'Fill Sentiment', value: (fillScore * 100).toFixed(0) + '%',
      signal: fillScore > 0.6 ? 'bull' : fillScore < 0.4 ? 'bear' : 'neutral',
      strength: Math.abs(fillScore - 0.5) * 2,
    })

    // Aggregate score
    const bullScore = indicators.filter(i => i.signal === 'bull').reduce((s, i) => s + i.strength, 0)
    const bearScore = indicators.filter(i => i.signal === 'bear').reduce((s, i) => s + i.strength, 0)
    const neutralScore = indicators.filter(i => i.signal === 'neutral').reduce((s, i) => s + i.strength, 0)
    const totalScore = bullScore + bearScore + neutralScore || 1

    const bullPct = (bullScore / totalScore) * 100
    const bearPct = (bearScore / totalScore) * 100
    const neutralPct = (neutralScore / totalScore) * 100

    const netScore = ((bullScore - bearScore) / totalScore) * 100

    let consensus = 'Neutral'
    let consensusColor = 'text-gray-400'
    if (netScore > 30) { consensus = 'Strong Buy'; consensusColor = 'text-accent-green' }
    else if (netScore > 10) { consensus = 'Buy'; consensusColor = 'text-accent-green' }
    else if (netScore < -30) { consensus = 'Strong Sell'; consensusColor = 'text-accent-red' }
    else if (netScore < -10) { consensus = 'Sell'; consensusColor = 'text-accent-red' }

    // Agreement
    const bullCount = indicators.filter(i => i.signal === 'bull').length
    const bearCount = indicators.filter(i => i.signal === 'bear').length
    const totalCount = indicators.length

    return {
      indicators, bullPct, bearPct, neutralPct, netScore,
      consensus, consensusColor, bullCount, bearCount, totalCount,
    }
  }, [candles, signals, fills, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <LayoutDashboard size={12} className="text-accent-blue" />
          Composite Dashboard
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 20+ candles</div>
      </div>
    )
  }

  const { indicators, bullPct, bearPct, neutralPct, netScore, consensus, consensusColor, bullCount, bearCount, totalCount } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <LayoutDashboard size={12} className="text-accent-blue" />
        Composite Signal Dashboard
      </div>

      {/* Consensus */}
      <div className="bg-bg-800 rounded px-2 py-2 mb-2 text-center">
        <div className="text-[8px] text-gray-600">Aggregate Consensus</div>
        <div className={'text-lg font-bold ' + consensusColor}>{consensus}</div>
        <div className="text-[8px] text-gray-500">
          Net: {netScore >= 0 ? '+' : ''}{netScore.toFixed(0)} | {bullCount}B / {bearCount}S / {totalCount - bullCount - bearCount}N
        </div>
      </div>

      {/* Bull/Bear/Neutral bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-2">
        <div className="bg-accent-green transition-all" style={{ width: `${bullPct}%` }} />
        <div className="bg-gray-600 transition-all" style={{ width: `${neutralPct}%` }} />
        <div className="bg-accent-red transition-all" style={{ width: `${bearPct}%` }} />
      </div>
      <div className="flex justify-between text-[7px] text-gray-600 mb-2">
        <span className="text-accent-green">Bull {bullPct.toFixed(0)}%</span>
        <span>Neutral {neutralPct.toFixed(0)}%</span>
        <span className="text-accent-red">Bear {bearPct.toFixed(0)}%</span>
      </div>

      {/* Indicator list */}
      <div className="space-y-0.5">
        {indicators.map((ind, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
            {ind.signal === 'bull' ? <TrendingUp size={8} className="text-accent-green shrink-0" /> :
             ind.signal === 'bear' ? <TrendingDown size={8} className="text-accent-red shrink-0" /> :
             <Minus size={8} className="text-gray-500 shrink-0" />}
            <span className="text-gray-400 w-24 truncate">{ind.name}</span>
            <div className="flex-1 h-1 bg-bg-600 rounded-full overflow-hidden">
              <div
                className={'h-full rounded-full ' + (ind.signal === 'bull' ? 'bg-accent-green' : ind.signal === 'bear' ? 'bg-accent-red' : 'bg-gray-500')}
                style={{ width: `${ind.strength * 100}%` }}
              />
            </div>
            <span className="font-mono text-gray-500 w-12 text-right">{ind.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Aggregates 10 indicators with strength weighting. Net &gt;+30 = strong buy, &lt;-30 = strong sell.
      </div>
    </div>
  )
}
