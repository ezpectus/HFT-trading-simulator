import { memo, useState, useMemo } from 'react'
import { Star, Plus, X, TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { EmptyState } from './LoadingSkeleton'
import { useLocalStorage } from '../hooks/useLocalStorage'

const WATCHLIST_KEY = 'trading-sim-watchlist'
const SORT_KEY = 'trading-sim-watchlist-sort'
const DEFAULT_WATCHLIST = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']
const SORT_OPTIONS = [
  { id: 'symbol', label: 'Symbol' },
  { id: 'price', label: 'Price' },
  { id: 'change', label: 'Change %' },
]

function Watchlist({ candles, prices, onSelectSymbol }) {
  const [watchlist, setWatchlist] = useLocalStorage(WATCHLIST_KEY, DEFAULT_WATCHLIST)
  const [sortMode, setSortMode] = useLocalStorage(SORT_KEY, 'symbol')
  const [showAdd, setShowAdd] = useState(false)
  const [newSymbol, setNewSymbol] = useState('')

  const handleAdd = () => {
    const sym = newSymbol.trim().toUpperCase()
    if (sym && !watchlist.includes(sym)) {
      setWatchlist([...watchlist, sym])
      setNewSymbol('')
      setShowAdd(false)
    }
  }

  const handleRemove = (sym) => {
    setWatchlist(watchlist.filter(s => s !== sym))
  }

  const cycleSortMode = () => {
    const idx = SORT_OPTIONS.findIndex(o => o.id === sortMode)
    setSortMode(SORT_OPTIONS[(idx + 1) % SORT_OPTIONS.length].id)
  }

  const items = useMemo(() => {
    const raw = watchlist.map(sym => {
      const symCandles = candles.filter(c => c.symbol === sym)
      const latest = symCandles[symCandles.length - 1]
      const price = latest?.close || prices[sym] || 0

      const recent = symCandles.slice(-20)
      let change = 0
      if (recent.length >= 2) {
        const first = recent[0].close
        const last = recent[recent.length - 1].close
        change = first > 0 ? ((last - first) / first) * 100 : 0
      }

      const exchanges = {}
      for (const c of symCandles.slice(-3)) {
        exchanges[c.exchange] = c.close
      }
      const bestExchange = Object.entries(exchanges).sort((a, b) => b[1] - a[1])[0]

      return { symbol: sym, price, change, bestExchange }
    })

    if (sortMode === 'price') return raw.sort((a, b) => b.price - a.price)
    if (sortMode === 'change') return raw.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    return raw.sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [watchlist, candles, prices, sortMode])

  return (
    <div className="bg-bg-700  p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Star size={12} className="text-accent-yellow" />
        Watchlist
        <div className="flex-1" />
        <button
          onClick={cycleSortMode}
          className="flex items-center gap-0.5 text-gray-600 hover:text-gray-400 transition-colors"
          title={`Sort by ${SORT_OPTIONS.find(o => o.id === sortMode)?.label || 'symbol'}`}
        >
          <ArrowUpDown size={10} />
          {SORT_OPTIONS.find(o => o.id === sortMode)?.label || 'Symbol'}
        </button>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-gray-500 hover:text-accent-yellow transition-colors"
          title="Add symbol"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Add input */}
      {showAdd && (
        <div className="flex gap-1 mb-2">
          <input
            type="text"
            value={newSymbol}
            onChange={e => setNewSymbol(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. ADA/USDT"
            className="flex-1 bg-bg-800 border border-bg-600  px-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-accent-yellow"
            autoFocus
          />
          <button
            onClick={handleAdd}
            className="px-2 py-0.5 text-[10px]  bg-accent-yellow/20 text-accent-yellow"
          >
            Add
          </button>
        </div>
      )}

      {/* Watchlist items */}
      <div className="space-y-0.5">
        {items.map(item => (
          <div
            key={item.symbol}
            className="flex items-center gap-2 px-1.5 py-1  hover:bg-bg-600/50 cursor-pointer group"
            onClick={() => onSelectSymbol?.(item.symbol)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium text-gray-300">{item.symbol.split('/')[0]}</span>
                {item.bestExchange && (
                  <span className="text-[7px] text-gray-600">{item.bestExchange[0]}</span>
                )}
              </div>
              <div className="text-[8px] text-gray-600">
                {item.price > 0 ? `$${formatPrice(item.price)}` : 'no data'}
              </div>
            </div>
            <div className={'flex items-center gap-0.5 text-[9px] font-mono ' +
              (item.change >= 0 ? 'text-accent-green' : 'text-accent-red')}>
              {item.change >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
              {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleRemove(item.symbol) }}
              className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-accent-red transition-all"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <EmptyState
          icon={Star}
          title="No symbols in watchlist"
          subtitle="Click + to add a symbol"
        />
      )}
    </div>
  )
}

export default memo(Watchlist)
