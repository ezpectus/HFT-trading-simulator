import { useMemo } from 'react'
import { BarChart3, TrendingDown, Award } from 'lucide-react'

export default function PerformanceAttribution({ accounts, fills, signals }) {
  const data = useMemo(() => {
    // Gather all closed trades
    const trades = []
    for (const acc of Object.values(accounts || {})) {
      for (const t of (acc.trade_history || [])) {
        trades.push(t)
      }
    }

    if (trades.length === 0) return null

    // Attribute P&L by various dimensions
    const bySide = { LONG: { count: 0, pnl: 0, wins: 0 }, SHORT: { count: 0, pnl: 0, wins: 0 } }
    const bySymbol = {}
    const byHour = {}
    const byReason = {}
    const byDayOfWeek = {}

    for (const t of trades) {
      const side = t.side || (t.direction === 'BUY' ? 'LONG' : 'SHORT')
      const pnl = t.pnl || 0
      const sym = t.symbol || 'unknown'
      const reason = t.reason || t.strategy || 'manual'
      const ts = t.timestamp || t.time || 0
      const date = new Date(ts * 1000)
      const hour = date.getUTCHours()
      const dow = date.getUTCDay()

      // By side
      if (!bySide[side]) bySide[side] = { count: 0, pnl: 0, wins: 0 }
      bySide[side].count++
      bySide[side].pnl += pnl
      if (pnl > 0) bySide[side].wins++

      // By symbol
      if (!bySymbol[sym]) bySymbol[sym] = { count: 0, pnl: 0, wins: 0 }
      bySymbol[sym].count++
      bySymbol[sym].pnl += pnl
      if (pnl > 0) bySymbol[sym].wins++

      // By hour
      if (!byHour[hour]) byHour[hour] = { count: 0, pnl: 0, wins: 0 }
      byHour[hour].count++
      byHour[hour].pnl += pnl
      if (pnl > 0) byHour[hour].wins++

      // By reason/strategy
      if (!byReason[reason]) byReason[reason] = { count: 0, pnl: 0, wins: 0 }
      byReason[reason].count++
      byReason[reason].pnl += pnl
      if (pnl > 0) byReason[reason].wins++

      // By day of week
      if (!byDayOfWeek[dow]) byDayOfWeek[dow] = { count: 0, pnl: 0, wins: 0 }
      byDayOfWeek[dow].count++
      byDayOfWeek[dow].pnl += pnl
      if (pnl > 0) byDayOfWeek[dow].wins++
    }

    // Calculate win rates and sort
    const processGroup = (group) => {
      return Object.entries(group).map(([key, stats]) => ({
        name: key,
        ...stats,
        winRate: stats.count > 0 ? (stats.wins / stats.count) * 100 : 0,
        avgPnl: stats.count > 0 ? stats.pnl / stats.count : 0,
      }))
    }

    const sideStats = processGroup(bySide).sort((a, b) => b.pnl - a.pnl)
    const symbolStats = processGroup(bySymbol).sort((a, b) => b.pnl - a.pnl).slice(0, 5)
    const reasonStats = processGroup(byReason).sort((a, b) => b.pnl - a.pnl).slice(0, 5)
    const hourStats = processGroup(byHour).sort((a, b) => a.name - b.name)
    const dowStats = processGroup(byDayOfWeek).sort((a, b) => a.name - b.name)

    // Best/worst
    const bestSymbol = symbolStats[0]
    const worstSymbol = symbolStats[symbolStats.length - 1]
    const bestReason = reasonStats[0]
    const worstReason = reasonStats[reasonStats.length - 1]

    // Best hour
    const bestHour = hourStats.reduce((best, h) => h.pnl > best.pnl ? h : best, hourStats[0])
    const worstHour = hourStats.reduce((worst, h) => h.pnl < worst.pnl ? h : worst, hourStats[0])

    // Day names
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    dowStats.forEach(d => d.dayName = dayNames[d.name])

    // Total stats
    const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0)
    const totalWins = trades.filter(t => (t.pnl || 0) > 0).length
    const totalWinRate = (totalWins / trades.length) * 100

    // Hour heatmap data
    const maxHourPnl = Math.max(...hourStats.map(h => Math.abs(h.pnl)), 1)

    return {
      sideStats, symbolStats, reasonStats, hourStats, dowStats,
      bestSymbol, worstSymbol, bestReason, worstReason,
      bestHour, worstHour,
      totalPnl, totalWinRate, totalTrades: trades.length,
      maxHourPnl,
    }
  }, [accounts, fills, signals])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <BarChart3 size={12} className="text-accent-purple" />
          Performance Attribution
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No trade history</div>
      </div>
    )
  }

  const { sideStats, symbolStats, reasonStats, hourStats, dowStats, bestSymbol, worstSymbol, bestReason, worstReason, bestHour, worstHour, totalPnl, totalWinRate, totalTrades, maxHourPnl } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <BarChart3 size={12} className="text-accent-purple" />
        Performance Attribution
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Trades</span>
          <div className="font-mono text-gray-300">{totalTrades}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Win Rate</span>
          <div className="font-mono text-gray-400">{totalWinRate.toFixed(0)}%</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Total P&L</span>
          <div className={'font-mono ' + (totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Best/Worst */}
      <div className="grid grid-cols-2 gap-1 mb-2">
        <div className="bg-accent-green/10 border border-accent-green/20 rounded px-1.5 py-1">
          <div className="flex items-center gap-1">
            <Award size={8} className="text-accent-green" />
            <span className="text-[8px] text-accent-green">Best</span>
          </div>
          <div className="text-[8px] text-gray-400 mt-0.5">{bestSymbol?.name}</div>
          <div className="text-[8px] font-mono text-accent-green">+{bestSymbol?.pnl.toFixed(2)}</div>
        </div>
        <div className="bg-accent-red/10 border border-accent-red/20 rounded px-1.5 py-1">
          <div className="flex items-center gap-1">
            <TrendingDown size={8} className="text-accent-red" />
            <span className="text-[8px] text-accent-red">Worst</span>
          </div>
          <div className="text-[8px] text-gray-400 mt-0.5">{worstSymbol?.name}</div>
          <div className="text-[8px] font-mono text-accent-red">{worstSymbol?.pnl.toFixed(2)}</div>
        </div>
      </div>

      {/* By side */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5">By Side:</div>
        <div className="grid grid-cols-2 gap-1">
          {sideStats.map((s, i) => (
            <div key={i} className="bg-bg-800 rounded px-1.5 py-0.5 text-[8px]">
              <div className="flex justify-between">
                <span className="text-gray-500">{s.name}</span>
                <span className="font-mono text-gray-400">{s.count}t</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">WR: {s.winRate.toFixed(0)}%</span>
                <span className={'font-mono ' + (s.pnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                  {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(1)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* By symbol */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5">By Symbol:</div>
        <div className="space-y-0.5">
          {symbolStats.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
              <span className="text-gray-400 w-16 truncate">{s.name}</span>
              <span className="text-gray-600">{s.count}t</span>
              <span className="text-gray-500">WR {s.winRate.toFixed(0)}%</span>
              <span className={'font-mono ' + (s.pnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* By strategy/reason */}
      {reasonStats.length > 0 && reasonStats[0].name !== 'manual' && (
        <div className="mb-2">
          <div className="text-[8px] text-gray-600 mb-0.5">By Strategy:</div>
          <div className="space-y-0.5">
            {reasonStats.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
                <span className="text-gray-400 w-20 truncate">{s.name}</span>
                <span className="text-gray-600">{s.count}t</span>
                <span className="text-gray-500">WR {s.winRate.toFixed(0)}%</span>
                <span className={'font-mono ' + (s.pnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                  {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hour heatmap */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5">P&L by Hour (UTC):</div>
        <div className="flex gap-px h-3">
          {Array.from({ length: 24 }, (_, h) => {
            const hs = hourStats.find(s => Number(s.name) === h)
            const pnl = hs?.pnl || 0
            const intensity = Math.abs(pnl) / maxHourPnl
            return (
              <div
                key={h}
                className="flex-1 rounded-sm"
                style={{
                  backgroundColor: pnl > 0 ? `rgba(34,197,94,${0.2 + intensity * 0.8})` :
                    pnl < 0 ? `rgba(239,68,68,${0.2 + intensity * 0.8})` : '#1e293b',
                }}
                title={`${h}:00 - ${pnl.toFixed(2)}`}
              />
            )
          })}
        </div>
        <div className="flex justify-between text-[6px] text-gray-700 mt-0.5">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>

      {/* By day of week */}
      <div>
        <div className="text-[8px] text-gray-600 mb-0.5">By Day:</div>
        <div className="space-y-0.5">
          {dowStats.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
              <span className="text-gray-400 w-8">{s.dayName}</span>
              <span className="text-gray-600">{s.count}t</span>
              <span className="text-gray-500">WR {s.winRate.toFixed(0)}%</span>
              <span className={'font-mono ' + (s.pnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        P&L attributed by side, symbol, strategy, hour, and day. Identify what works and when.
      </div>
    </div>
  )
}
