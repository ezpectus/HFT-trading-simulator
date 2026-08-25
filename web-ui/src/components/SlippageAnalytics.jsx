import { memo, useMemo } from 'react'
import { TrendingDown, BarChart3, Activity, AlertTriangle } from 'lucide-react'
import { formatVolume } from '../utils/format'
import { StatCard, WarningBanner, Label } from '../utils/ui-helpers'

const MOCK_SLIPPAGE = [
  { symbol: 'BTC/USDT', orderSize: 0.5, expected: 44100, filled: 44102.5, slippageBps: 5.7, venue: 'Binance' },
  { symbol: 'BTC/USDT', orderSize: 2.0, expected: 44100, filled: 44108.0, slippageBps: 18.1, venue: 'Binance' },
  { symbol: 'BTC/USDT', orderSize: 5.0, expected: 44100, filled: 44125.0, slippageBps: 56.7, venue: 'Binance' },
  { symbol: 'ETH/USDT', orderSize: 3.0, expected: 2350, filled: 2351.2, slippageBps: 5.1, venue: 'OKX' },
  { symbol: 'ETH/USDT', orderSize: 15.0, expected: 2350, filled: 2354.5, slippageBps: 19.1, venue: 'OKX' },
  { symbol: 'SOL/USDT', orderSize: 50, expected: 96.2, filled: 96.25, slippageBps: 5.2, venue: 'Bybit' },
  { symbol: 'SOL/USDT', orderSize: 500, expected: 96.2, filled: 96.85, slippageBps: 67.6, venue: 'Bybit' },
  { symbol: 'AVAX/USDT', orderSize: 120, expected: 28.5, filled: 28.53, slippageBps: 10.5, venue: 'OKX' },
]

const MOCK_VENUE_STATS = [
  { venue: 'Binance', avgSlippage: 12.5, fillRate: 98.2, orderCount: 342 },
  { venue: 'OKX', avgSlippage: 15.8, fillRate: 96.5, orderCount: 218 },
  { venue: 'Bybit', avgSlippage: 18.2, fillRate: 94.8, orderCount: 156 },
]

const MOCK_SIZE_BUCKETS = [
  { bucket: '< 1k', avgSlip: 3.2, count: 180 },
  { bucket: '1-5k', avgSlip: 8.5, count: 120 },
  { bucket: '5-20k', avgSlip: 22.1, count: 65 },
  { bucket: '20-50k', avgSlip: 45.8, count: 28 },
  { bucket: '> 50k', avgSlip: 89.3, count: 12 },
]

function slipColor(bps) {
  if (bps < 10) return 'text-accent-green'
  if (bps < 25) return 'text-accent-yellow'
  if (bps < 50) return 'text-accent-orange'
  return 'text-accent-red'
}

const SlippageAnalytics = memo(function SlippageAnalytics({ symbol }) {
  const stats = useMemo(() => {
    const totalSlip = MOCK_SLIPPAGE.reduce((s, e) => s + e.slippageBps, 0)
    const avgSlip = totalSlip / MOCK_SLIPPAGE.length
    const maxSlip = Math.max(...MOCK_SLIPPAGE.map(e => e.slippageBps))
    const worstExec = MOCK_SLIPPAGE.reduce((max, e) => e.slippageBps > max.slippageBps ? e : max, MOCK_SLIPPAGE[0])
    return { avgSlip, maxSlip, worstExec }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingDown size={14} className="text-accent-orange" />
          <span className="text-sm font-medium">Slippage Analytics</span>
        </div>
        <span className="text-[10px] text-gray-600">{symbol ?? 'BTC/USDT'}</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1">
        <StatCard label="Avg Slippage" value={`${stats.avgSlip.toFixed(1)}bps`} color={slipColor(stats.avgSlip)} />
        <StatCard label="Max Slippage" value={`${stats.maxSlip.toFixed(1)}bps`} color={slipColor(stats.maxSlip)} />
        <StatCard label="Executions" value={MOCK_SLIPPAGE.length} color="text-gray-300" />
      </div>

      {/* Slippage by order size */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <BarChart3 size={11} className="text-gray-500" />
          <Label>Slippage by Order Size</Label>
        </div>
        <div className="space-y-0.5">
          {MOCK_SIZE_BUCKETS.map(b => (
            <div key={b.bucket} className="flex items-center gap-2">
              <span className="text-[9px] text-gray-400 w-12">{b.bucket}</span>
              <div className="flex-1 h-2 bg-bg-600 rounded-full overflow-hidden">
                <div
                  className={`h-full ${b.avgSlip < 10 ? 'bg-accent-green' : b.avgSlip < 25 ? 'bg-accent-yellow' : b.avgSlip < 50 ? 'bg-accent-orange' : 'bg-accent-red'}`}
                  style={{ width: `${(b.avgSlip / 90) * 100}%` }}
                />
              </div>
              <span className={`text-[9px] font-mono w-12 text-right ${slipColor(b.avgSlip)}`}>
                {b.avgSlip.toFixed(1)}bps
              </span>
              <span className="text-[9px] text-gray-600 w-10 text-right">{b.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Venue comparison */}
      <div>
        <Label className="mb-1">Venue Comparison</Label>
        <div className="space-y-0.5">
          {MOCK_VENUE_STATS.map(v => (
            <div key={v.venue} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[10px] text-gray-300 w-16">{v.venue}</span>
              <span className={`text-[9px] font-mono w-16 ${slipColor(v.avgSlippage)}`}>{v.avgSlippage.toFixed(1)}bps</span>
              <span className="text-[9px] text-gray-400 w-16">{v.fillRate.toFixed(1)}% fill</span>
              <span className="text-[9px] text-gray-600 w-12 text-right">{v.orderCount} ord</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent executions */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Activity size={11} className="text-gray-500" />
          <Label>Recent Executions</Label>
        </div>
        <div className="space-y-0.5 max-h-32 overflow-y-auto">
          {MOCK_SLIPPAGE.map((ex, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[9px] text-gray-300 w-12 truncate">{ex.symbol.replace('/USDT', '')}</span>
              <span className="text-[9px] font-mono text-gray-400 w-12">{ex.orderSize}</span>
              <span className="text-[9px] font-mono text-gray-500 w-16">${formatVolume(ex.expected)}</span>
              <span className="text-[9px] font-mono text-gray-300 w-16">${formatVolume(ex.filled)}</span>
              <span className={`text-[9px] font-mono w-12 text-right ${slipColor(ex.slippageBps)}`}>
                {ex.slippageBps.toFixed(1)}bp
              </span>
              <span className="text-[9px] text-gray-600 w-12 text-right">{ex.venue}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Warning */}
      <WarningBanner icon={AlertTriangle} color="text-accent-orange">
        Large orders ({'>50k'}) show {Math.round(MOCK_SIZE_BUCKETS[4].avgSlip)}bps avg slippage — split orders
      </WarningBanner>
    </div>
  )
})

export default SlippageAnalytics
