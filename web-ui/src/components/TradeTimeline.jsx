import { useMemo } from 'react'
import { ArrowUp, ArrowDown, Clock } from 'lucide-react'
import { formatPrice, formatTime } from '../utils/format'

export default function TradeTimeline({ fills, symbol, selectedExchange }) {
  const recentFills = useMemo(() => {
    if (!fills?.length) return []
    return fills
      .filter(f => f.status === 'FILLED' && (!symbol || f.symbol === symbol) && (!selectedExchange || f.exchange === selectedExchange))
      .slice(-15)
      .reverse()
  }, [fills, symbol, selectedExchange])

  const summary = useMemo(() => {
    if (!recentFills.length) return { total: 0, buys: 0, sells: 0, volume: 0 }
    let buys = 0, sells = 0, volume = 0
    for (const f of recentFills) {
      if (f.side === 'BUY') buys++
      else sells++
      volume += (f.price || 0) * (f.quantity || 0)
    }
    return { total: recentFills.length, buys, sells, volume }
  }, [recentFills])

  return (
    <div className="bg-bg-700  p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Clock size={12} className="text-accent-green" />
        Execution Timeline
      </div>

      {recentFills.length > 0 && (
        <div className="flex items-center gap-3 text-[9px] mb-2 pb-1.5 border-b border-bg-600">
          <span className="text-gray-500">{summary.total} fills</span>
          <span className="text-accent-green">{summary.buys} buy</span>
          <span className="text-accent-red">{summary.sells} sell</span>
          <span className="text-gray-400 font-mono ml-auto">${summary.volume.toFixed(2)}</span>
        </div>
      )}

      {recentFills.length === 0 ? (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No fills yet</div>
      ) : (
        <div className="space-y-0.5 max-h-[200px] overflow-y-auto scrollbar-thin">
          {recentFills.map((f, i) => {
            const isBuy = f.side === 'BUY'
            return (
              <div
                key={f.id || i}
                className="flex items-center gap-2 py-1 px-1.5  hover:bg-bg-600/50 transition-colors"
              >
                {/* Timeline dot + line */}
                <div className="flex flex-col items-center shrink-0">
                  <div className={'w-5 h-5 rounded-full flex items-center justify-center ' +
                    (isBuy ? 'bg-accent-green/20' : 'bg-accent-red/20')}>
                    {isBuy
                      ? <ArrowUp size={10} className="text-accent-green" />
                      : <ArrowDown size={10} className="text-accent-red" />
                    }
                  </div>
                  {i < recentFills.length - 1 && (
                    <div className="w-px h-3 bg-bg-600" />
                  )}
                </div>

                {/* Fill details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={'text-[10px] font-medium ' + (isBuy ? 'text-accent-green' : 'text-accent-red')}>
                      {isBuy ? 'BUY' : 'SELL'}
                    </span>
                    <span className="text-[10px] text-gray-400">{f.quantity?.toFixed(4)}</span>
                    <span className="text-[9px] text-gray-600">@</span>
                    <span className="text-[10px] font-mono text-gray-300">${formatPrice(f.price)}</span>
                  </div>
                  <div className="text-[8px] text-gray-600">
                    {formatTime(f.timestamp)} · {f.exchange}
                  </div>
                </div>

                {/* Amount */}
                <div className="text-[10px] font-mono text-gray-400 shrink-0">
                  ${((f.price || 0) * (f.quantity || 0)).toFixed(2)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
