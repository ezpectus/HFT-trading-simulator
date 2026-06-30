import { useMemo, useState } from 'react'
import { Calculator, TrendingUp, TrendingDown, Target } from 'lucide-react'

export default function ExpectedValueCalculator({ accounts, fills, signals }) {
  const [customWinRate, setCustomWinRate] = useState('')
  const [customRR, setCustomRR] = useState('')
  const [customRisk, setCustomRisk] = useState(1)

  const data = useMemo(() => {
    // Gather stats from actual fills
    const allFills = (fills || []).filter(f => f.status === 'FILLED')
    const closedTrades = []

    for (const acc of Object.values(accounts || {})) {
      for (const t of (acc.trade_history || [])) {
        closedTrades.push(t)
      }
    }

    // Per-strategy analysis from signals
    const strategyStats = {}
    for (const s of (signals || [])) {
      const strat = s.strategy || 'unknown'
      if (!strategyStats[strat]) {
        strategyStats[strat] = { signals: 0, bullish: 0, bearish: 0, wins: 0, losses: 0, pnl: 0 }
      }
      strategyStats[strat].signals++
      if (s.direction === 'BUY' || s.direction === 'LONG') strategyStats[strat].bullish++
      else strategyStats[strat].bearish++
    }

    // Match signals to closed trades (simplified: by timestamp proximity)
    for (const t of closedTrades) {
      const strat = t.reason || t.strategy || 'unknown'
      if (!strategyStats[strat]) {
        strategyStats[strat] = { signals: 0, bullish: 0, bearish: 0, wins: 0, losses: 0, pnl: 0 }
      }
      if (t.pnl > 0) strategyStats[strat].wins++
      else strategyStats[strat].losses++
      strategyStats[strat].pnl += t.pnl || 0
    }

    // Overall stats
    const totalTrades = closedTrades.length
    const wins = closedTrades.filter(t => t.pnl > 0).length
    const losses = closedTrades.filter(t => t.pnl <= 0).length
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0
    const avgWin = wins > 0 ? closedTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / wins : 0
    const avgLoss = losses > 0 ? Math.abs(closedTrades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0) / losses) : 0
    const actualRR = avgLoss > 0 ? avgWin / avgLoss : 0

    // Use custom or actual
    const wr = customWinRate ? parseFloat(customWinRate) : (winRate || 45)
    const rr = customRR ? parseFloat(customRR) : (actualRR || 2)
    const risk = customRisk

    // EV calculation
    const w = wr / 100
    const l = 1 - w
    const evPerTrade = (w * rr * risk - l * risk) // in % of account
    const evDollar = evPerTrade * 100 // per $10,000
    const profitFactor = (w * rr) / l
    const breakevenWR = (1 / (1 + rr)) * 100
    const kelly = l > 0 ? w - l / rr : 0
    const kellyPct = Math.max(0, kelly * 100)

    // Expected drawdown sequence
    const losingStreakProb = Math.pow(l, 5) * 100 // P(5 losses in a row)
    const longStreakProb = Math.pow(l, 10) * 100 // P(10 losses)

    // Strategy breakdown with EV
    const strategyList = Object.entries(strategyStats).map(([name, stats]) => {
      const total = stats.wins + stats.losses
      const sWR = total > 0 ? (stats.wins / total) * 100 : 0
      const sAvgWin = stats.wins > 0 ? stats.pnl / stats.wins : 0
      const sAvgLoss = stats.losses > 0 ? Math.abs(stats.pnl / stats.losses) : 0
      const sRR = sAvgLoss > 0 ? sAvgWin / sAvgLoss : 0
      const sEV = total > 0 ? (sWR / 100 * sRR - (1 - sWR / 100)) * risk : 0
      return { name, ...stats, total, winRate: sWR, rr: sRR, ev: sEV, profitFactor: sAvgLoss > 0 ? (sWR / 100 * sRR) / (1 - sWR / 100) : 0 }
    }).sort((a, b) => b.ev - a.ev)

    return {
      wr, rr, risk, evPerTrade, evDollar, profitFactor, breakevenWR, kellyPct,
      losingStreakProb, longStreakProb,
      totalTrades, winRate, avgWin, avgLoss, actualRR,
      strategyList: strategyList.slice(0, 5),
    }
  }, [accounts, fills, signals, customWinRate, customRR, customRisk])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Calculator size={12} className="text-accent-green" />
          Expected Value
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No data</div>
      </div>
    )
  }

  const { wr, rr, risk, evPerTrade, evDollar, profitFactor, breakevenWR, kellyPct, losingStreakProb, longStreakProb, totalTrades, winRate, avgWin, avgLoss, actualRR, strategyList } = data

  const evColor = evPerTrade > 0 ? 'text-accent-green' : 'text-accent-red'

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Calculator size={12} className="text-accent-green" />
        Expected Value Calculator
      </div>

      {/* Actual stats */}
      {totalTrades > 0 && (
        <div className="mb-2 bg-bg-800 rounded px-2 py-1 text-[8px]">
          <span className="text-gray-600">Actual: </span>
          <span className="text-gray-300 font-mono">{totalTrades} trades, {winRate.toFixed(1)}% WR, {actualRR.toFixed(2)} R:R</span>
        </div>
      )}

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div>
          <label className="text-[8px] text-gray-600">Win %</label>
          <input
            type="number"
            value={customWinRate}
            placeholder={winRate.toFixed(0) || '45'}
            onChange={e => setCustomWinRate(e.target.value)}
            className="w-full bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-blue"
          />
        </div>
        <div>
          <label className="text-[8px] text-gray-600">R:R</label>
          <input
            type="number"
            value={customRR}
            placeholder={actualRR.toFixed(1) || '2'}
            onChange={e => setCustomRR(e.target.value)}
            className="w-full bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-blue"
          />
        </div>
        <div>
          <label className="text-[8px] text-gray-600">Risk %</label>
          <input
            type="number"
            value={customRisk}
            step="0.1"
            min="0.1"
            onChange={e => setCustomRisk(Number(e.target.value) || 1)}
            className="w-full bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-blue"
          />
        </div>
      </div>

      {/* EV result */}
      <div className="bg-bg-800 rounded px-2 py-2 mb-2 text-center">
        <div className="text-[8px] text-gray-600">EV per Trade</div>
        <div className={'text-xl font-bold ' + evColor}>
          {evPerTrade >= 0 ? '+' : ''}{evPerTrade.toFixed(3)}%
        </div>
        <div className={'text-[8px] ' + evColor}>
          ≈ ${evDollar.toFixed(2)} per $10K
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Profit Factor</span>
          <div className={'font-mono ' + (profitFactor > 1 ? 'text-accent-green' : 'text-accent-red')}>{profitFactor.toFixed(2)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">BE Win Rate</span>
          <div className="font-mono text-gray-400">{breakevenWR.toFixed(1)}%</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Kelly %</span>
          <div className={'font-mono ' + (kellyPct > 0 ? 'text-accent-green' : 'text-accent-red')}>{kellyPct.toFixed(1)}%</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">P(5 loss)</span>
          <div className="font-mono text-accent-yellow">{losingStreakProb.toFixed(2)}%</div>
        </div>
      </div>

      {/* Per strategy */}
      {strategyList.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-bg-600">
          <div className="text-[8px] text-gray-600 mb-1">Per Strategy EV:</div>
          <div className="space-y-0.5">
            {strategyList.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
                <span className="text-gray-400 truncate flex-1">{s.name}</span>
                <span className="font-mono text-gray-500 w-10 text-right">{s.total}t</span>
                <span className="font-mono text-gray-400 w-10 text-right">{s.winRate.toFixed(0)}%</span>
                <span className={'font-mono w-12 text-right ' + (s.ev > 0 ? 'text-accent-green' : 'text-accent-red')}>
                  {s.ev >= 0 ? '+' : ''}{s.ev.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        EV = (WR × R:R - LR) × risk%. Positive EV = profitable system. Kelly = optimal bet size.
      </div>
    </div>
  )
}
