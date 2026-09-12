import { memo, useMemo } from 'react'
import { CloudLightning, AlertTriangle, TrendingDown, Shield } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { StatCard, WarningBanner, SectionTitle } from '../utils/ui-helpers'
import { selectCandles } from '../utils/candles'

const pct = (xs, p) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

function impactColor(impact) {
  if (impact > -5) return 'text-accent-yellow'
  if (impact > -15) return 'text-accent-orange'
  return 'text-accent-red'
}

/**
 * Black Swan Tester — tail-risk on REAL candle history: observed worst move,
 * sigma-scaled shocks applied to current open exposure, VaR/ES, max drawdown.
 * No fabricated historical scenarios — everything derives from live data.
 */
const BlackSwanTester = memo(function BlackSwanTester({ candles, accounts, prices, symbol, exchange }) {
  const data = useMemo(() => {
    const cs = selectCandles(candles, exchange, symbol)
    if (cs.length < 20) return null

    const closes = cs.map(c => c.close)
    const rets = []
    for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]))
    if (rets.length < 10) return null

    const mean = rets.reduce((s, r) => s + r, 0) / rets.length
    const sigma = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length)
    const var95 = pct(rets, 5) * 100
    const var99 = pct(rets, 1) * 100
    const es95 = rets.filter(r => r <= pct(rets, 5)).reduce((s, r) => s + r, 0) / Math.max(1, rets.filter(r => r <= pct(rets, 5)).length) * 100
    const worst = Math.min(...rets) * 100

    // Max drawdown on close series
    let peak = closes[0], maxDD = 0
    for (const c of closes) {
      if (c > peak) peak = c
      maxDD = Math.min(maxDD, (c - peak) / peak)
    }
    maxDD *= 100

    // Skew / kurtosis
    const skew = sigma > 0 ? rets.reduce((s, r) => s + ((r - mean) / sigma) ** 3, 0) / rets.length : 0
    const kurt = sigma > 0 ? rets.reduce((s, r) => s + ((r - mean) / sigma) ** 4, 0) / rets.length - 3 : 0

    // Current net exposure across accounts (signed $)
    let netExposure = 0, grossExposure = 0, equity = 0
    for (const [ex, acc] of Object.entries(accounts || {})) {
      equity += acc.equity || 0
      for (const pos of acc.positions || []) { // positions is a list of position dicts
        const cur = prices?.[`${ex}|${pos.symbol}`] ?? pos.entry_price
        const signed = (pos.quantity ?? 0) * cur * (pos.side === 'SELL' ? -1 : 1)
        netExposure += signed
        grossExposure += Math.abs(signed)
      }
    }
    const base = grossExposure > 0 ? grossExposure : null

    // Scenarios: observed worst + sigma-scaled shocks (per-candle sigma)
    const sigmaPct = sigma * 100
    const mk = (name, shockPct) => ({
      name,
      shockPct,
      impact: base != null ? (shockPct / 100) * base : null,
      impactPct: base != null && equity > 0 ? (shockPct / 100) * (base / equity) * 100 : null,
    })
    const scenarios = [
      mk('Worst observed candle', worst),
      mk('-2σ shock', -2 * sigmaPct),
      mk('-3σ shock', -3 * sigmaPct),
      mk('-5σ flash crash', -5 * sigmaPct),
      mk('-10σ black swan', -10 * sigmaPct),
    ]

    return { var95, var99, es95, worst, maxDD, skew, kurt, sigmaPct, scenarios, netExposure, grossExposure, equity, nCandles: cs.length }
  }, [candles, accounts, prices, symbol, exchange])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={CloudLightning} title="Black Swan Tester" iconColor="text-accent-red" right={<span className="text-[10px] text-gray-600">{symbol ?? ''}</span>} />

      {!data ? (
        <div className="text-gray-500 text-[10px] p-2">Need at least 20 candles to estimate tail risk</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="VaR 95" value={`${data.var95.toFixed(2)}%`} color="text-accent-red" compact />
            <StatCard label="ES 95" value={`${data.es95.toFixed(2)}%`} color="text-accent-orange" compact />
            <StatCard label="Max DD" value={`${data.maxDD.toFixed(1)}%`} color="text-accent-red" compact />
            <StatCard label="σ/candle" value={`${data.sigmaPct.toFixed(2)}%`} color="text-gray-300" compact />
          </div>

          {/* Scenario results */}
          <div>
            <div className="text-[10px] text-gray-600 uppercase mb-1">Shock Scenarios ({data.nCandles} candles)</div>
            <div className="space-y-0.5">
              {data.scenarios.map(s => (
                <div key={s.name} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
                  <span className="text-[10px] text-gray-300 flex-1 truncate">{s.name}</span>
                  <span className="text-[9px] font-mono text-accent-red w-14 text-right">{s.shockPct.toFixed(2)}%</span>
                  {s.impact != null && (
                    <span className={`text-[9px] font-mono w-16 text-right ${impactColor(s.impactPct ?? s.shockPct)}`}>
                      {s.impact >= 0 ? '+' : '-'}${formatPrice(Math.abs(s.impact), 0)}
                    </span>
                  )}
                  {s.impactPct != null && (
                    <span className={`text-[9px] font-mono w-12 text-right ${impactColor(s.impactPct)}`}>
                      {s.impactPct.toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
              <span>Scenario / Shock / {data.grossExposure > 0 ? 'P&L $ / % of equity' : 'P&L (no open exposure)'}</span>
            </div>
          </div>

          {/* Tail shape */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <Shield size={11} className="text-gray-500" />
              <span className="text-[10px] text-gray-600 uppercase">Return Distribution</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <StatCard label="Skewness" value={data.skew.toFixed(2)} color={data.skew < -0.5 ? 'text-accent-red' : 'text-gray-300'} compact />
              <StatCard label="Ex. Kurtosis" value={data.kurt.toFixed(2)} color={data.kurt > 3 ? 'text-accent-orange' : 'text-gray-300'} compact />
              <StatCard label="VaR 99" value={`${data.var99.toFixed(2)}%`} color="text-accent-red" compact />
            </div>
          </div>

          <WarningBanner icon={AlertTriangle} color="text-accent-red">
            Worst observed move: {data.worst.toFixed(2)}% in one candle
            {data.grossExposure > 0 ? ` — $${formatPrice(data.grossExposure * Math.abs(data.worst) / 100, 0)} on current exposure` : ''}
          </WarningBanner>

          <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
            <span className="flex items-center gap-1">
              <TrendingDown size={9} className="text-accent-red" />
              {data.grossExposure > 0 ? `Gross exposure $${formatPrice(data.grossExposure, 0)}` : 'No open positions'}
            </span>
            <span>{data.kurt > 3 ? 'Fat tails detected' : 'Near-normal tails'}</span>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(BlackSwanTester)
