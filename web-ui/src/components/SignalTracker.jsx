import { memo, useMemo } from 'react'
import { Target, TrendingUp, TrendingDown, Crosshair } from 'lucide-react'
import { pnlColor, sideColor, StatCard } from '../utils/ui-helpers'

/**
 * Signal Tracker — live signal performance from the AI signal bot WS feed.
 * Mark-to-market: current move vs entry_price using latest price per symbol.
 */
const SignalTracker = memo(function SignalTracker({ signals, prices }) {
  const data = useMemo(() => {
    const list = signals || []

    // Latest price per symbol across exchanges (max over exchanges)
    const lastPrice = {}
    for (const ex of Object.keys(prices || {})) {
      for (const [sym, p] of Object.entries(prices[ex] || {})) {
        if (!lastPrice[sym] || p > 0) lastPrice[sym] = p
      }
    }

    // Mark-to-market move % since signal entry
    const enriched = list.map(sig => {
      const cur = lastPrice[sig.symbol]
      let movePct = null
      if (cur && sig.entry_price) {
        const raw = ((cur - sig.entry_price) / sig.entry_price) * 100
        movePct = sig.direction === 'SHORT' ? -raw : raw
      }
      return { ...sig, movePct }
    })

    const withMove = enriched.filter(s => s.movePct != null)
    const winners = withMove.filter(s => s.movePct > 0).length
    const losers = withMove.filter(s => s.movePct < 0).length
    const avgConf = list.length ? list.reduce((s, x) => s + (x.confidence || 0), 0) / list.length : 0
    const avgMove = withMove.length ? withMove.reduce((s, x) => s + x.movePct, 0) / withMove.length : 0
    const winRate = withMove.length ? (winners / withMove.length) * 100 : 0

    const groups = {}
    for (const s of enriched) {
      const key = s.strategy || 'unknown'
      if (!groups[key]) groups[key] = { count: 0, move: 0, wins: 0, n: 0 }
      groups[key].count++
      if (s.movePct != null) { groups[key].move += s.movePct; groups[key].n++; if (s.movePct > 0) groups[key].wins++ }
    }
    const byStrategy = Object.entries(groups).map(([name, d]) => ({
      name, count: d.count, pnl: d.n ? d.move / d.n : 0, winRate: d.n ? (d.wins / d.n) * 100 : 0,
    }))

    return { list: enriched, total: list.length, winners, losers, winRate, avgMove, avgConf, byStrategy }
  }, [signals, prices])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Target size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Signal Tracker</span>
        </div>
        <span className="text-[10px] text-gray-600">{data.total} live signals</span>
      </div>

      {data.total === 0 ? (
        <div className="text-gray-500 text-[10px] p-2">Waiting for signals — connect the AI signal bot (ws://…:8766)</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="Win Rate" value={`${data.winRate.toFixed(0)}%`} color={data.winRate >= 60 ? 'text-accent-green' : 'text-accent-yellow'} />
            <StatCard label="Avg Move" value={`${data.avgMove >= 0 ? '+' : ''}${data.avgMove.toFixed(2)}%`} color={pnlColor(data.avgMove)} />
            <StatCard label="Avg Conf" value={`${data.avgConf.toFixed(0)}%`} color="text-gray-300" />
            <StatCard label="Signals" value={data.total} color="text-gray-300" />
          </div>

          {/* By strategy */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <Crosshair size={11} className="text-gray-500" />
              <span className="text-[10px] text-gray-600 uppercase">By Strategy</span>
            </div>
            <div className="space-y-0.5">
              {data.byStrategy.map(s => (
                <div key={s.name} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
                  <span className="text-[10px] text-gray-300 w-24 truncate">{s.name}</span>
                  <span className="text-[9px] font-mono text-gray-500 w-8">{s.count}</span>
                  <span className={`text-[9px] font-mono w-12 ${pnlColor(s.pnl)}`}>
                    {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(2)}%
                  </span>
                  <span className={`text-[9px] font-mono w-12 ${s.winRate >= 60 ? 'text-accent-green' : 'text-accent-yellow'}`}>
                    {s.winRate.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Signal list */}
          <div>
            <div className="text-[10px] text-gray-600 uppercase mb-1">Signal History</div>
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {data.list.map((sig, i) => (
                <div key={sig.id || i} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
                  <span className="text-[8px] text-gray-600 font-mono w-8">{sig.timestamp ? new Date(sig.timestamp * 1000).toTimeString().slice(0, 5) : '—'}</span>
                  <span className="text-[9px] text-gray-400 w-20 truncate">{sig.strategy || '—'}</span>
                  <span className="text-[9px] text-gray-300 w-10 truncate">{(sig.symbol || '').replace('/USDT', '')}</span>
                  <span className={`text-[9px] font-mono w-8 ${sideColor(sig.direction)}`}>{sig.direction === 'LONG' ? 'L' : 'S'}</span>
                  <span className="text-[9px] font-mono text-gray-500 w-10">{(sig.confidence || 0).toFixed(0)}%</span>
                  <span className={`text-[9px] font-mono w-12 text-right ${sig.movePct != null ? pnlColor(sig.movePct) : 'text-gray-600'}`}>
                    {sig.movePct != null ? `${sig.movePct >= 0 ? '+' : ''}${sig.movePct.toFixed(2)}%` : '—'}
                  </span>
                  <span className="text-[8px] uppercase px-1 rounded bg-accent-blue/20 text-accent-blue w-10 text-center">
                    live
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
            <span className="flex items-center gap-1">
              <TrendingUp size={9} className="text-accent-green" />
              {data.winners} up
            </span>
            <span className="flex items-center gap-1">
              <TrendingDown size={9} className="text-accent-red" />
              {data.losers} down
            </span>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(SignalTracker)
