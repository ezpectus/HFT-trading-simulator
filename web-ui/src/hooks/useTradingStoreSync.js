import { useEffect } from 'react'
import { useTradingStore } from '../stores/useTradingStore'

/** Push live exchange + signal hook data into the Zustand trading store
 *  so PanelContainer/registry can read it. Extracted from App.jsx (S015). */
export function useTradingStoreSync(exchange, signals) {
  const setExchangeData = useTradingStore((s) => s.setExchangeData)
  const setSignalData = useTradingStore((s) => s.setSignalData)

  useEffect(() => {
    setExchangeData({
      candles: exchange.candles,
      prices: exchange.prices,
      accounts: exchange.accounts,
      arbitrage: exchange.arbitrage,
      fills: exchange.fills,
      orderbooks: exchange.orderbooks,
      fundingRates: exchange.fundingRates,
      candlesToFunding: exchange.candlesToFunding,
      newsEvent: exchange.newsEvent,
      weekendMode: exchange.weekendMode,
      replayPaused: exchange.replayPaused,
      tradingActive: exchange.tradingActive,
      optionsChain: exchange.optionsChain,
      exchangeConnected: exchange.connected,
      exchangeLatency: exchange.latency,
      submitOrder: exchange.submitOrder,
      closePosition: exchange.closePosition,
      requestOptionsChain: exchange.requestOptionsChain,
      sendSpeedChange: exchange.sendSpeedChange,
      sendConfigUpdate: exchange.sendConfigUpdate,
      toggleReplay: exchange.toggleReplay,
      scrubReplay: exchange.scrubReplay,
      startTrading: exchange.startTrading,
      stopTrading: exchange.stopTrading,
    })
  }, [exchange, setExchangeData])

  useEffect(() => {
    setSignalData({
      signals: signals.signals,
      regime: signals.regime,
      backtestResult: signals.backtestResult,
      circuitBreaker: signals.circuitBreaker,
      signalConnected: signals.connected,
      signalLatency: signals.latency,
      sendSignalMessage: signals.sendSignalMessage,
    })
  }, [signals, setSignalData])
}
