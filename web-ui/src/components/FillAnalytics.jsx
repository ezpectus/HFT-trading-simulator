import { memo, useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { ICONS, statusColor } from '../utils/ui-helpers'

const MOCK_FILLS = [
  { id: 1, orderId: 'ord_8a3f', symbol: 'BTC/USDT', side: 'BUY', reqQty: 0.5, fillQty: 0.5, reqPrice: 44100, fillPrice: 44102, partialFill: false, latency: 45, venue: 'Binance', status: 'filled' },
  { id: 2, orderId: 'ord_9b2e', symbol: 'ETH/USDT', side: 'SELL', reqQty: 3.0, fillQty: 2.8, reqPrice: 2350, fillPrice: 2351, partialFill: true, latency: 120, venue: 'OKX', status: 'partial' },
  { id: 3, orderId: 'ord_1c5d', symbol: 'SOL/USDT', side: 'BUY', reqQty: 50, fillQty: 50, reqPrice: 96.2, fillPrice: 96.2, partialFill: false, latency: 28, venue: 'Bybit', status: 'filled' },
  { id: 4, orderId: 'ord_3f8a', symbol: 'AVAX/USDT', side: 'BUY', reqQty: 120, fillQty: 80, reqPrice: 28.5, fillPrice: 28.53, partialFill: true, latency: 85, venue: 'OKX', status: 'partial' },
  { id: 5, orderId: 'ord_5e1b', symbol: 'LINK/USDT', side: 'SELL', reqQty: 80, fillQty: 0, reqPrice: 14.2, fillPrice: 0, partialFill: false, latency: 5000, venue: 'Binance', status: 'rejected' },
  { id: 6, orderId: 'ord_7d4c', symbol: 'BTC/USDT', side: 'SELL', reqQty: 0.3, fillQty: 0.3, reqPrice: 44250, fillPrice: 44248, partialFill: false, latency: 52, venue: 'Binance', status: 'filled' },
  { id: 7, orderId: 'ord_2a9f', symbol: 'DOT/USDT', side: 'BUY', reqQty: 200, fillQty: 200, reqPrice: 6.8, fillPrice: 6.81, partialFill: false, latency: 38, venue: 'Binance', status: 'filled' },
  { id: 8, orderId: 'ord_6b3e', symbol: 'ETH/USDT', side: 'BUY', reqQty: 2.0, fillQty: 1.5, reqPrice: 2348, fillPrice: 2349, partialFill: true, latency: 95, venue: 'Bybit', status: 'partial' },
]

function statusIcon(status) {
  if (status === 'filled') return ICONS.green()
  if (status === 'partial') return ICONS.yellow()
  return ICONS.red()
}

const STATUS_MAP = {
  filled: 'text-accent-green',
  partial: 'text-accent-yellow',
  default: 'text-accent-red',
}

const FillAnalytics = memo(function FillAnalytics() {
  const stats = useMemo(() => {
    const filled = MOCK_FILLS.filter(f => f.status === 'filled').length
    const partial = MOCK_FILLS.filter(f => f.status === 'partial').length
    const rejected = MOCK_FILLS.filter(f => f.status === 'rejected').length
    const fillRate = (filled / MOCK_FILLS.length) * 100
    const avgLatency = MOCK_FILLS.filter(f => f.status !== 'rejected').reduce((s, f) => s + f.latency, 0) / (MOCK_FILLS.length - rejected)
    const partialRate = (partial / MOCK_FILLS.length) * 100
    return { filled, partial, rejected, fillRate, avgLatency, partialRate }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Fill Analytics</span>
        </div>
        <span className="text-[10px] text-gray-600">{MOCK_FILLS.length} orders</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Fill Rate</div>
          <span className="text-sm font-mono text-accent-green">{stats.fillRate.toFixed(0)}%</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Partial</div>
          <span className="text-sm font-mono text-accent-yellow">{stats.partialRate.toFixed(0)}%</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Avg Latency</div>
          <span className="text-sm font-mono text-gray-300">{stats.avgLatency.toFixed(0)}ms</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Rejected</div>
          <span className="text-sm font-mono text-accent-red">{stats.rejected}</span>
        </div>
      </div>

      {/* Fill quality distribution */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <div className="text-[10px] text-gray-600 uppercase mb-1">Fill Quality</div>
        <div className="flex h-4 rounded overflow-hidden">
          <div className="bg-accent-green flex items-center justify-center" style={{ width: `${stats.fillRate}%` }}>
            <span className="text-[7px] text-white">{stats.filled} filled</span>
          </div>
          <div className="bg-accent-yellow flex items-center justify-center" style={{ width: `${stats.partialRate}%` }}>
            <span className="text-[7px] text-white">{stats.partial} partial</span>
          </div>
          <div className="bg-accent-red flex items-center justify-center" style={{ width: `${(stats.rejected / MOCK_FILLS.length) * 100}%` }}>
            <span className="text-[7px] text-white">{stats.rejected} rej</span>
          </div>
        </div>
      </div>

      {/* Fill details */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Recent Fills</div>
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {MOCK_FILLS.map(f => (
            <div key={f.id} className="py-0.5 px-1.5 bg-bg-700">
              <div className="flex items-center gap-2">
                {statusIcon(f.status)}
                <span className="text-[9px] text-gray-300 w-12 truncate">{f.symbol.replace('/USDT', '')}</span>
                <span className={`text-[9px] font-mono w-10 ${f.side === 'BUY' ? 'text-accent-green' : 'text-accent-red'}`}>{f.side}</span>
                <span className="text-[9px] font-mono text-gray-400 w-16">{f.fillQty}/{f.reqQty}</span>
                <span className="text-[9px] font-mono text-gray-300 w-16">${f.fillPrice || '—'}</span>
                <span className="text-[9px] font-mono text-gray-500 w-12 text-right">{f.latency}ms</span>
                <span className={`text-[8px] uppercase ${statusColor(f.status, STATUS_MAP)} w-10 text-right`}>{f.status}</span>
              </div>
              {f.partialFill && (
                <div className="text-[8px] text-accent-yellow pl-4 mt-0.5">
                  Partial fill: {((f.fillQty / f.reqQty) * 100).toFixed(0)}% of requested quantity
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span>{stats.filled} full fills / {stats.partial} partial / {stats.rejected} rejected</span>
        <span>Avg latency: {stats.avgLatency.toFixed(0)}ms</span>
      </div>
    </div>
  )
})

export default FillAnalytics
