import { create } from 'zustand'

/**
 * Trading data store — holds exchange and signal data that was previously
 * prop-drilled from App.jsx through hooks. The hooks (useExchangeData,
 * useSignalData) call the setters to populate this store. Components
 * read directly from the store instead of receiving props.
 *
 * This eliminates the massive prop drilling chain:
 *   App.jsx → PanelContainer context → registry props(ctx) → Component
 */
export const useTradingStore = create((set) => ({
  // === Exchange data ===
  candles: [],
  prices: {},
  accounts: {},
  arbitrage: null,
  fills: [],
  orderbooks: {},
  fundingRates: {},
  candlesToFunding: null,
  newsEvent: null,
  weekendMode: false,
  replayPaused: false,
  tradingActive: true,
  exchangeConnected: false,
  exchangeLatency: 0,
  exchangeReconnects: 0,

  // Exchange actions (set by hook)
  submitOrder: null,
  closePosition: null,
  sendSpeedChange: null,
  sendConfigUpdate: null,
  toggleReplay: null,
  scrubReplay: null,
  startTrading: null,
  stopTrading: null,

  // === Signal data ===
  signals: [],
  regime: null,
  backtestResult: null,
  circuitBreaker: null,
  signalConnected: false,
  signalLatency: 0,
  sendSignalMessage: null,

  // === Batch setters (called by hooks) ===
  setExchangeData: (data) => set(data),
  setSignalData: (data) => set(data),

  // === Derived data (set by App.jsx memo) ===
  chartCandles: [],
  currentPrice: 0,
  priceChange: 0,
  setDerivedData: (data) => set(data),
}))
