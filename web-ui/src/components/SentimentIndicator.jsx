import { useMemo } from 'react'
import { Newspaper, TrendingUp, TrendingDown, Minus } from 'lucide-react'

const NEWS_EVENTS = [
  { id: 'fed_hawkish', label: 'Fed Hawkish', impact: 'bearish', weight: 3 },
  { id: 'fed_dovish', label: 'Fed Dovish', impact: 'bullish', weight: 3 },
  { id: 'regulation_fear', label: 'Regulation Fear', impact: 'bearish', weight: 2 },
  { id: 'institutional_buy', label: 'Institutional Buy', impact: 'bullish', weight: 2 },
  { id: 'exchange_hack', label: 'Exchange Hack', impact: 'bearish', weight: 3 },
  { id: 'etf_approval', label: 'ETF Approval', impact: 'bullish', weight: 3 },
  { id: 'whale_move', label: 'Whale Movement', impact: 'neutral', weight: 1 },
  { id: 'tech_breakthrough', label: 'Tech Breakthrough', impact: 'bullish', weight: 2 },
  { id: 'market_crash', label: 'Market Crash', impact: 'bearish', weight: 3 },
  { id: 'adoption_news', label: 'Adoption News', impact: 'bullish', weight: 1 },
]

export default function SentimentIndicator({ candles, signals, symbol, exchange }) {
  const sentiment = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-20)

    if (symCandles.length < 5) return null

    // Price momentum sentiment
    const recent = symCandles.slice(-5)
    const older = symCandles.slice(-10, -5)
    const recentAvg = recent.reduce((s, c) => s + c.close, 0) / recent.length
    const olderAvg = older.length > 0 ? older.reduce((s, c) => s + c.close, 0) / older.length : recentAvg
    const priceMomentum = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0

    // Signal sentiment
    const symSignals = (signals || []).filter(s => s.symbol === symbol)
    const longCount = symSignals.filter(s => s.direction === 'LONG').length
    const shortCount = symSignals.filter(s => s.direction === 'SHORT').length
    const signalBias = symSignals.length > 0 ? (longCount - shortCount) / symSignals.length : 0

    // Volume sentiment (high volume = high interest)
    const avgVol = symCandles.reduce((s, c) => s + c.volume, 0) / symCandles.length
    const lastVol = symCandles[symCandles.length - 1].volume
    const volSpike = avgVol > 0 ? (lastVol / avgVol) : 1

    // Simulated news events (random based on candle patterns)
    const newsItems = []
    const lastCandle = symCandles[symCandles.length - 1]
    const bodySize = Math.abs(lastCandle.close - lastCandle.open)
    const range = lastCandle.high - lastCandle.low || 0.001
    const bodyRatio = bodySize / range

    if (volSpike > 2 && bodyRatio > 0.6) {
      if (lastCandle.close > lastCandle.open) {
        newsItems.push({ ...NEWS_EVENTS[3], time: lastCandle.timestamp })
      } else {
        newsItems.push({ ...NEWS_EVENTS[8], time: lastCandle.timestamp })
      }
    }
    if (priceMomentum > 2) {
      newsItems.push({ ...NEWS_EVENTS[5], time: lastCandle.timestamp })
    }
    if (priceMomentum < -2) {
      newsItems.push({ ...NEWS_EVENTS[0], time: lastCandle.timestamp })
    }
    if (volSpike > 1.5 && bodyRatio < 0.3) {
      newsItems.push({ ...NEWS_EVENTS[6], time: lastCandle.timestamp })
    }

    // Calculate sentiment score (-100 to +100)
    let score = 0
    score += Math.max(-30, Math.min(30, priceMomentum * 10))
    score += signalBias * 30
    score += Math.max(-20, Math.min(20, (volSpike - 1) * 10))

    for (const news of newsItems) {
      if (news.impact === 'bullish') score += news.weight * 5
      else if (news.impact === 'bearish') score -= news.weight * 5
    }

    score = Math.max(-100, Math.min(100, score))

    let label, color, Icon
    if (score > 30) { label = 'BULLISH'; color = 'text-accent-green'; Icon = TrendingUp }
    else if (score > 10) { label = 'SLIGHTLY BULLISH'; color = 'text-accent-green'; Icon = TrendingUp }
    else if (score > -10) { label = 'NEUTRAL'; color = 'text-gray-400'; Icon = Minus }
    else if (score > -30) { label = 'SLIGHTLY BEARISH'; color = 'text-accent-red'; Icon = TrendingDown }
    else { label = 'BEARISH'; color = 'text-accent-red'; Icon = TrendingDown }

    return {
      score,
      label,
      color,
      Icon,
      priceMomentum,
      signalBias: signalBias * 100,
      volSpike,
      longCount,
      shortCount,
      newsItems,
    }
  }, [candles, signals, symbol, exchange])

  if (!sentiment) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Newspaper size={12} className="text-accent-yellow" />
          Sentiment Indicator
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { score, label, color, Icon, priceMomentum, signalBias, volSpike, longCount, shortCount, newsItems } = sentiment

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Newspaper size={12} className="text-accent-yellow" />
        Sentiment Indicator
      </div>

      {/* Score gauge */}
      <div className="flex items-center gap-2 mb-2">
        <div className={'flex items-center gap-1.5 ' + color}>
          <Icon size={16} />
          <span className="text-[11px] font-bold">{label}</span>
        </div>
        <div className="flex-1" />
        <div className={'text-lg font-bold font-mono ' + color}>
          {score > 0 ? '+' : ''}{score.toFixed(0)}
        </div>
      </div>

      {/* Sentiment bar */}
      <div className="relative h-2 bg-bg-600 rounded-full overflow-hidden mb-2">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-bg-500" />
        <div
          className={'absolute top-0 h-full rounded-full ' + (score >= 0 ? 'bg-accent-green' : 'bg-accent-red')}
          style={{
            left: score >= 0 ? '50%' : `${50 + score / 2}%`,
            width: `${Math.abs(score) / 2}%`,
          }}
        />
      </div>

      {/* Factors */}
      <div className="grid grid-cols-3 gap-2 mb-2 text-[9px]">
        <div>
          <div className="text-gray-600">Price Mom</div>
          <div className={'font-mono ' + (priceMomentum >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {priceMomentum >= 0 ? '+' : ''}{priceMomentum.toFixed(2)}%
          </div>
        </div>
        <div>
          <div className="text-gray-600">Signals</div>
          <div className="font-mono text-gray-400">
            {longCount}L / {shortCount}S
          </div>
        </div>
        <div>
          <div className="text-gray-600">Vol Spike</div>
          <div className={'font-mono ' + (volSpike > 1.5 ? 'text-accent-yellow' : 'text-gray-400')}>
            {volSpike.toFixed(1)}x
          </div>
        </div>
      </div>

      {/* News events */}
      {newsItems.length > 0 && (
        <div className="border-t border-bg-600 pt-2">
          <div className="text-[8px] text-gray-600 uppercase mb-1">Detected Events</div>
          <div className="space-y-0.5">
            {newsItems.map((n, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[9px]">
                <div className={'w-1.5 h-1.5 rounded-full ' +
                  (n.impact === 'bullish' ? 'bg-accent-green' : n.impact === 'bearish' ? 'bg-accent-red' : 'bg-gray-500')} />
                <span className="text-gray-400">{n.label}</span>
                <span className="text-gray-600 ml-auto">{n.impact}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
