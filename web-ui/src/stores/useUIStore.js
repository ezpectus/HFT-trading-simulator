import { create } from 'zustand'
import { TIMEFRAMES } from '../utils/timeframes'

const EXCHANGES = ['binance', 'bybit', 'okx']

// Symbols — must match shared_config.yaml `symbols:` section
// Vite frontend cannot import YAML at runtime, so symbols are duplicated here.
// Keep in sync when adding/removing trading pairs.
const SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
  'ADA/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', 'SHIB/USDT',
  'AVAX/USDT', 'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT',
  'NEAR/USDT', 'XLM/USDT', 'ALGO/USDT', 'VET/USDT', 'FIL/USDT',
  'APT/USDT', 'INJ/USDT', 'OP/USDT', 'ARB/USDT', 'QNT/USDT',
  'ETC/USDT', 'HBAR/USDT', 'ICP/USDT', 'LDO/USDT', 'GRT/USDT',
  'STX/USDT', 'AAVE/USDT', 'MKR/USDT', 'COMP/USDT', 'SUSHI/USDT',
  'CRV/USDT', '1INCH/USDT', 'SNX/USDT', 'MANA/USDT', 'SAND/USDT',
  'AXS/USDT', 'ENJ/USDT', 'FTM/USDT', 'CRO/USDT', 'GLM/USDT',
  'KAVA/USDT', 'ROSE/USDT', 'CELO/USDT', 'MINA/USDT'
]

// Symbol categories for filtering
const SYMBOL_CATEGORIES = {
  'Major': ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT'],
  'DeFi': ['UNI/USDT', 'AAVE/USDT', 'MKR/USDT', 'COMP/USDT', 'SUSHI/USDT', 'CRV/USDT', '1INCH/USDT', 'LDO/USDT', 'SNX/USDT'],
  'Layer 1': ['SOL/USDT', 'AVAX/USDT', 'DOT/USDT', 'ATOM/USDT', 'NEAR/USDT', 'ALGO/USDT', 'FIL/USDT', 'APT/USDT', 'INJ/USDT', 'OP/USDT', 'ARB/USDT'],
  'Layer 2': ['MATIC/USDT', 'OP/USDT', 'ARB/USDT'],
  'Gaming': ['MANA/USDT', 'SAND/USDT', 'AXS/USDT', 'ENJ/USDT'],
  'Meme': ['DOGE/USDT', 'SHIB/USDT'],
  'Other': ['LTC/USDT', 'XLM/USDT', 'VET/USDT', 'QNT/USDT', 'ETC/USDT', 'HBAR/USDT', 'ICP/USDT', 'GRT/USDT', 'STX/USDT', 'FTM/USDT', 'CRO/USDT', 'GLM/USDT', 'KAVA/USDT', 'ROSE/USDT', 'CELO/USDT', 'MINA/USDT']
}

export const useUIStore = create((set, get) => ({
  // Selection
  selectedExchange: 'binance',
  selectedSymbol: 'BTC/USDT',
  setSelectedExchange: (exchange) => set({ selectedExchange: exchange }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  // Symbol search and filter
  symbolSearch: '',
  setSymbolSearch: (search) => {
    set({ symbolSearch: search })
    get()._recomputeFilteredSymbols()
  },
  selectedCategory: 'All',
  setSelectedCategory: (category) => {
    set({ selectedCategory: category })
    get()._recomputeFilteredSymbols()
  },

  // Cached filtered symbols — only recomputed when search/category changes
  _filteredSymbols: SYMBOLS,
  _recomputeFilteredSymbols: () => {
    const { symbolSearch, selectedCategory } = get()
    let filtered = SYMBOLS
    if (selectedCategory !== 'All' && SYMBOL_CATEGORIES[selectedCategory]) {
      filtered = SYMBOL_CATEGORIES[selectedCategory]
    }
    if (symbolSearch) {
      const searchLower = symbolSearch.toLowerCase()
      filtered = filtered.filter(s => s.toLowerCase().includes(searchLower))
    }
    set({ _filteredSymbols: filtered })
  },

  // Get filtered symbols (returns cached result)
  getFilteredSymbols: () => get()._filteredSymbols,

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
  SYMBOL_CATEGORIES,
}))
