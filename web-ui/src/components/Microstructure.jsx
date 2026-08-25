import { memo, useMemo } from 'react'
import { Activity, BarChart3, Waves, Gauge } from 'lucide-react'
import { formatVolume } from '../utils/format'
import { StatCard, Label } from '../utils/ui-helpers'

const MOCK_SPREADS = [
  { time: '12:40', bid: 44098, ask: 44102, spread: 4, depth: 12500 },
  { time: '12:41', bid: 44100, ask: 44103, spread: 3, depth: 14200 },
  { time: '12:42', bid: 44101, ask: 44105, spread: 4, depth: 11800 },
  { time: '12:43', bid: 44105, ask: 44108, spread: 3, depth: 16500 },
  { time: '12:44', bid: 44102, ask: 44106, spread: 4, depth: 13200 },
  { time: '12:45', bid: 44100, ask: 44104, spread: 4, depth: 15800 },
  { time: '12:46', bid: 44098, ask: 44101, spread: 3, depth: 18900 },
  { time: '12:47', bid: 44100, ask: 44102, spread: 2, depth: 22300 },
]

const MOCK_ORDER_FLOW = [
  { size: 'Small (<1k)', buyPct: 52, sellPct: 48, count: 342 },
  { size: 'Medium (1-10k)', buyPct: 58, sellPct: 42, count: 128 },
  { size: 'Large (10-50k)', buyPct: 65, sellPct: 35, count: 34 },
  { size: 'Whale (>50k)', buyPct: 72, sellPct: 28, count: 8 },
]

const MOCK_DEPTH = [
  { level: 'L1', bidVol: 5.2, askVol: 3.8, imbalance: 0.15 },
  { level: 'L2', bidVol: 8.1, askVol: 6.2, imbalance: 0.13 },
  { level: 'L3', bidVol: 12.5, askVol: 9.8, imbalance: 0.12 },
  { level: 'L4', bidVol: 18.3, askVol: 14.2, imbalance: 0.13 },
  { level: 'L5', bidVol: 25.0, askVol: 19.5, imbalance: 0.12 },
  { level: 'L6', bidVol: 32.1, askVol: 26.8, imbalance: 0.09 },
  { level: 'L7', bidVol: 41.5, askVol: 35.2, imbalance: 0.08 },
  { level: 'L8', bidVol: 52.3, askVol: 44.1, imbalance: 0.09 },
  { level: 'L9', bidVol: 65.8, askVol: 56.3, imbalance: 0.08 },
  { level: 'L10', bidVol: 82.1, askVol: 71.5, imbalance: 0.07 },
]

function spreadColor(spread) {
  if (spread <= 2) return 'text-accent-green'
  if (spread <= 4) return 'text-accent-yellow'
  return 'text-accent-red'
}

const Microstructure = memo(function Microstructure({ symbol }) {
  const stats = useMemo(() => {
    const avgSpread = MOCK_SPREADS.reduce((s, p) => s + p.spread, 0) / MOCK_SPREADS.length
    const avgDepth = MOCK_SPREADS.reduce((s, p) => s + p.depth, 0) / MOCK_SPREADS.length
    const totalTrades = MOCK_ORDER_FLOW.reduce((s, f) => s + f.count, 0)
    const buyPressure = MOCK_ORDER_FLOW.reduce((s, f) => s + f.buyPct * f.count, 0) / totalTrades
    const l10Imbalance = MOCK_DEPTH[MOCK_DEPTH.length - 1].imbalance
    return { avgSpread, avgDepth, totalTrades, buyPressure, l10Imbalance }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Waves size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Microstructure</span>
        </div>
        <span className="text-[10px] text-gray-600">{symbol ?? 'BTC/USDT'}</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Avg Spread" value={`${stats.avgSpread.toFixed(1)}bps`} color={spreadColor(stats.avgSpread)} size="xs" compact />
        <StatCard label="Depth" value={formatVolume(stats.avgDepth)} color="text-accent-blue" size="xs" compact />
        <StatCard label="Buy Press" value={`${stats.buyPressure.toFixed(1)}%`} color={stats.buyPressure > 55 ? 'text-accent-green' : stats.buyPressure < 45 ? 'text-accent-red' : 'text-gray-300'} size="xs" compact />
        <StatCard label="Imbalance" value={`${(stats.l10Imbalance * 100).toFixed(1)}%`} color="text-accent-yellow" size="xs" compact />
      </div>

      {/* Spread trend */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <Activity size={11} className="text-accent-blue" />
          <Label>Spread Trend</Label>
        </div>
        <div className="flex items-end gap-1 h-12">
          {MOCK_SPREADS.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div
                className={`w-full ${s.spread <= 2 ? 'bg-accent-green' : s.spread <= 4 ? 'bg-accent-yellow' : 'bg-accent-red'} opacity-70`}
                style={{ height: `${(s.spread / 5) * 100}%` }}
              />
              <span className="text-[7px] text-gray-600 mt-0.5">{s.time.split(':')[1]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Order flow by size */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <BarChart3 size={11} className="text-accent-green" />
          <Label>Order Flow by Size</Label>
        </div>
        <div className="space-y-0.5">
          {MOCK_ORDER_FLOW.map(flow => (
            <div key={flow.size} className="flex items-center gap-2">
              <span className="text-[9px] text-gray-400 w-24 truncate">{flow.size}</span>
              <div className="flex-1 flex h-3 rounded overflow-hidden">
                <div className="bg-accent-green flex items-center" style={{ width: `${flow.buyPct}%` }}>
                  <span className="text-[7px] text-white pl-0.5">{flow.buyPct}%</span>
                </div>
                <div className="bg-accent-red flex items-center justify-end" style={{ width: `${flow.sellPct}%` }}>
                  <span className="text-[7px] text-white pr-0.5">{flow.sellPct}%</span>
                </div>
              </div>
              <span className="text-[9px] font-mono text-gray-500 w-10 text-right">{flow.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Depth profile */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <Gauge size={11} className="text-accent-purple" />
          <Label>Depth Profile (L1-L10)</Label>
        </div>
        <div className="space-y-0.5">
          {MOCK_DEPTH.map(level => (
            <div key={level.level} className="flex items-center gap-2">
              <span className="text-[8px] text-gray-600 w-6">{level.level}</span>
              <div className="flex-1 flex h-2 rounded overflow-hidden">
                <div className="bg-accent-green" style={{ width: `${(level.bidVol / 82.1) * 100}%` }} />
                <div className="bg-accent-red" style={{ width: `${(level.askVol / 82.1) * 100}%` }} />
              </div>
              <span className="text-[8px] font-mono text-gray-500 w-16 text-right">
                {level.bidVol.toFixed(1)} / {level.askVol.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

export default Microstructure
