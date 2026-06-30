import { useMemo } from 'react'
import { Layers, TrendingUp, TrendingDown, CheckCircle2, XCircle } from 'lucide-react'
import { calcRSI, calcEMA, calcSMA } from '../utils/indicators'
import { formatPrice } from '../utils/format'

export default function MultiTimeframeConfluence({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-200)
    if (symCandles.length < 30) return null

    const closes = symCandles.map(c => c.close)
    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)

    // Build multiple timeframes by aggregating
    const timeframes = [
      { name: '1x', multiplier: 1, label: 'Short' },
      { name: '3x', multiplier: 3, label: 'Medium' },
      { name: '5x', multiplier: 5, label: 'Long' },
    ]

    const tfData = timeframes.map(tf => {
      const aggregated = []
      for (let i = 0; i < closes.length; i += tf.multiplier) {
        const chunk = symCandles.slice(i, i + tf.multiplier)
        if (chunk.length === 0) continue
        aggregated.push({
          open: chunk[0].open,
          high: Math.max(...chunk.map(c => c.high)),
          low: Math.min(...chunk.map(c => c.low)),
          close: chunk[chunk.length - 1].close,
          volume: chunk.reduce((s, c) => s + (c.volume || 0), 0),
        })
      }
      const tfCloses = aggregated.map(c => c.close)
      const tfHighs = aggregated.map(c => c.high)
      const tfLows = aggregated.map(c => c.low)

      if (tfCloses.length < 10) return { name: tf.name, label: tf.label, valid: false }

      // Indicators per timeframe
      const sma20 = calcSMA(tfCloses, Math.min(20, tfCloses.length))
      const ema9 = calcEMA(tfCloses, 9)
      const rsi = calcRSI(tfCloses, 14)
      const lastClose = tfCloses[tfCloses.length - 1]
      const lastSma = sma20[sma20.length - 1] || lastClose
      const lastEma = ema9[ema9.length - 1] || lastClose
      const lastRsi = rsi[rsi.length - 1] || 50

      // Signals
      const signals = []
      // Trend: price vs SMA
      if (lastClose > lastSma) signals.push({ name: 'Price > SMA20', dir: 'bull' })
      else signals.push({ name: 'Price < SMA20', dir: 'bear' })
      // EMA cross
      if (lastEma > lastSma) signals.push({ name: 'EMA9 > SMA20', dir: 'bull' })
      else signals.push({ name: 'EMA9 < SMA20', dir: 'bear' })
      // RSI
      if (lastRsi > 55) signals.push({ name: 'RSI bullish', dir: 'bull' })
      else if (lastRsi < 45) signals.push({ name: 'RSI bearish', dir: 'bear' })
      else signals.push({ name: 'RSI neutral', dir: 'neutral' })
      // Momentum (last 3 candles)
      const recent3 = tfCloses.slice(-3)
      if (recent3[recent3.length - 1] > recent3[0]) signals.push({ name: 'Momentum up', dir: 'bull' })
      else signals.push({ name: 'Momentum down', dir: 'bear' })

      const bullCount = signals.filter(s => s.dir === 'bull').length
      const bearCount = signals.filter(s => s.dir === 'bear').length
      const score = (bullCount - bearCount) / signals.length * 100

      return {
        name: tf.name, label: tf.label, valid: true,
        lastClose, lastSma, lastEma, lastRsi,
        signals, bullCount, bearCount, score,
      }
    })

    const validTFs = tfData.filter(tf => tf.valid)
    if (validTFs.length === 0) return null

    // Confluence score
    const totalBull = validTFs.reduce((s, tf) => s + tf.bullCount, 0)
    const totalBear = validTFs.reduce((s, tf) => s + tf.bearCount, 0)
    const totalSignals = validTFs.reduce((s, tf) => s + tf.signals.length, 0)
    const confluenceScore = ((totalBull - totalBear) / totalSignals) * 100

    // Consensus
    let consensus = 'Mixed'
    let consensusColor = 'text-gray-400'
    if (confluenceScore > 50) { consensus = 'Strong Bullish'; consensusColor = 'text-accent-green' }
    else if (confluenceScore > 20) { consensus = 'Bullish'; consensusColor = 'text-accent-green' }
    else if (confluenceScore < -50) { consensus = 'Strong Bearish'; consensusColor = 'text-accent-red' }
    else if (confluenceScore < -20) { consensus = 'Bearish'; consensusColor = 'text-accent-red' }

    // Agreement: all timeframes same direction
    const allBull = validTFs.every(tf => tf.score > 0)
    const allBear = validTFs.every(tf => tf.score < 0)
    const perfectAlignment = allBull || allBear

    return {
      validTFs, confluenceScore, consensus, consensusColor,
      totalBull, totalBear, perfectAlignment, allBull, allBear,
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Layers size={12} className="text-accent-blue" />
          MTF Confluence
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 30+ candles</div>
      </div>
    )
  }

  const { validTFs, confluenceScore, consensus, consensusColor, totalBull, totalBear, perfectAlignment, allBull, allBear } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Layers size={12} className="text-accent-blue" />
        Multi-Timeframe Confluence
      </div>

      {/* Confluence score */}
      <div className="bg-bg-800 rounded px-2 py-2 mb-2 text-center">
        <div className="text-[8px] text-gray-600">Confluence Score</div>
        <div className={'text-xl font-bold ' + consensusColor}>
          {confluenceScore >= 0 ? '+' : ''}{confluenceScore.toFixed(0)}
        </div>
        <div className={'text-[10px] font-medium ' + consensusColor}>{consensus}</div>
      </div>

      {/* Perfect alignment */}
      {perfectAlignment && (
        <div className={'mb-2 rounded px-1.5 py-1 flex items-center gap-1 ' + (allBull ? 'bg-accent-green/10' : 'bg-accent-red/10')}>
          <CheckCircle2 size={10} className={allBull ? 'text-accent-green' : 'text-accent-red'} />
          <span className={'text-[8px] ' + (allBull ? 'text-accent-green' : 'text-accent-red')}>
            Perfect alignment: all timeframes {allBull ? 'bullish' : 'bearish'}
          </span>
        </div>
      )}

      {/* Per-timeframe breakdown */}
      <div className="space-y-1.5">
        {validTFs.map((tf, i) => (
          <div key={i} className="bg-bg-800 rounded p-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-gray-400 font-medium">{tf.label} ({tf.name})</span>
              <span className={'text-[9px] font-mono ' + (tf.score > 0 ? 'text-accent-green' : tf.score < 0 ? 'text-accent-red' : 'text-gray-400')}>
                {tf.score >= 0 ? '+' : ''}{tf.score.toFixed(0)}
              </span>
            </div>
            {/* Signal dots */}
            <div className="flex gap-0.5 mb-1">
              {tf.signals.map((s, j) => (
                <div
                  key={j}
                  className={'flex-1 h-1.5 rounded-full ' + (s.dir === 'bull' ? 'bg-accent-green' : s.dir === 'bear' ? 'bg-accent-red' : 'bg-gray-600')}
                  title={s.name}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[7px]">
              {tf.signals.map((s, j) => (
                <span key={j} className={s.dir === 'bull' ? 'text-accent-green' : s.dir === 'bear' ? 'text-accent-red' : 'text-gray-600'}>
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-1 mt-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5 flex justify-between">
          <span className="text-gray-600">Total Bull</span>
          <span className="font-mono text-accent-green">{totalBull}</span>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5 flex justify-between">
          <span className="text-gray-600">Total Bear</span>
          <span className="font-mono text-accent-red">{totalBear}</span>
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Aggregates 3 timeframes (1x/3x/5x). Score = net bullish signals. Perfect alignment = highest probability.
      </div>
    </div>
  )
}
