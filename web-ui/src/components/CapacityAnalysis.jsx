import { memo, useMemo } from 'react'
import { Gauge, TrendingUp, AlertTriangle, Maximize2 } from 'lucide-react'
import { formatVolume } from '../utils/format'
import { statusColor, statusBg } from '../utils/ui-helpers'

const MOCK_STRATEGIES = [
  { name: 'TrendFollowing', currentAUM: 500000, maxCapacity: 5000000, utilization: 10, alphaDecay: 0.5, status: 'scalable' },
  { name: 'MeanReversion', currentAUM: 800000, maxCapacity: 2000000, utilization: 40, alphaDecay: 2.1, status: 'moderate' },
  { name: 'StatArb', currentAUM: 1200000, maxCapacity: 1500000, utilization: 80, alphaDecay: 5.8, status: 'constrained' },
  { name: 'MarketMaking', currentAUM: 300000, maxCapacity: 800000, utilization: 37.5, alphaDecay: 1.2, status: 'scalable' },
  { name: 'Sentiment', currentAUM: 200000, maxCapacity: 1000000, utilization: 20, alphaDecay: 0.8, status: 'scalable' },
  { name: 'FundingArb', currentAUM: 600000, maxCapacity: 900000, utilization: 67, alphaDecay: 3.5, status: 'moderate' },
]

const MOCK_CAPACITY_CURVE = [
  { aum: 100, alpha: 12.5 }, { aum: 250, alpha: 11.8 }, { aum: 500, alpha: 10.5 },
  { aum: 750, alpha: 9.2 }, { aum: 1000, alpha: 7.8 }, { aum: 1500, alpha: 5.5 },
  { aum: 2000, alpha: 3.2 }, { aum: 3000, alpha: 1.5 }, { aum: 5000, alpha: 0.5 },
]

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

const CapacityAnalysis = memo(function CapacityAnalysis() {
  const stats = useMemo(() => {
    const totalAUM = MOCK_STRATEGIES.reduce((s, st) => s + st.currentAUM, 0)
    const totalMax = MOCK_STRATEGIES.reduce((s, st) => s + st.maxCapacity, 0)
    const scalable = MOCK_STRATEGIES.filter(s => s.status === 'scalable').length
    const constrained = MOCK_STRATEGIES.filter(s => s.status === 'constrained').length
    return { totalAUM, totalMax, scalable, constrained, overallUtil: (totalAUM / totalMax) * 100 }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Gauge size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Capacity Analysis</span>
        </div>
        <span className="text-[10px] text-gray-600">{stats.overallUtil.toFixed(0)}% utilized</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Total AUM</div>
          <span className="text-[11px] font-mono text-gray-300">${formatVolume(stats.totalAUM)}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Max Cap</div>
          <span className="text-[11px] font-mono text-gray-300">${formatVolume(stats.totalMax)}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Scalable</div>
          <span className="text-[11px] font-mono text-accent-green">{stats.scalable}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Constrained</div>
          <span className="text-[11px] font-mono text-accent-red">{stats.constrained}</span>
        </div>
      </div>

      {/* Strategy capacity table */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Strategy Capacity</div>
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
                <div className="flex-1 h-2 bg-bg-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${s.utilization < 50 ? 'bg-accent-green' : s.utilization < 75 ? 'bg-accent-yellow' : 'bg-accent-red'}`}
                    style={{ width: `${s.utilization}%` }}
                  />
                </div>
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
          <span className="text-[10px] text-gray-600 uppercase">Alpha Decay Curve (StatArb)</span>
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
        <div className="flex items-center gap-1.5 p-1.5 bg-accent-red/10 border border-accent-red/30">
          <AlertTriangle size={11} className="text-accent-red" />
          <span className="text-[10px] text-accent-red">
            {stats.constrained} strategy at capacity — reduce allocation or diversify
          </span>
        </div>
      )}

      <div className="flex items-center gap-1 text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <Maximize2 size={9} />
        <span>Capacity based on 30-day avg volume and market impact model</span>
      </div>
    </div>
  )
})

export default CapacityAnalysis
