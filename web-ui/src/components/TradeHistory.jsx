import { useMemo, useCallback, useState } from 'react'
import { History, TrendingUp, TrendingDown, Crown, AlertCircle, Download, NotebookPen, X, Check, FileText } from 'lucide-react'
import { formatPrice, formatUsd, formatTime, colorForSide } from '../utils/format'
import { useTradeJournal, tradeKey } from '../hooks/useTradeJournal'
import VirtualList from './VirtualList'

function exportTradesCSV(trades) {
  const headers = ['Exchange', 'Symbol', 'Side', 'Entry Price', 'Exit Price', 'Quantity', 'PnL', 'Reason', 'Closed At']
  const rows = trades.map(t => [
    t.exchange,
    t.symbol,
    t.side,
    t.entry_price,
    t.exit_price,
    t.quantity,
    t.pnl,
    t.reason || 'MANUAL',
    new Date(t.closed_at * 1000).toISOString(),
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trades_${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function TradeHistory({ accounts }) {
  const journal = useTradeJournal()
  const [expandedKey, setExpandedKey] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')

  const { allTrades, bestTrade, worstTrade, totalPnl, wins, losses } = useMemo(() => {
    const trades = []
    for (const [exId, acc] of Object.entries(accounts || {})) {
      for (const trade of (acc.trade_history || [])) {
        trades.push({ ...trade, exchange: exId })
      }
    }
    trades.sort((a, b) => b.closed_at - a.closed_at)

    let best = null, worst = null, pnl = 0, w = 0, l = 0
    for (const t of trades) {
      pnl += t.pnl
      if (t.pnl >= 0) w++; else l++
      if (!best || t.pnl > best.pnl) best = t
      if (!worst || t.pnl < worst.pnl) worst = t
    }

    return { allTrades: trades, bestTrade: best, worstTrade: worst, totalPnl: pnl, wins: w, losses: l }
  }, [accounts])

  if (!allTrades.length) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <History size={24} className="mx-auto mb-2 opacity-50" />
        No closed trades yet
      </div>
    )
  }

  const winRate = allTrades.length > 0 ? (wins / allTrades.length * 100).toFixed(1) : 0

  return (
    <div className="p-2 space-y-1">
      {/* Summary stats */}
      <div className="bg-bg-700 rounded-lg p-2.5 mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] text-gray-500 uppercase">Trade History Summary</div>
          <div className="flex gap-1">
            <button
              onClick={() => exportTradesCSV(allTrades)}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-bg-600 text-gray-400 hover:bg-bg-500 hover:text-gray-200 transition-colors"
              title="Export trades as CSV"
            >
              <Download size={10} />
              CSV
            </button>
            <button
              onClick={() => journal.exportJournalCSV(allTrades)}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-bg-600 text-gray-400 hover:bg-bg-500 hover:text-gray-200 transition-colors"
              title="Export trades with journal notes as CSV"
            >
              <FileText size={10} />
              Journal CSV
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div>
            <div className="text-gray-500 text-[10px]">Total</div>
            <div className="font-mono text-gray-200">{allTrades.length}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">Win Rate</div>
            <div className="font-mono text-gray-200">{winRate}%</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">Total PnL</div>
            <div className={`font-mono ${totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)}
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">W/L</div>
            <div className="font-mono">
              <span className="text-accent-green">{wins}</span>
              <span className="text-gray-600">/</span>
              <span className="text-accent-red">{losses}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Best & worst trades */}
      {(bestTrade || worstTrade) && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          {bestTrade && (
            <div className="bg-accent-green/10 border border-accent-green/20 rounded-lg p-2">
              <div className="flex items-center gap-1 text-[10px] text-accent-green mb-1">
                <Crown size={10} /> Best Trade
              </div>
              <div className="text-xs font-mono text-accent-green">
                +{formatUsd(bestTrade.pnl)}
              </div>
              <div className="text-[10px] text-gray-500">
                {bestTrade.symbol} · {bestTrade.exchange}
              </div>
            </div>
          )}
          {worstTrade && (
            <div className="bg-accent-red/10 border border-accent-red/20 rounded-lg p-2">
              <div className="flex items-center gap-1 text-[10px] text-accent-red mb-1">
                <AlertCircle size={10} /> Worst Trade
              </div>
              <div className="text-xs font-mono text-accent-red">
                {formatUsd(worstTrade.pnl)}
              </div>
              <div className="text-[10px] text-gray-500">
                {worstTrade.symbol} · {worstTrade.exchange}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="text-xs font-medium text-gray-400 mb-1 px-1">
        Closed Trades ({allTrades.length})
      </div>
      <VirtualList
        items={allTrades}
        itemHeight={80}
        maxHeight={400}
        overscan={5}
        renderItem={(trade, i) => {
        const isWin = trade.pnl >= 0
        const isBest = bestTrade && trade.closed_at === bestTrade.closed_at && trade.symbol === bestTrade.symbol
        const isWorst = worstTrade && trade.closed_at === worstTrade.closed_at && trade.symbol === worstTrade.symbol
        const reasonColor = trade.reason === 'TAKE_PROFIT' ? 'text-accent-green' :
                           trade.reason === 'STOP_LOSS' ? 'text-accent-red' :
                           trade.reason === 'LIQUIDATION' ? 'text-accent-red' : 'text-gray-400'
        const reasonLabel = trade.reason === 'TAKE_PROFIT' ? 'TP' :
                           trade.reason === 'STOP_LOSS' ? 'SL' :
                           trade.reason === 'LIQUIDATION' ? 'LIQ' : 'MANUAL'
        const tKey = tradeKey(trade)
        const hasNote = !!journal.getNote(tKey)
        const isExpanded = expandedKey === tKey

        return (
          <div className={'bg-bg-700 rounded p-2 text-xs ' + (isBest ? 'ring-1 ring-accent-green/30' : isWorst ? 'ring-1 ring-accent-red/30' : '')}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                {isBest && <Crown size={10} className="text-accent-green" />}
                {isWorst && <AlertCircle size={10} className="text-accent-red" />}
                <span className={'font-semibold ' + colorForSide(trade.side)}>
                  {trade.side === 'BUY' ? 'LONG' : 'SHORT'}
                </span>
                <span className="text-gray-300">{trade.symbol}</span>
                <span className="text-gray-500 text-[10px]">{trade.exchange}</span>
                <span className={'text-[9px] px-1 rounded ' + reasonColor + ' bg-bg-800'}>
                  {reasonLabel}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    if (isExpanded) {
                      setExpandedKey(null)
                    } else {
                      setExpandedKey(tKey)
                      setNoteDraft(journal.getNote(tKey))
                    }
                  }}
                  className={'p-0.5 rounded transition-colors ' + (hasNote ? 'text-accent-yellow' : 'text-gray-600 hover:text-gray-400')}
                  title={hasNote ? 'Edit note' : 'Add note'}
                >
                  <NotebookPen size={10} />
                </button>
                <span className="text-gray-500 text-[10px]">{formatTime(trade.closed_at)}</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 font-mono text-[11px]">
              <div>
                <span className="text-gray-500">Entry: </span>
                <span className="text-gray-300">${formatPrice(trade.entry_price)}</span>
              </div>
              <div>
                <span className="text-gray-500">Exit: </span>
                <span className="text-gray-300">${formatPrice(trade.exit_price)}</span>
              </div>
              <div>
                <span className="text-gray-500">Qty: </span>
                <span className="text-gray-300">{trade.quantity}</span>
              </div>
              <div>
                <span className="text-gray-500">PnL: </span>
                <span className={isWin ? 'text-accent-green' : 'text-accent-red'}>
                  {isWin ? '+' : ''}{formatUsd(trade.pnl)}
                </span>
              </div>
            </div>
            {/* Existing note preview */}
            {hasNote && !isExpanded && (
              <div className="mt-1 text-[10px] text-gray-500 italic truncate pl-4 border-l-2 border-accent-yellow/30">
                {journal.getNote(tKey)}
              </div>
            )}
            {/* Expanded journal editor */}
            {isExpanded && (
              <div className="mt-2 pt-2 border-t border-bg-600">
                <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-1">
                  <NotebookPen size={9} className="text-accent-yellow" />
                  Trade Note
                </div>
                <textarea
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  placeholder="Add your analysis, lessons learned, or strategy notes..."
                  rows={3}
                  className="w-full bg-bg-600 text-gray-200 text-[11px] rounded px-2 py-1.5 border border-bg-500 focus:outline-none focus:border-accent-yellow resize-none"
                  autoFocus
                />
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => {
                      journal.saveNote(tKey, noteDraft)
                      setExpandedKey(null)
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-accent-green/20 text-accent-green hover:bg-accent-green/30 transition-colors"
                  >
                    <Check size={10} />
                    Save
                  </button>
                  <button
                    onClick={() => {
                      journal.deleteNote(tKey)
                      setNoteDraft('')
                      setExpandedKey(null)
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-bg-600 text-gray-500 hover:text-accent-red transition-colors"
                  >
                    <X size={10} />
                    Delete
                  </button>
                  <button
                    onClick={() => setExpandedKey(null)}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-bg-600 text-gray-500 hover:text-gray-300 transition-colors ml-auto"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
        }}
      />
    </div>
  )
}
