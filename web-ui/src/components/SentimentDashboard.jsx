import { memo, useMemo } from 'react'
import { Smile, Frown, Meh, TrendingUp, TrendingDown, MessageCircle, Newspaper, Twitter } from 'lucide-react'
import { Label } from '../utils/ui-helpers'

const MOCK_SENTIMENT = [
  { source: 'Twitter', score: 0.72, count: 3420, trend: 'up', change: 8.5 },
  { source: 'Reddit', score: 0.58, count: 1890, trend: 'up', change: 3.2 },
  { source: 'News', score: 0.45, count: 156, trend: 'down', change: -5.8 },
  { source: 'Telegram', score: 0.81, count: 2340, trend: 'up', change: 12.3 },
  { source: 'Discord', score: 0.65, count: 980, trend: 'neutral', change: 0.5 },
  { source: 'OnChain', score: 0.38, count: 450, trend: 'down', change: -2.1 },
]

const MOCK_HEADLINES = [
  { ts: '2h ago', source: 'CoinDesk', sentiment: 'positive', headline: 'Bitcoin breaks $44k resistance with strong volume' },
  { ts: '4h ago', source: 'Bloomberg', sentiment: 'neutral', headline: 'Crypto markets consolidate ahead of Fed meeting' },
  { ts: '6h ago', source: 'Reuters', sentiment: 'negative', headline: 'Regulatory concerns mount over DeFi protocols' },
  { ts: '8h ago', source: 'The Block', sentiment: 'positive', headline: 'Institutional inflows hit 6-month high' },
  { ts: '12h ago', source: 'Decrypt', sentiment: 'positive', headline: 'Major exchange announces new trading pairs' },
]

const MOCK_MENTIONS = [
  { symbol: 'BTC', mentions: 8420, sentiment: 0.72, change: 15.2 },
  { symbol: 'ETH', mentions: 5230, sentiment: 0.65, change: 8.8 },
  { symbol: 'SOL', mentions: 3120, sentiment: 0.81, change: 22.5 },
  { symbol: 'AVAX', mentions: 890, sentiment: 0.42, change: -3.5 },
  { symbol: 'LINK', mentions: 1240, sentiment: 0.58, change: 4.2 },
  { symbol: 'DOT', mentions: 670, sentiment: 0.38, change: -8.1 },
]

function sentimentIcon(score) {
  if (score >= 0.65) return <Smile size={12} className="text-accent-green" />
  if (score >= 0.45) return <Meh size={12} className="text-accent-yellow" />
  return <Frown size={12} className="text-accent-red" />
}

function sentimentColor(score) {
  if (score >= 0.65) return 'text-accent-green'
  if (score >= 0.45) return 'text-accent-yellow'
  return 'text-accent-red'
}

function sentimentBg(score) {
  if (score >= 0.65) return 'bg-accent-green'
  if (score >= 0.45) return 'bg-accent-yellow'
  return 'bg-accent-red'
}

const SOURCE_ICONS = {
  Twitter: Twitter,
  News: Newspaper,
  Reddit: MessageCircle,
}

const SentimentDashboard = memo(function SentimentDashboard({ symbol }) {
  const overall = useMemo(() => {
    const totalScore = MOCK_SENTIMENT.reduce((s, src) => s + src.score * src.count, 0)
    const totalCount = MOCK_SENTIMENT.reduce((s, src) => s + src.count, 0)
    return totalScore / totalCount
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <MessageCircle size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Sentiment Dashboard</span>
        </div>
        <span className="text-[10px] text-gray-600">{symbol ?? 'BTC/USDT'}</span>
      </div>

      {/* Overall sentiment */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <div className="flex items-center justify-between">
          <Label>Overall Sentiment</Label>
          <div className="flex items-center gap-1.5">
            {sentimentIcon(overall)}
            <span className={`text-sm font-mono font-bold ${sentimentColor(overall)}`}>
              {(overall * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="h-2 bg-bg-600 rounded-full overflow-hidden mt-1">
          <div className={`h-full ${sentimentBg(overall)}`} style={{ width: `${overall * 100}%` }} />
        </div>
      </div>

      {/* Source breakdown */}
      <div>
        <Label className="mb-1">By Source</Label>
        <div className="space-y-0.5">
          {MOCK_SENTIMENT.map(src => {
            const Icon = SOURCE_ICONS[src.source] || MessageCircle
            return (
              <div key={src.source} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
                <Icon size={10} className="text-gray-500 shrink-0" />
                <span className="text-[10px] text-gray-300 w-16 shrink-0">{src.source}</span>
                <div className="flex-1 h-2 bg-bg-600 rounded-full overflow-hidden">
                  <div className={`h-full ${sentimentBg(src.score)}`} style={{ width: `${src.score * 100}%` }} />
                </div>
                <span className={`text-[9px] font-mono w-8 text-right ${sentimentColor(src.score)}`}>
                  {(src.score * 100).toFixed(0)}%
                </span>
                <span className="text-[9px] text-gray-600 w-10 text-right">{src.count}</span>
                {src.trend === 'up' ? (
                  <TrendingUp size={9} className="text-accent-green shrink-0" />
                ) : src.trend === 'down' ? (
                  <TrendingDown size={9} className="text-accent-red shrink-0" />
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {/* Top mentions */}
      <div>
        <Label className="mb-1">Top Mentions</Label>
        <div className="space-y-0.5">
          {MOCK_MENTIONS.map(m => (
            <div key={m.symbol} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[10px] text-gray-300 w-10">{m.symbol}</span>
              <span className="text-[9px] text-gray-500 w-12">{m.mentions} mentions</span>
              <span className={`text-[9px] font-mono w-10 text-right ${sentimentColor(m.sentiment)}`}>
                {(m.sentiment * 100).toFixed(0)}%
              </span>
              <span className={`text-[9px] font-mono w-12 text-right ${m.change >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {m.change >= 0 ? '+' : ''}{m.change.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Headlines */}
      <div>
        <Label className="mb-1">Recent Headlines</Label>
        <div className="space-y-0.5">
          {MOCK_HEADLINES.map((h, i) => (
            <div key={i} className="py-0.5 px-1.5 bg-bg-700">
              <div className="flex items-center gap-1.5">
                {sentimentIcon(h.sentiment === 'positive' ? 0.7 : h.sentiment === 'negative' ? 0.3 : 0.5)}
                <span className="text-[9px] text-gray-600 shrink-0">{h.source}</span>
                <span className="text-[9px] text-gray-600 shrink-0">{h.ts}</span>
              </div>
              <div className="text-[10px] text-gray-300 mt-0.5 truncate">{h.headline}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

export default memo(SentimentDashboard)
