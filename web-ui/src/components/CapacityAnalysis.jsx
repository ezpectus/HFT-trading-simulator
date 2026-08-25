import { memo } from 'react'
import { Gauge, TrendingUp, AlertTriangle, Maximize2 } from 'lucide-react'
import { formatVolume } from '../utils/format'
import { statusColor, statusBg, StatCard, Bar, Label, SectionTitle, WarningBanner } from '../utils/ui-helpers'
import { MOCK_STRATEGIES, MOCK_CAPACITY_CURVE } from '../utils/mock-data'

const STATUS_MAP = {
  scalable: 'text-accent-green',
  moderate: 'text-accent-yellow',
  default: 'text-accent-red',
}

const STATUS_BG_MAP = {
  scalable: 'bg-accent-green/20',
  moderate: 'bg-accent-yellow/20',
  default: 'bg-accent-red/20',
}

function utilColor(util) {
  if (util < 50) return 'text-accent-green'
  if (util < 75) return 'text-accent-yellow'
  return 'text-accent-red'
}

const STATS = {
  totalAUM: MOCK_STRATEGIES.reduce((s, st) => s + st.currentAUM, 0),
  totalMax: MOCK_STRATEGIES.reduce((s, st) => s + st.maxCapacity, 0),
  scalable: MOCK_STRATEGIES.filter(s => s.status === 'scalable').length,
  constrained: MOCK_STRATEGIES.filter(s => s.status === 'constrained').length,
}
STATS.overallUtil = (STATS.totalAUM / STATS.totalMax) * 100

const CapacityAnalysis = memo(function CapacityAnalysis() {
  const stats = STATS

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Gauge} title="Capacity Analysis" right={<span className="text-[10px] text-gray-600">{stats.overallUtil.toFixed(0)}% utilized</span>} />

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Total AUM" value={`$${formatVolume(stats.totalAUM)}`} color="text-gray-300" size="xs" />
        <StatCard label="Max Cap" value={`$${formatVolume(stats.totalMax)}`} color="text-gray-300" size="xs" />
        <StatCard label="Scalable" value={stats.scalable} color="text-accent-green" size="xs" />
        <StatCard label="Constrained" value={stats.constrained} color="text-accent-red" size="xs" />
      </div>

      {/* Strategy capacity table */}
      <div>
        <Label className="mb-1">Strategy Capacity</Label>
        <div className="space-y-0.5">
          {MOCK_STRATEGIES.map(s => (
            <div key={s.name} className="py-1 px-1.5 bg-bg-700">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] text-gray-300 w-28 truncate">{s.name}</span>
                <span className={`text-[8px] px-1 rounded ${statusBg(s.status, STATUS_BG_MAP)} ${statusColor(s.status, STATUS_MAP)} w-16 text-center`}>
                  {s.status.toUpperCase()}
                </span>
                <span className={`text-[9px] font-mono w-10 text-right ${utilColor(s.utilization)}`}>
                  {s.utilization}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Bar value={s.utilization} max={100} color={s.utilization < 50 ? 'bg-accent-green' : s.utilization < 75 ? 'bg-accent-yellow' : 'bg-accent-red'} />
                <span className="text-[9px] text-gray-500 font-mono">
                  ${formatVolume(s.currentAUM)} / ${formatVolume(s.maxCapacity)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[8px] text-gray-600">Alpha decay:</span>
                <span className={`text-[8px] font-mono ${s.alphaDecay > 4 ? 'text-accent-red' : s.alphaDecay > 2 ? 'text-accent-yellow' : 'text-accent-green'}`}>
                  {s.alphaDecay.toFixed(1)}% per 2x AUM
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alpha decay curve */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <TrendingUp size={11} className="text-gray-500" />
          <Label>Alpha Decay Curve (StatArb)</Label>
        </div>
        <div className="flex items-end gap-1 h-16">
          {MOCK_CAPACITY_CURVE.map((pt, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div
                className={`w-full ${pt.alpha > 8 ? 'bg-accent-green' : pt.alpha > 4 ? 'bg-accent-yellow' : pt.alpha > 1 ? 'bg-accent-orange' : 'bg-accent-red'} opacity-70`}
                style={{ height: `${(pt.alpha / 13) * 100}%` }}
              />
              <span className="text-[7px] text-gray-600 mt-0.5">{pt.aum}k</span>
            </div>
          ))}
        </div>
      </div>

      {stats.constrained > 0 && (
        <WarningBanner icon={AlertTriangle} color="text-accent-red">
          {stats.constrained} strategy at capacity — reduce allocation or diversify
        </WarningBanner>
      )}

      <div className="flex items-center gap-1 text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <Maximize2 size={9} />
        <span>Capacity based on 30-day avg volume and market impact model</span>
      </div>
    </div>
  )
})

export default CapacityAnalysis
