export default function StreakPanel({ accounts }) {
  const trades = []
  for (const acc of Object.values(accounts || {})) {
    for (const t of (acc.trade_history || [])) {
      trades.push(t)
    }
  }
  trades.sort((a, b) => b.close_time - a.close_time)

  let curWinStreak = 0, curLossStreak = 0
  let maxWinStreak = 0, maxLossStreak = 0
  for (const t of trades) {
    if (t.pnl >= 0) {
      curWinStreak++
      curLossStreak = 0
      maxWinStreak = Math.max(maxWinStreak, curWinStreak)
    } else {
      curLossStreak++
      curWinStreak = 0
      maxLossStreak = Math.max(maxLossStreak, curLossStreak)
    }
  }
  const currentStreak = curWinStreak > 0 ? curWinStreak : -curLossStreak

  return (
    <div className="bg-bg-700 p-3 border border-bg-600">
      <div className="text-xs text-gray-400 mb-2 font-medium">Streak Tracking</div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center">
          <div className="text-gray-500 text-[10px]">Current</div>
          <div className={`font-mono font-bold ${currentStreak > 0 ? 'text-accent-green' : currentStreak < 0 ? 'text-accent-red' : 'text-gray-400'}`}>
            {currentStreak > 0 ? `${currentStreak}W` : currentStreak < 0 ? `${-currentStreak}L` : '—'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 text-[10px]">Max Win Streak</div>
          <div className="font-mono font-bold text-accent-green">{maxWinStreak}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 text-[10px]">Max Loss Streak</div>
          <div className="font-mono font-bold text-accent-red">{maxLossStreak}</div>
        </div>
      </div>
    </div>
  )
}
