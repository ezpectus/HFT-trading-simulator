import { useMemo } from 'react'
import { useUIStore } from './useUIStore'
import { useTradingStore } from './useTradingStore'
import { useToastStore } from './useToastStore'

/**
 * Builds the context object that registry.js props builders expect,
 * but reads from Zustand stores instead of receiving props from App.jsx.
 *
 * This maintains backward compatibility with the 200+ panel entries in
 * registry.js while eliminating prop drilling from App.jsx.
 */
export function usePanelContext() {
  const {
    selectedExchange,
    selectedSymbol,
    setSelectedSymbol,
    EXCHANGES,
    SYMBOLS,
  } = useUIStore()

  const {
    candles,
    prices,
    accounts,
    arbitrage,
    fills,
    orderbooks,
    fundingRates,
    candlesToFunding,
    newsEvent,
    weekendMode,
    replayPaused,
    tradingActive,
    exchangeConnected,
    exchangeLatency,
    submitOrder,
    closePosition,
    sendSpeedChange,
    sendConfigUpdate,
    toggleReplay,
    scrubReplay,
    startTrading,
    stopTrading,
    signals,
    regime,
    backtestResult,
    circuitBreaker,
    signalConnected,
    signalLatency,
    sendSignalMessage,
    chartCandles,
    currentPrice,
  } = useTradingStore()

  const { toasts, addToast } = useToastStore()

  // Build the exchange object that registry expects (same shape as useExchangeData hook)
  const exchange = useMemo(() => ({
    candles,
    prices,
    accounts,
    arbitrage,
    fills,
    orderbooks,
    fundingRates,
    candlesToFunding,
    newsEvent,
    weekendMode,
    replayPaused,
    tradingActive,
    connected: exchangeConnected,
    latency: exchangeLatency,
    submitOrder,
    closePosition,
    sendSpeedChange,
    sendConfigUpdate,
    toggleReplay,
    scrubReplay,
    startTrading,
    stopTrading,
  }), [candles, prices, accounts, arbitrage, fills, orderbooks, fundingRates,
      candlesToFunding, newsEvent, weekendMode, replayPaused, tradingActive,
      exchangeConnected, exchangeLatency, submitOrder, closePosition,
      sendSpeedChange, sendConfigUpdate, toggleReplay, scrubReplay,
      startTrading, stopTrading])

  // Build the signals object that registry expects (same shape as useSignalData hook)
  const signalsObj = useMemo(() => ({
    signals,
    regime,
    backtestResult,
    circuitBreaker,
    connected: signalConnected,
    latency: signalLatency,
    sendSignalMessage,
  }), [signals, regime, backtestResult, circuitBreaker, signalConnected,
      signalLatency, sendSignalMessage])

  return useMemo(() => ({
    exchange,
    signals: signalsObj,
    selectedExchange,
    selectedSymbol,
    chartCandles,
    currentPrice,
    SYMBOLS,
    EXCHANGES,
    toasts,
    addToast,
    setSelectedSymbol,
  }), [exchange, signalsObj, selectedExchange, selectedSymbol, chartCandles,
      currentPrice, SYMBOLS, EXCHANGES, toasts, addToast, setSelectedSymbol])
}
