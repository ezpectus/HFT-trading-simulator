import { useEffect, useCallback } from 'react'

/** Keeps detached (floating) panels fed with live data + provides the
 *  detach handler that snapshots current data. Extracted from App.jsx (S015). */
export function useDetachedPanelSync({
  exchange, signals, chartCandles, currentPrice,
  selectedExchange, selectedSymbol, isDetached, updateDetached, detachPanel,
}) {
  // Update detached panels with live data
  useEffect(() => {
    if (isDetached('orderbook')) {
      updateDetached('orderbook', {
        orderbookData: exchange.orderbooks[`${selectedExchange}|${selectedSymbol}`],
        currentPrice,
      })
    }
    if (isDetached('account')) {
      updateDetached('account', { account: exchange.accounts[selectedExchange] })
    }
    if (isDetached('signals')) {
      updateDetached('signals', { signals: signals.signals })
    }
    if (isDetached('arbitrage')) {
      updateDetached('arbitrage', { arbitrage: exchange.arbitrage })
    }
    if (isDetached('chart')) {
      updateDetached('chart', {
        candles: chartCandles.slice(-50),
        symbol: selectedSymbol,
        exchange: selectedExchange,
      })
    }
  }, [exchange, signals, chartCandles, currentPrice, selectedExchange, selectedSymbol, isDetached, updateDetached])

  const handleDetach = useCallback((panelId) => {
    if (isDetached(panelId)) return
    const dataMap = {
      orderbook: {
        orderbookData: exchange.orderbooks[`${selectedExchange}|${selectedSymbol}`],
        currentPrice,
      },
      account: { account: exchange.accounts[selectedExchange] },
      signals: { signals: signals.signals },
      arbitrage: { arbitrage: exchange.arbitrage },
      chart: { candles: chartCandles.slice(-50), symbol: selectedSymbol, exchange: selectedExchange },
    }
    detachPanel(panelId, dataMap[panelId])
  }, [exchange, signals, chartCandles, currentPrice, selectedExchange, selectedSymbol, isDetached, detachPanel])

  return handleDetach
}
