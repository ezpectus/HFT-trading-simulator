import { useMemo } from 'react'
import { Gauge, TrendingUp, TrendingDown, AlertCircle, CheckCircle2 } from 'lucide-react'
import { calcRSI, calcEMA, calcATR, calcSMA } from '../utils/indicators'

export default function ConfidenceScorer({ candles, signals, fills, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 15) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const volumes = symCandles.map(c => c.volume || 0)

    // Gather confidence factors
    const factors = []

    // 1. Trend alignment (EMA 9 > 21 > 50)
    const ema9 = calcEMA(closes, 9)
    const ema21 = calcEMA(closes, 21)
    const sma50 = calcSMA(closes, Math.min(50, closes.length))
    const lastEma9 = ema9[ema9.length - 1]
    const lastEma21 = ema21[ema21.length - 1]
    const lastSma50 = sma50[sma50.length - 1]
    const bullAligned = lastEma9 > lastEma21 && lastEma21 > lastSma50
    const bearAligned = lastEma9 < lastEma21 && lastEma21 < lastSma50
    factors.push({
      name: 'Trend Alignment',
      score: bullAligned || bearAligned ? 100 : 40,
      direction: bullAligned ? 'bull' : bearAligned ? 'bear' : 'neutral',
      detail: bullAligned ? 'EMA9>21>SMA50' : bearAligned ? 'EMA9<21<SMA50' : 'Misaligned',
    })

    // 2. RSI momentum
    const rsi = calcRSI(closes, 14)
    const lastRsi = rsi[rsi.length - 1] || 50
    const rsiScore = lastRsi > 50 ? Math.min((lastRsi - 50) * 2, 100) : Math.max((50 - lastRsi) * 2, 0)
    factors.push({
      name: 'RSI Momentum',
      score: Math.abs(rsiScore),
      direction: lastRsi > 50 ? 'bull' : 'bear',
      detail: `RSI ${lastRsi.toFixed(0)}`,
    })

    // 3. Volume confirmation
    const recentVol = volumes.slice(-5).reduce((s, v) => s + v, 0) / 5
    const olderVol = volumes.slice(-15, -5).reduce((s, v) => s + v, 0) / 10
    const volRatio = olderVol > 0 ? recentVol / olderVol : 1
    const volScore = Math.min(volRatio * 50, 100)
    factors.push({
      name: 'Volume Confirmation',
      score: volScore,
      direction: volRatio > 1 ? 'bull' : 'neutral',
      detail: `${volRatio.toFixed(2)}x avg`,
    })

    // 4. Volatility regime
    const atr = calcATR(highs, lows, closes, 14)
    const validAtr = atr.filter(v => !isNaN(v))
    const lastAtr = validAtr.length > 0 ? validAtr[validAtr.length - 1] : 0
    const avgAtr = validAtr.length > 0 ? validAtr.reduce((s, v) => s + v, 0) / validAtr.length : 0
    const atrRatio = avgAtr > 0 ? lastAtr / avgAtr : 1
    const volRegimeScore = atrRatio > 2 ? 30 : atrRatio > 1.5 ? 50 : atrRatio < 0.5 ? 40 : 80
    factors.push({
      name: 'Volatility Regime',
      score: volRegimeScore,
      direction: 'neutral',
      detail: atrRatio > 1.5 ? 'High vol' : atrRatio < 0.7 ? 'Low vol' : 'Normal',
    })

    // 5. Signal consensus
    const symSignals = (signals || []).filter(s => s.symbol === symbol).slice(-5)
    const bullSigs = symSignals.filter(s => s.direction === 'BUY' || s.direction === 'LONG').length
    const bearSigs = symSignals.filter(s => s.direction === 'SELL' || s.direction === 'SHORT').length
    const sigConsensus = symSignals.length > 0
      ? Math.max(bullSigs, bearSigs) / symSignals.length * 100
      : 50
    factors.push({
      name: 'Signal Consensus',
      score: sigConsensus,
      direction: bullSigs > bearSigs ? 'bull' : bearSigs > bullSigs ? 'bear' : 'neutral',
      detail: `${symSignals.length} signals`,
    })

    // 6. Price position (above/below key MAs)
    const lastPrice = closes[closes.length - 1]
    const aboveAll = lastPrice > lastEma9 && lastPrice > lastEma21 && lastPrice > lastSma50
    const belowAll = lastPrice < lastEma9 && lastPrice < lastEma21 && lastPrice < lastSma50
    factors.push({
      name: 'Price Position',
      score: aboveAll || belowAll ? 90 : 50,
      direction: aboveAll ? 'bull' : belowAll ? 'bear' : 'neutral',
      detail: aboveAll ? 'Above all MAs' : belowAll ? 'Below all MAs' : 'Mixed',
    })

    // 7. Candle body efficiency
    const last3Candles = symCandles.slice(-3)
    const bodyEfficiency = last3Candles.reduce((s, c) => s + Math.abs(c.close - c.open), 0) /
      last3Candles.reduce((s, c) => s + (c.high - c.low), 0)
    factors.push({
      name: 'Body Efficiency',
      score: Math.min(bodyEfficiency * 150, 100),
      direction: last3Candles[last3Candles.length - 1].close >= last3Candles[0].open ? 'bull' : 'bear',
      detail: `${(bodyEfficiency * 100).toFixed(0)}% body/range`,
    })

    // 8. No contradiction (fills vs signals)
    const symFills = (fills || []).filter(f => f.symbol === symbol && f.status === 'FILLED').slice(-5)
    const buyFills = symFills.filter(f => f.side === 'BUY').length
    const sellFills = symFills.filter(f => f.side === 'SELL').length
    const fillDir = buyFills > sellFills ? 'bull' : sellFills > buyFills ? 'bear' : 'neutral'
    const sigDir = bullSigs > bearSigs ? 'bull' : bearSigs > bullSigs ? 'bear' : 'neutral'
    const noContradiction = fillDir === sigDir || fillDir === 'neutral' || sigDir === 'neutral'
    factors.push({
      name: 'No Contradiction',
      score: noContradiction ? 80 : 30,
      direction: sigDir,
      detail: noContradiction ? 'Aligned' : 'Fills vs signals conflict',
    })

    // Composite confidence
    const avgScore = factors.reduce((s, f) => s + f.score, 0) / factors.length
    const direction = factors.filter(f => f.direction === 'bull').length > factors.filter(f => f.direction === 'bear').length ? 'bull' : 'bear'
    const bullFactors = factors.filter(f => f.direction === 'bull').length
    const bearFactors = factors.filter(f => f.direction === 'bear').length

    let confidence = 'Low'
    let confidenceColor = 'text-gray-400'
    if (avgScore > 75) { confidence = 'Very High'; confidenceColor = 'text-accent-green' }
    else if (avgScore > 60) { confidence = 'High'; confidenceColor = 'text-accent-green' }
    else if (avgScore > 45) { confidence = 'Medium'; confidenceColor = 'text-accent-yellow' }
    else if (avgScore > 30) { confidence = 'Low'; confidenceColor = 'text-accent-orange' }
    else { confidence = 'Very Low'; confidenceColor = 'text-accent-red' }

    return { factors, avgScore, confidence, confidenceColor, direction, bullFactors, bearFactors }
  }, [candles, signals, fills, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Gauge size={12} className="text-accent-green" />
          Confidence Scorer
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 15+ candles</div>
      </div>
    )
  }

  const { factors, avgScore, confidence, confidenceColor, direction, bullFactors, bearFactors } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Gauge size={12} className="text-accent-green" />
        Signal Confidence Scorer
      </div>

      {/* Score gauge */}
      <div className="bg-bg-800 rounded px-2 py-2 mb-2 text-center">
        <div className="text-[8px] text-gray-600">Confidence Level</div>
        <div className={'text-xl font-bold ' + confidenceColor}>{confidence}</div>
        <div className="text-[10px] font-mono text-gray-400">{avgScore.toFixed(0)}/100</div>
        <div className="flex items-center justify-center gap-1 mt-0.5">
          {direction === 'bull' ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
          <span className={'text-[8px] ' + (direction === 'bull' ? 'text-accent-green' : 'text-accent-red')}>
            {direction === 'bull' ? 'Bullish bias' : 'Bearish bias'} ({bullFactors}B/{bearFactors}S)
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-2 bg-bg-800 rounded-full overflow-hidden mb-2">
        <div
          className={'h-full rounded-full transition-all ' + (avgScore > 60 ? 'bg-accent-green' : avgScore > 45 ? 'bg-accent-yellow' : 'bg-accent-red')}
          style={{ width: `${avgScore}%` }}
        />
      </div>

      {/* Factors */}
      <div className="space-y-0.5">
        {factors.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
            {f.direction === 'bull' ? <TrendingUp size={7} className="text-accent-green shrink-0" /> :
             f.direction === 'bear' ? <TrendingDown size={7} className="text-accent-red shrink-0" /> :
             <AlertCircle size={7} className="text-gray-500 shrink-0" />}
            <span className="text-gray-400 w-20 truncate">{f.name}</span>
            <div className="flex-1 h-1 bg-bg-600 rounded-full overflow-hidden">
              <div
                className={'h-full rounded-full ' + (f.score > 60 ? 'bg-accent-green' : f.score > 40 ? 'bg-accent-yellow' : 'bg-accent-red')}
                style={{ width: `${f.score}%` }}
              />
            </div>
            <span className="font-mono text-gray-500 w-8 text-right">{f.score.toFixed(0)}</span>
            <span className="text-gray-700 w-16 text-right truncate">{f.detail}</span>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      <div className="mt-2 bg-bg-800 rounded px-2 py-1 flex items-center gap-1">
        {avgScore > 60 ? (
          <>
            <CheckCircle2 size={10} className="text-accent-green shrink-0" />
            <span className="text-[8px] text-accent-green">
              High confidence {direction} signal — consider entry
            </span>
          </>
        ) : avgScore < 40 ? (
          <>
            <AlertCircle size={10} className="text-accent-red shrink-0" />
            <span className="text-[8px] text-accent-red">
              Low confidence — wait for more confirmation
            </span>
          </>
        ) : (
          <>
            <AlertCircle size={10} className="text-accent-yellow shrink-0" />
            <span className="text-[8px] text-accent-yellow">
              Medium confidence — proceed with caution
            </span>
          </>
        )}
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        8-factor confidence model. &gt;75 = very high, &gt;60 = high, &lt;40 = low. Direction from factor majority.
      </div>
    </div>
  )
}
