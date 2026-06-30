import { useMemo } from 'react'
import { Download, FileText, Check } from 'lucide-react'

export default function TradeStatsExport({ accounts, fills }) {
  const stats = useMemo(() => {
    const allTrades = []
    for (const [exId, acc] of Object.entries(accounts || {})) {
      for (const t of (acc.trade_history || [])) {
        allTrades.push({ ...t, exchange: exId })
      }
    }

    if (allTrades.length === 0) return null

    const pnls = allTrades.map(t => t.pnl || 0)
    const wins = pnls.filter(p => p > 0)
    const losses = pnls.filter(p => p < 0)
    const totalPnl = pnls.reduce((s, v) => s + v, 0)
    const avgWin = wins.length > 0 ? wins.reduce((s, v) => s + v, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? losses.reduce((s, v) => s + v, 0) / losses.length : 0
    const winRate = allTrades.length > 0 ? (wins.length / allTrades.length) * 100 : 0
    const profitFactor = avgLoss !== 0 ? Math.abs(avgWin * wins.length / (avgLoss * losses.length)) : 0
    const maxWin = Math.max(...pnls, 0)
    const maxLoss = Math.min(...pnls, 0)
    const expectancy = allTrades.length > 0 ? totalPnl / allTrades.length : 0

    // By symbol
    const bySymbol = {}
    for (const t of allTrades) {
      if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { trades: 0, pnl: 0, wins: 0 }
      bySymbol[t.symbol].trades++
      bySymbol[t.symbol].pnl += t.pnl || 0
      if ((t.pnl || 0) > 0) bySymbol[t.symbol].wins++
    }

    return {
      totalTrades: allTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      totalPnl,
      avgWin,
      avgLoss,
      profitFactor,
      maxWin,
      maxLoss,
      expectancy,
      bySymbol,
      trades: allTrades,
    }
  }, [accounts])

  const exportCSV = () => {
    if (!stats) return
    const headers = ['Exchange', 'Symbol', 'Side', 'Entry Price', 'Exit Price', 'Quantity', 'PnL', 'Opened At', 'Closed At', 'Duration (s)']
    const rows = stats.trades.map(t => [
      t.exchange,
      t.symbol,
      t.side,
      t.entry_price?.toFixed(2) || '',
      t.exit_price?.toFixed(2) || '',
      t.quantity?.toFixed(6) || '',
      (t.pnl || 0).toFixed(2),
      t.opened_at ? new Date(t.opened_at * 1000).toISOString() : '',
      t.closed_at ? new Date(t.closed_at * 1000).toISOString() : '',
      t.closed_at && t.opened_at ? (t.closed_at - t.opened_at) : '',
    ])

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trade-stats-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportSummary = () => {
    if (!stats) return
    const lines = [
      'TRADE STATISTICS SUMMARY',
      '========================',
      `Total Trades: ${stats.totalTrades}`,
      `Wins: ${stats.wins} | Losses: ${stats.losses}`,
      `Win Rate: ${stats.winRate.toFixed(2)}%`,
      `Total PnL: ${stats.totalPnl.toFixed(2)}`,
      `Avg Win: ${stats.avgWin.toFixed(2)}`,
      `Avg Loss: ${stats.avgLoss.toFixed(2)}`,
      `Profit Factor: ${stats.profitFactor.toFixed(2)}`,
      `Expectancy: ${stats.expectancy.toFixed(2)}`,
      `Max Win: ${stats.maxWin.toFixed(2)}`,
      `Max Loss: ${stats.maxLoss.toFixed(2)}`,
      '',
      'PER SYMBOL BREAKDOWN',
      '====================',
    ]
    for (const [sym, s] of Object.entries(stats.bySymbol)) {
      lines.push(`${sym}: ${s.trades} trades, PnL ${s.pnl.toFixed(2)}, Win rate ${(s.wins / s.trades * 100).toFixed(0)}%`)
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trade-summary-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!stats) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Download size={12} className="text-accent-green" />
          Trade Stats Export
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No trades to export</div>
      </div>
    )
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Download size={12} className="text-accent-green" />
        Trade Stats Export
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 mb-2 text-[9px]">
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">Trades</div>
          <div className="text-gray-300 font-mono">{stats.totalTrades}</div>
        </div>
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">Win Rate</div>
          <div className="text-gray-300 font-mono">{stats.winRate.toFixed(0)}%</div>
        </div>
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">P Factor</div>
          <div className={'font-mono ' + (stats.profitFactor > 1.5 ? 'text-accent-green' : stats.profitFactor > 1 ? 'text-accent-yellow' : 'text-accent-red')}>
            {stats.profitFactor.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Per symbol */}
      <div className="space-y-0.5 mb-2 max-h-[80px] overflow-y-auto scrollbar-thin">
        {Object.entries(stats.bySymbol).map(([sym, s]) => (
          <div key={sym} className="flex items-center gap-1.5 text-[8px] bg-bg-600/30 rounded px-1.5 py-0.5">
            <span className="text-gray-400">{sym.split('/')[0]}</span>
            <span className="text-gray-600">{s.trades} trades</span>
            <span className={'ml-auto font-mono ' + (s.pnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
              {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Export buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={exportCSV}
          className="flex items-center justify-center gap-1 py-1.5 text-[10px] rounded bg-accent-green/20 text-accent-green hover:bg-accent-green/30"
        >
          <Download size={11} />
          CSV Export
        </button>
        <button
          onClick={exportSummary}
          className="flex items-center justify-center gap-1 py-1.5 text-[10px] rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30"
        >
          <FileText size={11} />
          Summary .txt
        </button>
      </div>
    </div>
  )
}
