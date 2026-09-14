import { useEffect, useCallback } from 'react'

/** Keeps detached (floating) panels fed with live data + provides the
 *  detach handler that snapshots current data. Extracted from App.jsx (S015). */
export function useDetachedPanelSync({
  exchange, chartCandles, currentPrice,
  selectedExchange, selectedSymbol, isDetached, updateDetached, detachPanel,
}) {
  // Update detached panels with live data (only chart/orderbook can detach —
  // see PANEL_CONFIG in useDetachablePanels).
  useEffect(() => {
    if (isDetached('orderbook')) {
      updateDetached('orderbook', {
        orderbookData: exchange.orderbooks[`${selectedExchange}|${selectedSymbol}`],
        currentPrice,
      })
    }
    if (isDetached('chart')) {
      updateDetached('chart', {
        candles: chartCandles.slice(-50),
        symbol: selectedSymbol,
        exchange: selectedExchange,
      })
    }
  }, [exchange, chartCandles, currentPrice, selectedExchange, selectedSymbol, isDetached, updateDetached])

  const handleDetach = useCallback((panelId) => {
    if (isDetached(panelId)) return
    const dataMap = {
      orderbook: {
        orderbookData: exchange.orderbooks[`${selectedExchange}|${selectedSymbol}`],
        currentPrice,
      },
      chart: { candles: chartCandles.slice(-50), symbol: selectedSymbol, exchange: selectedExchange },
    }
    detachPanel(panelId, dataMap[panelId])
  }, [exchange, chartCandles, currentPrice, selectedExchange, selectedSymbol, isDetached, detachPanel])

  return handleDetach
}
