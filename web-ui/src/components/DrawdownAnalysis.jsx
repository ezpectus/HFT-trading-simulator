import { useMemo } from 'react'
import { TrendingDown, Activity, Clock } from 'lucide-react'
import { formatUsd } from '../utils/format'

export default function DrawdownAnalysis({ fills }) {
  const analysis = useMemo(() => {
    if (!fills?.length) {
      return { maxDD: 0, maxDDPct: 0, maxDDDuration: 0, recoveries: 0, currentDD: 0, underwaterPct: 0, currentEquity: 10000, peakEquity: 10000, peaks: [] }
    }

    // Build equity curve from fills
    let equity = 10000
    const equityPoints = [{ t: 0, eq: equity, peak: equity }]
    let peak = equity

    for (const f of fills.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))) {
      const pnl = f.pnl || 0
      equity += pnl
      if (equity > peak) peak = equity
      equityPoints.push({ t: f.timestamp, eq: equity, peak })
    }

    // Calculate drawdowns
    let maxDD = 0
    let maxDDStart = 0
    let maxDDEnd = 0
    let currentDD = 0
    let underwaterTime = 0
    let recoveries = 0
    let wasUnderwater = false

    for (let i = 0; i < equityPoints.length; i++) {
      const p = equityPoints[i]
      const dd = p.peak > 0 ? ((p.eq - p.peak) / p.peak) * 100 : 0
      const ddAbs = p.peak - p.eq

      if (dd < 0) {
        underwaterTime++
        if (!wasUnderwater) wasUnderwater = true
      } else {
        if (wasUnderwater) {
          recoveries++
          wasUnderwater = false
        }
      }

      if (ddAbs > maxDD) {
        maxDD = ddAbs
        maxDDStart = i
      }
      if (dd < currentDD) currentDD = dd
    }

    // Max drawdown duration (in fill count)
    let maxDuration = 0
    let currentDuration = 0
    for (const p of equityPoints) {
      const dd = p.peak > 0 ? ((p.eq - p.peak) / p.peak) * 100 : 0
      if (dd < 0) {
        currentDuration++
        if (currentDuration > maxDuration) maxDuration = currentDuration
      } else {
        currentDuration = 0
      }
    }

    const underwaterPct = equityPoints.length > 0 ? (underwaterTime / equityPoints.length) * 100 : 0

    // Current state
    const last = equityPoints[equityPoints.length - 1]
    const currentDDPct = last.peak > 0 ? ((last.eq - last.peak) / last.peak) * 100 : 0

    return {
      maxDD,
      maxDDPct: last.peak > 0 ? (maxDD / last.peak) * 100 : 0,
      maxDDDuration: maxDuration,
      recoveries,
      currentDD: Math.abs(currentDDPct),
      underwaterPct,
      currentEquity: last.eq,
      peakEquity: last.peak,
    }
  }, [fills])

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <TrendingDown size={12} className="text-accent-red" />
        Drawdown Analysis
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <Stat
          label="Max Drawdown"
          value={formatUsd(analysis.maxDD)}
          sub={`${analysis.maxDDPct.toFixed(1)}%`}
          color="text-accent-red"
        />
        <Stat
          label="Current DD"
          value={`${analysis.currentDD.toFixed(2)}%`}
          color={analysis.currentDD > 5 ? 'text-accent-red' : 'text-gray-200'}
        />
        <Stat
          label="Max DD Duration"
          value={`${analysis.maxDDDuration} fills`}
          color="text-accent-yellow"
        />
        <Stat
          label="Recoveries"
          value={analysis.recoveries}
          color="text-accent-green"
        />
        <Stat
          label="Underwater %"
          value={`${analysis.underwaterPct.toFixed(1)}%`}
          color={analysis.underwaterPct > 50 ? 'text-accent-red' : 'text-gray-200'}
        />
        <Stat
          label="Peak Equity"
          value={formatUsd(analysis.peakEquity)}
          color="text-accent-green"
        />
      </div>

      {/* Recovery indicator */}
      <div className="bg-bg-600/50 rounded px-2 py-1.5">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-gray-500">Current vs Peak</span>
          <span className={analysis.currentDD < 0.1 ? 'text-accent-green' : 'text-accent-yellow'}>
            {analysis.currentDD < 0.1 ? 'At peak' : `${analysis.currentDD.toFixed(1)}% below`}
          </span>
        </div>
        <div className="h-1.5 bg-bg-600 rounded-full overflow-hidden mt-1">
          <div
            className={'h-full rounded-full transition-all ' + (analysis.currentDD < 0.1 ? 'bg-accent-green' : 'bg-accent-yellow')}
            style={{ width: `${Math.max(0, 100 - analysis.currentDD * 2)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, color = 'text-gray-200' }) {
  return (
    <div className="bg-bg-600/50 rounded px-2 py-1">
      <div className="text-[8px] text-gray-600 uppercase">{label}</div>
      <div className={`text-[11px] font-mono font-medium ${color}`}>
        {value}
        {sub && <span className="text-[9px] text-gray-500 ml-1">{sub}</span>}
      </div>
    </div>
  )
}
