import { useState, useMemo } from 'react'
import { Percent, Info } from 'lucide-react'

export default function KellyCalculator({ accounts }) {
  const [fractionalKelly, setFractionalKelly] = useState(0.5)

  const stats = useMemo(() => {
    const trades = []
    for (const acc of Object.values(accounts || {})) {
      for (const t of (acc.trade_history || [])) trades.push(t)
    }

    if (trades.length < 5) {
      return { wins: 0, losses: 0, winRate: 0, avgWin: 0, avgLoss: 0, kelly: 0, suggested: 0, trades: 0 }
    }

    const wins = trades.filter(t => (t.pnl || 0) > 0)
    const losses = trades.filter(t => (t.pnl || 0) < 0)

    const winRate = wins.length / trades.length
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0

    // Kelly formula: f* = (bp - q) / b
    // b = avgWin/avgLoss (odds ratio), p = winRate, q = 1 - winRate
    const b = avgLoss > 0 ? avgWin / avgLoss : 0
    const p = winRate
    const q = 1 - winRate

    const kelly = b > 0 ? ((b * p - q) / b) * 100 : 0
    const suggested = Math.max(0, kelly * fractionalKelly)

    return {
      wins: wins.length,
      losses: losses.length,
      winRate: winRate * 100,
      avgWin,
      avgLoss,
      kelly,
      suggested,
      trades: trades.length,
    }
  }, [accounts, fractionalKelly])

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Percent size={12} className="text-accent-blue" />
        Kelly Criterion Calculator
      </div>

      {stats.trades < 5 ? (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">
          Need at least 5 trades for Kelly calculation
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Stat label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} color={stats.winRate >= 50 ? 'text-accent-green' : 'text-accent-yellow'} />
            <Stat label="Trades" value={stats.trades} />
            <Stat label="Avg Win" value={`+$${stats.avgWin.toFixed(2)}`} color="text-accent-green" />
            <Stat label="Avg Loss" value={`-$${stats.avgLoss.toFixed(2)}`} color="text-accent-red" />
          </div>

          {/* Fractional Kelly selector */}
          <div className="mb-2">
            <div className="text-[9px] text-gray-600 mb-1">Fractional Kelly</div>
            <div className="flex gap-1">
              {[0.25, 0.5, 0.75, 1.0].map(f => (
                <button
                  key={f}
                  onClick={() => setFractionalKelly(f)}
                  className={'flex-1 py-1 text-[10px] rounded transition-colors ' +
                    (fractionalKelly === f ? 'bg-accent-blue/20 text-accent-blue' : 'bg-bg-600 text-gray-400 hover:bg-bg-500')}
                >
                  {f}x
                </button>
              ))}
            </div>
          </div>

          {/* Kelly results */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-bg-600/50 rounded px-2 py-1.5">
              <div className="text-[8px] text-gray-600 uppercase">Full Kelly</div>
              <div className={'text-sm font-mono font-bold ' + (stats.kelly > 0 ? 'text-accent-green' : 'text-accent-red')}>
                {stats.kelly > 0 ? '+' : ''}{stats.kelly.toFixed(2)}%
              </div>
            </div>
            <div className="bg-bg-600/50 rounded px-2 py-1.5 border border-accent-blue/30">
              <div className="text-[8px] text-accent-blue uppercase">Suggested ({fractionalKelly}x)</div>
              <div className="text-sm font-mono font-bold text-accent-blue">
                {stats.suggested.toFixed(2)}%
              </div>
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-bg-600 flex items-start gap-1 text-[8px] text-gray-600">
            <Info size={9} className="shrink-0 mt-0.5" />
            <span>
              Kelly = (b×p − q) / b. Suggested = Kelly × fraction. Fractional Kelly (0.5x) reduces variance.
              {stats.kelly <= 0 && ' No edge detected — avoid trading.'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, color = 'text-gray-200' }) {
  return (
    <div className="bg-bg-600/50 rounded px-2 py-1">
      <div className="text-[8px] text-gray-600 uppercase">{label}</div>
      <div className={`text-[11px] font-mono ${color}`}>{value}</div>
    </div>
  )
}
