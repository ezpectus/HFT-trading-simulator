import { useState } from 'react'
import { Trophy, Swords, BarChart3, RefreshCw } from 'lucide-react'

const STORAGE_KEY = 'trading-sim-competition-results'

const DEFAULT_STRATEGIES = [
  { id: 'trend_following', name: 'Trend Following', color: 'text-accent-blue' },
  { id: 'mean_reversion', name: 'Mean Reversion', color: 'text-accent-purple' },
  { id: 'rsi_divergence', name: 'RSI Divergence', color: 'text-accent-green' },
  { id: 'ema_crossover', name: 'EMA Crossover', color: 'text-accent-orange' },
  { id: 'volume_breakout', name: 'Volume Breakout', color: 'text-accent-red' },
  { id: 'statistical_arb', name: 'Statistical Arbitrage', color: 'text-accent-yellow' },
]

function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function runMockTournament(strategies, seed = Date.now()) {
  const rng = mulberry32(seed)
  const rand = (lo, hi) => lo + rng() * (hi - lo)

  const results = strategies.map(s => ({
    ...s,
    elo: 1000 + Math.floor(rand(-100, 100)),
    sharpe: rand(-0.5, 2.5),
    returnPct: rand(-15, 25),
    maxDD: rand(2, 27),
    winRate: rand(40, 70),
    totalTrades: Math.floor(rand(50, 550)),
    wins: 0, losses: 0, draws: 0,
  }))

  // Round-robin ELO
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i], b = results[j]
      if (Math.abs(a.sharpe - b.sharpe) < 0.15) {
        a.draws++; b.draws++
      } else if (a.sharpe > b.sharpe) {
        a.wins++; b.losses++
        const ea = 1 / (1 + Math.pow(10, (b.elo - a.elo) / 400))
        a.elo += 32 * (1 - ea)
        b.elo -= 32 * ea
      } else {
        b.wins++; a.losses++
        const eb = 1 / (1 + Math.pow(10, (a.elo - b.elo) / 400))
        b.elo += 32 * (1 - eb)
        a.elo -= 32 * eb
      }
    }
  }

  results.sort((a, b) => b.elo - a.elo)
  results.forEach((r, i) => { r.rank = i + 1 })
  return results
}

export default function CompetitionFramework() {
  const [selected, setSelected] = useState(new Set(DEFAULT_STRATEGIES.map(s => s.id)))
  const [results, setResults] = useState(null)
  const [tournamentSeed, setTournamentSeed] = useState(null)
  const [running, setRunning] = useState(false)

  const toggleStrategy = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const runTournament = () => {
    setRunning(true)
    const seed = Date.now()
    setTournamentSeed(seed)
    const strategies = DEFAULT_STRATEGIES.filter(s => selected.has(s.id))
    setTimeout(() => {
      const res = runMockTournament(strategies, seed)
      setResults(res)
      setRunning(false)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ timestamp: Date.now(), results: res }))
      } catch { /* ignore */ }
    }, 800)
  }

  const sortedResults = results || []

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Trophy size={12} className="text-accent-yellow" />
        Strategy Competition
      </div>

      <div className="mb-2">
        <div className="text-[8px] text-gray-600 uppercase mb-1">Select Strategies</div>
        <div className="space-y-0.5">
          {DEFAULT_STRATEGIES.map(s => (
            <label key={s.id} className="flex items-center gap-1.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggleStrategy(s.id)}
                className="w-3 h-3 accent-accent-yellow"
              />
              <span className={`text-[9px] ${selected.has(s.id) ? s.color : 'text-gray-600'}`}>{s.name}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={runTournament}
        disabled={running || selected.size < 2}
        className="w-full flex items-center justify-center gap-1 py-1 text-[10px] rounded bg-accent-yellow/20 text-accent-yellow hover:bg-accent-yellow/30 disabled:opacity-50 mb-2"
      >
        {running ? <RefreshCw size={10} className="animate-spin" /> : <Swords size={10} />}
        {running ? 'Running...' : `Run Tournament (${selected.size})`}
      </button>

      {sortedResults.length > 0 && (
        <div className="border-t border-bg-600 pt-2">
          <div className="text-[8px] text-gray-600 uppercase mb-1 flex items-center gap-1">
            <BarChart3 size={8} /> Leaderboard
          </div>
          <div className="space-y-0.5">
            {sortedResults.map(r => (
              <div key={r.id} className={`flex items-center gap-1.5 px-1.5 py-1 rounded ${r.rank === 1 ? 'bg-accent-yellow/10' : 'bg-bg-600/40'}`}>
                <span className={`text-[10px] font-bold w-4 ${r.rank === 1 ? 'text-accent-yellow' : r.rank === 2 ? 'text-gray-300' : r.rank === 3 ? 'text-accent-orange' : 'text-gray-600'}`}>
                  {r.rank}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-[9px] truncate ${r.color}`}>{r.name}</div>
                  <div className="text-[7px] text-gray-600">
                    ELO {Math.round(r.elo)} | Sharpe {r.sharpe.toFixed(2)} | {(r.returnPct).toFixed(1)}% | DD {r.maxDD.toFixed(1)}%
                  </div>
                </div>
                <div className="text-[7px] text-gray-600 font-mono">
                  {r.wins}W/{r.losses}L/{r.draws}D
                </div>
              </div>
            ))}
          </div>
          <div className="text-[7px] text-gray-700 mt-1">
            Seed: {tournamentSeed}
          </div>
        </div>
      )}
    </div>
  )
}
