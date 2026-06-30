import { useMemo } from 'react'
import { Clock } from 'lucide-react'
import { formatUsd } from '../utils/format'

const HOURS = Array.from({ length: 24 }, (_, i) => i)

export default function TimeOfDayPerformance({ accounts }) {
  const hourlyStats = useMemo(() => {
    const byHour = {}
    for (let h = 0; h < 24; h++) {
      byHour[h] = { trades: 0, pnl: 0, wins: 0, losses: 0, volume: 0 }
    }

    for (const acc of Object.values(accounts || {})) {
      for (const t of (acc.trade_history || [])) {
        const ts = t.closed_at || t.timestamp || 0
        if (!ts) continue
        const d = new Date(ts * 1000)
        const h = d.getUTCHours()
        byHour[h].trades++
        byHour[h].pnl += t.pnl || 0
        byHour[h].volume += Math.abs(t.quantity || 0) * (t.entry_price || 0)
        if ((t.pnl || 0) > 0) byHour[h].wins++
        else if ((t.pnl || 0) < 0) byHour[h].losses++
      }
    }

    const maxAbsPnl = Math.max(...HOURS.map(h => Math.abs(byHour[h].pnl)), 1)
    const maxTrades = Math.max(...HOURS.map(h => byHour[h].trades), 1)

    // Find best and worst hours
    const sorted = HOURS.map(h => ({ hour: h, ...byHour[h] }))
      .filter(s => s.trades > 0)
      .sort((a, b) => b.pnl - a.pnl)

    const bestHour = sorted[0]
    const worstHour = sorted[sorted.length - 1]

    return { byHour, maxAbsPnl, maxTrades, bestHour, worstHour, activeHours: sorted.length }
  }, [accounts])

  const { byHour, maxAbsPnl, maxTrades, bestHour, worstHour, activeHours } = hourlyStats

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Clock size={12} className="text-accent-blue" />
        Performance by Hour (UTC)
      </div>

      {activeHours === 0 ? (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No trade history yet</div>
      ) : (
        <>
          {/* Hourly bars */}
          <div className="space-y-0.5 mb-2">
            {HOURS.map(h => {
              const s = byHour[h]
              if (s.trades === 0) return null
              const widthPct = (Math.abs(s.pnl) / maxAbsPnl) * 50
              const tradeHeight = (s.trades / maxTrades) * 100
              const winRate = s.trades > 0 ? (s.wins / s.trades) * 100 : 0
              return (
                <div key={h} className="flex items-center gap-1.5 group">
                  <span className="text-[8px] text-gray-600 w-6 text-right font-mono">
                    {h.toString().padStart(2, '0')}h
                  </span>
                  {/* PnL bar */}
                  <div className="flex-1 h-3 bg-bg-600/30 rounded-sm overflow-hidden relative">
                    <div
                      className={'absolute h-full rounded-sm ' + (s.pnl >= 0 ? 'bg-accent-green/60 left-1/2' : 'bg-accent-red/60 right-1/2')}
                      style={{ width: `${widthPct}%` }}
                    />
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-bg-500" />
                  </div>
                  {/* Trade count indicator */}
                  <div className="w-8 flex items-end h-3">
                    <div
                      className="w-full bg-accent-blue/30 rounded-sm"
                      style={{ height: `${tradeHeight}%` }}
                      title={`${s.trades} trades`}
                    />
                  </div>
                  <span className={'text-[8px] font-mono w-12 text-right ' + (s.pnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                    {s.pnl >= 0 ? '+' : ''}{formatUsd(s.pnl)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 text-[9px] pt-2 border-t border-bg-600">
            <div>
              <div className="text-gray-600">Best Hour</div>
              {bestHour && (
                <div className="text-accent-green font-mono">
                  {bestHour.hour.toString().padStart(2, '0')}h +{formatUsd(bestHour.pnl)}
                </div>
              )}
            </div>
            <div>
              <div className="text-gray-600">Worst Hour</div>
              {worstHour && (
                <div className="text-accent-red font-mono">
                  {worstHour.hour.toString().padStart(2, '0')}h {formatUsd(worstHour.pnl)}
                </div>
              )}
            </div>
            <div>
              <div className="text-gray-600">Active Hrs</div>
              <div className="text-gray-300 font-mono">{activeHours}/24</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
