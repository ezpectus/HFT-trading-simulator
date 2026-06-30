import { Radio, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react'
import { formatPrice, formatTime, colorForSide } from '../utils/format'
import VirtualList from './VirtualList'

export default function SignalFeed({ signals, regime }) {
  return (
    <div className="p-2 space-y-1">
      {/* Market regime */}
      {regime && (
        <div className="bg-bg-700 rounded-lg p-2 mb-2">
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
        <div className="bg-bg-700 rounded-lg p-2 mb-2">
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
                      className={`w-full rounded-sm ${colors[i]}`}
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

      {/* Signal list */}
      <div className="text-xs font-medium text-gray-400 mb-1 px-1">
        AI Signals ({signals.length})
      </div>

      {!signals.length ? (
        <div className="text-center text-gray-500 text-xs py-4">
          <Radio size={20} className="mx-auto mb-1 opacity-50" />
          Waiting for signals...
        </div>
      ) : (
        <VirtualList
          items={signals}
          itemHeight={72}
          maxHeight={400}
          renderItem={(sig, i) => {
            const isLong = sig.direction === 'LONG'
            const isShort = sig.direction === 'SHORT'
            const Icon = isLong ? TrendingUp : isShort ? TrendingDown : Minus

            return (
              <div className="bg-bg-700 rounded p-2 text-xs mx-px">
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
