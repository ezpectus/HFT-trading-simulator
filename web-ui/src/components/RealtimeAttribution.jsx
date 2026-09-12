import { memo, useMemo } from 'react'
import { PieChart, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { pnlColor, StatCard, Bar } from '../utils/ui-helpers'

const COLORS = ['bg-accent-blue', 'bg-accent-green', 'bg-accent-purple', 'bg-accent-yellow', 'bg-accent-orange', 'bg-accent-red']

/**
 * Realtime PnL Attribution — attributes REALIZED PnL from account
 * trade_history: by symbol, by close reason (STOP_LOSS/TAKE_PROFIT/MANUAL),
 * plus cumulative PnL curve across closed trades.
 */
const RealtimeAttribution = memo(function RealtimeAttribution({ accounts }) {
  const data = useMemo(() => {
    const trades = []
    for (const [ex, acc] of Object.entries(accounts || {})) {
      for (const t of acc.trade_history || []) trades.push({ ...t, exchange: ex })
    }
    if (!trades.length) return null

    trades.sort((a, b) => (a.closed_at || 0) - (b.closed_at || 0))

    const bySymbol = new Map()
    const byReason = new Map()
    let totalFees = 0, cum = 0
    const curve = []
    for (const t of trades) {
      const sym = (t.symbol || '?').replace('/USDT', '')
      const reason = t.reason || 'OTHER'
      bySymbol.set(sym, (bySymbol.get(sym) || 0) + (t.pnl || 0))
      byReason.set(reason, (byReason.get(reason) || 0) + (t.pnl || 0))
      totalFees += t.fee || 0
      cum += t.pnl || 0
      curve.push(cum)
    }

    const rows = [...bySymbol.entries()]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([source, pnl], i) => ({ source, pnl, color: COLORS[i % COLORS.length] }))
    const total = rows.reduce((s, r) => s + r.pnl, 0)
    for (const r of rows) r.pct = total !== 0 ? (r.pnl / Math.abs(total)) * 100 : 0

    const grossProfit = trades.filter(t => (t.pnl || 0) > 0).reduce((s, t) => s + t.pnl, 0)
    const grossLoss = trades.filter(t => (t.pnl || 0) < 0).reduce((s, t) => s + Math.abs(t.pnl), 0)

    return {
      rows,
      reasons: [...byReason.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])),
      curve,
      total,
      totalFees,
      grossProfit,
      grossLoss,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0),
      best: rows.find(r => r.pnl === Math.max(...rows.map(x => x.pnl))),
      worst: rows.find(r => r.pnl === Math.min(...rows.map(x => x.pnl))),
      nTrades: trades.length,
    }
  }, [accounts])

  const curveMax = data ? Math.max(...data.curve.map(Math.abs), 1) : 1

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PieChart size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Realtime PnL Attribution</span>
        </div>
        {data && (
          <span className={`text-[10px] font-mono ${pnlColor(data.total)}`}>
            {data.total >= 0 ? '+' : ''}${data.total.toFixed(0)}
          </span>
        )}
      </div>

      {!data ? (
        <div className="text-gray-500 text-[10px] p-2">No closed trades yet — PnL attribution appears after positions close</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="Total PnL" value={`${data.total >= 0 ? '+' : ''}$${data.total.toFixed(0)}`} color={pnlColor(data.total)} compact />
            <StatCard label="Profit Factor" value={data.profitFactor === Infinity ? '∞' : data.profitFactor.toFixed(2)} color={data.profitFactor >= 1.5 ? 'text-accent-green' : data.profitFactor >= 1 ? 'text-accent-yellow' : 'text-accent-red'} compact />
            <StatCard label="Best" value={data.best?.source ?? '—'} color="text-accent-green" size="xs" compact />
            <StatCard label="Fees Paid" value={`$${data.totalFees.toFixed(0)}`} color="text-gray-400" compact />
          </div>

          {/* Attribution by symbol */}
          <div>
            <div className="text-[10px] text-gray-600 uppercase mb-1">Realized PnL by Symbol ({data.nTrades} trades)</div>
            <div className="space-y-0.5">
              {data.rows.map(a => (
                <div key={a.source} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
                  <span className="text-[10px] text-gray-300 w-24 truncate">{a.source}</span>
                  <Bar value={Math.abs(a.pct)} max={100} color={a.color} />
                  <span className={`text-[9px] font-mono w-14 text-right ${pnlColor(a.pnl)}`}>
                    {a.pnl >= 0 ? '+' : ''}${a.pnl.toFixed(0)}
                  </span>
                  <span className={`text-[9px] font-mono w-10 text-right ${pnlColor(a.pnl)}`}>
                    {a.pct >= 0 ? '+' : ''}{a.pct.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* By close reason */}
          {data.reasons.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-600 uppercase mb-1">By Close Reason</div>
              <div className="flex gap-1">
                {data.reasons.map(([reason, pnl]) => (
                  <div key={reason} className="flex-1 p-1.5 bg-bg-700 border border-bg-600 text-center">
                    <div className="text-[8px] text-gray-600">{reason}</div>
                    <div className={`text-[11px] font-mono ${pnlColor(pnl)}`}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cumulative PnL curve */}
          <div className="p-2 bg-bg-700 border border-bg-600">
            <div className="flex items-center gap-1 mb-1">
              <Activity size={11} className="text-gray-500" />
              <span className="text-[10px] text-gray-600 uppercase">Cumulative Realized PnL</span>
            </div>
            <div className="flex items-end gap-px h-16">
              {data.curve.slice(-40).map((v, i) => (
                <div
                  key={i}
                  className={`flex-1 ${v >= 0 ? 'bg-accent-green' : 'bg-accent-red'}`}
                  style={{ height: `${Math.max(2, (Math.abs(v) / curveMax) * 100)}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-0.5 text-[8px] text-gray-600">
              <span>{data.curve.length} closed trades</span>
              <span>${data.curve[data.curve.length - 1].toFixed(0)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
            <span className="flex items-center gap-1">
              <TrendingUp size={9} className="text-accent-green" />
              Gross: +${data.grossProfit.toFixed(0)}
            </span>
            <span className="flex items-center gap-1">
              <TrendingDown size={9} className="text-accent-red" />
              Gross: -${data.grossLoss.toFixed(0)}
            </span>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(RealtimeAttribution)
