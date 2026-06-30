import { useState, useMemo } from 'react'
import { Dice5, Play, Info } from 'lucide-react'
import { formatUsd } from '../utils/format'

function runMonteCarlo(trades, runs, initialBalance) {
  if (trades.length < 5) return null

  const pnls = trades.map(t => t.pnl || 0)
  const results = []
  const equityCurves = []

  for (let r = 0; r < runs; r++) {
    let equity = initialBalance
    const curve = [equity]
    const shuffled = [...pnls].sort(() => Math.random() - 0.5)

    for (const pnl of shuffled) {
      equity += pnl
      curve.push(equity)
    }

    results.push(equity - initialBalance)
    equityCurves.push(curve)
  }

  results.sort((a, b) => a - b)

  const finalBalances = results.map(r => r + initialBalance)
  const percentiles = {
    p5: results[Math.floor(runs * 0.05)],
    p25: results[Math.floor(runs * 0.25)],
    p50: results[Math.floor(runs * 0.50)],
    p75: results[Math.floor(runs * 0.75)],
    p95: results[Math.floor(runs * 0.95)],
  }

  const profitable = results.filter(r => r > 0).length
  const profitProb = (profitable / runs) * 100

  const maxDDs = equityCurves.map(curve => {
    let peak = curve[0], maxDD = 0
    for (const v of curve) {
      if (v > peak) peak = v
      const dd = peak - v
      if (dd > maxDD) maxDD = dd
    }
    return maxDD
  })
  maxDDs.sort((a, b) => a - b)

  return {
    percentiles,
    profitProb,
    medianMaxDD: maxDDs[Math.floor(runs * 0.5)],
    worstMaxDD: maxDDs[maxDDs.length - 1],
    bestReturn: results[results.length - 1],
    worstReturn: results[0],
    runs,
  }
}

export default function MonteCarlo({ accounts }) {
  const [runs, setRuns] = useState(100)
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)

  const allTrades = useMemo(() => {
    const trades = []
    for (const acc of Object.values(accounts || {})) {
      for (const t of (acc.trade_history || [])) trades.push(t)
    }
    return trades
  }, [accounts])

  const handleRun = () => {
    if (allTrades.length < 5) return
    setRunning(true)
    setTimeout(() => {
      const r = runMonteCarlo(allTrades, runs, 10000)
      setResult(r)
      setRunning(false)
    }, 50)
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Dice5 size={12} className="text-accent-purple" />
        Monte Carlo Simulation
      </div>

      {allTrades.length < 5 ? (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">
          Need at least 5 trades ({allTrades.length} available)
        </div>
      ) : (
        <>
          {/* Runs selector */}
          <div className="flex items-center gap-2 mb-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[8px] text-gray-600">Simulations</span>
              <select
                value={runs}
                onChange={e => setRuns(Number(e.target.value))}
                className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none"
              >
                <option value={100}>100</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </label>
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] rounded bg-accent-purple/20 text-accent-purple hover:bg-accent-purple/30 transition-colors disabled:opacity-50"
            >
              <Play size={10} />
              {running ? 'Running...' : 'Run'}
            </button>
          </div>

          {result && (
            <>
              {/* Profit probability */}
              <div className="bg-bg-600/50 rounded px-2 py-1.5 mb-2">
                <div className="text-[8px] text-gray-600 uppercase">Profit Probability</div>
                <div className={'text-lg font-bold ' + (result.profitProb >= 50 ? 'text-accent-green' : 'text-accent-red')}>
                  {result.profitProb.toFixed(1)}%
                </div>
              </div>

              {/* Percentiles */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <PStat label="5th pct (worst)" value={formatUsd(result.percentiles.p5)} color="text-accent-red" />
                <PStat label="95th pct (best)" value={formatUsd(result.percentiles.p95)} color="text-accent-green" />
                <PStat label="Median (p50)" value={formatUsd(result.percentiles.p50)} color="text-gray-200" />
                <PStat label="IQR (p25-p75)" value={`${formatUsd(result.percentiles.p25)} → ${formatUsd(result.percentiles.p75)}`} color="text-gray-400" small />
              </div>

              {/* Drawdown */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <PStat label="Median Max DD" value={formatUsd(result.medianMaxDD)} color="text-accent-yellow" />
                <PStat label="Worst Max DD" value={formatUsd(result.worstMaxDD)} color="text-accent-red" />
              </div>

              <div className="mt-1.5 pt-1.5 border-t border-bg-600 flex items-start gap-1 text-[8px] text-gray-600">
                <Info size={9} className="shrink-0 mt-0.5" />
                <span>Shuffles trade order {result.runs}× to estimate robustness. Shows range of possible outcomes.</span>
              </div>
            </>
          )}

          {!result && !running && (
            <div className="text-[10px] text-gray-600 italic py-2 text-center">
              Click "Run" to simulate {runs} scenarios
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PStat({ label, value, color, small }) {
  return (
    <div className="bg-bg-600/50 rounded px-2 py-1">
      <div className="text-[8px] text-gray-600 uppercase">{label}</div>
      <div className={`${small ? 'text-[8px]' : 'text-[11px]'} font-mono ${color}`}>{value}</div>
    </div>
  )
}
