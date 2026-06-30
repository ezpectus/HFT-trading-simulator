import { useMemo, useState, useEffect } from 'react'
import { Clock, TrendingUp, TrendingDown, Award, AlertCircle, Timer } from 'lucide-react'
import { formatUsd } from '../utils/format'

const SESSION_KEY = 'trading-sim-session-start'

export default function SessionStats({ accounts, fills }) {
  const [sessionStart, setSessionStart] = useState(null)

  useEffect(() => {
    try {
      let start = localStorage.getItem(SESSION_KEY)
      if (!start) {
        start = Date.now().toString()
        localStorage.setItem(SESSION_KEY, start)
      }
      setSessionStart(parseInt(start))
    } catch (e) {
      console.warn('[SessionStats] Failed to load session start:', e)
      setSessionStart(Date.now())
    }
  }, [])

  const stats = useMemo(() => {
    if (sessionStart == null) return null
    const now = Date.now()
    const elapsed = Math.floor((now - sessionStart) / 1000)

    // Aggregate all trades across exchanges
    const allTrades = []
    for (const acc of Object.values(accounts || {})) {
      for (const t of (acc.trade_history || [])) {
        allTrades.push({ ...t, ts: t.closed_at || t.timestamp || 0 })
      }
    }

    // Trades since session start (use trade count as proxy since we don't have exact timestamps)
    const sessionTrades = allTrades.slice(-50) // last 50 trades as session trades

    const pnl = sessionTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
    const wins = sessionTrades.filter(t => (t.pnl || 0) > 0)
    const losses = sessionTrades.filter(t => (t.pnl || 0) < 0)
    const winRate = sessionTrades.length > 0 ? (wins.length / sessionTrades.length * 100) : 0

    const bestTrade = sessionTrades.length > 0
      ? sessionTrades.reduce((best, t) => (t.pnl > best.pnl ? t : best), sessionTrades[0])
      : null
    const worstTrade = sessionTrades.length > 0
      ? sessionTrades.reduce((worst, t) => (t.pnl < worst.pnl ? t : worst), sessionTrades[0])
      : null

    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0

    const hours = Math.floor(elapsed / 3600)
    const mins = Math.floor((elapsed % 3600) / 60)
    const secs = elapsed % 60

    return {
      elapsed,
      elapsedStr: hours > 0 ? `${hours}h ${mins}m` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`,
      tradeCount: sessionTrades.length,
      pnl,
      winRate,
      wins: wins.length,
      losses: losses.length,
      bestTrade,
      worstTrade,
      avgWin,
      avgLoss,
      fillsCount: fills.length,
    }
  }, [accounts, fills, sessionStart])

  if (!stats) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
          <Timer size={12} className="text-accent-blue" />
          Session Stats
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Loading...</div>
      </div>
    )
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Timer size={12} className="text-accent-blue" />
        Session Stats
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Elapsed */}
        <div className="flex items-center gap-1.5">
          <Clock size={11} className="text-gray-600" />
          <div>
            <div className="text-[9px] text-gray-600">Duration</div>
            <div className="text-[11px] font-mono text-gray-300">{stats.elapsedStr}</div>
          </div>
        </div>

        {/* Trades */}
        <div className="flex items-center gap-1.5">
          <TrendingUp size={11} className="text-gray-600" />
          <div>
            <div className="text-[9px] text-gray-600">Trades</div>
            <div className="text-[11px] font-mono text-gray-300">{stats.tradeCount}</div>
          </div>
        </div>

        {/* Session PnL */}
        <div className="flex items-center gap-1.5">
          {stats.pnl >= 0 ? <TrendingUp size={11} className="text-accent-green" /> : <TrendingDown size={11} className="text-accent-red" />}
          <div>
            <div className="text-[9px] text-gray-600">Session PnL</div>
            <div className={'text-[11px] font-mono font-medium ' + (stats.pnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
              {stats.pnl >= 0 ? '+' : ''}{formatUsd(stats.pnl)}
            </div>
          </div>
        </div>

        {/* Win Rate */}
        <div className="flex items-center gap-1.5">
          <Award size={11} className="text-gray-600" />
          <div>
            <div className="text-[9px] text-gray-600">Win Rate</div>
            <div className={'text-[11px] font-mono ' + (stats.winRate >= 50 ? 'text-accent-green' : 'text-accent-yellow')}>
              {stats.winRate.toFixed(1)}% ({stats.wins}W/{stats.losses}L)
            </div>
          </div>
        </div>

        {/* Best Trade */}
        {stats.bestTrade && (
          <div className="flex items-center gap-1.5">
            <TrendingUp size={11} className="text-accent-green" />
            <div>
              <div className="text-[9px] text-gray-600">Best</div>
              <div className="text-[11px] font-mono text-accent-green">
                +{formatUsd(stats.bestTrade.pnl)}
              </div>
            </div>
          </div>
        )}

        {/* Worst Trade */}
        {stats.worstTrade && (
          <div className="flex items-center gap-1.5">
            <TrendingDown size={11} className="text-accent-red" />
            <div>
              <div className="text-[9px] text-gray-600">Worst</div>
              <div className="text-[11px] font-mono text-accent-red">
                {formatUsd(stats.worstTrade.pnl)}
              </div>
            </div>
          </div>
        )}

        {/* Avg Win */}
        {stats.wins > 0 && (
          <div className="flex items-center gap-1.5">
            <div>
              <div className="text-[9px] text-gray-600">Avg Win</div>
              <div className="text-[11px] font-mono text-accent-green">+{formatUsd(stats.avgWin)}</div>
            </div>
          </div>
        )}

        {/* Avg Loss */}
        {stats.losses > 0 && (
          <div className="flex items-center gap-1.5">
            <div>
              <div className="text-[9px] text-gray-600">Avg Loss</div>
              <div className="text-[11px] font-mono text-accent-red">{formatUsd(stats.avgLoss)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Fills count */}
      <div className="mt-2 pt-2 border-t border-bg-600 flex items-center justify-between text-[9px] text-gray-600">
        <span>Fills received: {stats.fillsCount}</span>
        <button
          onClick={() => {
            const now = Date.now()
            try { localStorage.setItem(SESSION_KEY, now.toString()) } catch (e) {
              console.warn('[SessionStats] Failed to reset session:', e)
            }
            setSessionStart(now)
          }}
          className="text-gray-500 hover:text-accent-blue transition-colors"
          title="Reset session timer"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
