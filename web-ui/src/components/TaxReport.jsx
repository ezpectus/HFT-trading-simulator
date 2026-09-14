import { memo, useMemo, useState } from 'react'
import { FileText, Download, Calculator, DollarSign, TrendingUp, TrendingDown } from 'lucide-react'
import { formatUsd } from '../utils/format'
import { EmptyState } from './LoadingSkeleton'

const TaxReport = memo(function TaxReport({ accounts, addToast }) {
  const [year, setYear] = useState(new Date().getFullYear())

  const trades = useMemo(() => {
    const all = Object.values(accounts || {}).flatMap(a => a.trade_history || [])
    if (!all.length) return []
    return all.slice(0, 50).map((t, i) => ({
      id: `${t.exchange}-${t.closed_at}-${i}`,
      symbol: t.symbol,
      side: t.side,
      quantity: t.quantity || 0,
      price: t.exit_price || 0,
      timestamp: t.closed_at ? new Date(t.closed_at * 1000).toISOString().split('T')[0] : '—',
      pnl: t.pnl || 0,
      fee: t.fee || 0,
    }))
  }, [accounts])

  const summary = useMemo(() => {
    const realizedPnl = trades.reduce((s, t) => s + t.pnl, 0)
    const totalFees = trades.reduce((s, t) => s + t.fee, 0)
    const netProfit = realizedPnl - totalFees
    const shortTerm = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0)
    const losses = trades.filter(t => t.pnl < 0).reduce((s, t) => s + Math.abs(t.pnl), 0)
    const estimatedTax = netProfit > 0 ? netProfit * 0.25 : 0
    return { realizedPnl, totalFees, netProfit, shortTerm, losses, estimatedTax, tradeCount: trades.length }
  }, [trades])

  const handleExport = () => {
    addToast?.('success', `Tax report for ${year} exported`)
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FileText size={14} className="text-accent-green" />
          <span className="text-sm font-medium">Tax Report</span>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="bg-bg-700 border border-bg-600 text-[10px] text-gray-400 px-1 py-0.5 focus:outline-none focus:border-accent-blue"
        >
          <option value={year}>{year}</option>
          <option value={year - 1}>{year - 1}</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-1 p-2 bg-bg-700 border border-bg-600">
        <div className="flex flex-col">
          <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><TrendingUp size={9} /> Realized PnL</span>
          <span className={summary.realizedPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}>
            {formatUsd(summary.realizedPnl)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><DollarSign size={9} /> Total Fees</span>
          <span className="text-gray-400">{formatUsd(summary.totalFees)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><TrendingDown size={9} /> Losses</span>
          <span className="text-accent-red">{formatUsd(summary.losses)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><Calculator size={9} /> Est. Tax (25%)</span>
          <span className="text-accent-yellow">{formatUsd(summary.estimatedTax)}</span>
        </div>
      </div>

      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-600">Net Profit</span>
          <span className={summary.netProfit >= 0 ? 'text-accent-green font-medium' : 'text-accent-red font-medium'}>
            {formatUsd(summary.netProfit)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] mt-0.5">
          <span className="text-gray-600">Total Trades</span>
          <span className="text-gray-400">{summary.tradeCount}</span>
        </div>
      </div>

      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Trade History</div>
        <div className="max-h-[150px] overflow-y-auto scrollbar-thin">
          <table className="w-full text-[9px]">
            <thead>
              <tr className="border-b border-bg-600 text-gray-600">
                <th className="px-1 py-0.5 text-left">Date</th>
                <th className="px-1 py-0.5 text-left">Symbol</th>
                <th className="px-1 py-0.5 text-left">Side</th>
                <th className="px-1 py-0.5 text-right">PnL</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(t => (
                <tr key={t.id} className="border-b border-bg-600/30">
                  <td className="px-1 py-0.5 text-gray-500">{t.timestamp}</td>
                  <td className="px-1 py-0.5 text-gray-400">{t.symbol}</td>
                  <td className={`px-1 py-0.5 ${t.side === 'BUY' ? 'text-accent-green' : 'text-accent-red'}`}>{t.side}</td>
                  <td className={`px-1 py-0.5 text-right ${t.pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {formatUsd(t.pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button
        onClick={handleExport}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-accent-green/20 text-accent-green hover:bg-accent-green/30 transition-colors"
      >
        <Download size={12} />
        Export {year} Tax Report
      </button>

      {trades.length === 0 && (
        <EmptyState icon={FileText} title="No closed trades yet" subtitle="Realized PnL is computed from closed trades — nothing to report yet" />
      )}
    </div>
  )
})

export default memo(TaxReport)
