function RiskStat({ label, value, color = 'text-gray-200' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 text-[10px] uppercase tracking-wide">{label}</span>
      <span className={`font-mono font-medium ${color}`}>{value}</span>
    </div>
  )
}

export default function RiskMetricsPanel({ metrics, drawdown, allTrades, sharpe, sortino, accounts }) {
  return (
    <>
      {/* Risk metrics */}
      {metrics.totalTrades > 0 && (
        <div className="bg-bg-700 p-3 border border-bg-600">
          <div className="text-xs text-gray-400 mb-2 font-medium">Risk Metrics</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <RiskStat
              label="Max Drawdown"
              value={drawdown.length > 0 ? `${Math.min(...drawdown.map(d => d.drawdown)).toFixed(2)}%` : '0%'}
              color="text-accent-red"
            />
            <RiskStat
              label="Profit Factor"
              value={(() => {
                const gp = allTrades.filter(t => (t.pnl || 0) > 0).reduce((s, t) => s + t.pnl, 0)
                const gl = Math.abs(allTrades.filter(t => (t.pnl || 0) < 0).reduce((s, t) => s + t.pnl, 0))
                return gl > 0 ? (gp / gl).toFixed(2) : gp > 0 ? '∞' : '--'
              })()}
              color="text-gray-200"
            />
            <RiskStat
              label="Avg Win"
              value={(() => {
                const wins = allTrades.filter(t => (t.pnl || 0) > 0)
                return wins.length > 0 ? `$${(wins.reduce((s, t) => s + t.pnl, 0) / wins.length).toFixed(2)}` : '--'
              })()}
              color="text-accent-green"
            />
            <RiskStat
              label="Avg Loss"
              value={(() => {
                const losses = allTrades.filter(t => (t.pnl || 0) < 0)
                return losses.length > 0 ? `$${(Math.abs(losses.reduce((s, t) => s + t.pnl, 0)) / losses.length).toFixed(2)}` : '--'
              })()}
              color="text-accent-red"
            />
            <RiskStat
              label="Total Fees"
              value={`$${(accounts && Object.values(accounts).reduce((s, a) => s + (a.total_fees || 0), 0)).toFixed(2)}`}
              color="text-gray-400"
            />
            <RiskStat
              label="Fees % of PnL"
              value={metrics.totalPnl !== 0 ? `${Math.abs((accounts && Object.values(accounts).reduce((s, a) => s + (a.total_fees || 0), 0)) / metrics.totalPnl * 100).toFixed(1)}%` : '--'}
              color="text-gray-400"
            />
          </div>
        </div>
      )}

      {/* Sharpe / Sortino */}
      {allTrades.length >= 2 && (
        <div className="bg-bg-700 p-3 border border-bg-600">
          <div className="text-xs text-gray-400 mb-2 font-medium">Risk-Adjusted Returns</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <RiskStat
              label="Sharpe Ratio"
              value={isFinite(sharpe) ? sharpe.toFixed(3) : '∞'}
              color={sharpe >= 1 ? 'text-accent-green' : sharpe >= 0 ? 'text-gray-200' : 'text-accent-red'}
            />
            <RiskStat
              label="Sortino Ratio"
              value={isFinite(sortino) ? sortino.toFixed(3) : '∞'}
              color={sortino >= 1 ? 'text-accent-green' : sortino >= 0 ? 'text-gray-200' : 'text-accent-red'}
            />
          </div>
          <div className="mt-1.5 text-[9px] text-gray-600">
            Annualized (252 periods). Sharpe uses total vol, Sortino uses downside-only vol.
          </div>
        </div>
      )}
    </>
  )
}
