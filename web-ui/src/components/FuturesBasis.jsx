import { memo } from 'react'
import { Calendar, DollarSign } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { StatCard, WarningBanner, SectionTitle } from '../utils/ui-helpers'

const MOCK_BASIS = [
  { expiry: '1W', days: 7, spot: 44100, futures: 44250, basis: 150, basisPct: 0.34, funding: 0.012, apr: 17.8 },
  { expiry: '2W', days: 14, spot: 44100, futures: 44480, basis: 380, basisPct: 0.86, funding: 0.011, apr: 22.4 },
  { expiry: '1M', days: 30, spot: 44100, futures: 44950, basis: 850, basisPct: 1.93, funding: 0.010, apr: 23.5 },
  { expiry: '3M', days: 90, spot: 44100, futures: 46800, basis: 2700, basisPct: 6.12, funding: 0.009, apr: 24.9 },
  { expiry: '6M', days: 180, spot: 44100, futures: 49200, basis: 5100, basisPct: 11.57, funding: 0.008, apr: 23.5 },
  { expiry: '1Y', days: 365, spot: 44100, futures: 53500, basis: 9400, basisPct: 21.32, funding: 0.007, apr: 21.3 },
]

const MOCK_HISTORY = [
  { day: 'D-7', basis1M: 1.45, basis3M: 4.80 },
  { day: 'D-6', basis1M: 1.52, basis3M: 5.10 },
  { day: 'D-5', basis1M: 1.68, basis3M: 5.45 },
  { day: 'D-4', basis1M: 1.75, basis3M: 5.62 },
  { day: 'D-3', basis1M: 1.82, basis3M: 5.80 },
  { day: 'D-2', basis1M: 1.88, basis3M: 5.95 },
  { day: 'D-1', basis1M: 1.93, basis3M: 6.12 },
]

function basisColor(pct) {
  if (pct < 1) return 'text-accent-green'
  if (pct < 5) return 'text-accent-yellow'
  if (pct < 15) return 'text-accent-orange'
  return 'text-accent-red'
}

const STATS = {
  bestAPR: Math.max(...MOCK_BASIS.map(b => b.apr)),
  bestBasis: MOCK_BASIS.reduce((max, b) => b.basisPct > max.basisPct ? b : max, MOCK_BASIS[0]),
  contango: MOCK_BASIS.every(b => b.futures > b.spot),
}

const FuturesBasis = memo(function FuturesBasis({ currentPrice }) {
  const spot = currentPrice ?? 44100

  const stats = STATS

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Calendar} title="Futures Basis" iconColor="text-accent-purple" right={<span className="text-[10px] text-gray-600">Spot: ${formatPrice(spot, 0)}</span>} />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1">
        <StatCard label="Best APR" value={`${stats.bestAPR.toFixed(1)}%`} color="text-accent-green" />
        <StatCard label="Max Basis" value={`${stats.bestBasis.basisPct.toFixed(2)}%`} color="text-accent-yellow" />
        <StatCard label="Structure" value={stats.contango ? 'Contango' : 'Backwardation'} color={stats.contango ? 'text-accent-green' : 'text-accent-red'} />
      </div>

      {/* Basis table */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Basis by Expiry</div>
        <div className="space-y-0.5">
          {MOCK_BASIS.map(b => (
            <div key={b.expiry} className="grid grid-cols-6 gap-1 py-0.5 px-1.5 bg-bg-700 items-center">
              <span className="text-[10px] text-gray-300 font-mono">{b.expiry}</span>
              <span className="text-[10px] font-mono text-gray-400">${formatPrice(b.futures, 0)}</span>
              <span className={`text-[10px] font-mono ${basisColor(b.basisPct)}`}>+{b.basis}</span>
              <span className={`text-[10px] font-mono ${basisColor(b.basisPct)}`}>{b.basisPct.toFixed(2)}%</span>
              <span className="text-[10px] font-mono text-gray-500">{b.funding.toFixed(3)}%</span>
              <span className="text-[10px] font-mono text-accent-green">{b.apr.toFixed(1)}%</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-1 mt-0.5 text-[8px] text-gray-600 px-1.5">
          <span>Expiry</span>
          <span>Futures</span>
          <span>Basis</span>
          <span>Basis%</span>
          <span>Fund/8h</span>
          <span>APR</span>
        </div>
      </div>

      {/* Basis history chart */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="text-[10px] text-gray-600 uppercase mb-1">Basis Trend (7 days)</div>
        <div className="flex items-end gap-1 h-16">
          {MOCK_HISTORY.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="flex items-end gap-0.5 h-12">
                <div className="w-1.5 bg-accent-blue" style={{ height: `${(h.basis1M / 2.5) * 100}%` }} />
                <div className="w-1.5 bg-accent-purple" style={{ height: `${(h.basis3M / 7) * 100}%` }} />
              </div>
              <span className="text-[7px] text-gray-600">{h.day}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[8px]">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-accent-blue" />1M Basis
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-accent-purple" />3M Basis
          </span>
        </div>
      </div>

      {/* Opportunity alert */}
      <WarningBanner icon={DollarSign} color="text-accent-green">
        Best opportunity: 3M expiry at {stats.bestBasis.apr.toFixed(1)}% APR
      </WarningBanner>
    </div>
  )
})

export default FuturesBasis
