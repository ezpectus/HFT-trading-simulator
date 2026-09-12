import { memo, useMemo } from 'react'
import { TrendingDown, BarChart3, Activity, AlertTriangle } from 'lucide-react'
import { formatVolume } from '../utils/format'
import { StatCard, WarningBanner, Label } from '../utils/ui-helpers'

function slipColor(bps) {
  if (bps < 10) return 'text-accent-green'
  if (bps < 25) return 'text-accent-yellow'
  if (bps < 50) return 'text-accent-orange'
  return 'text-accent-red'
}

const BUCKETS = [
  { label: '< 1k', test: n => n < 1e3 },
  { label: '1-5k', test: n => n >= 1e3 && n < 5e3 },
  { label: '5-20k', test: n => n >= 5e3 && n < 2e4 },
  { label: '20-50k', test: n => n >= 2e4 && n < 5e4 },
  { label: '> 50k', test: n => n >= 5e4 },
]

/**
 * Slippage Analytics — real fills; slippage bps = |slip| / mid * 1e4,
 * notional bucketed by filled_quantity * filled_price.
 */
const SlippageAnalytics = memo(function SlippageAnalytics({ fills, symbol }) {
  const data = useMemo(() => {
    const list = (fills || []).map(f => {
      const qty = f.filled_quantity || f.quantity || 0
      const price = f.filled_price || f.price || 0
      const mid = f.filled_price ? f.filled_price - (f.slippage || 0) : price
      const slipBps = mid > 0 ? Math.abs(f.slippage || 0) / mid * 10000 : 0
      return {
        symbol: f.symbol, orderSize: qty, expected: mid, filled: price,
        slippageBps: slipBps, venue: f.exchange, notional: qty * price,
        status: (f.status || '').toUpperCase(),
      }
    })

    const n = list.length || 1
    const avgSlip = list.reduce((s, e) => s + e.slippageBps, 0) / n
    const maxSlip = list.length ? Math.max(...list.map(e => e.slippageBps)) : 0

    const venueStats = Object.entries(
      list.reduce((m, e) => {
        const v = e.venue || 'unknown'
        if (!m[v]) m[v] = { slip: 0, n: 0, filled: 0 }
        m[v].slip += e.slippageBps; m[v].n++
        if (e.status === 'FILLED') m[v].filled++
        return m
      }, {})
    ).map(([venue, d]) => ({ venue, avgSlippage: d.slip / d.n, fillRate: (d.filled / d.n) * 100, orderCount: d.n }))

    const sizeBuckets = BUCKETS.map(b => {
      const hits = list.filter(e => b.test(e.notional))
      return {
        bucket: b.label,
        avgSlip: hits.length ? hits.reduce((s, e) => s + e.slippageBps, 0) / hits.length : 0,
        count: hits.length,
      }
    })

    return { list, avgSlip, maxSlip, venueStats, sizeBuckets }
  }, [fills])

  const maxBucketSlip = Math.max(1, ...data.sizeBuckets.map(b => b.avgSlip))

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingDown size={14} className="text-accent-orange" />
          <span className="text-sm font-medium">Slippage Analytics</span>
        </div>
        <span className="text-[10px] text-gray-600">{symbol ?? 'all symbols'}</span>
      </div>

      {data.list.length === 0 ? (
        <div className="text-gray-500 text-[10px] p-2">No fills yet — slippage stats appear after orders fill</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-1">
            <StatCard label="Avg Slippage" value={`${data.avgSlip.toFixed(1)}bps`} color={slipColor(data.avgSlip)} />
            <StatCard label="Max Slippage" value={`${data.maxSlip.toFixed(1)}bps`} color={slipColor(data.maxSlip)} />
            <StatCard label="Executions" value={data.list.length} color="text-gray-300" />
          </div>

          {/* Slippage by order size */}
          <div className="p-2 bg-bg-700 border border-bg-600">
            <div className="flex items-center gap-1 mb-1">
              <BarChart3 size={11} className="text-gray-500" />
              <Label>Slippage by Order Size</Label>
            </div>
            <div className="space-y-0.5">
              {data.sizeBuckets.map(b => (
                <div key={b.bucket} className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-400 w-12">{b.bucket}</span>
                  <div className="flex-1 h-2 bg-bg-600 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${b.avgSlip < 10 ? 'bg-accent-green' : b.avgSlip < 25 ? 'bg-accent-yellow' : b.avgSlip < 50 ? 'bg-accent-orange' : 'bg-accent-red'}`}
                      style={{ width: `${(b.avgSlip / maxBucketSlip) * 100}%` }}
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
          {data.venueStats.length > 0 && (
            <div>
              <Label className="mb-1">Venue Comparison</Label>
              <div className="space-y-0.5">
                {data.venueStats.map(v => (
                  <div key={v.venue} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
                    <span className="text-[10px] text-gray-300 w-16">{v.venue}</span>
                    <span className={`text-[9px] font-mono w-16 ${slipColor(v.avgSlippage)}`}>{v.avgSlippage.toFixed(1)}bps</span>
                    <span className="text-[9px] text-gray-400 w-16">{v.fillRate.toFixed(1)}% fill</span>
                    <span className="text-[9px] text-gray-600 w-12 text-right">{v.orderCount} ord</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent executions */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <Activity size={11} className="text-gray-500" />
              <Label>Recent Executions</Label>
            </div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {data.list.slice(-20).reverse().map((ex, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
                  <span className="text-[9px] text-gray-300 w-12 truncate">{(ex.symbol || '').replace('/USDT', '')}</span>
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
          {data.maxSlip > 50 && (
            <WarningBanner icon={AlertTriangle} color="text-accent-orange">
              Max slippage {data.maxSlip.toFixed(0)}bps observed — consider splitting large orders
            </WarningBanner>
          )}
        </>
      )}
    </div>
  )
})

export default memo(SlippageAnalytics)
