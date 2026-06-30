import { useMemo } from 'react'
import { ArrowLeftRight, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function InterExchangeSpread({ candles, prices, symbols, exchange }) {
  const data = useMemo(() => {
    if (!symbols || symbols.length === 0) return null

    // Get latest price per exchange per symbol
    const spreads = []

    for (const sym of symbols) {
      const symCandles = candles.filter(c => c.symbol === sym)
      const exchangePrices = {}

      for (const c of symCandles.slice(-1)) {
        if (!exchangePrices[c.exchange]) {
          exchangePrices[c.exchange] = c.close
        }
      }

      // Also check prices object
      if (prices) {
        for (const [key, price] of Object.entries(prices)) {
          if (key.includes(sym) && typeof price === 'number') {
            const ex = key.split('|')[0]
            if (!exchangePrices[ex]) exchangePrices[ex] = price
          }
        }
      }

      const exList = Object.keys(exchangePrices)
      if (exList.length < 2) continue

      // All pairwise spreads
      for (let i = 0; i < exList.length; i++) {
        for (let j = i + 1; j < exList.length; j++) {
          const exA = exList[i]
          const exB = exList[j]
          const priceA = exchangePrices[exA]
          const priceB = exchangePrices[exB]
          const spread = priceA - priceB
          const spreadPct = (spread / Math.min(priceA, priceB)) * 100

          // Historical spread from candles
          const candlesA = candles.filter(c => c.exchange === exA && c.symbol === sym).slice(-20).map(c => c.close)
          const candlesB = candles.filter(c => c.exchange === exB && c.symbol === sym).slice(-20).map(c => c.close)
          const histSpreads = []
          for (let k = 0; k < Math.min(candlesA.length, candlesB.length); k++) {
            histSpreads.push(candlesA[k] - candlesB[k])
          }

          const avgSpread = histSpreads.length > 0 ? histSpreads.reduce((s, v) => s + v, 0) / histSpreads.length : 0
          const maxSpread = histSpreads.length > 0 ? Math.max(...histSpreads.map(Math.abs)) : 0
          const zScore = maxSpread > 0 ? (spread - avgSpread) / maxSpread : 0

          // Arbitrage opportunity
          const isOpportunity = Math.abs(spreadPct) > 0.1

          spreads.push({
            symbol: sym,
            exchangeA: exA,
            exchangeB: exB,
            priceA, priceB,
            spread,
            spreadPct,
            avgSpread,
            zScore,
            isOpportunity,
            direction: spread > 0 ? 'A>B' : 'B>A',
            histSpreads: histSpreads.slice(-15),
          })
        }
      }
    }

    if (spreads.length === 0) return null

    // Sort by opportunity (largest absolute spread %)
    spreads.sort((a, b) => Math.abs(b.spreadPct) - Math.abs(a.spreadPct))

    const opportunities = spreads.filter(s => s.isOpportunity)

    return { spreads: spreads.slice(0, 6), opportunities: opportunities.length }
  }, [candles, prices, symbols])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <ArrowLeftRight size={12} className="text-accent-blue" />
          Inter-Exchange Spread
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 2+ exchanges</div>
      </div>
    )
  }

  const { spreads, opportunities } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <ArrowLeftRight size={12} className="text-accent-blue" />
        Inter-Exchange Spread Tracker
      </div>

      {opportunities > 0 && (
        <div className="mb-2 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-1 flex items-center gap-1">
          <AlertCircle size={9} className="text-accent-yellow shrink-0" />
          <span className="text-[8px] text-accent-yellow">
            {opportunities} arbitrage opportunity({opportunities > 1 ? 's' : ''}) detected (&gt;0.1%)
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        {spreads.map((s, i) => (
          <div key={i} className="bg-bg-800 rounded p-1.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-gray-300">{s.symbol.split('/')[0]}</span>
                <span className="text-[7px] text-gray-600">{s.exchangeA}↔{s.exchangeB}</span>
              </div>
              <span className={'text-[9px] font-mono font-bold ' + (s.spread > 0 ? 'text-accent-green' : 'text-accent-red')}>
                {s.spread > 0 ? '+' : ''}{s.spreadPct.toFixed(3)}%
              </span>
            </div>

            <div className="flex justify-between text-[8px] text-gray-500 mb-1">
              <span className="font-mono">{s.exchangeA}: {formatPrice(s.priceA)}</span>
              <span className="font-mono">{s.exchangeB}: {formatPrice(s.priceB)}</span>
            </div>

            {/* Spread sparkline */}
            {s.histSpreads.length > 2 && (
              <svg viewBox="0 0 100 20" className="w-full h-[15px]" preserveAspectRatio="none">
                {(() => {
                  const minS = Math.min(...s.histSpreads)
                  const maxS = Math.max(...s.histSpreads)
                  const sRange = maxS - minS || 1
                  const midY = 10
                  const path = s.histSpreads.map((v, idx) => {
                    const x = (idx / (s.histSpreads.length - 1)) * 100
                    const y = 20 - ((v - minS) / sRange) * 16 - 2
                    return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
                  }).join(' ')
                  const zeroY = 20 - ((0 - minS) / sRange) * 16 - 2
                  return (
                    <>
                      <line x1="0" y1={zeroY >= 0 && zeroY <= 20 ? zeroY : midY} x2="100" y2={zeroY >= 0 && zeroY <= 20 ? zeroY : midY} stroke="#64748b" strokeWidth="0.2" strokeDasharray="1 2" opacity="0.3" />
                      <path d={path} fill="none" stroke={s.spread >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="0.8" />
                    </>
                  )
                })()}
              </svg>
            )}

            {s.isOpportunity && (
              <div className="flex items-center gap-1 mt-0.5">
                {s.spread > 0 ? (
                  <>
                    <TrendingUp size={7} className="text-accent-green" />
                    <span className="text-[7px] text-accent-green">Buy {s.exchangeB}, sell {s.exchangeA}</span>
                  </>
                ) : (
                  <>
                    <TrendingDown size={7} className="text-accent-red" />
                    <span className="text-[7px] text-accent-red">Buy {s.exchangeA}, sell {s.exchangeB}</span>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Price differences between exchanges. &gt;0.1% = potential arbitrage after fees.
      </div>
    </div>
  )
}
