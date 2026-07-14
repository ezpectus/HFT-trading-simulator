import { create } from 'zustand'
import { TIMEFRAMES } from '../utils/timeframes'

const EXCHANGES = ['binance', 'bybit', 'okx']
const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']

export const useUIStore = create((set) => ({
  // Selection
  selectedExchange: 'binance',
  selectedSymbol: 'BTC/USDT',
  setSelectedExchange: (exchange) => set({ selectedExchange: exchange }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  // Tabs
  activeTab: 'account',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Chart
  timeframe: TIMEFRAMES[0],
  setTimeframe: (tf) => set({ timeframe: tf }),

  // Sim speed
  simSpeed: 1,
  setSimSpeed: (speed) => set({ simSpeed: speed }),

  // Layout
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  mobilePanel: 'chart',
  setMobilePanel: (panel) => set({ mobilePanel: panel }),

  // Sound
  soundOn: true,
  setSoundOn: (on) => set({ soundOn: on }),
  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),

  // Constants (exposed for convenience)
  EXCHANGES,
  SYMBOLS,
}))
