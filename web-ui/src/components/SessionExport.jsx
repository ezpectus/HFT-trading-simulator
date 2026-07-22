import { useCallback } from 'react'
import { Download, FileJson } from 'lucide-react'

export default function SessionExport({ accounts, fills, candles, signals, config }) {
  const exportJSON = useCallback(() => {
    const session = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      accounts: Object.fromEntries(
        Object.entries(accounts || {}).map(([id, acc]) => [id, {
          balance: acc.balance,
          equity: acc.equity,
          total_pnl: acc.total_pnl,
          total_fees: acc.total_fees,
          total_trades: acc.total_trades,
          winning_trades: acc.winning_trades,
          positions: Object.values(acc.positions || {}).map(p => ({
            symbol: p.symbol,
            side: p.side,
            quantity: p.quantity,
            entry_price: p.entry_price,
            unrealized_pnl: p.unrealized_pnl,
          })),
          trade_history: acc.trade_history?.map(t => ({
            symbol: t.symbol,
            side: t.side,
            entry_price: t.entry_price,
            exit_price: t.exit_price,
            quantity: t.quantity,
            pnl: t.pnl,
            reason: t.reason,
            closed_at: t.closed_at,
          })),
        }])
      ),
      fills: (fills || []).map(f => ({
        id: f.id,
        exchange: f.exchange,
        symbol: f.symbol,
        side: f.side,
        type: f.type,
        price: f.price,
        quantity: f.quantity,
        status: f.status,
        timestamp: f.timestamp,
      })),
      candles: (candles || []).slice(-200).map(c => ({
        exchange: c.exchange,
        symbol: c.symbol,
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
      signals: (signals || []).slice(-50).map(s => ({
        symbol: s.symbol,
        direction: s.direction,
        confidence: s.confidence,
        strategy: s.strategy,
        timestamp: s.timestamp,
      })),
      summary: {
        totalFills: (fills || []).length,
        totalCandles: (candles || []).length,
        totalSignals: (signals || []).length,
        accountCount: Object.keys(accounts || {}).length,
      },
    }

    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trading_session_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [accounts, fills, candles, signals])

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <FileJson size={12} className="text-accent-blue" />
        Session Export
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2 text-[9px]">
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">Fills</div>
          <div className="font-mono text-gray-300">{(fills || []).length}</div>
        </div>
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">Candles</div>
          <div className="font-mono text-gray-300">{(candles || []).length}</div>
        </div>
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">Signals</div>
          <div className="font-mono text-gray-300">{(signals || []).length}</div>
        </div>
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">Accounts</div>
          <div className="font-mono text-gray-300">{Object.keys(accounts || {}).length}</div>
        </div>
      </div>

      <button
        onClick={exportJSON}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors"
      >
        <Download size={11} />
        Export Full Session (JSON)
      </button>

      <div className="mt-1.5 text-[8px] text-gray-600 text-center">
        Includes accounts, fills, last 200 candles, signals
      </div>
    </div>
  )
}
