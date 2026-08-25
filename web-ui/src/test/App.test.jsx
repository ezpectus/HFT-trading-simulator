import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('./hooks/useExchangeData', () => ({
  useExchangeData: () => ({
    connected: false, candles: [], orderbooks: {}, prices: {},
    fills: [], accounts: {}, arbitrage: [], newsEvent: null,
  }),
  useSignalData: () => ({
    connected: false, signals: [], regime: null, backtestResults: null,
  }),
}))

vi.mock('./hooks/useMockData', () => ({
  useMockExchangeData: () => ({
    connected: true, candles: [], orderbooks: {}, prices: {},
    fills: [], accounts: {}, arbitrage: [], newsEvent: null,
  }),
  useMockSignalData: () => ({
    connected: true, signals: [], regime: null, backtestResults: null,
  }),
  IS_MOCK: false,
}))

vi.mock('./hooks/useDetachablePanels', () => ({
  useDetachablePanels: () => ({ panels: [], openPanel: vi.fn(), closePanel: vi.fn() }),
}))

vi.mock('./hooks/useMediaQuery', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
}))

vi.mock('./hooks/useSoundAlerts', () => ({
  useSoundAlerts: () => ({ playSound: vi.fn() }),
}))

vi.mock('./hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', accent: 'blue', toggleTheme: vi.fn(), setAccent: vi.fn() }),
}))

vi.mock('./hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => {},
}))

vi.mock('./hooks/useNotifications', () => ({
  useNotifications: () => {},
}))

vi.mock('./stores/useUIStore', () => ({
  useUIStore: () => ({
    activeTab: 'trading', setActiveTab: vi.fn(),
    sidebarOpen: true, toggleSidebar: vi.fn(),
    selectedSymbol: 'BTCUSDT', setSelectedSymbol: vi.fn(),
    selectedExchange: 'binance', setSelectedExchange: vi.fn(),
    selectedTimeframe: '1m', setSelectedTimeframe: vi.fn(),
    simulationSpeed: 1, setSimulationSpeed: vi.fn(),
  }),
}))

vi.mock('./stores/useTradingStore', () => ({
  useTradingStore: () => ({
    orders: [], positions: [],
  }),
}))

vi.mock('./stores/useToastStore', () => ({
  useToastStore: () => ({
    toasts: [], addToast: vi.fn(), removeToast: vi.fn(),
  }),
}))

vi.mock('./panels/PanelContainer', () => ({
  default: () => <div data-testid="panel-container" />,
}))

vi.mock('./panels/registry', () => ({
  CATEGORIES: [],
  PANELS: [],
  DEFAULT_VISIBLE: [],
  ADVANCED_PANEL_IDS: new Set(),
  getPanelsByCategory: () => [],
  preloadCategory: vi.fn(),
}))

describe('App', () => {
  it('renders without crashing', async () => {
    const App = (await import('./App')).default
    const { container } = render(<App />)
    expect(container).toBeTruthy()
  })
})
