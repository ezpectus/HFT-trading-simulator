import { memo, useMemo, useCallback } from 'react'
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Percent, Award, Activity, FileDown } from 'lucide-react'
import { calcAggregateMetrics, buildEquityCurve, calcDrawdown, calcSharpeRatio, calcSortinoRatio, formatMetric } from '../utils/performance'
import { exportPDF } from '../utils/performanceReport'
import PerfAreaChart from './performance/PerfAreaChart'
import ExchangeBreakdown from './performance/ExchangeBreakdown'
import StreakPanel from './performance/StreakPanel'
import RiskMetricsPanel from './performance/RiskMetricsPanel'
import { EmptyState } from './LoadingSkeleton'

function PerformanceDashboard({ accounts, fills, signals }) {

  const metrics = useMemo(() => calcAggregateMetrics(accounts), [accounts])
  const equityCurve = useMemo(() => buildEquityCurve(fills, 10000), [fills])
  const drawdown = useMemo(() => calcDrawdown(equityCurve), [equityCurve])

  const allTrades = useMemo(() => {
    const trades = []
    for (const acc of Object.values(accounts || {})) {
      for (const t of (acc.trade_history || [])) trades.push(t)
    }
    return trades
  }, [accounts])

  const sharpe = useMemo(() => calcSharpeRatio(allTrades), [allTrades])
  const sortino = useMemo(() => calcSortinoRatio(allTrades), [allTrades])

  const mapEquityPoint = useCallback((p, i) => ({ time: p.time || i, value: p.value }), [])
  const mapDrawdownPoint = useCallback((p, i) => ({ time: p.time || i, value: -p.drawdown }), [])


  const pnlPositive = metrics.totalPnl >= 0
  const signalCount = signals?.length || 0
  const longSignals = signals?.filter(s => s.direction === 'LONG').length || 0
  const shortSignals = signals?.filter(s => s.direction === 'SHORT').length || 0

  if (metrics.totalTrades === 0 && Object.keys(accounts || {}).length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No performance data yet"
        subtitle="Metrics and equity curve will appear after trades are executed"
      />
    )
  }

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      {/* Export button */}
      <div className="flex justify-end">
        <button
          onClick={() => exportPDF(accounts, metrics, allTrades, sharpe, sortino)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-bg-700 text-gray-400 hover:bg-bg-600 hover:text-gray-200 transition-colors"
          title="Export performance report as PDF"
        >
          <FileDown size={10} />
          Export PDF
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-1.5">
        <MetricCard
          icon={<DollarSign size={14} />}
          label="Total Balance"
          value={formatMetric(metrics.totalBalance, 'usd')}
          color="text-gray-200"
        />
        <MetricCard
          icon={<Activity size={14} />}
          label="Total Equity"
          value={formatMetric(metrics.totalEquity, 'usd')}
          color="text-gray-200"
        />
        <MetricCard
          icon={pnlPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          label="Total PnL"
          value={formatMetric(metrics.totalPnl, 'usd')}
          color={pnlPositive ? 'text-accent-green' : 'text-accent-red'}
        />
        <MetricCard
          icon={<Percent size={14} />}
          label="Win Rate"
          value={formatMetric(metrics.avgWinRate, 'pct')}
          color={metrics.avgWinRate >= 50 ? 'text-accent-green' : 'text-accent-yellow'}
        />
        <MetricCard
          icon={<BarChart3 size={14} />}
          label="Total Trades"
          value={formatMetric(metrics.totalTrades, 'int')}
          color="text-gray-200"
        />
        <MetricCard
          icon={<Award size={14} />}
          label="Open Positions"
          value={formatMetric(metrics.totalPositions, 'int')}
          color="text-accent-blue"
        />
      </div>

      <ExchangeBreakdown accounts={accounts} />

      {/* Equity curve chart */}
      <div className="bg-bg-700 p-2 border border-bg-600">
        <div className="flex items-center gap-2 px-1 py-1 mb-1">
          <TrendingUp size={12} className="text-accent-yellow" />
          <span className="text-xs text-gray-400 font-medium">Equity Curve</span>
        </div>
        <PerfAreaChart data={equityCurve} mapPoint={mapEquityPoint}
          lineColor="#f0b90b" topColor="rgba(240, 185, 11, 0.25)"
          bottomColor="rgba(240, 185, 11, 0.0)" height={120} lineWidth={2} />
      </div>

      {/* Drawdown chart */}
      <div className="bg-bg-700 p-2 border border-bg-600">
        <div className="flex items-center gap-2 px-1 py-1 mb-1">
          <TrendingDown size={12} className="text-accent-red" />
          <span className="text-xs text-gray-400 font-medium">Drawdown</span>
        </div>
        <PerfAreaChart data={drawdown} mapPoint={mapDrawdownPoint}
          lineColor="#f6465d" topColor="rgba(246, 70, 93, 0.2)"
          bottomColor="rgba(246, 70, 93, 0.0)" height={80} lineWidth={1} />
      </div>

      {/* Signal stats */}
      {signalCount > 0 && (
        <div className="bg-bg-700 p-3 border border-bg-600">
          <div className="text-xs text-gray-400 mb-2 font-medium">Signal Statistics</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-gray-500">Total</div>
              <div className="text-gray-200 font-medium">{signalCount}</div>
            </div>
            <div>
              <div className="text-gray-500">Long</div>
              <div className="text-accent-green font-medium">{longSignals}</div>
            </div>
            <div>
              <div className="text-gray-500">Short</div>
              <div className="text-accent-red font-medium">{shortSignals}</div>
            </div>
          </div>
        </div>
      )}

      {metrics.totalTrades > 0 && <StreakPanel accounts={accounts} />}

      <RiskMetricsPanel metrics={metrics} drawdown={drawdown} allTrades={allTrades} sharpe={sharpe} sortino={sortino} accounts={accounts} />
    </div>
  )
}

export default memo(PerformanceDashboard)

function MetricCard({ icon, label, value, color }) {
  return (
    <div className="bg-bg-700 p-2.5 border border-bg-600 transition-all duration-200 hover:bg-bg-600/50 animate-fadein">
      <div className="flex items-center gap-1.5 text-gray-500 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-base font-bold ${color} transition-colors duration-300`}>{value}</div>
    </div>
  )
}

