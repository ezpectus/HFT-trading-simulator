import { memo, useMemo } from 'react'
import { Clock, XCircle, Ban } from 'lucide-react'
import { formatPrice, formatTime, colorForSide } from '../utils/format'
import { EmptyState } from './LoadingSkeleton'

function PendingOrders({ openOrders, onCancel, onCancelAll, exchange }) {
  const orders = useMemo(() => {
    const all = Object.values(openOrders || {})
    const filtered = exchange ? all.filter(o => o.exchange === exchange) : all
    return filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  }, [openOrders, exchange])

  if (!orders.length) {
    return (
      <EmptyState
        icon={Clock}
        title="No pending orders"
        subtitle="Resting limit/stop orders will appear here"
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-bg-600">
        <span className="text-[10px] text-gray-500 uppercase">
          {orders.length} pending {exchange ? `on ${exchange}` : 'across exchanges'}
        </span>
        <button
          onClick={() => onCancelAll(exchange || orders[0].exchange)}
          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-accent-red/10 text-accent-red hover:bg-accent-red/20 transition-colors"
          title={exchange ? `Cancel all on ${exchange}` : `Cancel all on ${orders[0].exchange}`}
        >
          <Ban size={10} />
          Cancel All
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {orders.map(o => (
          <div key={`${o.exchange}|${o.id}`} className="flex items-center gap-2 bg-bg-700 rounded px-2 py-1.5 text-xs">
            <span className={`font-medium ${colorForSide(o.side)}`}>{o.side}</span>
            <span className="text-gray-300">{o.symbol}</span>
            <span className="text-gray-500">{o.order_type}</span>
            <span className="font-mono text-gray-400">{o.quantity} @ {o.price ? formatPrice(o.price) : 'MKT'}</span>
            <span className="text-[9px] text-gray-600 ml-auto">{formatTime(o.timestamp)}</span>
            {!exchange && <span className="text-[9px] text-gray-600">{o.exchange}</span>}
            <button
              onClick={() => onCancel(o.exchange, o.id)}
              className="p-0.5 rounded text-gray-500 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
              title={`Cancel ${o.id}`}
            >
              <XCircle size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(PendingOrders)
