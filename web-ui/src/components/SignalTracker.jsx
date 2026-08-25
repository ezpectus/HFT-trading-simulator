import { memo, useMemo } from 'react'
import { Target, TrendingUp, TrendingDown, Crosshair } from 'lucide-react'
import { pnlColor, sideColor, StatCard } from '../utils/ui-helpers'
import { MOCK_SIGNALS } from '../utils/mock-data'

const SignalTracker = memo(function SignalTracker() {
  const stats = useMemo(() => {
    const open = MOCK_SIGNALS.filter(s => s.status === 'open').length
    const closed = MOCK_SIGNALS.filter(s => s.status === 'closed').length
    const winners = MOCK_SIGNALS.filter(s => s.status === 'closed' && s.pnl > 0).length
    const losers = MOCK_SIGNALS.filter(s => s.status === 'closed' && s.pnl < 0).length
    const winRate = (winners / closed) * 100
    const avgPnl = MOCK_SIGNALS.reduce((s, sig) => s + sig.pnl, 0) / MOCK_SIGNALS.length
    const avgConf = MOCK_SIGNALS.reduce((s, sig) => s + sig.confidence, 0) / MOCK_SIGNALS.length
    return { open, closed, winners, losers, winRate, avgPnl, avgConf }
  }, [])

  const byStrategy = useMemo(() => {
    const groups = {}
    MOCK_SIGNALS.forEach(s => {
      if (!groups[s.strategy]) groups[s.strategy] = { count: 0, pnl: 0, wins: 0 }
      groups[s.strategy].count++
      groups[s.strategy].pnl += s.pnl
      if (s.pnl > 0) groups[s.strategy].wins++
    })
    return Object.entries(groups).map(([name, data]) => ({
      name,
      count: data.count,
      pnl: data.pnl,
      winRate: (data.wins / data.count) * 100,
    }))
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Target size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Signal Tracker</span>
        </div>
        <span className="text-[10px] text-gray-600">{stats.open} open / {stats.closed} closed</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} color={stats.winRate >= 60 ? 'text-accent-green' : 'text-accent-yellow'} />
        <StatCard label="Avg PnL" value={`${stats.avgPnl >= 0 ? '+' : ''}${stats.avgPnl.toFixed(2)}%`} color={pnlColor(stats.avgPnl)} />
        <StatCard label="Avg Conf" value={`${(stats.avgConf * 100).toFixed(0)}%`} color="text-gray-300" />
        <StatCard label="Signals" value={MOCK_SIGNALS.length} color="text-gray-300" />
      </div>

      {/* By strategy */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Crosshair size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">By Strategy</span>
        </div>
        <div className="space-y-0.5">
          {byStrategy.map(s => (
            <div key={s.name} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[10px] text-gray-300 w-24 truncate">{s.name}</span>
              <span className="text-[9px] font-mono text-gray-500 w-8">{s.count}</span>
              <span className={`text-[9px] font-mono w-12 ${pnlColor(s.pnl)}`}>
                {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(1)}%
              </span>
              <span className={`text-[9px] font-mono w-12 ${s.winRate >= 60 ? 'text-accent-green' : 'text-accent-yellow'}`}>
                {s.winRate.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Signal list */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Signal History</div>
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {MOCK_SIGNALS.map(sig => (
            <div key={sig.id} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[8px] text-gray-600 font-mono w-8">{sig.timestamp}</span>
              <span className="text-[9px] text-gray-400 w-20 truncate">{sig.strategy}</span>
              <span className="text-[9px] text-gray-300 w-10 truncate">{sig.symbol.replace('/USDT', '')}</span>
              <span className={`text-[9px] font-mono w-8 ${sideColor(sig.direction)}`}>{sig.direction === 'LONG' ? 'L' : 'S'}</span>
              <span className="text-[9px] font-mono text-gray-500 w-10">{(sig.confidence * 100).toFixed(0)}%</span>
              <span className={`text-[9px] font-mono w-12 text-right ${pnlColor(sig.pnl)}`}>
                {sig.pnl >= 0 ? '+' : ''}{sig.pnl.toFixed(2)}%
              </span>
              <span className={`text-[8px] uppercase px-1 rounded ${sig.status === 'open' ? 'bg-accent-blue/20 text-accent-blue' : 'bg-bg-600 text-gray-500'} w-10 text-center`}>
                {sig.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <TrendingUp size={9} className="text-accent-green" />
          {stats.winners} wins
        </span>
        <span className="flex items-center gap-1">
          <TrendingDown size={9} className="text-accent-red" />
          {stats.losers} losses
        </span>
      </div>
    </div>
  )
})

export default SignalTracker
