import { useMemo } from 'react'
import { Link2, TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react'
import { formatPrice } from '../utils/format'

function correlation(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 10) return 0
  const aS = a.slice(-n), bS = b.slice(-n)
  const mA = aS.reduce((s, v) => s + v, 0) / n
  const mB = bS.reduce((s, v) => s + v, 0) / n
  let cov = 0, vA = 0, vB = 0
  for (let i = 0; i < n; i++) {
    const da = aS[i] - mA, db = bS[i] - mB
    cov += da * db; vA += da * da; vB += db * db
  }
  if (vA === 0 || vB === 0) return 0
  return cov / Math.sqrt(vA * vB)
}

function cointegrationSpread(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 20) return []
  const aS = a.slice(-n), bS = b.slice(-n)
  // Simple OLS: spread = a - beta * b
  const meanA = aS.reduce((s, v) => s + v, 0) / n
  const meanB = bS.reduce((s, v) => s + v, 0) / n
  let cov = 0, varB = 0
  for (let i = 0; i < n; i++) {
    cov += (aS[i] - meanA) * (bS[i] - meanB)
    varB += (bS[i] - meanB) ** 2
  }
  const beta = varB > 0 ? cov / varB : 1
  return aS.map((v, i) => v - beta * bS[i])
}

export default function PairTradingSignals({ candles, symbols, exchange }) {
  const data = useMemo(() => {
    if (!symbols || symbols.length < 2) return null

    // Get close prices for each symbol
    const priceData = {}
    for (const sym of symbols) {
      const symCandles = candles
        .filter(c => c.exchange === exchange && c.symbol === sym)
        .slice(-60)
        .map(c => c.close)
      if (symCandles.length >= 20) priceData[sym] = symCandles
    }

    const symList = Object.keys(priceData)
    if (symList.length < 2) return null

    // Find all pairs
    const pairs = []
    for (let i = 0; i < symList.length; i++) {
      for (let j = i + 1; j < symList.length; j++) {
        const a = priceData[symList[i]]
        const b = priceData[symList[j]]
        const corr = correlation(a, b)
        const spread = cointegrationSpread(a, b)

        if (spread.length < 20) continue

        // Z-score of current spread
        const meanSpread = spread.reduce((s, v) => s + v, 0) / spread.length
        const stdSpread = Math.sqrt(spread.reduce((s, v) => s + (v - meanSpread) ** 2, 0) / spread.length) || 1
        const lastSpread = spread[spread.length - 1]
        const zScore = (lastSpread - meanSpread) / stdSpread

        // Signal
        let signal = 'Neutral'
        let signalColor = 'text-gray-400'
        if (zScore > 2.0) { signal = 'Short A / Long B'; signalColor = 'text-accent-red' }
        else if (zScore > 1.0) { signal = 'Lean Short A'; signalColor = 'text-accent-yellow' }
        else if (zScore < -2.0) { signal = 'Long A / Short B'; signalColor = 'text-accent-green' }
        else if (zScore < -1.0) { signal = 'Lean Long A'; signalColor = 'text-accent-yellow' }

        // Mean reversion target
        const targetZ = 0
        const distanceFromMean = Math.abs(zScore)

        pairs.push({
          symA: symList[i],
          symB: symList[j],
          corr,
          zScore,
          signal,
          signalColor,
          distanceFromMean,
          spread: spread.slice(-20),
          meanSpread,
          stdSpread,
        })
      }
    }

    if (pairs.length === 0) return null

    // Sort by absolute z-score (best opportunities first)
    pairs.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))

    return { pairs: pairs.slice(0, 5) }
  }, [candles, symbols, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Link2 size={12} className="text-accent-blue" />
          Pair Trading
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 2+ symbols with data</div>
      </div>
    )
  }

  const { pairs } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Link2 size={12} className="text-accent-blue" />
        Pair Trading Signals
      </div>

      <div className="space-y-1.5">
        {pairs.map((p, i) => (
          <div key={i} className="bg-bg-800 rounded p-1.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <ArrowRightLeft size={9} className="text-gray-500" />
                <span className="text-[10px] font-mono text-gray-300">{p.symA.split('/')[0]}</span>
                <span className="text-[8px] text-gray-600">/</span>
                <span className="text-[10px] font-mono text-gray-300">{p.symB.split('/')[0]}</span>
              </div>
              <span className={'text-[9px] font-medium ' + p.signalColor}>{p.signal}</span>
            </div>

            <div className="grid grid-cols-3 gap-1 text-[8px]">
              <div>
                <span className="text-gray-600">Corr</span>
                <div className={'font-mono ' + (p.corr > 0.7 ? 'text-accent-green' : p.corr > 0.3 ? 'text-accent-yellow' : 'text-gray-400')}>
                  {p.corr.toFixed(2)}
                </div>
              </div>
              <div>
                <span className="text-gray-600">Z-Score</span>
                <div className={'font-mono font-bold ' + (Math.abs(p.zScore) > 2 ? 'text-accent-yellow' : 'text-gray-300')}>
                  {p.zScore >= 0 ? '+' : ''}{p.zScore.toFixed(2)}
                </div>
              </div>
              <div>
                <span className="text-gray-600">σ Dist</span>
                <div className="font-mono text-gray-400">{p.distanceFromMean.toFixed(1)}σ</div>
              </div>
            </div>

            {/* Spread sparkline */}
            <svg viewBox="0 0 100 30" className="w-full h-[20px] mt-1" preserveAspectRatio="none">
              <line x1="0" y1="15" x2="100" y2="15" stroke="#64748b" strokeWidth="0.2" strokeDasharray="1 3" opacity="0.3" />
              {(() => {
                const sMin = Math.min(...p.spread)
                const sMax = Math.max(...p.spread)
                const sRange = sMax - sMin || 1
                const sPath = p.spread.map((v, idx) => {
                  const x = (idx / (p.spread.length - 1)) * 100
                  const y = 30 - ((v - sMin) / sRange) * 25 - 2.5
                  return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
                }).join(' ')
                return <path d={sPath} fill="none" stroke="#3b82f6" strokeWidth="0.8" />
              })()}
            </svg>
          </div>
        ))}
      </div>

      <div className="mt-2 pt-1.5 border-t border-bg-600 text-[8px] text-gray-600">
        Statistical arbitrage: |Z|&gt;2 = entry, Z→0 = exit. Requires high correlation.
      </div>
    </div>
  )
}
