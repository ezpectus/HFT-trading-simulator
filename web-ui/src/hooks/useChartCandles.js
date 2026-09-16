import { useMemo, useEffect } from 'react'
import { aggregateCandles } from '../utils/timeframes'
import { useTradingStore } from '../stores/useTradingStore'

/** Selected-exchange/symbol candles aggregated by timeframe + derived
 *  price/change, synced into the trading store for the panel registry.
 * Extracted from App.jsx. */
export function useChartCandles(exchange, selectedExchange, selectedSymbol, timeframe) {
  const setDerivedData = useTradingStore((s) => s.setDerivedData)

  const chartCandles = useMemo(() => {
    const raw = exchange.candles
      .filter(c => c.exchange === selectedExchange && c.symbol === selectedSymbol)
      .map(c => ({
        time: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))
    return aggregateCandles(raw, timeframe.factor)
  }, [exchange.candles, selectedExchange, selectedSymbol, timeframe])

  const currentPrice = exchange.prices[selectedExchange]?.[selectedSymbol] || 0

  // Calculate price change from recent candles
  const priceChange = (() => {
    const candles = chartCandles
    if (candles.length < 2) return 0
    const first = candles[0].close
    const last = candles[candles.length - 1].close
    if (first === 0) return 0
    return ((last - first) / first) * 100
  })()

  // Sync derived data to Zustand store (for PanelContainer + registry)
  useEffect(() => {
    setDerivedData({ chartCandles, currentPrice, priceChange })
  }, [chartCandles, currentPrice, priceChange, setDerivedData])

  return { chartCandles, currentPrice, priceChange }
}
