import { useMemo } from 'react'
import { Shield, TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react'
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

export default function HedgingSuggestions({ candles, accounts, symbols, exchange }) {
  const suggestions = useMemo(() => {
    // Get open positions
    const positions = []
    const acc = accounts?.[exchange]
    if (acc?.positions) {
      for (const p of acc.positions) {
        positions.push({
          symbol: p.symbol,
          side: p.side,
          quantity: p.quantity,
          uPnl: p.unrealized_pnl || 0,
          entryPrice: p.entry_price,
        })
      }
    }

    if (positions.length === 0) return { suggestions: [], hasPositions: false }

    // Get price series for correlation
    const priceSeries = {}
    for (const sym of symbols) {
      priceSeries[sym] = candles
        .filter(c => c.exchange === exchange && c.symbol === sym)
        .map(c => c.close)
    }

    // For each position, find best hedge
    const hedges = []
    for (const pos of positions) {
      const posPrices = priceSeries[pos.symbol]
      if (!posPrices || posPrices.length < 10) continue

      const candidates = []
      for (const sym of symbols) {
        if (sym === pos.symbol) continue
        const symPrices = priceSeries[sym]
        if (!symPrices || symPrices.length < 10) continue

        const corr = correlation(posPrices, symPrices)
        const lastPrice = symPrices[symPrices.length - 1]

        // Hedge ratio: inverse correlation * position qty
        const hedgeSide = pos.side === 'LONG' ? 'SHORT' : 'LONG'
        const hedgeQty = Math.abs(corr) > 0.3 ? pos.quantity * Math.abs(corr) * 0.5 : 0

        candidates.push({
          hedgeSymbol: sym,
          correlation: corr,
          hedgeSide,
          hedgeQty,
          hedgePrice: lastPrice,
          effectiveness: Math.abs(corr) * 100,
        })
      }

      candidates.sort((a, b) => b.effectiveness - a.effectiveness)
      const best = candidates[0]
      if (best && best.effectiveness > 30) {
        hedges.push({
          ...pos,
          ...best,
          posPrice: posPrices[posPrices.length - 1],
        })
      }
    }

    return { suggestions: hedges, hasPositions: true }
  }, [candles, accounts, symbols, exchange])

  if (!suggestions.hasPositions) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Shield size={12} className="text-accent-blue" />
          Hedging Suggestions
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No open positions to hedge</div>
      </div>
    )
  }

  if (suggestions.suggestions.length === 0) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Shield size={12} className="text-accent-blue" />
          Hedging Suggestions
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No suitable hedges found (low correlation)</div>
      </div>
    )
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Shield size={12} className="text-accent-blue" />
        Hedging Suggestions
      </div>

      <div className="space-y-1.5">
        {suggestions.suggestions.map((h, i) => (
          <div key={i} className="bg-bg-600/50 rounded p-1.5">
            {/* Position → Hedge */}
            <div className="flex items-center gap-1.5 mb-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium text-gray-300">{h.symbol.split('/')[0]}</span>
                <span className={'text-[8px] px-1 rounded ' + (h.side === 'LONG' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red')}>
                  {h.side}
                </span>
                <span className="text-[8px] text-gray-600">{h.quantity.toFixed(4)}</span>
              </div>
              <ArrowRightLeft size={10} className="text-gray-600" />
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium text-accent-blue">{h.hedgeSymbol.split('/')[0]}</span>
                <span className={'text-[8px] px-1 rounded ' + (h.hedgeSide === 'LONG' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red')}>
                  {h.hedgeSide}
                </span>
                <span className="text-[8px] text-gray-600">{h.hedgeQty.toFixed(4)}</span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-1 text-[8px]">
              <div>
                <span className="text-gray-600">Corr: </span>
                <span className={h.correlation > 0 ? 'text-accent-green' : 'text-accent-red'}>
                  {h.correlation.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Eff: </span>
                <span className="text-gray-300">{h.effectiveness.toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-gray-600">@ </span>
                <span className="text-gray-300">${formatPrice(h.hedgePrice)}</span>
              </div>
            </div>

            {/* Effectiveness bar */}
            <div className="h-1 bg-bg-600 rounded-full overflow-hidden mt-1">
              <div
                className={'h-full rounded-full ' + (h.effectiveness > 70 ? 'bg-accent-green' : h.effectiveness > 50 ? 'bg-accent-yellow' : 'bg-gray-500')}
                style={{ width: `${h.effectiveness}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1.5 pt-1.5 border-t border-bg-600 text-[8px] text-gray-600">
        Hedge qty = position × |correlation| × 0.5. High correlation = better hedge.
      </div>
    </div>
  )
}
