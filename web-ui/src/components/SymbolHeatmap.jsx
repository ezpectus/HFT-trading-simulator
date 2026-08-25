import { useMemo, useState, memo } from 'react'
import { Grid3x3, ArrowUpDown } from 'lucide-react'
import { formatPct, formatVolume } from '../utils/format'

const SORT_OPTIONS = [
  { id: 'change', label: 'Change %' },
  { id: 'volume', label: 'Volume' },
  { id: 'alpha', label: 'A-Z' },
]

const CATEGORIES = ['All', 'Majors', 'Altcoins', 'DeFi', 'L2']

const SYMBOL_CATEGORIES = {
  Majors: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'DOT/USDT', 'LTC/USDT'],
  Altcoins: ['SOL/USDT', 'DOGE/USDT', 'MATIC/USDT', 'SHIB/USDT', 'AVAX/USDT', 'LINK/USDT', 'ATOM/USDT'],
  DeFi: ['UNI/USDT', 'AAVE/USDT', 'SUSHI/USDT', 'CRV/USDT', 'COMP/USDT', 'SNX/USDT', 'YFI/USDT'],
  L2: ['ARB/USDT', 'OP/USDT', 'MATIC/USDT', 'STRK/USDT', 'MNT/USDT', 'BLAST/USDT', 'SCROLL/USDT'],
}

function heatBgStyle(pct) {
  if (pct == null || isNaN(pct)) return {}
  const abs = Math.min(Math.abs(pct), 5)
  const intensity = abs / 5
  if (pct >= 0) {
    return { backgroundColor: `rgba(14, 203, 129, ${0.15 + intensity * 0.75})` }
  }
  return { backgroundColor: `rgba(246, 70, 93, ${0.15 + intensity * 0.75})` }
}

const SymbolHeatmap = memo(function SymbolHeatmap({ candles, prices, symbols, onSelectSymbol, exchange }) {
  const [sortMode, setSortMode] = useState('change')
  const [category, setCategory] = useState('All')
  const [hovered, setHovered] = useState(null)

  const cellData = useMemo(() => {
    const symList = symbols && symbols.length ? symbols : []
    return symList.map(sym => {
      const symCandles = (candles || []).filter(c => c.symbol === sym && (!exchange || c.exchange === exchange))
      const lastCandle = symCandles[symCandles.length - 1]
      const firstCandle = symCandles[0]
      const close = lastCandle?.close || 0
      const open = firstCandle?.open || close
      const changePct = open > 0 ? ((close - open) / open) * 100 : 0
      const volume = symCandles.reduce((s, c) => s + (c.volume || 0), 0)
      const price = prices?.[exchange]?.[sym] || close
      return {
        symbol: sym,
        changePct,
        volume,
        price,
        open: firstCandle?.open || 0,
        high: Math.max(...symCandles.map(c => c.high || 0), 0),
        low: Math.min(...symCandles.map(c => c.low || 0), Infinity),
        close,
      }
    })
  }, [candles, prices, symbols, exchange])

  const filtered = useMemo(() => {
    let result = cellData
    if (category !== 'All' && SYMBOL_CATEGORIES[category]) {
      const catSet = new Set(SYMBOL_CATEGORIES[category])
      result = result.filter(d => catSet.has(d.symbol))
    }
    const sorted = [...result]
    if (sortMode === 'change') sorted.sort((a, b) => b.changePct - a.changePct)
    else if (sortMode === 'volume') sorted.sort((a, b) => b.volume - a.volume)
    else if (sortMode === 'alpha') sorted.sort((a, b) => a.symbol.localeCompare(b.symbol))
    return sorted
  }, [cellData, category, sortMode])

  if (!cellData.length) {
    return (
      <div className="p-3 bg-bg-800 text-gray-200 text-xs h-full flex flex-col">
        <div className="flex items-center gap-1.5 mb-2 text-gray-400">
          <Grid3x3 size={14} />
          <span>Symbol Heatmap</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-600">
          No symbol data available
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-gray-400">
          <Grid3x3 size={14} />
          <span>Symbol Heatmap</span>
        </div>
        <button
          onClick={() => {
            const idx = SORT_OPTIONS.findIndex(o => o.id === sortMode)
            setSortMode(SORT_OPTIONS[(idx + 1) % SORT_OPTIONS.length].id)
          }}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-accent-yellow transition-colors"
          title={`Sort: ${SORT_OPTIONS.find(o => o.id === sortMode)?.label}`}
        >
          <ArrowUpDown size={11} />
          {SORT_OPTIONS.find(o => o.id === sortMode)?.label}
        </button>
      </div>

      <div className="flex gap-1 mb-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
              category === cat ? 'bg-accent-blue text-white' : 'bg-bg-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
          {filtered.map(cell => (
            <div
              key={cell.symbol}
              onClick={() => onSelectSymbol?.(cell.symbol)}
              onMouseEnter={() => setHovered(cell.symbol)}
              onMouseLeave={() => setHovered(null)}
              className="relative p-1.5 cursor-pointer rounded transition-all hover:ring-1 hover:ring-accent-blue"
              style={heatBgStyle(cell.changePct)}
            >
              <div className="text-[10px] font-bold truncate">{cell.symbol.replace('/USDT', '')}</div>
              <div className="text-[11px] font-mono font-semibold">{formatPct(cell.changePct)}</div>
              <div className="text-[9px] opacity-80">{formatVolume(cell.volume)}</div>

              {hovered === cell.symbol && (
                <div className="absolute z-20 left-1/2 -translate-x-1/2 top-full mt-1 p-2 bg-bg-900 border border-bg-600 rounded shadow-lg text-[10px] text-gray-300 whitespace-nowrap pointer-events-none">
                  <div className="font-bold text-gray-200">{cell.symbol}</div>
                  <div>O: {cell.open.toFixed(2)} H: {cell.high.toFixed(2)}</div>
                  <div>L: {isFinite(cell.low) ? cell.low.toFixed(2) : '--'} C: {cell.close.toFixed(2)}</div>
                  <div>Vol: {formatVolume(cell.volume)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

export default SymbolHeatmap
