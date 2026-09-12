import { memo } from 'react'
import { MessageCircle, TrendingUp, TrendingDown, Newspaper, Radio } from 'lucide-react'
import { Label, Bar } from '../utils/ui-helpers'

/**
 * Sentiment / News-event panel — shows the REAL active news event
 * broadcast by the simulator (symbol, intensity, remaining ticks,
 * direction). There is no multi-source sentiment feed; the previous
 * per-source/mentions/headlines arrays were fabricated and are gone.
 */
const SentimentDashboard = memo(function SentimentDashboard({ symbol, newsEvent }) {
  const active = newsEvent != null

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <MessageCircle size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Sentiment / News Events</span>
        </div>
        <span className="text-[10px] text-gray-600">{symbol ?? '—'}</span>
      </div>

      {/* Active news event — real simulator broadcast */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <Label className="mb-1">Active News Event</Label>
        {active ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              {newsEvent.direction === 'up'
                ? <TrendingUp size={14} className="text-accent-green" />
                : <TrendingDown size={14} className="text-accent-red" />}
              <span className="text-sm font-medium text-gray-200">{newsEvent.symbol}</span>
              <span className={`text-[10px] uppercase px-1.5 rounded ${newsEvent.direction === 'up' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'}`}>
                {newsEvent.direction}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 w-20">Intensity</span>
              <Bar value={newsEvent.intensity * 100} max={100} color={newsEvent.direction === 'up' ? 'bg-accent-green' : 'bg-accent-red'} />
              <span className="text-[9px] font-mono text-gray-400">{(newsEvent.intensity * 100).toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 w-20">Remaining</span>
              <span className="text-[10px] font-mono text-gray-300">{newsEvent.remaining} ticks</span>
            </div>
          </div>
        ) : (
          <div className="text-gray-500 text-[10px]">No active news event — market running without exogenous shock</div>
        )}
      </div>

      {/* Honest note: no multi-source feed exists */}
      <div className="p-2 bg-bg-700/50 border border-bg-600 border-dashed rounded">
        <div className="flex items-center gap-1.5 mb-1">
          <Newspaper size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-500 uppercase">Multi-source sentiment</span>
        </div>
        <div className="text-[9px] text-gray-600 leading-relaxed">
          Twitter/Reddit/Telegram sentiment feeds are not connected. This panel only
          shows the simulator's exogenous news events (above). A real sentiment
          backend would be required for per-source scores.
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <Radio size={9} />
          {active ? 'event active' : 'monitoring'}
        </span>
        <span>source: simulator news_event</span>
      </div>
    </div>
  )
})

export default memo(SentimentDashboard)
