import { useMemo } from 'react'
import { BarChart3, AlertTriangle, CheckCircle } from 'lucide-react'

export default function TradeClustering({ fills }) {
  const analysis = useMemo(() => {
    if (!fills?.length || fills.length < 3) {
      return { clusters: [], overtrading: false, avgInterval: 0, maxCluster: 0 }
    }

    const sorted = [...fills].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    const intervals = []
    for (let i = 1; i < sorted.length; i++) {
      intervals.push((sorted[i].timestamp || 0) - (sorted[i - 1].timestamp || 0))
    }

    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length

    // Detect clusters: trades within 30 seconds of each other
    const CLUSTER_THRESHOLD = 30
    const clusters = []
    let currentCluster = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i].timestamp || 0) - (sorted[i - 1].timestamp || 0)
      if (gap <= CLUSTER_THRESHOLD) {
        currentCluster.push(sorted[i])
      } else {
        if (currentCluster.length >= 3) clusters.push(currentCluster)
        currentCluster = [sorted[i]]
      }
    }
    if (currentCluster.length >= 3) clusters.push(currentCluster)

    // Overtrading detection: >10 trades in 5 minutes
    const FIVE_MIN = 300
    let maxInWindow = 0
    for (let i = 0; i < sorted.length; i++) {
      const windowEnd = (sorted[i].timestamp || 0) + FIVE_MIN
      let count = 0
      for (let j = i; j < sorted.length && (sorted[j].timestamp || 0) <= windowEnd; j++) count++
      if (count > maxInWindow) maxInWindow = count
    }

    const overtrading = maxInWindow > 10

    return {
      clusters: clusters.slice(-5).map(c => ({
        count: c.length,
        start: c[0].timestamp,
        end: c[c.length - 1].timestamp,
        duration: c[c.length - 1].timestamp - c[0].timestamp,
        side: c[0].side,
      })),
      overtrading,
      avgInterval,
      maxInWindow,
      totalFills: sorted.length,
    }
  }, [fills])

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <BarChart3 size={12} className="text-accent-yellow" />
        Trade Clustering
      </div>

      {/* Overtrading warning */}
      {analysis.overtrading ? (
        <div className="flex items-center gap-2 bg-accent-red/20 border border-accent-red/30 rounded px-2 py-1.5 mb-2">
          <AlertTriangle size={14} className="text-accent-red shrink-0" />
          <div>
            <div className="text-[10px] font-medium text-accent-red">Overtrading Detected</div>
            <div className="text-[9px] text-gray-400">{analysis.maxInWindow} trades in 5 min window</div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-accent-green/10 border border-accent-green/20 rounded px-2 py-1.5 mb-2">
          <CheckCircle size={14} className="text-accent-green shrink-0" />
          <div className="text-[10px] text-gray-400">Normal trading frequency</div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <div className="text-[8px] text-gray-600">Total Fills</div>
          <div className="text-[11px] font-mono text-gray-300">{analysis.totalFills || 0}</div>
        </div>
        <div>
          <div className="text-[8px] text-gray-600">Avg Interval</div>
          <div className="text-[11px] font-mono text-gray-300">
            {analysis.avgInterval > 0 ? `${analysis.avgInterval.toFixed(0)}s` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[8px] text-gray-600">Max 5min</div>
          <div className={'text-[11px] font-mono ' + (analysis.overtrading ? 'text-accent-red' : 'text-gray-300')}>
            {analysis.maxInWindow || 0}
          </div>
        </div>
      </div>

      {/* Clusters */}
      {analysis.clusters.length > 0 && (
        <div>
          <div className="text-[8px] text-gray-600 uppercase mb-1">Trade Clusters (≥3 rapid fills)</div>
          <div className="space-y-0.5 max-h-[100px] overflow-y-auto scrollbar-thin">
            {analysis.clusters.map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-bg-600/50 rounded px-1.5 py-1 text-[9px]">
                <span className="text-gray-400">{c.count} fills</span>
                <span className="text-gray-600">{c.duration}s span</span>
                <span className={c.side === 'BUY' ? 'text-accent-green' : 'text-accent-red'}>{c.side}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
