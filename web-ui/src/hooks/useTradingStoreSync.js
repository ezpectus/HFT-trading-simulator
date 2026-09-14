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
      auditLogs: exchange.auditLogs,
      lastError: exchange.lastError,
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
      openOrders: exchange.openOrders,
      cancelOrder: exchange.cancelOrder,
      cancelAllOrders: exchange.cancelAllOrders,
      exchangeReconnects: exchange.reconnects,
      exchangeConnect: exchange.connect,
      exchangeNextReconnectIn: exchange.nextReconnectIn,
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
      // S230: server-compute results — panels read these via ctx.signals.*;
      // dropping them left 7 panels drawing fake 30s timeouts on live answers.
      portfolioResult: signals.portfolioResult,
      volSurfaceResult: signals.volSurfaceResult,
      cvarResult: signals.cvarResult,
      stressTestResult: signals.stressTestResult,
      positionSizeResult: signals.positionSizeResult,
      hawkesResult: signals.hawkesResult,
      fundingArbResult: signals.fundingArbResult,
      authState: signals.authState,
      signalConnected: signals.connected,
      signalLatency: signals.latency,
      sendSignalMessage: signals.sendSignalMessage,
      signalConnect: signals.connect,
      signalNextReconnectIn: signals.nextReconnectIn,
    })
  }, [signals, setSignalData])
}
