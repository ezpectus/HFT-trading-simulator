import { memo, useEffect, useMemo, useRef } from 'react'
import { Calendar, DollarSign } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { StatCard, WarningBanner, SectionTitle } from '../utils/ui-helpers'

function basisColor(pct) {
  if (Math.abs(pct) < 0.05) return 'text-accent-green'
  if (Math.abs(pct) < 0.2) return 'text-accent-yellow'
  if (Math.abs(pct) < 0.5) return 'text-accent-orange'
  return 'text-accent-red'
}

/**
 * Futures Basis — perp funding rates (per exchange) and cross-exchange
 * spot basis from live prices. Term-structure expiries require a futures
 * feed and are not shown.
 */
const FuturesBasis = memo(function FuturesBasis({ currentPrice, fundingRates, prices, symbol }) {
  const funding = useMemo(() =>
    Object.entries(fundingRates || {}).map(([ex, rate]) => ({
      ex,
      rate,
      apr: rate * 3 * 365 * 100, // 3 funding periods/day
    })),
  [fundingRates])

  const basis = useMemo(() => {
    if (!symbol) return null
    const rows = []
    for (const [key, px] of Object.entries(prices || {})) {
      const [ex, sym] = key.split('|')
      if (sym === symbol) rows.push({ ex, px })
    }
    if (rows.length < 2) return null
    const ref = Math.min(...rows.map(r => r.px))
    for (const r of rows) {
      r.basis = r.px - ref
      r.basisPct = ref > 0 ? (r.basis / ref) * 100 : 0
    }
    rows.sort((a, b) => a.px - b.px)
    return { rows, spreadPct: rows[rows.length - 1].basisPct, cheapest: rows[0], richest: rows[rows.length - 1] }
  }, [prices, symbol])

  // Accumulate observed cross-exchange spread (5s throttle, cap 60)
  const historyRef = useRef([])
  useEffect(() => {
    if (!basis) return
    const last = historyRef.current[historyRef.current.length - 1]
    if (last && Date.now() - last.t < 5000) return
    historyRef.current.push({ t: Date.now(), v: basis.spreadPct })
    if (historyRef.current.length > 60) historyRef.current.shift()
  }, [basis])
  const history = historyRef.current
  const histMax = Math.max(...history.map(h => h.v), 0.01)

  const bestFunding = funding.length ? funding.reduce((a, b) => (Math.abs(b.apr) > Math.abs(a.apr) ? b : a)) : null

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Calendar} title="Futures Basis" iconColor="text-accent-purple" right={<span className="text-[10px] text-gray-600">Spot: ${formatPrice(currentPrice ?? 0, 0)}</span>} />

      {funding.length === 0 && !basis ? (
        <div className="text-gray-500 text-[10px] p-2">No funding or cross-exchange price data yet</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-1">
            <StatCard label="Venues" value={basis ? basis.rows.length : 0} color="text-gray-300" />
            <StatCard label="X-Exch Spread" value={basis ? `${basis.spreadPct.toFixed(3)}%` : '—'} color="text-accent-yellow" />
            <StatCard label="Max Funding APR" value={bestFunding ? `${bestFunding.apr.toFixed(1)}%` : '—'} color="text-accent-green" />
          </div>

          {/* Funding rates */}
          {funding.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-600 uppercase mb-1">Perp Funding by Exchange</div>
              <div className="space-y-0.5">
                {funding.map(f => (
                  <div key={f.ex} className="grid grid-cols-3 gap-1 py-0.5 px-1.5 bg-bg-700 items-center">
                    <span className="text-[10px] text-gray-300 font-mono">{f.ex}</span>
                    <span className={`text-[10px] font-mono ${f.rate >= 0 ? 'text-accent-red' : 'text-accent-green'}`}>
                      {(f.rate * 100).toFixed(4)}%/8h
                    </span>
                    <span className="text-[10px] font-mono text-accent-green text-right">{f.apr.toFixed(1)}% APR</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cross-exchange basis */}
          {basis && (
            <div>
              <div className="text-[10px] text-gray-600 uppercase mb-1">Cross-Exchange Basis ({symbol})</div>
              <div className="space-y-0.5">
                {basis.rows.map(r => (
                  <div key={r.ex} className="grid grid-cols-3 gap-1 py-0.5 px-1.5 bg-bg-700 items-center">
                    <span className="text-[10px] text-gray-300 font-mono">{r.ex}</span>
                    <span className="text-[10px] font-mono text-gray-400">${formatPrice(r.px, 0)}</span>
                    <span className={`text-[10px] font-mono text-right ${basisColor(r.basisPct)}`}>
                      {r.basisPct >= 0 ? '+' : ''}{r.basisPct.toFixed(3)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spread history */}
          {history.length > 1 && (
            <div className="p-2 bg-bg-700 border border-bg-600">
              <div className="text-[10px] text-gray-600 uppercase mb-1">Observed Spread (session)</div>
              <div className="flex items-end gap-px h-12">
                {history.map((h, i) => (
                  <div key={i} className="flex-1 bg-accent-blue opacity-70" style={{ height: `${Math.max(3, (h.v / histMax) * 100)}%` }} />
                ))}
              </div>
              <div className="flex justify-between mt-0.5 text-[8px] text-gray-600">
                <span>{history.length} samples</span>
                <span>max {histMax.toFixed(3)}%</span>
              </div>
            </div>
          )}

          {basis && basis.spreadPct > 0.1 && (
            <WarningBanner icon={DollarSign} color="text-accent-green">
              Basis spread {basis.spreadPct.toFixed(3)}%: buy {basis.cheapest.ex}, sell {basis.richest.ex}
            </WarningBanner>
          )}
        </>
      )}
    </div>
  )
})

export default memo(FuturesBasis)
