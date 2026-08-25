import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PanelContainer from '../panels/PanelContainer'

vi.mock('../stores/usePanelContext', () => ({
  usePanelContext: () => ({
    selectedSymbol: 'BTCUSDT',
    selectedExchange: 'binance',
    currentPrice: 65000,
    exchange: { fills: [], candles: [], accounts: {}, orderbooks: {} },
    signals: { signals: [], regime: null },
  }),
}))

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (key, initial) => {
    const [state, setState] = vi.fn(() => [Array.isArray(initial) ? initial : initial, vi.fn()])()
    return [state, setState]
  },
}))

vi.mock('../panels/registry', () => ({
  CATEGORIES: [
    { id: 'orderflow', label: 'Order Flow', icon: 'Activity', order: 1 },
    { id: 'technical', label: 'Technical Analysis', icon: 'TrendingUp', order: 2 },
  ],
  PANELS: [
    { id: 'depth-chart', name: 'Depth Chart', category: 'orderflow', component: () => <div>Depth Chart</div>, props: () => ({}) },
    { id: 'rsi', name: 'RSI Indicator', category: 'technical', component: () => <div>RSI</div>, props: () => ({}) },
  ],
  DEFAULT_VISIBLE: ['depth-chart', 'rsi'],
  ADVANCED_PANEL_IDS: new Set(),
  getPanelsByCategory: (catId) => [
    { id: 'depth-chart', name: 'Depth Chart', category: 'orderflow', component: () => <div>Depth Chart</div>, props: () => ({}) },
  ].filter(p => p.category === catId),
  preloadCategory: vi.fn(),
}))

describe('PanelContainer', () => {
  it('renders without crashing', () => {
    render(<PanelContainer />)
    expect(screen.getByText(/Order Flow/i)).toBeInTheDocument()
  })

  it('shows panel count', () => {
    render(<PanelContainer />)
    expect(screen.getByText(/2/i)).toBeInTheDocument()
  })
})
