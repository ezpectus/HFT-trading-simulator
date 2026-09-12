import { memo, useMemo } from 'react'
import { Grid3x3, TrendingUp, TrendingDown } from 'lucide-react'
import { StatCard } from '../utils/ui-helpers'

function corrColor(corr) {
  if (corr >= 0.5) return 'text-accent-red bg-accent-red/20'
  if (corr >= 0.3) return 'text-accent-orange bg-accent-orange/15'
  if (corr >= 0.1) return 'text-accent-yellow bg-accent-yellow/10'
  if (corr >= -0.1) return 'text-gray-400 bg-bg-600'
  if (corr >= -0.3) return 'text-accent-blue bg-accent-blue/10'
  return 'text-accent-green bg-accent-green/15'
}

/**
 * Strategy Correlation — real directional agreement between strategies
 * from the live signal stream. For each pair, agreement = fraction of
 * symbols both signaled where directions match (signed), weighted by
 * co-occurrence. Requires ≥2 strategies in the signal stream.
 */
const StrategyCorrelation = memo(function StrategyCorrelation({ signals }) {
  const data = useMemo(() => {
    const list = signals || []
    // Latest signal per (strategy, symbol)
    const latest = new Map()
    for (const s of list) {
      if (!s.strategy || !s.symbol) continue
      const key = `${s.strategy}|${s.symbol}`
      if (!latest.has(key) || (s.timestamp || 0) > latest.get(key).timestamp) latest.set(key, s)
    }
    const byStrat = {}
    for (const s of latest.values()) {
      if (!byStrat[s.strategy]) byStrat[s.strategy] = {}
      byStrat[s.strategy][s.symbol] = s
    }
    const strats = Object.keys(byStrat).sort()
    if (strats.length < 2) return null

    // Pairwise directional agreement on co-signaled symbols
    const corr = strats.map((a, i) =>
      strats.map((b, j) => {
        if (i === j) return 1
        const A = byStrat[a], B = byStrat[b]
        let agree = 0, disagree = 0
        for (const sym of Object.keys(A)) {
          if (!B[sym]) continue
          if (A[sym].direction === B[sym].direction) agree++
          else disagree++
        }
        const n = agree + disagree
        return n > 0 ? (agree - disagree) / n : 0
      })
    )

    const stratStats = strats.map(name => {
      const sigs = Object.values(byStrat[name])
      const longs = sigs.filter(s => s.direction === 'LONG').length
      const avgConf = sigs.reduce((a, s) => a + (s.confidence || 0), 0) / sigs.length
      const avgRR = sigs.reduce((a, s) => a + (s.rr_ratio || 0), 0) / sigs.length
      return { strategy: name, count: sigs.length, longPct: (longs / sigs.length) * 100, avgConf, avgRR }
    })

    let highCorr = 0, diversifying = 0
    for (let i = 0; i < corr.length; i++)
      for (let j = i + 1; j < corr.length; j++) {
        if (corr[i][j] >= 0.5) highCorr++
        if (corr[i][j] < 0) diversifying++
      }

    return { strats, corr, stratStats, highCorr, diversifying, total: list.length }
  }, [signals])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Grid3x3 size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Strategy Correlation</span>
        </div>
        <span className="text-[10px] text-gray-600">{data ? `${data.strats.length} strategies` : 'waiting'}</span>
      </div>

      {!data ? (
        <div className="text-gray-500 text-[10px] p-2">Need ≥2 strategies in the signal stream — connect the AI signal bot</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="High Agree" value={data.highCorr} color="text-accent-red" compact />
            <StatCard label="Opposing" value={data.diversifying} color="text-accent-green" compact />
            <StatCard label="Signals" value={data.total} color="text-gray-300" compact />
            <StatCard label="Avg Conf" value={`${(data.stratStats.reduce((s, x) => s + x.avgConf, 0) / data.stratStats.length).toFixed(0)}%`} color="text-gray-300" compact />
          </div>

          {/* Agreement matrix */}
          <div className="p-2 bg-bg-700 border border-bg-600 rounded">
            <div className="text-[10px] text-gray-600 uppercase mb-1">Directional Agreement</div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-[8px] text-gray-600 p-1"></th>
                    {data.strats.map(s => (
                      <th key={s} className="text-[8px] text-gray-600 text-center p-1">{s.slice(0, 4)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.corr.map((row, i) => (
                    <tr key={i}>
                      <td className="text-[8px] text-gray-500 p-1 font-mono">{data.strats[i].slice(0, 4)}</td>
                      {row.map((corr, j) => (
                        <td key={j} className="p-0.5">
                          <div className={`text-center text-[9px] font-mono rounded py-1 ${corrColor(corr)}`}>
                            {corr.toFixed(2)}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[8px] text-gray-600">
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-red/20" />Agree</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-yellow/10" />Mixed</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-green/15" />Oppose</span>
            </div>
          </div>

          {/* Strategy stats */}
          <div>
            <div className="text-[10px] text-gray-600 uppercase mb-1">Strategy Snapshot (latest signals)</div>
            <div className="space-y-0.5">
              {data.stratStats.map(r => (
                <div key={r.strategy} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
                  <span className="text-[10px] text-gray-300 w-20 truncate">{r.strategy}</span>
                  <span className="text-[9px] font-mono text-gray-400 w-12">{r.count} sig</span>
                  <span className="text-[9px] font-mono text-accent-blue w-12">{r.avgConf.toFixed(0)}% cf</span>
                  <span className="text-[9px] font-mono text-gray-400 w-12">RR {r.avgRR.toFixed(1)}</span>
                  <span className={`text-[9px] font-mono w-12 ${r.longPct >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {r.longPct.toFixed(0)}%L
                  </span>
                  {r.longPct >= 50 ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
              <span>Strategy / Signals / AvgConf / AvgRR / LongBias</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(StrategyCorrelation)
