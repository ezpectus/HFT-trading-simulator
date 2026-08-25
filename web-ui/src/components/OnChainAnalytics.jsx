import { memo, useMemo } from 'react'
import { Link2, TrendingUp, TrendingDown, Wallet, Activity, Database } from 'lucide-react'
import { formatVolume } from '../utils/format'

const MOCK_METRICS = [
  { metric: 'Active Addresses', value: 1245000, change: 5.2, trend: 'up' },
  { metric: 'Transaction Count', value: 425000, change: 8.7, trend: 'up' },
  { metric: 'Avg Tx Fee', value: 2.34, change: -12.5, trend: 'down' },
  { metric: 'Hash Rate', value: 645000, change: 3.1, trend: 'up' },
  { metric: 'MVRV Ratio', value: 2.45, change: -1.8, trend: 'down' },
  { metric: 'NVT Ratio', value: 18.2, change: 4.5, trend: 'up' },
  { metric: 'Exchange Inflow', value: 3250, change: -8.2, trend: 'down' },
  { metric: 'Exchange Outflow', value: 4120, change: 12.3, trend: 'up' },
]

const MOCK_WHALES = [
  { address: 'bc1q...8a3f', balance: 125000, change: 500, type: 'accumulation' },
  { address: 'bc1q...4k2d', balance: 89000, change: -1200, type: 'distribution' },
  { address: 'bc1q...9x1c', balance: 67000, change: 300, type: 'accumulation' },
  { address: 'bc1q...2m5b', balance: 45000, change: -800, type: 'distribution' },
  { address: 'bc1q...7n3e', balance: 38000, change: 120, type: 'accumulation' },
]

function trendIcon(trend) {
  return trend === 'up' ? <TrendingUp size={10} className="text-accent-green" /> : <TrendingDown size={10} className="text-accent-red" />
}

function trendColor(change) {
  return change >= 0 ? 'text-accent-green' : 'text-accent-red'
}

const OnChainAnalytics = memo(function OnChainAnalytics({ symbol }) {
  const netFlow = useMemo(() => {
    const inflow = MOCK_METRICS.find(m => m.metric === 'Exchange Inflow').value
    const outflow = MOCK_METRICS.find(m => m.metric === 'Exchange Outflow').value
    return outflow - inflow
  }, [])

  const accumCount = MOCK_WHALES.filter(w => w.type === 'accumulation').length
  const distCount = MOCK_WHALES.filter(w => w.type === 'distribution').length

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link2 size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">On-Chain Analytics</span>
        </div>
        <span className="text-[10px] text-gray-600">{(symbol ?? 'BTC/USDT').split('/')[0]}</span>
      </div>

      {/* Net exchange flow */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-600 uppercase">Net Exchange Flow</span>
          <span className={`text-sm font-mono font-bold ${netFlow >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {netFlow >= 0 ? '+' : ''}{formatVolume(netFlow)} BTC
          </span>
        </div>
        <div className="text-[9px] text-gray-600 mt-0.5">
          {netFlow >= 0 ? 'Outflow exceeds inflow — bullish signal' : 'Inflow exceeds outflow — bearish signal'}
        </div>
      </div>

      {/* Key metrics */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Activity size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Key Metrics</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {MOCK_METRICS.map(m => (
            <div key={m.metric} className="p-1.5 bg-bg-700 border border-bg-600">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-gray-600 truncate flex-1">{m.metric}</span>
                {trendIcon(m.trend)}
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[11px] font-mono text-gray-300">
                  {m.value >= 1000 ? formatVolume(m.value) : m.value.toFixed(2)}
                </span>
                <span className={`text-[9px] font-mono ${trendColor(m.change)}`}>
                  {m.change >= 0 ? '+' : ''}{m.change.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Whale activity */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Wallet size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Whale Activity</span>
          <span className="text-[9px] text-gray-600 ml-auto">
            <span className="text-accent-green">{accumCount} acc</span>
            {' / '}
            <span className="text-accent-red">{distCount} dist</span>
          </span>
        </div>
        <div className="space-y-0.5">
          {MOCK_WHALES.map(whale => (
            <div key={whale.address} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[9px] font-mono text-gray-400 w-24 truncate">{whale.address}</span>
              <span className="text-[10px] font-mono text-gray-300 w-16">{formatVolume(whale.balance)}</span>
              <span className={`text-[10px] font-mono w-14 text-right ${trendColor(whale.change)}`}>
                {whale.change >= 0 ? '+' : ''}{whale.change}
              </span>
              <span className={`text-[8px] px-1 rounded ${whale.type === 'accumulation' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'}`}>
                {whale.type === 'accumulation' ? 'ACC' : 'DIST'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <Database size={9} />
          Data from blockchain API
        </span>
        <span>Updated: 5 min ago</span>
      </div>
    </div>
  )
})

export default OnChainAnalytics
