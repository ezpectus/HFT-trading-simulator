import { memo, useMemo } from 'react'
import { Box, Layers, TrendingDown } from 'lucide-react'
import { StatCard, WarningBanner } from '../utils/ui-helpers'
import { selectCandles } from '../utils/candles'

const WINDOWS = [10, 20, 50, 100]

function logReturns(cs) {
  const out = []
  for (let i = 1; i < cs.length; i++) {
    if (cs[i - 1].close > 0 && cs[i].close > 0) out.push(Math.log(cs[i].close / cs[i - 1].close))
  }
  return out
}

function stdev(xs) {
  if (xs.length < 2) return 0
  const m = xs.reduce((s, x) => s + x, 0) / xs.length
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length)
}

/** Annualized realized vol % from candles (interval inferred from timestamps). */
function realizedVol(cs, window, periodsPerYear) {
  const slice = window ? cs.slice(-window - 1) : cs
  return stdev(logReturns(slice)) * Math.sqrt(periodsPerYear) * 100
}

function inferPeriodsPerYear(cs) {
  if (cs.length < 3) return 365 * 24 * 60 // assume 1m
  const diffs = []
  for (let i = 1; i < cs.length; i++) diffs.push(cs[i].timestamp - cs[i - 1].timestamp)
  diffs.sort((a, b) => a - b)
  const interval = diffs[Math.floor(diffs.length / 2)] || 60
  return (365 * 24 * 3600) / interval
}

function volColor(iv) {
  if (iv < 40) return 'bg-accent-green/60'
  if (iv < 80) return 'bg-accent-yellow/60'
  if (iv < 120) return 'bg-accent-orange/60'
  return 'bg-accent-red/60'
}

function volTextColor(iv) {
  if (iv < 40) return 'text-accent-green'
  if (iv < 80) return 'text-accent-yellow'
  if (iv < 120) return 'text-accent-orange'
  return 'text-accent-red'
}

/**
 * Volatility Surface — realized-vol grid (exchange × lookback window) and a
 * vol cone for the selected pair, computed from live candles. Implied-vol
 * surface requires an options feed; this shows realized vol instead.
 */
const VolSurface = memo(function VolSurface({ candles, exchange, symbol }) {
  const data = useMemo(() => {
    const exchanges = [...new Set((candles || []).map(c => c.exchange))]
    const rows = []
    let minIV = Infinity, maxIV = 0
    for (const ex of exchanges) {
      const cs = selectCandles(candles, ex, symbol)
      if (cs.length < 12) continue
      const ppy = inferPeriodsPerYear(cs)
      const cells = WINDOWS.map(w => (cs.length > w ? realizedVol(cs, w, ppy) : null))
      for (const v of cells) {
        if (v == null) continue
        minIV = Math.min(minIV, v)
        maxIV = Math.max(maxIV, v)
      }
      rows.push({ exchange: ex, cells })
    }
    if (!rows.length) return null

    // Vol cone for selected pair: rolling 20-candle vol distribution
    const sel = selectCandles(candles, exchange, symbol)
    const ppy = inferPeriodsPerYear(sel)
    const rolling = []
    for (let i = 20; i <= sel.length; i++) rolling.push(realizedVol(sel.slice(0, i), 20, ppy))
    rolling.sort((a, b) => a - b)
    const cone = rolling.length
      ? { min: rolling[0], p25: rolling[Math.floor(rolling.length * 0.25)], med: rolling[Math.floor(rolling.length * 0.5)], p75: rolling[Math.floor(rolling.length * 0.75)], max: rolling[rolling.length - 1], cur: realizedVol(sel, 20, ppy) }
      : null

    // Realized skew of returns on selected pair
    const rets = logReturns(sel)
    const m = rets.reduce((s, x) => s + x, 0) / rets.length
    const sd = stdev(rets)
    const skew = sd > 0 ? rets.reduce((s, x) => s + ((x - m) / sd) ** 3, 0) / rets.length : 0

    const allCells = rows.flatMap(r => r.cells).filter(v => v != null)
    const avgIV = allCells.reduce((s, v) => s + v, 0) / allCells.length
    return { rows, minIV, maxIV, avgIV, cone, skew, exchanges }
  }, [candles, exchange, symbol])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Box size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Volatility Surface</span>
        </div>
        <span className="text-[10px] text-gray-600">realized · {symbol ?? ''}</span>
      </div>

      {!data ? (
        <div className="text-gray-500 text-[10px] p-2">Need more candles to estimate realized vol</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-1">
            <StatCard label="Min RV" value={`${data.minIV.toFixed(0)}%`} color="text-accent-green" />
            <StatCard label="Avg RV" value={`${data.avgIV.toFixed(0)}%`} color="text-gray-300" />
            <StatCard label="Max RV" value={`${data.maxIV.toFixed(0)}%`} color="text-accent-red" />
          </div>

          {/* Realized vol grid */}
          <div className="p-2 bg-bg-700 border border-bg-600 rounded">
            <div className="flex items-center gap-1 mb-1">
              <Layers size={11} className="text-gray-500" />
              <span className="text-[10px] text-gray-600 uppercase">Realized Vol (exchange × window)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-[8px] text-gray-600 text-left p-1">Exchange</th>
                    {WINDOWS.map(w => (
                      <th key={w} className="text-[8px] text-gray-600 text-center p-1">{w}c</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(row => (
                    <tr key={row.exchange}>
                      <td className="text-[9px] font-mono p-1 text-gray-400">{row.exchange}</td>
                      {row.cells.map((v, i) => (
                        <td key={i} className="p-0.5">
                          {v == null ? (
                            <div className="text-center text-[9px] font-mono text-gray-700 py-1">—</div>
                          ) : (
                            <div className={`text-center text-[9px] font-mono rounded py-1 ${volColor(v)} ${volTextColor(v)}`}>
                              {v.toFixed(0)}%
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[8px] text-gray-600">
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-green/60" />&lt;40%</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-yellow/60" />40–80%</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-red/60" />&gt;120%</span>
            </div>
          </div>

          {/* Vol cone */}
          {data.cone && (
            <div className="p-2 bg-bg-700 border border-bg-600">
              <div className="text-[10px] text-gray-600 uppercase mb-1">Vol Cone (20-candle, {exchange})</div>
              <div className="flex items-end gap-2 h-12">
                {[data.cone.min, data.cone.p25, data.cone.med, data.cone.p75, data.cone.max].map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div className="w-full bg-accent-purple opacity-70" style={{ height: `${(v / Math.max(data.cone.max, 1)) * 100}%` }} />
                    <span className="text-[8px] text-gray-600 mt-0.5">{['min', 'p25', 'med', 'p75', 'max'][i]}</span>
                    <span className="text-[8px] font-mono text-accent-purple">{v.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
              <div className="text-[8px] text-gray-600 mt-1">
                Current 20c vol: <span className="font-mono text-gray-300">{data.cone.cur.toFixed(0)}%</span>
                {' '}({data.cone.cur > data.cone.p75 ? 'high' : data.cone.cur < data.cone.p25 ? 'low' : 'mid'} of cone)
              </div>
            </div>
          )}

          {/* Realized skew */}
          <WarningBanner icon={TrendingDown} color={data.skew < -0.5 ? 'text-accent-red' : 'text-accent-yellow'}>
            Realized skew: {data.skew.toFixed(2)} — {data.skew < -0.5 ? 'left tail dominates (crash risk)' : data.skew > 0.5 ? 'right tail dominates' : 'roughly symmetric'}
          </WarningBanner>
        </>
      )}
    </div>
  )
})

export default memo(VolSurface)
