import { memo, useMemo } from 'react'
import { GitCommit, TrendingUp, TrendingDown } from 'lucide-react'
import { ICONS, StatCard, WarningBanner } from '../utils/ui-helpers'

function statusIcon(ok) {
  return ok ? ICONS.green() : ICONS.red()
}

/**
 * Backtest Comparison — per-strategy results from the signal bot's
 * backtest_result broadcast (triggered via BacktestRunner).
 * backtestResult: { strategy, symbol, candles, results: {name: metrics} }
 */
const WalkForwardViewer = memo(function WalkForwardViewer({ backtestResult }) {
  const rows = useMemo(() => {
    const results = backtestResult?.results || {}
    return Object.entries(results).map(([name, r]) => ({
      name,
      totalReturn: r.total_return_pct ?? 0,
      trades: r.total_trades ?? 0,
      winRate: r.win_rate ?? 0,
      profitFactor: r.profit_factor ?? 0,
      maxDD: r.max_drawdown_pct ?? 0,
      sharpe: r.sharpe_ratio ?? 0,
      finalBalance: r.final_balance ?? 0,
      equityCurve: r.equity_curve || [],
      pass: (r.total_return_pct ?? 0) > 0,
    }))
  }, [backtestResult])

  const stats = useMemo(() => {
    const passed = rows.filter(r => r.pass).length
    const failed = rows.length - passed
    const n = rows.length || 1
    const avgRet = rows.reduce((s, r) => s + r.totalReturn, 0) / n
    const avgSharpe = rows.reduce((s, r) => s + r.sharpe, 0) / n
    const best = rows.length ? rows.reduce((m, r) => (r.totalReturn > m.totalReturn ? r : m), rows[0]) : null
    return { passed, failed, passRate: (passed / n) * 100, avgRet, avgSharpe, best }
  }, [rows])

  const maxAbsRet = Math.max(1, ...rows.map(r => Math.abs(r.totalReturn)))

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GitCommit size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Backtest Results</span>
        </div>
        <span className="text-[10px] text-gray-600">
          {backtestResult ? `${rows.length} strategies · ${backtestResult.symbol || ''} · ${backtestResult.candles || 0} candles` : 'no run'}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="text-gray-500 text-[10px] p-2">No backtest yet — run one from the Backtest panel (BT tab) to compare strategies</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="Pass Rate" value={`${stats.passRate.toFixed(0)}%`} color={stats.passRate >= 70 ? 'text-accent-green' : 'text-accent-yellow'} compact />
            <StatCard label="Avg Return" value={`${stats.avgRet >= 0 ? '+' : ''}${stats.avgRet.toFixed(1)}%`} color={stats.avgRet >= 0 ? 'text-accent-green' : 'text-accent-red'} compact />
            <StatCard label="Avg Sharpe" value={stats.avgSharpe.toFixed(2)} color="text-accent-blue" compact />
            <StatCard label="Best" value={stats.best ? stats.best.name.slice(0, 8) : '—'} color="text-accent-yellow" compact />
          </div>

          {/* Strategy table */}
          <div>
            <div className="text-[10px] text-gray-600 uppercase mb-1">Strategy Comparison</div>
            <div className="space-y-0.5">
              {rows.map(r => (
                <div key={r.name} className="py-1 px-1.5 bg-bg-700">
                  <div className="flex items-center gap-2">
                    {statusIcon(r.pass)}
                    <span className="text-[9px] text-gray-300 w-24 truncate">{r.name}</span>
                    <span className={`text-[9px] font-mono w-14 text-right ${r.totalReturn >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {r.totalReturn >= 0 ? '+' : ''}{r.totalReturn.toFixed(1)}%
                    </span>
                    <span className="text-[9px] font-mono text-accent-blue w-12 text-right">{r.sharpe.toFixed(2)}</span>
                    <span className="text-[9px] font-mono text-gray-500 w-12 text-right">{r.winRate.toFixed(0)}%wr</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 pl-4 text-[8px] text-gray-600">
                    <span>Trades: {r.trades}</span>
                    <span>PF: {r.profitFactor.toFixed(2)}</span>
                    <span>MaxDD: <span className="text-accent-red">{r.maxDD.toFixed(1)}%</span></span>
                    <span>Final: ${r.finalBalance.toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Return comparison bars */}
          <div className="p-2 bg-bg-700 border border-bg-600">
            <div className="text-[10px] text-gray-600 uppercase mb-1">Total Return by Strategy</div>
            <div className="flex items-end gap-1 h-16">
              {rows.map(r => (
                <div key={r.name} className="flex-1 flex flex-col items-center">
                  <div className="flex items-end h-12">
                    <div
                      className={`w-2 ${r.totalReturn >= 0 ? 'bg-accent-green' : 'bg-accent-red'}`}
                      style={{ height: `${(Math.abs(r.totalReturn) / maxAbsRet) * 100}%` }}
                    />
                  </div>
                  <span className="text-[7px] text-gray-600 mt-0.5 truncate w-full text-center">{r.name.slice(0, 5)}</span>
                </div>
              ))}
            </div>
          </div>

          {stats.passRate < 50 && (
            <WarningBanner icon={TrendingDown} color="text-accent-yellow">
              {stats.failed} of {rows.length} strategies lost money on this run
            </WarningBanner>
          )}

          <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
            <span className="flex items-center gap-1">
              <TrendingUp size={9} />
              {stats.passed} profitable, {stats.failed} losing
            </span>
            <span>Source: signal bot backtest_result</span>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(WalkForwardViewer)
