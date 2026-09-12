import { memo, useMemo } from 'react'
import { GitCompare, TrendingUp, TrendingDown, Zap, AlertTriangle } from 'lucide-react'
import { statusColor, statusBg, StatCard } from '../utils/ui-helpers'
import { selectCandles } from '../utils/candles'

const STATUS_MAP = { signal: 'text-accent-yellow', watch: 'text-gray-400', default: 'text-gray-500' }
const STATUS_BG_MAP = { signal: 'bg-accent-yellow/20', watch: 'bg-bg-600', default: 'bg-bg-600' }

function zScoreColor(z) {
  if (Math.abs(z) >= 2.5) return 'text-accent-red'
  if (Math.abs(z) >= 2) return 'text-accent-yellow'
  return 'text-gray-400'
}

function closesFor(candles, exchange, symbol) {
  return selectCandles(candles, exchange, symbol).map(c => c.close)
}

/** Pearson on aligned return windows. */
function returns(xs) {
  const r = []
  for (let i = 1; i < xs.length; i++) r.push(Math.log(xs[i] / xs[i - 1]))
  return r
}
function pearson(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 10) return null
  const x = a.slice(-n), y = b.slice(-n)
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n
  let cov = 0, vx = 0, vy = 0
  for (let i = 0; i < n; i++) { cov += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2 }
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0
}

/**
 * Pairs Arbitrage — builds every symbol pair from the candle stream on the
 * selected exchange and computes REAL correlation, current spread
 * (log ratio) and its z-score over the window. |z|>2 = signal.
 * No simulated positions — this is a monitor, not a strategy runner.
 */
const PairsArb = memo(function PairsArb({ candles, symbols, exchange }) {
  const pairs = useMemo(() => {
    if (!candles?.length || !symbols?.length) return null
    const closes = symbols
      .map(s => ({ s, cls: closesFor(candles, exchange, s) }))
      .filter(x => x.cls.length >= 30)
    const out = []
    for (let i = 0; i < closes.length; i++) {
      for (let j = i + 1; j < closes.length; j++) {
        const A = closes[i], B = closes[j]
        const corr = pearson(returns(A.cls), returns(B.cls))
        const n = Math.min(A.cls.length, B.cls.length)
        const spreadSeries = []
        for (let k = 0; k < n; k++) spreadSeries.push(Math.log(A.cls[A.cls.length - n + k] / B.cls[B.cls.length - n + k]))
        const mean = spreadSeries.reduce((a, v) => a + v, 0) / n
        const sd = Math.sqrt(spreadSeries.reduce((a, v) => a + (v - mean) ** 2, 0) / n) || 1e-9
        const z = (spreadSeries[n - 1] - mean) / sd
        out.push({
          id: `${A.s}/${B.s}`,
          pairA: A.s, pairB: B.s,
          corr: corr ?? 0,
          spread: spreadSeries[n - 1],
          zScore: z,
          status: Math.abs(z) >= 2 ? 'signal' : 'watch',
        })
      }
    }
    return out.length ? out.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore)) : null
  }, [candles, symbols, exchange])

  const stats = useMemo(() => {
    if (!pairs) return null
    const sigs = pairs.filter(p => p.status === 'signal').length
    const avgCorr = pairs.reduce((s, p) => s + p.corr, 0) / pairs.length
    const best = pairs.reduce((m, p) => Math.abs(p.zScore) > Math.abs(m.zScore) ? p : m, pairs[0])
    return { total: pairs.length, sigs, avgCorr, best }
  }, [pairs])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GitCompare size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Pairs Arbitrage</span>
        </div>
        {stats && <span className="text-[10px] text-gray-600">{stats.sigs} signals</span>}
      </div>

      {!stats ? (
        <div className="text-gray-500 text-[10px] p-2">Need ≥2 symbols with 30+ candles on {exchange ?? 'exchange'} — collecting stream data</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1">
            <StatCard label="Pairs" value={stats.total} color="text-gray-300" />
            <StatCard label="Signals" value={stats.sigs} color="text-accent-yellow" />
            <StatCard label="Avg Corr" value={stats.avgCorr.toFixed(2)} color="text-gray-300" />
          </div>

          <div>
            <div className="text-[10px] text-gray-600 uppercase mb-1">Pairs (sorted by |z|)</div>
            <div className="space-y-0.5 max-h-56 overflow-y-auto">
              {pairs.map(pair => (
                <div key={pair.id} className="py-1 px-1.5 bg-bg-700">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-300 w-24 truncate">{pair.pairA.replace('/USDT', '')} / {pair.pairB.replace('/USDT', '')}</span>
                    <span className="text-[9px] font-mono text-gray-400 w-10">{pair.corr.toFixed(2)}</span>
                    <span className={`text-[9px] font-mono w-12 ${pair.spread >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {pair.spread >= 0 ? '+' : ''}{pair.spread.toFixed(3)}
                    </span>
                    <span className={`text-[9px] font-mono w-10 ${zScoreColor(pair.zScore)}`}>
                      z={pair.zScore.toFixed(1)}
                    </span>
                    <span className={`text-[8px] px-1 rounded ${statusBg(pair.status, STATUS_BG_MAP)} ${statusColor(pair.status, STATUS_MAP)} w-12 text-center`}>
                      {pair.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
              <span>Pair / Corr / Log-Spread / Z-Score / Status</span>
            </div>
          </div>

          {stats.sigs > 0 && (
            <div className="space-y-0.5">
              {pairs.filter(p => p.status === 'signal').map(pair => (
                <div key={pair.id} className="flex items-center gap-1.5 p-1.5 bg-accent-yellow/10 border border-accent-yellow/30">
                  <Zap size={11} className="text-accent-yellow shrink-0" />
                  <span className="text-[10px] text-accent-yellow">
                    {pair.pairA.replace('/USDT', '')}/{pair.pairB.replace('/USDT', '')} z={pair.zScore.toFixed(1)} — {' '}
                    {pair.zScore > 0 ? 'short spread' : 'long spread'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
            <span className="flex items-center gap-1">
              <AlertTriangle size={9} />
              |z| {'>'} 2.0 = entry signal
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp size={9} className="text-accent-green" />
              <TrendingDown size={9} className="text-accent-red" />
              Mean reversion monitor
            </span>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(PairsArb)
