import { memo, useEffect, useMemo, useState } from 'react'
import { Newspaper, TrendingUp, TrendingDown, Clock } from 'lucide-react'
import { EmptyState } from './LoadingSkeleton'

const MAX_ITEMS = 50

const SENTIMENT_CONFIG = {
  positive: { icon: TrendingUp, color: 'text-accent-green', bg: 'bg-accent-green/10', label: 'Bullish' },
  negative: { icon: TrendingDown, color: 'text-accent-red', bg: 'bg-accent-red/10', label: 'Bearish' },
  neutral: { icon: Newspaper, color: 'text-gray-400', bg: 'bg-bg-700', label: 'Neutral' },
}

const IMPACT_COLORS = {
  high: 'text-accent-red',
  medium: 'text-accent-yellow',
  low: 'text-gray-500',
}

function NewsItem({ news }) {
  const config = SENTIMENT_CONFIG[news.sentiment] || SENTIMENT_CONFIG.neutral
  const Icon = config.icon

  return (
    <div className={`p-2 ${config.bg} border border-bg-600`}>
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <Icon size={11} className={config.color} />
            <span className="text-[11px] font-medium text-gray-300 truncate">{news.title}</span>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-gray-600">
            <span>{news.source}</span>
            <span className="flex items-center gap-0.5">
              <Clock size={8} />
              {new Date(news.timestamp * 1000).toLocaleTimeString('en-US', { hour12: false })}
            </span>
            {news.impact && (
              <span className={`uppercase font-medium ${IMPACT_COLORS[news.impact]}`}>
                {news.impact}
              </span>
            )}
          </div>
          {news.symbols?.length > 0 && (
            <div className="flex gap-0.5 mt-0.5">
              {news.symbols.map(s => (
                <span key={s} className="text-[8px] bg-bg-600 text-gray-500 px-1 rounded">{s}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const NewsFeed = memo(function NewsFeed({ newsEvent }) {
  // Accumulate real news_event broadcasts — no feed history exists, so the
  // list holds only events received while this panel was mounted.
  const [events, setEvents] = useState([])

  useEffect(() => {
    if (!newsEvent) return
    setEvents(prev => {
      const item = {
        id: newsEvent.timestamp ?? Date.now() / 1000,
        title: newsEvent.title ?? `${newsEvent.symbol ?? 'Market'} event`,
        source: newsEvent.source || 'Exchange',
        sentiment: newsEvent.sentiment || (newsEvent.direction === 'up' ? 'positive' : newsEvent.direction === 'down' ? 'negative' : 'neutral'),
        impact: newsEvent.impact || 'medium',
        timestamp: newsEvent.timestamp || Date.now() / 1000,
        symbols: newsEvent.symbols || (newsEvent.symbol ? [newsEvent.symbol] : []),
      }
      if (prev.some(e => e.id === item.id && e.title === item.title)) return prev
      return [item, ...prev].slice(0, MAX_ITEMS)
    })
  }, [newsEvent])

  const allNews = useMemo(() => [...events].sort((a, b) => b.timestamp - a.timestamp), [events])

  const stats = useMemo(() => {
    const positive = allNews.filter(n => n.sentiment === 'positive').length
    const negative = allNews.filter(n => n.sentiment === 'negative').length
    const highImpact = allNews.filter(n => n.impact === 'high').length
    return { positive, negative, highImpact, total: allNews.length }
  }, [allNews])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Newspaper size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">News Feed</span>
        </div>
        <span className="text-[10px] text-gray-600">{stats.total} items</span>
      </div>

      <div className="grid grid-cols-3 gap-1 p-2 bg-bg-700 border border-bg-600">
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-gray-600">Bullish</span>
          <span className="text-[11px] text-accent-green">{stats.positive}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-gray-600">Bearish</span>
          <span className="text-[11px] text-accent-red">{stats.negative}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-gray-600">High Impact</span>
          <span className="text-[11px] text-accent-yellow">{stats.highImpact}</span>
        </div>
      </div>

      <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-thin">
        {allNews.length > 0 ? (
          allNews.map(n => <NewsItem key={n.id} news={n} />)
        ) : (
          <EmptyState icon={Newspaper} title="No news events yet" subtitle="Only real news_event broadcasts appear here — no external news feed is connected" />
        )}
      </div>
    </div>
  )
})

export default memo(NewsFeed)
