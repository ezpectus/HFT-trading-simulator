import { useMemo } from 'react'
import { Shuffle, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { calcSMA, calcRSI, calcATR } from '../utils/indicators'
import { formatPrice } from '../utils/format'

export default function RegimeSwitching({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-100)
    if (symCandles.length < 30) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const volumes = symCandles.map(c => c.volume || 0)

    // Features for regime detection
    const sma20 = calcSMA(closes, 20)
    const sma50 = calcSMA(closes, Math.min(50, closes.length))
    const rsi = calcRSI(closes, 14)
    const atr = calcATR(highs, lows, closes, 14)

    // Classify each candle into a regime
    // Regimes: Trending Up, Trending Down, Ranging, Volatile, Calm
    const regimes = []
    for (let i = 20; i < closes.length; i++) {
      const price = closes[i]
      const s20 = sma20[i] || price
      const s50 = sma50[i] || price
      const r = rsi[i] || 50
      const a = atr[i] || 0
      const avgAtr = atr.slice(Math.max(0, i - 20), i).filter(v => !isNaN(v)).reduce((s, v) => s + v, 0) / 20 || a
      const volRatio = avgAtr > 0 ? a / avgAtr : 1
      const smaSpread = s50 > 0 ? ((s20 - s50) / s50) * 100 : 0
      const recentVol = volumes.slice(Math.max(0, i - 5), i).reduce((s, v) => s + v, 0) / 5
      const olderVol = volumes.slice(Math.max(0, i - 20), Math.max(0, i - 5)).reduce((s, v) => s + v, 0) / 15
      const volChange = olderVol > 0 ? recentVol / olderVol : 1

      let regime = 'Ranging'
      let regimeId = 2
      let color = '#64748b'

      // Trend detection
      if (smaSpread > 0.5 && r > 55) {
        regime = 'Trending Up'
        regimeId = 0
        color = '#22c55e'
      } else if (smaSpread < -0.5 && r < 45) {
        regime = 'Trending Down'
        regimeId = 1
        color = '#ef4444'
      }

      // Volatility override
      if (volRatio > 1.8) {
        regime = 'Volatile'
        regimeId = 3
        color = '#f97316'
      } else if (volRatio < 0.5 && Math.abs(smaSpread) < 0.3) {
        regime = 'Calm'
        regimeId = 4
        color = '#3b82f6'
      }

      regimes.push({ idx: i, regime, regimeId, color, price, rsi: r, volRatio, smaSpread, volChange })
    }

    if (regimes.length < 5) return null

    // Current regime
    const current = regimes[regimes.length - 1]

    // Regime transitions (HMM-like: count transition probabilities)
    const transitions = {}
    const regimeNames = ['Trending Up', 'Trending Down', 'Ranging', 'Volatile', 'Calm']
    for (const name of regimeNames) transitions[name] = {}
    for (const name of regimeNames) {
      for (const name2 of regimeNames) transitions[name][name2] = 0
    }

    for (let i = 1; i < regimes.length; i++) {
      const prev = regimes[i - 1].regime
      const curr = regimes[i].regime
      transitions[prev][curr] = (transitions[prev][curr] || 0) + 1
    }

    // Normalize to probabilities
    const transitionProbs = {}
    for (const [from, tos] of Object.entries(transitions)) {
      const total = Object.values(tos).reduce((s, v) => s + v, 0) || 1
      transitionProbs[from] = {}
      for (const [to, count] of Object.entries(tos)) {
        transitionProbs[from][to] = count / total
      }
    }

    // Most likely next regime
    const nextRegimes = transitionProbs[current.regime] || {}
    const sortedNext = Object.entries(nextRegimes).sort((a, b) => b[1] - a[1])
    const mostLikelyNext = sortedNext[0] || [current.regime, 0]

    // Regime duration (how long in current regime)
    let duration = 0
    for (let i = regimes.length - 1; i >= 0; i--) {
      if (regimes[i].regime === current.regime) duration++
      else break
    }

    // Regime distribution
    const dist = {}
    for (const r of regimes) {
      dist[r.regime] = (dist[r.regime] || 0) + 1
    }
    const distPct = Object.entries(dist).map(([name, count]) => ({
      name, count, pct: (count / regimes.length) * 100,
    })).sort((a, b) => b.pct - a.pct)

    // Chart: regime-colored price
    const slice = regimes.slice(-30)
    const prices = slice.map(s => s.price)
    const minP = Math.min(...prices)
    const maxP = Math.max(...prices)
    const range = maxP - minP || 1
    const toY = (v) => 100 - ((v - minP) / range) * 80 - 10

    const segments = slice.map((s, i) => ({
      x1: (i / slice.length) * 100,
      x2: ((i + 1) / slice.length) * 100,
      y: toY(s.price),
      color: s.color,
      regime: s.regime,
    }))

    return {
      current, duration, distPct,
      transitionProbs, mostLikelyNext,
      segments, sortedNext,
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Shuffle size={12} className="text-accent-purple" />
          Regime Switching
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 30+ candles</div>
      </div>
    )
  }

  const { current, duration, distPct, transitionProbs, mostLikelyNext, segments, sortedNext } = data

  const regimeColors = {
    'Trending Up': 'text-accent-green',
    'Trending Down': 'text-accent-red',
    'Ranging': 'text-gray-400',
    'Volatile': 'text-accent-orange',
    'Calm': 'text-accent-blue',
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Shuffle size={12} className="text-accent-purple" />
        Regime Switching Detection
      </div>

      {/* Current regime */}
      <div className="rounded px-2 py-1.5 mb-2 text-center" style={{ backgroundColor: current.color + '15' }}>
        <div className="text-[8px] text-gray-600">Current Regime</div>
        <div className="text-sm font-bold" style={{ color: current.color }}>{current.regime}</div>
        <div className="text-[8px] text-gray-500">{duration} candles in this regime</div>
      </div>

      {/* Regime-colored price chart */}
      <svg viewBox="0 0 100 100" className="w-full h-[40px]" preserveAspectRatio="none">
        {segments.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y} x2={s.x2} y2={s.y} stroke={s.color} strokeWidth="1.5" />
        ))}
      </svg>

      {/* Next regime prediction */}
      <div className="mt-2">
        <div className="text-[8px] text-gray-600 mb-1">Next regime probability:</div>
        <div className="space-y-0.5">
          {sortedNext.slice(0, 3).map(([name, prob], i) => (
            <div key={i} className="flex items-center gap-1.5 text-[8px]">
              <span className="text-gray-500 w-20 truncate">{name}</span>
              <div className="flex-1 h-1.5 bg-bg-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${prob * 100}%`, backgroundColor: regimeColors[name] ? '' : '#64748b' }}
                />
              </div>
              <span className="font-mono text-gray-400 w-8 text-right">{(prob * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Regime distribution */}
      <div className="mt-2 pt-1.5 border-t border-bg-600">
        <div className="text-[8px] text-gray-600 mb-1">Regime distribution:</div>
        <div className="flex h-2 rounded-full overflow-hidden">
          {distPct.map((d, i) => {
            const colors = { 'Trending Up': '#22c55e', 'Trending Down': '#ef4444', 'Ranging': '#64748b', 'Volatile': '#f97316', 'Calm': '#3b82f6' }
            return (
              <div
                key={i}
                style={{ width: `${d.pct}%`, backgroundColor: colors[d.name] || '#64748b' }}
                title={`${d.name}: ${d.pct.toFixed(0)}%`}
              />
            )
          })}
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
          {distPct.map((d, i) => (
            <span key={i} className="text-[7px] text-gray-600">
              {d.name}: {d.pct.toFixed(0)}%
            </span>
          ))}
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        HMM-like regime detection: Trend/Range/Volatile/Calm. Transition probs from historical data.
      </div>
    </div>
  )
}
