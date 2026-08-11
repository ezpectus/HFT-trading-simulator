import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// Exchange-specific theme configurations
const EXCHANGE_THEMES = {
  binance: {
    name: 'Binance',
    primary: '#FCD535',
    primaryDark: '#C0A328',
    background: '#0B0E11',
    surface: '#1E2329',
    text: '#EAECEF',
    textSecondary: '#848E9C',
    success: '#0ECB81',
    danger: '#F6465D',
    warning: '#FCD535',
    border: '#2B3139',
    grid: '#2B3139',
    accent: '#FCD535',
  },
  bybit: {
    name: 'Bybit',
    primary: '#F7A600',
    primaryDark: '#D68B00',
    background: '#050505',
    surface: '#191919',
    text: '#E0E0E0',
    textSecondary: '#888888',
    success: '#00E396',
    danger: '#FF4560',
    warning: '#F7A600',
    border: '#333333',
    grid: '#333333',
    accent: '#F7A600',
  },
  coinbase: {
    name: 'Coinbase',
    primary: '#0052FF',
    primaryDark: '#0039B3',
    background: '#000000',
    surface: '#121212',
    text: '#FFFFFF',
    textSecondary: '#A0A0A0',
    success: '#00C853',
    danger: '#FF3D00',
    warning: '#FFAB00',
    border: '#2A2A2A',
    grid: '#2A2A2A',
    accent: '#0052FF',
  },
}

// Exchange-specific layout configurations
const EXCHANGE_LAYOUTS = {
  binance: {
    orderFormPosition: 'bottom',
    orderBookPosition: 'right',
    compactMode: false,
    showDepthChart: true,
    showRecentTrades: true,
  },
  bybit: {
    orderFormPosition: 'right',
    orderBookPosition: 'right',
    compactMode: true,
    showDepthChart: false,
    showRecentTrades: true,
  },
  coinbase: {
    orderFormPosition: 'bottom',
    orderBookPosition: 'right',
    compactMode: false,
    showDepthChart: true,
    showRecentTrades: false,
  },
}

const ExchangeContext = createContext(null)

export function ExchangeProvider({ children }) {
  const [selectedExchange, setSelectedExchange] = useState('binance')
  const [theme, setTheme] = useState(EXCHANGE_THEMES.binance)
  const [layout, setLayout] = useState(EXCHANGE_LAYOUTS.binance)

  // Update theme and layout when exchange changes
  useEffect(() => {
    const newTheme = EXCHANGE_THEMES[selectedExchange] || EXCHANGE_THEMES.binance
    const newLayout = EXCHANGE_LAYOUTS[selectedExchange] || EXCHANGE_LAYOUTS.binance
    setTheme(newTheme)
    setLayout(newLayout)
    
    // Apply CSS variables for theme
    const root = document.documentElement
    root.style.setProperty('--exchange-primary', newTheme.primary)
    root.style.setProperty('--exchange-primary-dark', newTheme.primaryDark)
    root.style.setProperty('--exchange-background', newTheme.background)
    root.style.setProperty('--exchange-surface', newTheme.surface)
    root.style.setProperty('--exchange-text', newTheme.text)
    root.style.setProperty('--exchange-text-secondary', newTheme.textSecondary)
    root.style.setProperty('--exchange-success', newTheme.success)
    root.style.setProperty('--exchange-danger', newTheme.danger)
    root.style.setProperty('--exchange-warning', newTheme.warning)
    root.style.setProperty('--exchange-border', newTheme.border)
    root.style.setProperty('--exchange-grid', newTheme.grid)
    root.style.setProperty('--exchange-accent', newTheme.accent)
  }, [selectedExchange])

  const switchExchange = useCallback((exchangeId) => {
    if (EXCHANGE_THEMES[exchangeId]) {
      setSelectedExchange(exchangeId)
    }
  }, [])

  const value = {
    selectedExchange,
    switchExchange,
    theme,
    layout,
    availableExchanges: Object.keys(EXCHANGE_THEMES),
    exchangeThemes: EXCHANGE_THEMES,
    exchangeLayouts: EXCHANGE_LAYOUTS,
  }

  return <ExchangeContext.Provider value={value}>{children}</ExchangeContext.Provider>
}

export function useExchange() {
  const context = useContext(ExchangeContext)
  if (!context) {
    throw new Error('useExchange must be used within ExchangeProvider')
  }
  return context
}
