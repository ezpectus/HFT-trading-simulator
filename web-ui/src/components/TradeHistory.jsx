import { memo, useMemo, useState } from 'react'
import { History, Crown, AlertCircle, Download, NotebookPen, X, Check, FileText, ArrowUpDown, TrendingUp } from 'lucide-react'
import { formatPrice, formatUsd, formatTime, colorForSide } from '../utils/format'
import { useTradeJournal, tradeKey, extractTradesFromAccounts } from '../hooks/useTradeJournal'
import VirtualList from './VirtualList'
import { EmptyState } from './LoadingSkeleton'

const SORT_OPTIONS = [
  { id: 'date', label: 'Date' },
  { id: 'pnl', label: 'PnL' },
  { id: 'symbol', label: 'Symbol' },
]

function TradeHistory({ accounts }) {
  const journal = useTradeJournal()
  const [expandedKey, setExpandedKey] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [sortMode, setSortMode] = useState('date')

  const { allTrades, bestTrade, worstTrade, totalPnl, wins, losses } = useMemo(() => {
    const baseTrades = extractTradesFromAccounts(accounts)
    const trades = baseTrades.sort((a, b) => {
      if (sortMode === 'pnl') return b.pnl - a.pnl
      if (sortMode === 'symbol') return a.symbol.localeCompare(b.symbol)
      return (b.closed_at || 0) - (a.closed_at || 0)
    })

    let best = null, worst = null, pnl = 0, w = 0, l = 0
    for (const t of trades) {
      pnl += t.pnl
      if (t.pnl >= 0) w++; else l++
      if (!best || t.pnl > best.pnl) best = t
      if (!worst || t.pnl < worst.pnl) worst = t
    }

    return { allTrades: trades, bestTrade: best, worstTrade: worst, totalPnl: pnl, wins: w, losses: l }
  }, [accounts, sortMode])

  const cycleSort = () => {
    const idx = SORT_OPTIONS.findIndex(o => o.id === sortMode)
    setSortMode(SORT_OPTIONS[(idx + 1) % SORT_OPTIONS.length].id)
  }

  if (!allTrades.length) {
    return (
      <EmptyState
        icon={History}
        title="No closed trades yet"
        subtitle="Trade history will appear here when positions are closed"
      />
    )
  }

  const winRate = allTrades.length > 0 ? (wins / allTrades.length * 100).toFixed(1) : 0

  return (
    <div className="p-2 space-y-1">
      {/* Summary stats */}
      <div className="bg-bg-700 p-2.5 mb-2 border border-bg-600">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] text-gray-500 uppercase">Trade History Summary</div>
          <div className="flex gap-1">
            <button
              onClick={() => journal.exportTradesCSV(allTrades)}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-bg-600 text-gray-400 hover:bg-bg-500 hover:text-gray-200 transition-colors"
              title="Export trades as CSV"
            >
              <Download size={10} />
              CSV
            </button>
            <button
              onClick={() => journal.exportJournalCSV(allTrades)}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-bg-600 text-gray-400 hover:bg-bg-500 hover:text-gray-200 transition-colors"
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

      {/* Cumulative PnL mini chart */}
      {allTrades.length >= 2 && (() => {
        const sorted = [...allTrades].sort((a, b) => (a.closed_at || 0) - (b.closed_at || 0))
        let cum = 0
        const points = sorted.map(t => { cum += t.pnl; return cum })
        const maxVal = Math.max(...points, 0)
        const minVal = Math.min(...points, 0)
        const range = maxVal - minVal || 1
        const W = 100, H = 40
        const path = points.map((v, i) => {
          const x = (i / (points.length - 1)) * W
          const y = H - ((v - minVal) / range) * H
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
        }).join(' ')
        const zeroY = H - ((0 - minVal) / range) * H
        const fillColor = cum >= 0 ? 'rgba(14, 203, 129, 0.15)' : 'rgba(246, 70, 93, 0.15)'
        const strokeColor = cum >= 0 ? '#0ecb81' : '#f6465d'
        return (
          <div className="bg-bg-700 p-2.5 mb-2 border border-bg-600">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
              <TrendingUp size={12} className="text-accent-yellow" />
              Cumulative PnL
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[40px]" preserveAspectRatio="none">
              <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="#5e6673" strokeWidth="0.3" strokeDasharray="1,1" />
              <path d={`${path} L ${W} ${H} L 0 ${H} Z`} fill={fillColor} />
              <path d={path} fill="none" stroke={strokeColor} strokeWidth="0.5" />
            </svg>
            <div className="flex justify-between text-[9px] font-mono mt-0.5">
              <span className="text-gray-600">{sorted.length} trades</span>
              <span className={cum >= 0 ? 'text-accent-green' : 'text-accent-red'}>{cum >= 0 ? '+' : ''}{formatUsd(cum)}</span>
            </div>
          </div>
        )
      })()}

      {/* Best & worst trades */}
      {(bestTrade || worstTrade) && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          {bestTrade && (
            <div className="bg-accent-green/10 border border-accent-green/20 p-2">
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
            <div className="bg-accent-red/10 border border-accent-red/20 p-2">
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

      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-xs font-medium text-gray-400">
          Closed Trades ({allTrades.length})
        </span>
        <button
          onClick={cycleSort}
          className="flex items-center gap-0.5 text-[9px] text-gray-600 hover:text-gray-400 transition-colors"
          title={`Sort by ${SORT_OPTIONS.find(o => o.id === sortMode)?.label || 'Date'}`}
        >
          <ArrowUpDown size={10} />
          {SORT_OPTIONS.find(o => o.id === sortMode)?.label || 'Date'}
        </button>
      </div>
      <VirtualList
        items={allTrades}
        itemHeight={80}
        maxHeight={400}
        overscan={5}
        renderItem={(trade, _i) => {
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
          <div className={'bg-bg-700 p-2 text-xs border border-bg-600 ' + (isBest ? 'ring-1 ring-accent-green/30' : isWorst ? 'ring-1 ring-accent-red/30' : '')}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                {isBest && <Crown size={10} className="text-accent-green" />}
                {isWorst && <AlertCircle size={10} className="text-accent-red" />}
                <span className={'font-semibold ' + colorForSide(trade.side)}>
                  {trade.side === 'BUY' ? 'LONG' : 'SHORT'}
                </span>
                <span className="text-gray-300">{trade.symbol}</span>
                <span className="text-gray-500 text-[10px]">{trade.exchange}</span>
                <span className={'text-[9px] px-1 ' + reasonColor + ' bg-bg-800'}>
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
                  className={'p-0.5 transition-colors ' + (hasNote ? 'text-accent-yellow' : 'text-gray-600 hover:text-gray-400')}
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
                  className="w-full bg-bg-600 text-gray-200 text-[11px] px-2 py-1.5 border border-bg-500 focus:outline-none focus:border-accent-yellow resize-none"
                  autoFocus
                />
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => {
                      journal.saveNote(tKey, noteDraft)
                      setExpandedKey(null)
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-accent-green/20 text-accent-green hover:bg-accent-green/30 transition-colors"
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
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-bg-600 text-gray-500 hover:text-accent-red transition-colors"
                  >
                    <X size={10} />
                    Delete
                  </button>
                  <button
                    onClick={() => setExpandedKey(null)}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-bg-600 text-gray-500 hover:text-gray-300 transition-colors ml-auto"
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

export default memo(TradeHistory)
