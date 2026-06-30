import { Wallet, TrendingUp, TrendingDown, BarChart3, Trophy } from 'lucide-react'
import { formatUsd, formatPct } from '../utils/format'

export default function AccountPanel({ accounts }) {
  const exchangeIds = Object.keys(accounts)

  if (!exchangeIds.length) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <Wallet size={24} className="mx-auto mb-2 opacity-50" />
        Waiting for account data...
      </div>
    )
  }

  // Build leaderboard sorted by total PnL
  const leaderboard = exchangeIds
    .map(exId => ({
      exId,
      pnl: accounts[exId].total_pnl || 0,
      balance: accounts[exId].balance || 0,
      trades: accounts[exId].total_trades || 0,
      winRate: accounts[exId].win_rate || 0,
    }))
    .sort((a, b) => b.pnl - a.pnl)

  return (
    <div className="p-2 space-y-2">
      {/* PnL Leaderboard */}
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1.5">
          <Trophy size={12} className="text-accent-yellow" />
          Exchange Leaderboard
        </div>
        <div className="space-y-1">
          {leaderboard.map((item, i) => {
            const isPositive = item.pnl >= 0
            const medal = i === 0 ? 'text-accent-yellow' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400/60' : 'text-gray-600'
            const pnlColor = isPositive ? 'text-accent-green' : 'text-accent-red'
            const pnlSign = isPositive ? '+' : ''
            return (
              <div key={item.exId} className="flex items-center gap-2 text-xs">
                <span className={`font-mono font-bold ${medal} w-4 text-center">{i + 1}</span>
                <span className="text-gray-300 capitalize flex-1">{item.exId}</span>
                <span className="text-gray-500 font-mono text-[10px]">{item.trades}t</span>
                <span className="text-gray-500 font-mono text-[10px]">{formatPct(item.winRate, 0)}w</span>
                <span className={`font-mono font-medium ${pnlColor} w-20 text-right`}>
                  {pnlSign}{formatUsd(item.pnl)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {exchangeIds.map(exId => {
        const acc = accounts[exId]
        const pnlPositive = acc.total_pnl >= 0
        const trades = acc.trade_history || []
        const recentTrades = trades.slice(-10)
        const pnlPct = acc.balance > 0 ? (acc.total_pnl / (acc.balance - acc.total_pnl) * 100) : 0

        return (
          <div key={exId} className="bg-bg-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium capitalize">{exId}</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${pnlPositive ? 'text-accent-green' : 'text-accent-red'}`}>
                  {pnlPositive ? <TrendingUp size={12} className="inline" /> : <TrendingDown size={12} className="inline" />}
                  {' '}{formatPct(pnlPct, 1)}
                </span>
                <span className="text-xs text-gray-500">
                  {formatPct(acc.win_rate, 1)} win
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <Stat label="Balance" value={formatUsd(acc.balance)} />
              <Stat label="Equity" value={formatUsd(acc.equity)} />
              <Stat
                label="Total PnL"
                value={formatUsd(acc.total_pnl)}
                color={pnlPositive ? 'text-accent-green' : 'text-accent-red'}
              />
              <Stat label="Fees" value={formatUsd(acc.total_fees)} color="text-gray-400" />
              <Stat label="Trades" value={acc.total_trades} />
              <Stat label="Positions" value={acc.positions?.length || 0} />
            </div>

            {/* Mini PnL bars from recent trades */}
            {recentTrades.length > 0 && (
              <div className="mt-2 pt-2 border-t border-bg-600">
                <div className="text-[10px] text-gray-500 mb-1">Recent Trade PnL</div>
                <div className="flex items-end gap-0.5 h-[24px]">
                  {recentTrades.map((t, i) => {
                    const maxAbs = Math.max(...recentTrades.map(x => Math.abs(x.pnl)), 1)
                    const h = Math.max(2, (Math.abs(t.pnl) / maxAbs) * 24)
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${t.pnl >= 0 ? 'bg-accent-green' : 'bg-accent-red'}`}
                        style={{ height: `${h}px` }}
                        title={`${t.symbol}: ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)} (${t.reason})`}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Stat({ label, value, color = 'text-gray-200' }) {
  return (
    <div className="flex flex-col">
      <span className="text-gray-500 text-[10px] uppercase tracking-wide">{label}</span>
      <span className={`font-mono font-medium ${color}`}>{value}</span>
    </div>
  )
}
