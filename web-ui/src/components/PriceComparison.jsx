import { useState, useMemo } from 'react'
import { ArrowRightLeft, Search } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { EmptyState } from './LoadingSkeleton'
import { useDebounce } from '../hooks/useDebounce'

export default function PriceComparison({ prices, symbols, selectedSymbol, exchanges }) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const filteredSymbols = useMemo(() => {
    if (!debouncedSearch) return symbols
    const q = debouncedSearch.toUpperCase()
    return symbols.filter(s => s.toUpperCase().includes(q))
  }, [symbols, debouncedSearch])

  if (!prices || !Object.keys(prices).length) {
    return (
      <EmptyState
        icon={ArrowRightLeft}
        title="Waiting for price data"
        subtitle="Cross-exchange prices will appear here when connected"
      />
    )
  }

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-xs font-medium text-gray-400">
          Cross-Exchange Prices
        </span>
        <div className="relative">
          <Search size={10} className="absolute left-1 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-16 bg-bg-600 border border-bg-500  pl-4 pr-1 py-0.5 text-[9px] text-gray-200 outline-none focus:border-accent-blue"
            aria-label="Search symbols"
          />
        </div>
      </div>

      {filteredSymbols.map(sym => {
        const exchangePrices = exchanges
          .map(ex => ({ exchange: ex, price: prices[ex]?.[sym] || 0 }))
          .filter(p => p.price > 0)

        if (exchangePrices.length < 2) return null

        // Find best bid (highest) and best ask (lowest)
        const sorted = [...exchangePrices].sort((a, b) => a.price - b.price)
        const lowest = sorted[0]
        const highest = sorted[sorted.length - 1]
        const spread = highest.price - lowest.price
        const spreadBps = (spread / lowest.price) * 10000
        const isSelected = sym === selectedSymbol

        return (
          <div
            key={sym}
            className={`bg-bg-700  p-2.5 ${isSelected ? 'ring-1 ring-accent-blue' : ''}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-300">{sym}</span>
              {spreadBps > 5 && (
                <span className="text-[9px] px-1.5 py-0.5  bg-accent-green/20 text-accent-green font-medium">
                  ARB {spreadBps.toFixed(1)}bps
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {exchangePrices.map(({ exchange, price }) => {
                const isLowest = exchange === lowest.exchange
                const isHighest = exchange === highest.exchange
                return (
                  <div
                    key={exchange}
                    className={` p-1.5 text-center ${
                      isLowest ? 'bg-accent-red/10' : isHighest ? 'bg-accent-green/10' : 'bg-bg-600'
                    }`}
                  >
                    <div className="text-[9px] text-gray-500 uppercase">{exchange}</div>
                    <div className={`font-mono text-xs font-medium ${
                      isLowest ? 'text-accent-red' : isHighest ? 'text-accent-green' : 'text-gray-200'
                    }`}>
                      ${formatPrice(price)}
                    </div>
                  </div>
                )
              })}
            </div>

            {spreadBps > 0 && (
              <div className="mt-1 text-[10px] text-gray-500 font-mono text-center">
                Spread: ${formatPrice(spread, 2)} ({spreadBps.toFixed(1)} bps)
                {' · '}
                Buy <span className="text-accent-red">{lowest.exchange}</span>
                {' → '}
                Sell <span className="text-accent-green">{highest.exchange}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
