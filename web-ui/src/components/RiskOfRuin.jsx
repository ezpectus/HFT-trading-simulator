import { useMemo, useState } from 'react'
import { Skull, Calculator, TrendingDown } from 'lucide-react'

export default function RiskOfRuin({ accounts, fills }) {
  const [winRate, setWinRate] = useState(45)
  const [riskPct, setRiskPct] = useState(2)
  const [rewardRatio, setRewardRatio] = useState(2)
  const [simulations, setSimulations] = useState(1000)

  const data = useMemo(() => {
    // Get actual stats from accounts if available
    let actualWinRate = null
    let actualTrades = 0
    let actualWins = 0

    if (accounts) {
      for (const acc of Object.values(accounts)) {
        const history = acc.trade_history || []
        actualTrades += history.length
        actualWins += history.filter(t => t.pnl > 0).length
      }
      if (actualTrades > 0) {
        actualWinRate = (actualWins / actualTrades) * 100
      }
    }

    const wr = actualWinRate !== null ? actualWinRate : winRate
    const lossRate = 100 - wr
    const w = wr / 100
    const l = lossRate / 100

    // Risk of Ruin formula (simplified Fama/Roll):
    // ROR = ((1 - edge) / (1 + edge))^units
    // Where edge = winRate * rewardRatio - lossRate
    const edge = w * rewardRatio - l
    const units = 1 / (riskPct / 100)

    let riskOfRuin
    if (edge <= 0) {
      riskOfRuin = 100 // guaranteed eventual ruin with negative edge
    } else {
      const ratio = (1 - edge) / (1 + edge)
      riskOfRuin = Math.pow(ratio, units) * 100
    }

    // Monte Carlo simulation
    let ruinCount = 0
    const ruinPaths = []
    const survivalPaths = []
    const startingBalance = 10000
    const ruinThreshold = startingBalance * 0.5 // 50% drawdown = "ruin"

    for (let sim = 0; sim < Math.min(simulations, 500); sim++) {
      let balance = startingBalance
      let maxBalance = startingBalance
      const path = [balance]
      let ruined = false

      for (let trade = 0; trade < 100; trade++) {
        const isWin = Math.random() < w
        const riskAmount = balance * (riskPct / 100)
        if (isWin) {
          balance += riskAmount * rewardRatio
        } else {
          balance -= riskAmount
        }
        if (balance > maxBalance) maxBalance = balance
        path.push(balance)

        if (balance <= ruinThreshold) {
          ruined = true
          break
        }
      }

      if (ruined) {
        ruinCount++
        if (ruinPaths.length < 5) ruinPaths.push(path)
      } else {
        if (survivalPaths.length < 5) survivalPaths.push(path)
      }
    }

    const mcRuinPct = (ruinCount / Math.min(simulations, 500)) * 100

    // Expected drawdown
    const maxDDs = []
    for (let sim = 0; sim < 100; sim++) {
      let balance = startingBalance
      let peak = startingBalance
      let maxDD = 0
      for (let trade = 0; trade < 100; trade++) {
        const isWin = Math.random() < w
        const riskAmount = balance * (riskPct / 100)
        balance += isWin ? riskAmount * rewardRatio : -riskAmount
        if (balance > peak) peak = balance
        const dd = ((peak - balance) / peak) * 100
        if (dd > maxDD) maxDD = dd
      }
      maxDDs.push(maxDD)
    }
    const avgMaxDD = maxDDs.reduce((s, v) => s + v, 0) / maxDDs.length
    const worstDD = Math.max(...maxDDs)
    const medianDD = maxDDs.sort((a, b) => a - b)[Math.floor(maxDDs.length / 2)]

    // Profit factor
    const profitFactor = (w * rewardRatio) / l

    // Breakeven win rate
    const breakevenWinRate = (1 / (1 + rewardRatio)) * 100

    return {
      wr, edge, riskOfRuin, mcRuinPct,
      avgMaxDD, worstDD, medianDD,
      profitFactor, breakevenWinRate,
      actualWinRate, actualTrades,
      ruinPaths, survivalPaths,
      startingBalance,
    }
  }, [accounts, fills, winRate, riskPct, rewardRatio, simulations])

  const { wr, edge, riskOfRuin, mcRuinPct, avgMaxDD, worstDD, medianDD, profitFactor, breakevenWinRate, actualWinRate, actualTrades, ruinPaths, survivalPaths, startingBalance } = data

  const riskColor = riskOfRuin < 1 ? 'text-accent-green' : riskOfRuin < 5 ? 'text-accent-yellow' : riskOfRuin < 20 ? 'text-accent-orange' : 'text-accent-red'

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Skull size={12} className="text-accent-red" />
        Risk of Ruin Calculator
      </div>

      {/* Use actual stats if available */}
      {actualWinRate !== null && (
        <div className="mb-2 bg-bg-800 rounded px-2 py-1 text-[8px]">
          <span className="text-gray-600">Actual stats: </span>
          <span className="text-gray-300 font-mono">{actualTrades} trades, {actualWinRate.toFixed(1)}% win rate</span>
        </div>
      )}

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div>
          <label className="text-[8px] text-gray-600">Win %</label>
          <input
            type="number"
            value={winRate}
            step="1"
            min="1"
            max="99"
            onChange={e => setWinRate(Number(e.target.value) || 45)}
            className="w-full bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-blue"
          />
        </div>
        <div>
          <label className="text-[8px] text-gray-600">Risk %</label>
          <input
            type="number"
            value={riskPct}
            step="0.1"
            min="0.1"
            max="10"
            onChange={e => setRiskPct(Number(e.target.value) || 2)}
            className="w-full bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-blue"
          />
        </div>
        <div>
          <label className="text-[8px] text-gray-600">R:R</label>
          <input
            type="number"
            value={rewardRatio}
            step="0.1"
            min="0.5"
            max="10"
            onChange={e => setRewardRatio(Number(e.target.value) || 2)}
            className="w-full bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-blue"
          />
        </div>
      </div>

      {/* Risk of Ruin */}
      <div className="bg-bg-800 rounded px-2 py-2 mb-2 text-center">
        <div className="text-[8px] text-gray-600">Risk of Ruin</div>
        <div className={'text-xl font-bold ' + riskColor}>{riskOfRuin.toFixed(2)}%</div>
        <div className="text-[8px] text-gray-600">MC: {mcRuinPct.toFixed(1)}%</div>
      </div>

      {/* Edge & metrics */}
      <div className="grid grid-cols-2 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Edge</span>
          <div className={'font-mono ' + (edge > 0 ? 'text-accent-green' : 'text-accent-red')}>
            {edge >= 0 ? '+' : ''}{(edge * 100).toFixed(2)}%
          </div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Profit Factor</span>
          <div className={'font-mono ' + (profitFactor > 1 ? 'text-accent-green' : 'text-accent-red')}>
            {profitFactor.toFixed(2)}
          </div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">BE Win Rate</span>
          <div className="font-mono text-gray-400">{breakevenWinRate.toFixed(1)}%</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Current WR</span>
          <div className={'font-mono ' + (wr >= breakevenWinRate ? 'text-accent-green' : 'text-accent-red')}>
            {wr.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Drawdown stats */}
      <div className="bg-bg-800 rounded px-2 py-1.5 mb-2">
        <div className="text-[8px] text-gray-600 mb-1">Monte Carlo Drawdown (100 trades):</div>
        <div className="grid grid-cols-3 gap-1 text-[8px]">
          <div>
            <span className="text-gray-600">Avg Max DD</span>
            <div className="font-mono text-accent-yellow">{avgMaxDD.toFixed(1)}%</div>
          </div>
          <div>
            <span className="text-gray-600">Median</span>
            <div className="font-mono text-gray-400">{medianDD.toFixed(1)}%</div>
          </div>
          <div>
            <span className="text-gray-600">Worst</span>
            <div className="font-mono text-accent-red">{worstDD.toFixed(1)}%</div>
          </div>
        </div>
      </div>

      {/* Monte Carlo paths */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-1">Sample equity curves:</div>
        <svg viewBox="0 0 100 50" className="w-full h-[40px]" preserveAspectRatio="none">
          <line x1="0" y1="25" x2="100" y2="25" stroke="#64748b" strokeWidth="0.2" strokeDasharray="1 3" opacity="0.3" />
          {[...survivalPaths, ...ruinPaths].map((path, i) => {
            const isRuin = i >= survivalPaths.length
            const maxVal = startingBalance * 2
            const minVal = startingBalance * 0.3
            const range = maxVal - minVal
            const toY = (v) => 50 - ((v - minVal) / range) * 45 - 2.5
            const d = path.map((v, j) => {
              const x = (j / (path.length - 1)) * 100
              return `${j === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${toY(v).toFixed(1)}`
            }).join(' ')
            return <path key={i} d={d} fill="none" stroke={isRuin ? '#ef4444' : '#22c55e'} strokeWidth="0.5" opacity="0.5" />
          })}
        </svg>
        <div className="flex items-center justify-between text-[7px] mt-0.5">
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-accent-green" />
            <span className="text-gray-600">Survived</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-accent-red" />
            <span className="text-gray-600">Ruined</span>
          </div>
        </div>
      </div>

      <div className="pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Risk of Ruin = probability of losing 50% of account. Keep &lt;1%. Lower risk% or improve edge.
      </div>
    </div>
  )
}
