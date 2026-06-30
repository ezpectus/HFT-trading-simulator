import { useMemo } from 'react'
import { Route, ArrowRight, Check, X } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function SmartOrderRouter({ candles, orderbooks, symbols, exchanges, onSubmit }) {
  const routing = useMemo(() => {
    const routes = []

    for (const sym of symbols) {
      const prices = {}
      const spreads = {}

      for (const ex of exchanges) {
        const symCandles = candles.filter(c => c.exchange === ex && c.symbol === sym)
        const lastPrice = symCandles[symCandles.length - 1]?.close
        if (lastPrice) prices[ex] = lastPrice

        const ob = orderbooks?.[`${ex}|${sym}`]
        if (ob?.bids?.[0] && ob?.asks?.[0]) {
          spreads[ex] = {
            bid: ob.bids[0].price,
            ask: ob.asks[0].price,
            spread: ob.asks[0].price - ob.bids[0].price,
            bidQty: ob.bids[0].quantity,
            askQty: ob.asks[0].quantity,
          }
        }
      }

      if (Object.keys(prices).length < 2) continue

      // Best buy (lowest ask) and best sell (highest bid)
      const sortedByPrice = Object.entries(prices).sort((a, b) => a[1] - b[1])
      const cheapest = sortedByPrice[0]
      const mostExpensive = sortedByPrice[sortedByPrice.length - 1]

      const arbSpread = mostExpensive[1] - cheapest[1]
      const arbPct = cheapest[1] > 0 ? (arbSpread / cheapest[1]) * 100 : 0

      // Best spread
      let bestSpread = null
      let bestSpreadExchange = null
      for (const [ex, sp] of Object.entries(spreads)) {
        if (!bestSpread || sp.spread < bestSpread) {
          bestSpread = sp.spread
          bestSpreadExchange = ex
        }
      }

      routes.push({
        symbol: sym,
        prices,
        spreads,
        cheapest: { exchange: cheapest[0], price: cheapest[1] },
        mostExpensive: { exchange: mostExpensive[0], price: mostExpensive[1] },
        arbSpread,
        arbPct,
        bestSpread,
        bestSpreadExchange,
      })
    }

    return routes
  }, [candles, orderbooks, symbols, exchanges])

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Route size={12} className="text-accent-blue" />
        Smart Order Router
      </div>

      <div className="space-y-1.5">
        {routing.map(r => (
          <div key={r.symbol} className="bg-bg-600/50 rounded p-1.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-medium text-gray-300">{r.symbol.split('/')[0]}</span>
              {r.arbPct > 0.1 && (
                <span className="text-[8px] px-1 rounded bg-accent-yellow/20 text-accent-yellow">
                  ARB {r.arbPct.toFixed(2)}%
                </span>
              )}
            </div>

            {/* Best route */}
            <div className="flex items-center gap-1 text-[9px]">
              <div className="flex items-center gap-1">
                <span className="text-accent-green">BUY</span>
                <span className="text-gray-400">{r.cheapest.exchange}</span>
                <span className="font-mono text-gray-300">${formatPrice(r.cheapest.price)}</span>
              </div>
              <ArrowRight size={10} className="text-gray-600" />
              <div className="flex items-center gap-1">
                <span className="text-accent-red">SELL</span>
                <span className="text-gray-400">{r.mostExpensive.exchange}</span>
                <span className="font-mono text-gray-300">${formatPrice(r.mostExpensive.price)}</span>
              </div>
            </div>

            {/* All exchange prices */}
            <div className="grid grid-cols-3 gap-1 mt-1 text-[8px]">
              {Object.entries(r.prices).map(([ex, price]) => (
                <div key={ex} className="flex items-center gap-0.5">
                  <span className="text-gray-600">{ex}</span>
                  <span className="font-mono text-gray-400">${formatPrice(price, 0)}</span>
                  {ex === r.cheapest.exchange && <Check size={8} className="text-accent-green" />}
                </div>
              ))}
            </div>

            {/* Spread info */}
            {r.bestSpread !== null && (
              <div className="text-[8px] text-gray-600 mt-1">
                Tightest spread: {r.bestSpreadExchange} (${r.bestSpread.toFixed(2)})
              </div>
            )}
          </div>
        ))}
      </div>

      {routing.length === 0 && (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No routing data available</div>
      )}

      <div className="mt-2 pt-1.5 border-t border-bg-600 text-[8px] text-gray-600">
        Finds best exchange to BUY (lowest price) and SELL (highest price). Flags arbitrage opportunities &gt; 0.1%.
      </div>
    </div>
  )
}
