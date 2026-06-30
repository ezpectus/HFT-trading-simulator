import { useMemo, useState } from 'react'
import { Layers, TrendingUp, TrendingDown } from 'lucide-react'
import { calcSMA, calcRSI } from '../utils/indicators'
import { formatPrice } from '../utils/format'

const TIMEFRAMES = [
  { label: '1m', multiplier: 1 },
  { label: '5m', multiplier: 5 },
  { label: '15m', multiplier: 15 },
  { label: '1h', multiplier: 60 },
]

export default function MultiTimeframeComparison({ candles, symbol, exchange }) {
  const [selectedTfs, setSelectedTfs] = useState(['1m', '5m', '15m', '1h'])

  const analysis = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-200)

    if (symCandles.length < 20) return null

    const results = TIMEFRAMES.map(tf => {
      const tfCandles = []
      for (let i = 0; i < symCandles.length; i += tf.multiplier) {
        const slice = symCandles.slice(i, i + tf.multiplier)
        if (slice.length === 0) continue
        tfCandles.push({
          open: slice[0].open,
          high: Math.max(...slice.map(c => c.high)),
          low: Math.min(...slice.map(c => c.low)),
          close: slice[slice.length - 1].close,
          volume: slice.reduce((s, c) => s + (c.volume || 0), 0),
          time: slice[0].time,
        })
      }

      if (tfCandles.length < 15) return { ...tf, valid: false }

      const closes = tfCandles.map(c => c.close)
      const sma20 = calcSMA(closes, Math.min(20, closes.length))
      const rsi = calcRSI(closes, 14)

      const lastClose = closes[closes.length - 1]
      const lastSma = sma20[sma20.length - 1]
      const lastRsi = rsi[rsi.length - 1]

      const trend = !isNaN(lastSma)
        ? lastClose > lastSma ? 'bullish' : 'bearish'
        : 'neutral'

      const rsiSignal = isNaN(lastRsi) ? 'neutral'
        : lastRsi > 70 ? 'overbought'
        : lastRsi < 30 ? 'oversold'
        : lastRsi > 50 ? 'bullish' : 'bearish'

      // Recent momentum
      const prevClose = closes[closes.length - 2] || lastClose
      const momentum = ((lastClose - prevClose) / prevClose) * 100

      return {
        ...tf,
        valid: true,
        lastClose,
        lastSma,
        lastRsi: isNaN(lastRsi) ? null : lastRsi,
        trend,
        rsiSignal,
        momentum,
      }
    })

    // Overall consensus
    const validResults = results.filter(r => r.valid)
    const bullCount = validResults.filter(r => r.trend === 'bullish').length
    const bearCount = validResults.filter(r => r.trend === 'bearish').length
    const consensus = bullCount > bearCount ? 'Bullish' : bearCount > bullCount ? 'Bearish' : 'Mixed'
    const consensusColor = bullCount > bearCount ? 'text-accent-green' : bearCount > bullCount ? 'text-accent-red' : 'text-gray-400'

    return { results, bullCount, bearCount, consensus, consensusColor, total: validResults.length }
  }, [candles, symbol, exchange])

  if (!analysis) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Layers size={12} className="text-accent-blue" />
          Multi-Timeframe
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { results, bullCount, bearCount, consensus, consensusColor, total } = analysis

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Layers size={12} className="text-accent-blue" />
        Multi-Timeframe Analysis
      </div>

      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[9px] text-gray-600">Consensus</span>
        <span className={'text-xs font-bold ' + consensusColor}>{consensus}</span>
      </div>

      {/* Consensus bar */}
      <div className="h-2 rounded-full overflow-hidden flex mb-2">
        <div className="bg-accent-green transition-all" style={{ width: `${(bullCount / total) * 100}%` }} />
        <div className="bg-gray-700 transition-all" style={{ width: `${((total - bullCount - bearCount) / total) * 100}%` }} />
        <div className="bg-accent-red transition-all" style={{ width: `${(bearCount / total) * 100}%` }} />
      </div>

      {/* Per-timeframe breakdown */}
      <div className="space-y-1">
        {results.map(r => (
          <div key={r.label} className="bg-bg-800 rounded px-2 py-1.5">
            {!r.valid ? (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-gray-500 font-mono">{r.label}</span>
                <span className="text-gray-600 italic">Insufficient data</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400 font-mono font-bold">{r.label}</span>
                  <div className="flex items-center gap-1">
                    {r.trend === 'bullish' ? (
                      <TrendingUp size={10} className="text-accent-green" />
                    ) : r.trend === 'bearish' ? (
                      <TrendingDown size={10} className="text-accent-red" />
                    ) : null}
                    <span className={'text-[9px] ' + (r.trend === 'bullish' ? 'text-accent-green' : r.trend === 'bearish' ? 'text-accent-red' : 'text-gray-500')}>
                      {r.trend}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[8px]">
                  <div>
                    <span className="text-gray-600">Price</span>
                    <div className="font-mono text-gray-300">{formatPrice(r.lastClose)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">RSI</span>
                    <div className={'font-mono ' + (r.rsiSignal === 'overbought' ? 'text-accent-red' : r.rsiSignal === 'oversold' ? 'text-accent-green' : 'text-gray-400')}>
                      {r.lastRsi ? r.lastRsi.toFixed(0) : '--'}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600">Mom</span>
                    <div className={'font-mono ' + (r.momentum >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                      {r.momentum >= 0 ? '+' : ''}{r.momentum.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 pt-1.5 border-t border-bg-600 text-[8px] text-gray-600">
        Aggregates 1m candles into higher TFs. Consensus = alignment across timeframes.
      </div>
    </div>
  )
}
