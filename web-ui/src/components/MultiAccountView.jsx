import { useMemo } from 'react'
import { Layers, Wallet, TrendingUp, TrendingDown } from 'lucide-react'
import { formatUsd } from '../utils/format'

export default function MultiAccountView({ accounts, exchanges }) {
  const aggregated = useMemo(() => {
    const perExchange = {}
    let totalEquity = 0
    let totalBalance = 0
    let totalUPnl = 0
    let totalRPnl = 0
    let totalPositions = 0
    let totalFees = 0
    let totalTrades = 0

    for (const exId of exchanges) {
      const acc = accounts?.[exId]
      if (!acc) continue

      const equity = acc.equity || acc.balance || 0
      const balance = acc.balance || 0
      const uPnl = acc.unrealized_pnl || 0
      const rPnl = acc.realized_pnl || 0
      const positions = Object.values(acc.positions || {}).filter(p => p.quantity > 0).length
      const fees = acc.total_fees || 0
      const trades = (acc.trade_history || []).length

      perExchange[exId] = { equity, balance, uPnl, rPnl, positions, fees, trades }

      totalEquity += equity
      totalBalance += balance
      totalUPnl += uPnl
      totalRPnl += rPnl
      totalPositions += positions
      totalFees += fees
      totalTrades += trades
    }

    // Allocation percentages
    const allocations = {}
    for (const [exId, data] of Object.entries(perExchange)) {
      allocations[exId] = totalEquity > 0 ? (data.equity / totalEquity) * 100 : 0
    }

    // Best/worst exchange by PnL
    const sorted = Object.entries(perExchange).sort((a, b) => (b[1].uPnl + b[1].rPnl) - (a[1].uPnl + a[1].rPnl))
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]

    return {
      perExchange,
      totalEquity,
      totalBalance,
      totalUPnl,
      totalRPnl,
      totalPositions,
      totalFees,
      totalTrades,
      allocations,
      best,
      worst,
      exchangeCount: sorted.length,
    }
  }, [accounts, exchanges])

  if (aggregated.exchangeCount === 0) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Layers size={12} className="text-accent-purple" />
          Multi-Account View
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No account data</div>
      </div>
    )
  }

  const { perExchange, totalEquity, totalBalance, totalUPnl, totalRPnl, totalPositions, totalFees, totalTrades, allocations, best, worst } = aggregated

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Layers size={12} className="text-accent-purple" />
        Multi-Account Aggregated
      </div>

      {/* Total summary */}
      <div className="bg-bg-600/50 rounded p-2 mb-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Wallet size={11} className="text-gray-500" />
          <span className="text-[9px] text-gray-500">Total Equity</span>
          <span className="text-sm font-mono font-bold text-gray-200 ml-auto">{formatUsd(totalEquity)}</span>
        </div>
        <div className="grid grid-cols-4 gap-1 text-[8px]">
          <div>
            <span className="text-gray-600">Balance</span>
            <div className="text-gray-300 font-mono">{formatUsd(totalBalance, 0)}</div>
          </div>
          <div>
            <span className="text-gray-600">U-PnL</span>
            <div className={'font-mono ' + (totalUPnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
              {totalUPnl >= 0 ? '+' : ''}{formatUsd(totalUPnl, 0)}
            </div>
          </div>
          <div>
            <span className="text-gray-600">R-PnL</span>
            <div className={'font-mono ' + (totalRPnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
              {totalRPnl >= 0 ? '+' : ''}{formatUsd(totalRPnl, 0)}
            </div>
          </div>
          <div>
            <span className="text-gray-600">Fees</span>
            <div className="text-accent-red font-mono">{formatUsd(totalFees, 0)}</div>
          </div>
        </div>
      </div>

      {/* Per-exchange breakdown */}
      <div className="space-y-1 mb-2">
        {Object.entries(perExchange).map(([exId, data]) => {
          const allocPct = allocations[exId] || 0
          const totalPnl = data.uPnl + data.rPnl
          const isBest = best && best[0] === exId
          const isWorst = worst && worst[0] === exId
          return (
            <div key={exId} className="bg-bg-600/40 rounded p-1.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-medium text-gray-300">{exId}</span>
                {isBest && <span className="text-[7px] px-1 rounded bg-accent-green/20 text-accent-green">BEST</span>}
                {isWorst && <span className="text-[7px] px-1 rounded bg-accent-red/20 text-accent-red">WORST</span>}
                <span className="text-[8px] text-gray-600 ml-auto">{data.positions} pos · {data.trades} trades</span>
              </div>
              <div className="flex items-center gap-2 text-[8px]">
                <span className="font-mono text-gray-300 w-16">{formatUsd(data.equity, 0)}</span>
                <div className="flex-1 h-2 bg-bg-600 rounded-full overflow-hidden">
                  <div
                    className={'h-full rounded-full ' + (totalPnl >= 0 ? 'bg-accent-green/60' : 'bg-accent-red/60')}
                    style={{ width: `${allocPct}%` }}
                  />
                </div>
                <span className="text-gray-600 w-8 text-right">{allocPct.toFixed(0)}%</span>
                <span className={'font-mono w-12 text-right ' + (totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                  {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl, 0)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Allocation bar */}
      <div className="mb-1">
        <div className="text-[8px] text-gray-600 uppercase mb-0.5">Equity Allocation</div>
        <div className="flex h-3 rounded-sm overflow-hidden">
          {Object.entries(allocations).map(([exId, pct]) => {
            const colors = { binance: 'bg-accent-yellow/60', bybit: 'bg-accent-orange/60', okx: 'bg-accent-blue/60' }
            return (
              <div
                key={exId}
                className={colors[exId] || 'bg-gray-500/60'}
                style={{ width: `${pct}%` }}
                title={`${exId}: ${pct.toFixed(1)}%`}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
