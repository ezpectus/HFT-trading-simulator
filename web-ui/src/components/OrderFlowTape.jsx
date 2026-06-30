import { useMemo, useRef, useEffect, useState } from 'react'
import { Printer, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { formatPrice, formatTime } from '../utils/format'

const MAX_PRINTS = 30

export default function OrderFlowTape({ fills, candles, symbol, selectedExchange }) {
  const printsRef = useRef([])
  const lastCandleTimeRef = useRef(null)
  const [, forceUpdate] = useState(0)

  // Generate prints from fills and candle updates
  useEffect(() => {
    if (!fills?.length) return

    const symFills = fills
      .filter(f => f.status === 'FILLED' && (!symbol || f.symbol === symbol) && (!selectedExchange || f.exchange === selectedExchange))
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    // Add new fills as prints
    for (const f of symFills.slice(-5)) {
      const existing = printsRef.current.find(p => p.id === f.id)
      if (!existing) {
        printsRef.current = [{
          id: f.id,
          time: f.timestamp,
          price: f.price,
          size: f.quantity,
          side: f.side,
          type: 'fill',
        }, ...printsRef.current].slice(0, MAX_PRINTS)
      }
    }
    forceUpdate(n => n + 1)
  }, [fills, symbol, selectedExchange])

  // Generate synthetic prints from candle changes
  useEffect(() => {
    if (!candles?.length) return
    const symCandles = candles.filter(c => c.symbol === symbol && c.exchange === selectedExchange)
    if (symCandles.length === 0) return

    const latest = symCandles[symCandles.length - 1]
    if (lastCandleTimeRef.current !== latest.time) {
      lastCandleTimeRef.current = latest.time
      const isBuy = latest.close >= latest.open
      const printSize = latest.volume / 3 // split into ~3 prints

      printsRef.current = [{
        id: `candle_${latest.time}_1`,
        time: latest.time,
        price: latest.close,
        size: printSize,
        side: isBuy ? 'BUY' : 'SELL',
        type: 'candle',
      }, ...printsRef.current].slice(0, MAX_PRINTS)
      forceUpdate(n => n + 1)
    }
  }, [candles, symbol, selectedExchange])

  const prints = printsRef.current

  // Calculate stats
  const stats = useMemo(() => {
    if (prints.length === 0) return null
    const buyPrints = prints.filter(p => p.side === 'BUY')
    const sellPrints = prints.filter(p => p.side === 'SELL')
    const buyVol = buyPrints.reduce((s, p) => s + p.size, 0)
    const sellVol = sellPrints.reduce((s, p) => s + p.size, 0)
    const largePrints = prints.filter(p => p.size > 0.5)
    return { buyVol, sellVol, buyCount: buyPrints.length, sellCount: sellPrints.length, largeCount: largePrints.length }
  }, [prints.length])

  function sizeColor(size) {
    if (size > 1.0) return 'text-accent-yellow font-bold'
    if (size > 0.5) return 'text-gray-200 font-medium'
    return 'text-gray-500'
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Printer size={12} className="text-accent-green" />
        Order Flow Tape
      </div>

      {prints.length === 0 ? (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Waiting for prints...</div>
      ) : (
        <>
          {/* Tape */}
          <div className="max-h-[160px] overflow-y-auto scrollbar-thin space-y-0.5">
            {prints.map((p, i) => {
              const isBuy = p.side === 'BUY'
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono ${i === 0 ? 'bg-bg-600/70' : 'bg-bg-600/20'}`}
                >
                  <span className="text-gray-600 w-10">{formatTime(p.time)}</span>
                  <span className={isBuy ? 'text-accent-green' : 'text-accent-red'}>
                    {isBuy ? <ArrowUp size={8} className="inline" /> : <ArrowDown size={8} className="inline" />}
                  </span>
                  <span className="text-gray-300 w-14">${formatPrice(p.price)}</span>
                  <span className={sizeColor(p.size)}>{p.size.toFixed(4)}</span>
                  <span className="text-gray-600 ml-auto">
                    {p.type === 'fill' ? 'FILL' : 'TICK'}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Stats */}
          {stats && (
            <div className="mt-2 pt-1.5 border-t border-bg-600 grid grid-cols-3 gap-2 text-[8px]">
              <div>
                <div className="text-gray-600">Buy Vol</div>
                <div className="text-accent-green font-mono">{stats.buyVol.toFixed(3)}</div>
              </div>
              <div>
                <div className="text-gray-600">Sell Vol</div>
                <div className="text-accent-red font-mono">{stats.sellVol.toFixed(3)}</div>
              </div>
              <div>
                <div className="text-gray-600">Large</div>
                <div className="text-accent-yellow font-mono">{stats.largeCount}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
