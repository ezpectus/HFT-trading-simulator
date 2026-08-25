import { memo, useMemo } from 'react'
import { PieChart, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { pnlColor, StatCard } from '../utils/ui-helpers'

const MOCK_ATTRIBUTION = [
  { source: 'TrendFollowing', pnl: 1250, pct: 35, color: 'bg-accent-blue' },
  { source: 'MeanReversion', pnl: 820, pct: 23, color: 'bg-accent-green' },
  { source: 'StatArb', pnl: 680, pct: 19, color: 'bg-accent-purple' },
  { source: 'FundingArb', pnl: 320, pct: 9, color: 'bg-accent-yellow' },
  { source: 'MarketMaking', pnl: 180, pct: 5, color: 'bg-accent-orange' },
  { source: 'Sentiment', pnl: -150, pct: -4, color: 'bg-accent-red' },
  { source: 'Fees', pnl: -350, pct: -10, color: 'bg-gray-600' },
  { source: 'Slippage', pnl: -280, pct: -8, color: 'bg-gray-500' },
  { source: 'Funding Cost', pnl: -120, pct: -3, color: 'bg-gray-400' },
]

const MOCK_TIME_SERIES = [
  { time: '09:00', trend: 0, meanRev: 0, statArb: 0, total: 0 },
  { time: '10:00', trend: 120, meanRev: 80, statArb: 50, total: 250 },
  { time: '11:00', trend: 280, meanRev: 150, statArb: 120, total: 550 },
  { time: '12:00', trend: 450, meanRev: 220, statArb: 180, total: 850 },
  { time: '13:00', trend: 680, meanRev: 310, statArb: 250, total: 1240 },
  { time: '14:00', trend: 920, meanRev: 420, statArb: 320, total: 1660 },
  { time: '15:00', trend: 1100, meanRev: 580, statArb: 380, total: 2060 },
  { time: '16:00', trend: 1250, meanRev: 820, statArb: 680, total: 2750 },
]

const RealtimeAttribution = memo(function RealtimeAttribution() {
  const stats = useMemo(() => {
    const totalPnl = MOCK_ATTRIBUTION.reduce((s, a) => s + a.pnl, 0)
    const grossProfit = MOCK_ATTRIBUTION.filter(a => a.pnl > 0).reduce((s, a) => s + a.pnl, 0)
    const grossLoss = MOCK_ATTRIBUTION.filter(a => a.pnl < 0).reduce((s, a) => s + Math.abs(a.pnl), 0)
    const profitFactor = grossProfit / grossLoss
    const bestSource = MOCK_ATTRIBUTION.reduce((max, a) => a.pnl > max.pnl ? a : max, MOCK_ATTRIBUTION[0])
    const worstSource = MOCK_ATTRIBUTION.reduce((min, a) => a.pnl < min.pnl ? a : min, MOCK_ATTRIBUTION[0])
    return { totalPnl, grossProfit, grossLoss, profitFactor, bestSource, worstSource }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PieChart size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Realtime PnL Attribution</span>
        </div>
        <span className={`text-[10px] font-mono ${pnlColor(stats.totalPnl)}`}>
          {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl}
        </span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Total PnL" value={`${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl}`} color={pnlColor(stats.totalPnl)} compact />
        <StatCard label="Profit Factor" value={stats.profitFactor.toFixed(2)} color={stats.profitFactor >= 1.5 ? 'text-accent-green' : stats.profitFactor >= 1 ? 'text-accent-yellow' : 'text-accent-red'} compact />
        <StatCard label="Best" value={stats.bestSource.source} color="text-accent-green" size="xs" compact />
        <StatCard label="Worst" value={stats.worstSource.source} color="text-accent-red" size="xs" compact />
      </div>

      {/* Attribution breakdown */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">PnL by Source</div>
        <div className="space-y-0.5">
          {MOCK_ATTRIBUTION.map(a => (
            <div key={a.source} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[10px] text-gray-300 w-24 truncate">{a.source}</span>
              <div className="flex-1 h-2 bg-bg-600 rounded-full overflow-hidden">
                <div className={`h-full ${a.color} opacity-70`} style={{ width: `${Math.abs(a.pct)}%` }} />
              </div>
              <span className={`text-[9px] font-mono w-14 text-right ${pnlColor(a.pnl)}`}>
                {a.pnl >= 0 ? '+' : ''}${a.pnl}
              </span>
              <span className={`text-[9px] font-mono w-10 text-right ${pnlColor(a.pnl)}`}>
                {a.pct >= 0 ? '+' : ''}{a.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Cumulative PnL chart */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <Activity size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Cumulative PnL (Today)</span>
        </div>
        <div className="flex items-end gap-1 h-16">
          {MOCK_TIME_SERIES.map((pt, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div className="flex items-end gap-0.5 h-12">
                <div className="w-1 bg-accent-blue" style={{ height: `${(pt.trend / 1250) * 100}%` }} />
                <div className="w-1 bg-accent-green" style={{ height: `${(pt.meanRev / 820) * 100}%` }} />
                <div className="w-1 bg-accent-purple" style={{ height: `${(pt.statArb / 680) * 100}%` }} />
              </div>
              <span className="text-[7px] text-gray-600 mt-0.5">{pt.time}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[8px]">
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-blue" />Trend</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-green" />MeanRev</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-purple" />StatArb</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <TrendingUp size={9} className="text-accent-green" />
          Gross: +${stats.grossProfit}
        </span>
        <span className="flex items-center gap-1">
          <TrendingDown size={9} className="text-accent-red" />
          Gross: -${stats.grossLoss}
        </span>
      </div>
    </div>
  )
})

export default RealtimeAttribution
