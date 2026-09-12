import { memo, useMemo } from 'react'
import { TrendingUp, TrendingDown, Boxes } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'
import { pnlColor, sideColor, StatCard, WarningBanner, SectionTitle } from '../utils/ui-helpers'

/**
 * Inventory Manager — live positions across exchange accounts.
 * accounts: {exchange: {balance, equity, positions: [{symbol, side, quantity, entry_price, unrealized_pnl, ...}]}}
 */
const Inventory = memo(function Inventory({ accounts, prices }) {
  const { positions, portfolio } = useMemo(() => {
    const list = []
    for (const [ex, acc] of Object.entries(accounts || {})) {
      for (const p of acc?.positions || []) {
        const cur = prices?.[ex]?.[p.symbol] ?? p.entry_price
        const notional = p.quantity * cur
        list.push({
          key: `${ex}|${p.symbol}`,
          symbol: p.symbol,
          exchange: ex,
          side: (p.side || '').toUpperCase() === 'BUY' ? 'LONG' : 'SHORT',
          qty: p.quantity,
          avgPrice: p.entry_price,
          currentPrice: cur,
          pnl: p.unrealized_pnl ?? ((p.side || '').toUpperCase() === 'BUY'
            ? (cur - p.entry_price) * p.quantity
            : (p.entry_price - cur) * p.quantity),
          notional,
        })
      }
    }
    const equity = Object.values(accounts || {}).reduce((s, a) => s + (a?.equity ?? a?.balance ?? 0), 0)
    for (const p of list) {
      p.weight = equity > 0 ? (p.notional / equity) * 100 : 0
      p.pnlPct = p.avgPrice > 0 ? (p.pnl / (p.avgPrice * p.qty)) * 100 : 0
    }
    const longs = list.filter(p => p.side === 'LONG')
    const shorts = list.filter(p => p.side === 'SHORT')
    const longExposure = longs.reduce((s, p) => s + p.notional, 0)
    const shortExposure = shorts.reduce((s, p) => s + p.notional, 0)
    const pf = {
      totalPnl: list.reduce((s, p) => s + p.pnl, 0),
      totalValue: list.reduce((s, p) => s + p.notional, 0),
      longs, shorts, longExposure, shortExposure,
      grossExposure: longExposure + shortExposure,
      netExposure: longExposure - shortExposure,
      losers: list.filter(p => p.pnl < 0).length,
      winners: list.filter(p => p.pnl >= 0).length,
      longCount: longs.length,
      shortCount: shorts.length,
    }
    return { positions: list, portfolio: pf }
  }, [accounts, prices])

  const concentrated = positions.some(p => p.weight > 25)

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Boxes} title="Inventory Manager" right={<span className="text-[10px] text-gray-600">{positions.length} positions</span>} />

      {positions.length === 0 ? (
        <div className="text-gray-500 text-[10px] p-2">No open positions — start trading on the simulator to see inventory</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="Total PnL" value={`$${portfolio.totalPnl >= 0 ? '+' : ''}${portfolio.totalPnl.toFixed(0)}`} color={pnlColor(portfolio.totalPnl)} size="xs" compact bold />
            <StatCard label="Gross Exp" value={`$${formatVolume(portfolio.grossExposure)}`} color="text-gray-300" size="xs" compact />
            <StatCard label="Net Exp" value={`$${formatVolume(portfolio.netExposure)}`} color={pnlColor(portfolio.netExposure)} size="xs" compact />
            <StatCard label="Win/Loss" value={`${portfolio.winners}/${portfolio.losers}`} color="text-gray-300" size="xs" compact />
          </div>

          {/* Long/Short bar */}
          <div className="p-2 bg-bg-700 border border-bg-600">
            <div className="flex justify-between text-[9px] text-gray-600 mb-1">
              <span>Long ({portfolio.longCount})</span>
              <span>Short ({portfolio.shortCount})</span>
            </div>
            <div className="flex h-3 rounded overflow-hidden">
              <div className="bg-accent-green flex items-center justify-center" style={{ width: `${portfolio.grossExposure > 0 ? (portfolio.longExposure / portfolio.grossExposure) * 100 : 0}%` }}>
                <span className="text-[8px] text-white">{portfolio.grossExposure > 0 ? ((portfolio.longExposure / portfolio.grossExposure) * 100).toFixed(0) : 0}%</span>
              </div>
              <div className="bg-accent-red flex items-center justify-center" style={{ width: `${portfolio.grossExposure > 0 ? (portfolio.shortExposure / portfolio.grossExposure) * 100 : 0}%` }}>
                <span className="text-[8px] text-white">{portfolio.grossExposure > 0 ? ((portfolio.shortExposure / portfolio.grossExposure) * 100).toFixed(0) : 0}%</span>
              </div>
            </div>
          </div>

          {/* Position table */}
          <div>
            <div className="text-[10px] text-gray-600 uppercase mb-1">Positions</div>
            <div className="space-y-0.5">
              {positions.map(pos => (
                <div key={pos.key} className="flex items-center gap-1.5 py-1 px-1.5 bg-bg-700">
                  <div className="flex items-center gap-1 w-20 shrink-0">
                    {pos.side === 'LONG' ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
                    <span className="text-[10px] text-gray-300 truncate">{pos.symbol.replace('/USDT', '')}</span>
                  </div>
                  <span className={`text-[9px] w-8 ${sideColor(pos.side)}`}>{pos.side}</span>
                  <span className="text-[10px] font-mono text-gray-400 w-14 text-right">{pos.qty}</span>
                  <span className="text-[10px] font-mono text-gray-500 w-16 text-right">${formatPrice(pos.currentPrice)}</span>
                  <span className={`text-[10px] font-mono w-14 text-right ${pnlColor(pos.pnl)}`}>
                    {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(0)}
                  </span>
                  <div className="w-12 flex items-center justify-end">
                    <div className="w-8 h-1.5 bg-bg-600 rounded overflow-hidden">
                      <div
                        className={`h-full ${pos.weight > 25 ? 'bg-accent-red' : pos.weight > 15 ? 'bg-accent-yellow' : 'bg-accent-blue'}`}
                        style={{ width: `${Math.min(pos.weight * 2, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Concentration warning */}
          {concentrated && (
            <WarningBanner color="text-accent-yellow">
              High concentration: position {'>'} 25% of portfolio
            </WarningBanner>
          )}

          {/* Footer stats */}
          <div className="flex justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
            <span>Portfolio Value: ${formatVolume(portfolio.totalValue)}</span>
            <span>Avg Win: ${portfolio.winners > 0 ? (portfolio.totalPnl / portfolio.winners).toFixed(0) : '0'}</span>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(Inventory)
