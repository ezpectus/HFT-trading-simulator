import { useMemo, useState } from 'react'
import { Shield, TrendingDown, Activity, Info } from 'lucide-react'
import { formatUsd } from '../utils/format'

function normCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = x < 0 ? -1 : 1
  x = Math.abs(x) / Math.sqrt(2)
  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return 0.5 * (1 + sign * y)
}

export default function RiskDashboard({ accounts, candles, symbols, exchange }) {
  const [confidence, setConfidence] = useState(95)

  const risk = useMemo(() => {
    // Gather trade PnLs for VaR calculation
    const pnls = []
    for (const acc of Object.values(accounts || {})) {
      for (const t of (acc.trade_history || [])) {
        if (t.pnl) pnls.push(t.pnl)
      }
    }

    // Portfolio value
    let portfolioValue = 0
    for (const acc of Object.values(accounts || {})) {
      portfolioValue += acc.equity || acc.balance || 0
    }

    if (pnls.length < 10 || portfolioValue <= 0) {
      return { hasData: false, portfolioValue }
    }

    // Historical VaR: find the percentile of PnL distribution
    const sorted = [...pnls].sort((a, b) => a - b)
    const zScore = confidence === 99 ? 2.326 : confidence === 95 ? 1.645 : 1.282
    const idx = Math.floor((1 - confidence / 100) * sorted.length)
    const histVar = Math.abs(sorted[Math.max(0, idx)])

    // Parametric VaR: mean - z * std
    const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length
    const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length
    const std = Math.sqrt(variance)
    const paramVar = Math.abs(mean - zScore * std)

    // CVaR (Expected Shortfall): average of losses beyond VaR
    const tailLosses = sorted.filter(p => p < -histVar)
    const cvar = tailLosses.length > 0
      ? Math.abs(tailLosses.reduce((s, v) => s + v, 0) / tailLosses.length)
      : histVar

    // Beta: correlation with BTC (market proxy)
    let beta = 0
    const btcCandles = candles.filter(c => c.symbol === 'BTC/USDT' && c.exchange === exchange).map(c => c.close)
    if (btcCandles.length > 20) {
      const btcReturns = []
      for (let i = 1; i < btcCandles.length; i++) {
        if (btcCandles[i - 1] > 0) btcReturns.push((btcCandles[i] - btcCandles[i - 1]) / btcCandles[i - 1])
      }
      // Portfolio returns from PnLs
      const portReturns = pnls.slice(-btcReturns.length).map(p => p / portfolioValue)
      const n = Math.min(btcReturns.length, portReturns.length)
      if (n > 5) {
        const mBtc = btcReturns.slice(-n).reduce((s, v) => s + v, 0) / n
        const mPort = portReturns.slice(-n).reduce((s, v) => s + v, 0) / n
        let cov = 0, varBtc = 0
        for (let i = 0; i < n; i++) {
          cov += (btcReturns[btcReturns.length - n + i] - mBtc) * (portReturns[i] - mPort)
          varBtc += (btcReturns[btcReturns.length - n + i] - mBtc) ** 2
        }
        beta = varBtc > 0 ? cov / varBtc : 0
      }
    }

    // Max single trade loss
    const maxLoss = Math.min(...pnls, 0)
    const maxGain = Math.max(...pnls, 0)

    // VaR as % of portfolio
    const varPct = (histVar / portfolioValue) * 100
    const cvarPct = (cvar / portfolioValue) * 100

    return {
      hasData: true,
      portfolioValue,
      histVar,
      paramVar,
      cvar,
      varPct,
      cvarPct,
      beta,
      std,
      mean,
      maxLoss,
      maxGain,
      tradeCount: pnls.length,
    }
  }, [accounts, candles, exchange, confidence])

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Shield size={12} className="text-accent-red" />
        Risk Dashboard
      </div>

      {!risk.hasData ? (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">
          Need 10+ trades for risk metrics
        </div>
      ) : (
        <>
          {/* Confidence selector */}
          <div className="flex gap-1 mb-2">
            {[90, 95, 99].map(c => (
              <button
                key={c}
                onClick={() => setConfidence(c)}
                className={'flex-1 py-1 text-[10px] rounded transition-colors ' +
                  (confidence === c ? 'bg-accent-red/20 text-accent-red' : 'bg-bg-600 text-gray-400')}
              >
                {c}%
              </button>
            ))}
          </div>

          {/* VaR / CVaR */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <RiskStat
              label={`VaR (${confidence}%)`}
              value={formatUsd(risk.histVar)}
              sub={`${risk.varPct.toFixed(2)}% of portfolio`}
              color="text-accent-red"
              icon={TrendingDown}
            />
            <RiskStat
              label="CVaR (ES)"
              value={formatUsd(risk.cvar)}
              sub={`${risk.cvarPct.toFixed(2)}% of portfolio`}
              color="text-accent-red"
              icon={Activity}
            />
          </div>

          {/* Secondary metrics */}
          <div className="grid grid-cols-3 gap-2 text-[9px] mb-2">
            <Cell label="Beta (vs BTC)" value={risk.beta.toFixed(3)} color={risk.beta > 1 ? 'text-accent-red' : risk.beta < 0.5 ? 'text-accent-green' : 'text-gray-300'} />
            <Cell label="Std Dev" value={formatUsd(risk.std)} />
            <Cell label="Mean PnL" value={formatUsd(risk.mean)} color={risk.mean >= 0 ? 'text-accent-green' : 'text-accent-red'} />
            <Cell label="Max Loss" value={formatUsd(risk.maxLoss)} color="text-accent-red" />
            <Cell label="Max Gain" value={formatUsd(risk.maxGain)} color="text-accent-green" />
            <Cell label="Trades" value={risk.tradeCount} />
          </div>

          {/* Beta interpretation */}
          <div className="bg-bg-600/50 rounded px-2 py-1.5 mb-2">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-gray-500">Portfolio Beta</span>
              <span className={'font-mono font-bold ' + (risk.beta > 1.5 ? 'text-accent-red' : risk.beta > 1 ? 'text-accent-yellow' : 'text-accent-green')}>
                {risk.beta.toFixed(2)}
              </span>
            </div>
            <div className="h-1.5 bg-bg-600 rounded-full overflow-hidden mt-1 relative">
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-bg-500" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-bg-500" />
              <div
                className={'absolute h-full rounded-full ' + (risk.beta > 1.5 ? 'bg-accent-red' : risk.beta > 1 ? 'bg-accent-yellow' : 'bg-accent-green')}
                style={{ width: `${Math.min(100, risk.beta * 33)}%` }}
              />
            </div>
            <div className="flex justify-between text-[7px] text-gray-600 mt-0.5">
              <span>Defensive (&lt;0.5)</span>
              <span>Neutral (1.0)</span>
              <span>Aggressive (&gt;1.5)</span>
            </div>
          </div>

          <div className="flex items-start gap-1 text-[8px] text-gray-600">
            <Info size={9} className="shrink-0 mt-0.5" />
            <span>VaR = max expected loss at {confidence}% confidence. CVaR = avg loss beyond VaR. Beta = sensitivity to BTC.</span>
          </div>
        </>
      )}
    </div>
  )
}

function RiskStat({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="bg-bg-600/50 rounded px-2 py-1.5">
      <div className="flex items-center gap-1 text-[8px] text-gray-600 uppercase">
        <Icon size={9} /> {label}
      </div>
      <div className={`text-sm font-mono font-bold ${color}`}>{value}</div>
      <div className="text-[8px] text-gray-600">{sub}</div>
    </div>
  )
}

function Cell({ label, value, color = 'text-gray-300' }) {
  return (
    <div className="bg-bg-600/50 rounded px-2 py-1">
      <div className="text-[8px] text-gray-600 uppercase">{label}</div>
      <div className={`text-[10px] font-mono ${color}`}>{value}</div>
    </div>
  )
}
