import { useMemo } from 'react'
import { PieChart, TrendingUp, TrendingDown, Award } from 'lucide-react'
import { formatUsd } from '../utils/format'

export default function PnLAttribution({ accounts }) {
  const attribution = useMemo(() => {
    const positions = []
    let totalUPnl = 0
    let totalRPnl = 0
    let totalFees = 0

    for (const [exId, acc] of Object.entries(accounts || {})) {
      const fees = acc.total_fees || 0
      totalFees += fees

      // Realized PnL from trade history
      const realizedBySymbol = {}
      for (const t of (acc.trade_history || [])) {
        const key = `${t.symbol}|${exId}`
        realizedBySymbol[key] = (realizedBySymbol[key] || 0) + (t.pnl || 0)
        totalRPnl += t.pnl || 0
      }

      // Unrealized PnL from open positions
      for (const p of (acc.positions || [])) {
        const uPnl = p.unrealized_pnl || 0
        totalUPnl += uPnl
        const key = `${p.symbol}|${exId}`
        positions.push({
          symbol: p.symbol,
          exchange: exId,
          side: p.side,
          quantity: p.quantity,
          entryPrice: p.entry_price,
          uPnl,
          rPnl: realizedBySymbol[key] || 0,
          total: uPnl + (realizedBySymbol[key] || 0),
        })
      }

      // Add realized-only entries (closed trades without open position)
      for (const [key, rPnl] of Object.entries(realizedBySymbol)) {
        const [symbol, ex] = key.split('|')
        if (!positions.find(p => p.symbol === symbol && p.exchange === ex)) {
          positions.push({
            symbol,
            exchange: ex,
            side: 'CLOSED',
            quantity: 0,
            entryPrice: 0,
            uPnl: 0,
            rPnl,
            total: rPnl,
          })
        }
      }
    }

    positions.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

    // Attribution by symbol
    const bySymbol = {}
    for (const p of positions) {
      if (!bySymbol[p.symbol]) {
        bySymbol[p.symbol] = { symbol: p.symbol, uPnl: 0, rPnl: 0, total: 0, positions: 0 }
      }
      bySymbol[p.symbol].uPnl += p.uPnl
      bySymbol[p.symbol].rPnl += p.rPnl
      bySymbol[p.symbol].total += p.total
      bySymbol[p.symbol].positions++
    }

    const symbolList = Object.values(bySymbol).sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

    // Attribution by exchange
    const byExchange = {}
    for (const p of positions) {
      if (!byExchange[p.exchange]) {
        byExchange[p.exchange] = { exchange: p.exchange, uPnl: 0, rPnl: 0, total: 0, positions: 0 }
      }
      byExchange[p.exchange].uPnl += p.uPnl
      byExchange[p.exchange].rPnl += p.rPnl
      byExchange[p.exchange].total += p.total
      byExchange[p.exchange].positions++
    }

    const exchangeList = Object.values(byExchange).sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

    const grandTotal = totalUPnl + totalRPnl

    return {
      positions,
      symbolList,
      exchangeList,
      totalUPnl,
      totalRPnl,
      totalFees,
      grandTotal,
      netTotal: grandTotal - totalFees,
    }
  }, [accounts])

  const { symbolList, exchangeList, totalUPnl, totalRPnl, totalFees, netTotal } = attribution

  // Max absolute for bar scaling
  const maxAbs = Math.max(...symbolList.map(s => Math.abs(s.total)), 1)

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <PieChart size={12} className="text-accent-blue" />
        P&L Attribution
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-2 text-[9px]">
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">Unrealized</div>
          <div className={'font-mono ' + (totalUPnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {totalUPnl >= 0 ? '+' : ''}{formatUsd(totalUPnl)}
          </div>
        </div>
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">Realized</div>
          <div className={'font-mono ' + (totalRPnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {totalRPnl >= 0 ? '+' : ''}{formatUsd(totalRPnl)}
          </div>
        </div>
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">Fees</div>
          <div className="font-mono text-accent-red">-{formatUsd(totalFees)}</div>
        </div>
      </div>

      {/* Net total */}
      <div className="bg-bg-600/50 rounded px-2 py-1.5 mb-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-gray-500">Net Total</span>
          <span className={'text-sm font-bold font-mono ' + (netTotal >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {netTotal >= 0 ? '+' : ''}{formatUsd(netTotal)}
          </span>
        </div>
      </div>

      {/* By symbol bars */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 uppercase mb-1">By Symbol</div>
        <div className="space-y-0.5">
          {symbolList.slice(0, 6).map(s => (
            <div key={s.symbol} className="flex items-center gap-1.5">
              <span className="text-[9px] text-gray-400 w-12 shrink-0">{s.symbol.split('/')[0]}</span>
              <div className="flex-1 h-3 bg-bg-600 rounded-sm overflow-hidden relative">
                <div
                  className={'absolute h-full rounded-sm ' + (s.total >= 0 ? 'bg-accent-green/60 left-1/2' : 'bg-accent-red/60 right-1/2')}
                  style={{ width: `${(Math.abs(s.total) / maxAbs) * 50}%` }}
                />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-bg-500" />
              </div>
              <span className={'text-[9px] font-mono w-14 text-right shrink-0 ' + (s.total >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                {s.total >= 0 ? '+' : ''}{formatUsd(s.total)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* By exchange */}
      <div>
        <div className="text-[8px] text-gray-600 uppercase mb-1">By Exchange</div>
        <div className="space-y-0.5">
          {exchangeList.map(e => (
            <div key={e.exchange} className="flex items-center justify-between bg-bg-600/30 rounded px-1.5 py-0.5 text-[9px]">
              <span className="text-gray-400">{e.exchange}</span>
              <span className="text-gray-600">{e.positions} pos</span>
              <span className={'font-mono ' + (e.total >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                {e.total >= 0 ? '+' : ''}{formatUsd(e.total)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
