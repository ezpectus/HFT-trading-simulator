import { useState, useMemo } from 'react'
import { Radio, TrendingUp, TrendingDown, Minus, Activity, Filter, Search } from 'lucide-react'
import { formatPrice, formatTime, colorForSide } from '../utils/format'
import VirtualList from './VirtualList'
import { EmptyState } from './LoadingSkeleton'
import { useDebounce } from '../hooks/useDebounce'

const FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Long', value: 'LONG' },
  { label: 'Short', value: 'SHORT' },
]

export default function SignalFeed({ signals, regime }) {
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const filteredSignals = useMemo(() => {
    let result = signals
    if (filter !== 'ALL') {
      result = result.filter(s => s.direction === filter)
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toUpperCase()
      result = result.filter(s =>
        s.symbol?.toUpperCase().includes(q) ||
        s.reason?.toUpperCase().includes(q)
      )
    }
    return result
  }, [signals, filter, debouncedSearch])

  return (
    <div className="p-2 space-y-1">
      {/* Market regime */}
      {regime && (
        <div className="bg-bg-700 p-2 mb-2 border border-bg-600">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
            <Activity size={12} />
            <span>Market Regime</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold ${
              regime.regime === 'TRENDING' ? 'text-accent-blue' :
              regime.regime === 'RANGING' ? 'text-accent-yellow' : 'text-gray-400'
            }`}>
              {regime.regime}
            </span>
            <div className="flex gap-2 text-xs font-mono text-gray-500">
              <span>T:{regime.trend_score?.toFixed(2)}</span>
              <span>C:{regime.cycle_strength?.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Signal confidence distribution */}
      {signals.length > 0 && (
        <div className="bg-bg-700 p-2 mb-2 border border-bg-600">
          <div className="text-[10px] text-gray-500 mb-1.5">Confidence Distribution</div>
          {(() => {
            const buckets = [0, 0, 0, 0, 0] // 0-20, 20-40, 40-60, 60-80, 80-100
            for (const s of signals) {
              const idx = Math.min(4, Math.floor((s.confidence || 0) / 20))
              buckets[idx]++
            }
            const maxB = Math.max(...buckets, 1)
            const labels = ['0-20', '20-40', '40-60', '60-80', '80-100']
            const colors = ['bg-gray-600', 'bg-gray-500', 'bg-accent-yellow', 'bg-accent-blue', 'bg-accent-green']
            return (
              <div className="flex items-end gap-1 h-[32px]">
                {buckets.map((count, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${labels[i]}%: ${count} signals`}>
                    <div
                      className={`w-full ${colors[i]}`}
                      style={{ height: `${(count / maxB) * 24}px` }}
                    />
                    <span className="text-[8px] text-gray-600 font-mono">{count}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* Signal list header with filter + search */}
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-xs font-medium text-gray-400">
          AI Signals ({filteredSignals.length}{filter !== 'ALL' || debouncedSearch ? `/${signals.length}` : ''})
        </span>
        {signals.length > 0 && (
          <div className="flex items-center gap-1" role="group" aria-label="Signal filter">
            <div className="relative">
              <Search size={10} className="absolute left-1 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-16 bg-bg-600 border border-bg-500  pl-4 pr-1 py-0.5 text-[9px] text-gray-200 outline-none focus:border-accent-blue"
                aria-label="Search signals by symbol or reason"
              />
            </div>
            <Filter size={10} className="text-gray-600" />
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className={`px-1.5 py-0.5 text-[9px] font-medium  transition-colors ${
                  filter === f.value
                    ? 'bg-bg-500 text-gray-200'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!filteredSignals.length ? (
        <EmptyState
          icon={Radio}
          title={signals.length === 0 ? 'Waiting for signals' : 'No signals match filter'}
          subtitle={signals.length === 0 ? 'AI signal bot will appear here when connected' : 'Try changing the filter or search query'}
        />
      ) : (
        <VirtualList
          items={filteredSignals}
          itemHeight={72}
          maxHeight={400}
          renderItem={(sig, i) => {
            const isLong = sig.direction === 'LONG'
            const isShort = sig.direction === 'SHORT'
            const Icon = isLong ? TrendingUp : isShort ? TrendingDown : Minus

            return (
              <div className="bg-bg-700  p-2 text-xs mx-px">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Icon size={14} className={colorForSide(sig.direction)} />
                    <span className={`font-semibold ${colorForSide(sig.direction)}`}>
                      {sig.direction}
                    </span>
                    <span className="text-gray-300">{sig.symbol}</span>
                  </div>
                  <span className="text-gray-500 text-[10px]">{formatTime(sig.timestamp)}</span>
                </div>

                <div className="grid grid-cols-3 gap-1 font-mono text-[11px]">
                  <div>
                    <span className="text-gray-500">Conf: </span>
                    <span className="text-gray-300">{sig.confidence?.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-gray-500">R:R: </span>
                    <span className="text-gray-300">{sig.rr_ratio?.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Entry: </span>
                    <span className="text-gray-300">${formatPrice(sig.entry_price)}</span>
                  </div>
                </div>

                {sig.reason && (
                  <div className="mt-1 text-[10px] text-gray-500 truncate">
                    {sig.reason}
                  </div>
                )}
              </div>
            )
          }}
        />
      )}
    </div>
  )
}
