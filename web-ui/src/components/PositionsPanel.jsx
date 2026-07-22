import { X, Layers, AlertTriangle } from 'lucide-react'
import { formatPrice, formatUsd, colorForSide } from '../utils/format'
import { EmptyState } from './LoadingSkeleton'

const EXCHANGE_FEES = { binance: 0.04, bybit: 0.06, okx: 0.05 }
const LEVERAGE = 10

export default function PositionsPanel({ accounts, onClose, currentPrices }) {
  const allPositions = []

  for (const [exId, acc] of Object.entries(accounts || {})) {
    if (!acc) continue
    for (const pos of Object.values(acc.positions || {})) {
      allPositions.push({ ...pos, exchange: exId, leverage: acc.leverage || LEVERAGE })
    }
  }

  if (!allPositions.length) {
    return (
      <EmptyState
        icon={Layers}
        title="No open positions"
        subtitle="Active positions will appear here when orders are filled"
      />
    )
  }

  const totalPnl = allPositions.reduce((s, p) => s + (p.unrealized_pnl || 0), 0)
  const totalMargin = allPositions.reduce((s, p) => {
    return s + (p.entry_price * p.quantity) / (p.leverage || LEVERAGE)
  }, 0)
  const longCount = allPositions.filter(p => p.side === 'BUY').length
  const shortCount = allPositions.length - longCount

  return (
    <div className="p-2 border-t border-bg-600">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="text-xs font-medium text-gray-400">
          Open Positions ({allPositions.length})
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-gray-500">L:{longCount} S:{shortCount}</span>
          <span className="text-gray-500">Margin: <span className="text-gray-300">${formatPrice(totalMargin)}</span></span>
          <span className={totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}>
            {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)}
          </span>
        </div>
      </div>
      <div className="space-y-1">
        {allPositions.map((pos, i) => {
          const pnlPositive = pos.unrealized_pnl >= 0
          const isLong = pos.side === 'BUY'
          const margin = (pos.entry_price * pos.quantity) / pos.leverage
          const liqPrice = isLong
            ? pos.entry_price * (1 - 1 / pos.leverage + 0.005)
            : pos.entry_price * (1 + 1 / pos.leverage - 0.005)

          // Progress from entry to SL and entry to TP
          const currentPx = currentPrices?.[pos.exchange]?.[pos.symbol] || pos.entry_price
          const slDist = Math.abs(pos.entry_price - pos.stop_loss)
          const tpDist = Math.abs(pos.entry_price - pos.take_profit)
          const currentDist = Math.abs(currentPx - pos.entry_price)
          const slProgress = Math.min(100, (currentDist / slDist) * 100)
          const tpProgress = Math.min(100, (currentDist / tpDist) * 100)

          // Which is closer?
          const nearSL = isLong
            ? currentPx < pos.entry_price
            : currentPx > pos.entry_price
          const dangerPct = nearSL ? slProgress : 0

          return (
            <div key={i} className="bg-bg-700 rounded p-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className={`font-semibold ${colorForSide(pos.side)}`}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </span>
                  <span className="text-gray-300">{pos.symbol}</span>
                  <span className="text-gray-500 text-[10px]">{pos.exchange}</span>
                  <span className="text-[9px] px-1 rounded bg-bg-600 text-gray-400">{pos.leverage}x</span>
                  {dangerPct > 70 && (
                    <AlertTriangle size={10} className="text-accent-red animate-pulse" />
                  )}
                </div>
                <button
                  onClick={() => onClose(pos.exchange, pos.symbol)}
                  className="text-gray-500 hover:text-accent-red transition-colors"
                  title="Close position"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1 font-mono text-[11px]">
                <div>
                  <span className="text-gray-500">Qty: </span>
                  <span className="text-gray-300">{pos.quantity}</span>
                </div>
                <div>
                  <span className="text-gray-500">Entry: </span>
                  <span className="text-gray-300">${formatPrice(pos.entry_price)}</span>
                </div>
                <div>
                  <span className="text-gray-500">PnL: </span>
                  <span className={pnlPositive ? 'text-accent-green' : 'text-accent-red'}>
                    {formatUsd(pos.unrealized_pnl)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Margin: </span>
                  <span className="text-gray-300">${formatPrice(margin)}</span>
                </div>
              </div>
              <div className="flex gap-3 mt-1 text-[10px] text-gray-500 font-mono">
                <span className="text-accent-red">SL: ${formatPrice(pos.stop_loss)}</span>
                <span className="text-accent-green">TP: ${formatPrice(pos.take_profit)}</span>
                <span className="text-gray-400">Liq: ${formatPrice(liqPrice)}</span>
              </div>
              {/* SL/TP progress bar */}
              <div className="mt-1.5 relative h-1 bg-bg-600 rounded-full overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full bg-accent-red/40"
                  style={{ width: `${slProgress}%` }}
                />
                <div
                  className="absolute top-0 right-0 h-full bg-accent-green/40"
                  style={{ width: `${tpProgress}%` }}
                />
                <div
                  className="absolute top-0 h-full w-0.5 bg-gray-300"
                  style={{ left: '50%' }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
