import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { Trophy, Swords, BarChart3, RefreshCw } from 'lucide-react'
import { selectCandles } from '../utils/candles'
import { NoDataFeed } from '../utils/ui-helpers'

const STORAGE_KEY = 'trading-sim-competition-results'
const RESPONSE_TIMEOUT_MS = 60000
const MAX_CANDLES_SENT = 1000

// Strategy ids must match src/communication/backtest_requests.py build_strategies().
// RESULT_KEY is the display-name key the backend puts into `results`.
const STRATEGIES = [
  { id: 'trend', name: 'Trend Following', resultKey: 'Trend Following', color: 'text-accent-blue' },
  { id: 'mean_reversion', name: 'Mean Reversion', resultKey: 'Mean Reversion', color: 'text-accent-purple' },
  { id: 'fft', name: 'FFT Cycle', resultKey: 'FFT Cycle', color: 'text-accent-orange' },
  { id: 'ensemble', name: 'Ensemble', resultKey: 'Ensemble', color: 'text-accent-yellow' },
]

// Round-robin ELO over real Sharpe ratios.
function rankByElo(entries) {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j]
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
  entries.sort((a, b) => b.elo - a.elo)
  entries.forEach((r, i) => { r.rank = i + 1 })
  return entries
}

export default memo(function CompetitionFramework({ sendSignalMessage, backtestResult, connected, candles, symbol, exchange }) {
  const [selected, setSelected] = useState(new Set(STRATEGIES.map(s => s.id)))
  const [results, setResults] = useState(null)
  const [pending, setPending] = useState(null)
  const [dataSource, setDataSource] = useState(null)
  const collectedRef = useRef({})
  const timeoutRef = useRef(null)

  const running = pending !== null

  const toggleStrategy = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const finishTournament = useCallback((collected) => {
    const entries = []
    for (const s of STRATEGIES) {
      if (!selected.has(s.id)) continue
      const res = collected[s.id]
      if (!res || res.error) {
        entries.push({ ...s, error: res?.error || 'no response', elo: 0, sharpe: 0, returnPct: 0, maxDD: 0, winRate: 0, totalTrades: 0, wins: 0, losses: 0, draws: 0 })
        continue
      }
      const metrics = res.results?.[s.resultKey]
      if (!metrics) {
        entries.push({ ...s, error: 'missing result', elo: 0, sharpe: 0, returnPct: 0, maxDD: 0, winRate: 0, totalTrades: 0, wins: 0, losses: 0, draws: 0 })
        continue
      }
      entries.push({
        ...s,
        elo: 1000,
        sharpe: metrics.sharpe_ratio ?? 0,
        returnPct: metrics.total_return_pct ?? 0,
        maxDD: metrics.max_drawdown_pct ?? 0,
        winRate: metrics.win_rate ?? 0,
        totalTrades: metrics.total_trades ?? 0,
        wins: 0, losses: 0, draws: 0,
      })
    }
    const ranked = rankByElo(entries.filter(e => !e.error))
    const failed = entries.filter(e => e.error)
    const all = [...ranked, ...failed.map((e, i) => ({ ...e, rank: ranked.length + i + 1 }))]
    setResults(all)
    setPending(null)
    setDataSource(collected._dataSource || null)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ timestamp: Date.now(), results: all }))
  }, [selected])

  // Collect backtest_result responses; the `strategy` field echoes the request.
  useEffect(() => {
    if (!pending || !backtestResult || backtestResult.type !== 'backtest_result') return
    const sid = backtestResult.strategy
    if (!pending.has(sid) || collectedRef.current[sid]) return
    collectedRef.current[sid] = backtestResult
    if (backtestResult.data_source) collectedRef.current._dataSource = backtestResult.data_source
    const remaining = new Set(pending)
    remaining.delete(sid)
    if (remaining.size === 0) {
      clearTimeout(timeoutRef.current)
      finishTournament(collectedRef.current)
    } else {
      setPending(remaining)
    }
  }, [backtestResult, pending, finishTournament])

  const runTournament = () => {
    if (!sendSignalMessage || running || selected.size < 2) return
    const marketCandles = selectCandles(candles, exchange, symbol).slice(-MAX_CANDLES_SENT)
    collectedRef.current = {}
    setResults(null)
    setDataSource(null)
    setPending(new Set(selected))
    timeoutRef.current = setTimeout(() => {
      setPending(prev => {
        if (prev) finishTournament(collectedRef.current)
        return prev
      })
    }, RESPONSE_TIMEOUT_MS)
    for (const id of selected) {
      sendSignalMessage({
        type: 'run_backtest',
        strategy: id,
        symbol,
        candles: Math.max(marketCandles.length, 200),
        ...(marketCandles.length >= 100 ? { candles_data: marketCandles } : {}),
      })
    }
  }

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  return (
    <div className="bg-bg-700  p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Trophy size={12} className="text-accent-yellow" />
        Strategy Competition
      </div>

      {!connected && (
        <NoDataFeed feed="signal server" />
      )}

      <div className="mb-2">
        <div className="text-[8px] text-gray-600 uppercase mb-1">Select Strategies</div>
        <div className="space-y-0.5">
          {STRATEGIES.map(s => (
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
        disabled={running || selected.size < 2 || !connected || !sendSignalMessage}
        className="w-full flex items-center justify-center gap-1 py-1 text-[10px]  bg-accent-yellow/20 text-accent-yellow hover:bg-accent-yellow/30 disabled:opacity-50 mb-2"
      >
        {running ? <RefreshCw size={10} className="animate-spin" /> : <Swords size={10} />}
        {running ? `Running (${pending.size} left)...` : `Run Tournament (${selected.size})`}
      </button>

      {results && results.length > 0 && (
        <div className="border-t border-bg-600 pt-2">
          <div className="text-[8px] text-gray-600 uppercase mb-1 flex items-center gap-1">
            <BarChart3 size={8} /> Leaderboard
            {dataSource && (
              <span className="normal-case text-gray-700">· {dataSource === 'client' ? 'real candles' : 'synthetic data'}</span>
            )}
          </div>
          <div className="space-y-0.5">
            {results.map(r => (
              <div key={r.id} className={`flex items-center gap-1.5 px-1.5 py-1  ${r.rank === 1 ? 'bg-accent-yellow/10' : 'bg-bg-600/40'}`}>
                <span className={`text-[10px] font-bold w-4 ${r.rank === 1 ? 'text-accent-yellow' : r.rank === 2 ? 'text-gray-300' : r.rank === 3 ? 'text-accent-orange' : 'text-gray-600'}`}>
                  {r.rank}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-[9px] truncate ${r.color}`}>{r.name}</div>
                  {r.error ? (
                    <div className="text-[7px] text-accent-red">{r.error}</div>
                  ) : (
                    <div className="text-[7px] text-gray-600">
                      ELO {Math.round(r.elo)} | Sharpe {r.sharpe.toFixed(2)} | {r.returnPct.toFixed(1)}% | DD {r.maxDD.toFixed(1)}% | WR {r.winRate.toFixed(0)}%
                    </div>
                  )}
                </div>
                {!r.error && (
                  <div className="text-[7px] text-gray-600 font-mono">
                    {r.wins}W/{r.losses}L/{r.draws}D · {r.totalTrades}tr
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
