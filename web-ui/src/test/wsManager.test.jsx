import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import WsManager from '../components/WsManager'

const mockExchange = {
  connected: true,
  latency: 25,
  reconnects: 0,
  tradingActive: true,
  replayPaused: false,
  candles: [{ timestamp: 1, close: 100 }],
  nextReconnectIn: null,
}

const mockSignals = {
  connected: true,
  latency: 12,
  reconnects: 0,
  signals: [{ symbol: 'BTC/USDT', direction: 'LONG' }],
  nextReconnectIn: null,
}

const mockToasts = [
  { type: 'success', message: 'Connected' },
  { type: 'error', message: 'WebSocket error' },
]

describe('WsManager', () => {
  it('renders connection status for both exchange and signal WS', () => {
    render(<WsManager exchange={mockExchange} signals={mockSignals} toasts={mockToasts} addToast={vi.fn()} />)
    expect(screen.getByText('Exchange Simulator')).toBeInTheDocument()
    expect(screen.getByText('AI Signal Bot')).toBeInTheDocument()
    expect(screen.getByText(/Online/i)).toBeInTheDocument()
  })

  it('shows latency values', () => {
    render(<WsManager exchange={mockExchange} signals={mockSignals} toasts={[]} addToast={vi.fn()} />)
    expect(screen.getByText('25ms')).toBeInTheDocument()
    expect(screen.getByText('12ms')).toBeInTheDocument()
  })

  it('handles disconnected state with reconnect button', () => {
    const disconnectedExchange = { ...mockExchange, connected: false, latency: null, nextReconnectIn: 5 }
    render(<WsManager exchange={disconnectedExchange} signals={mockSignals} toasts={[]} addToast={vi.fn()} />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByText('Reconnect in 5s')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('handles empty/null data gracefully', () => {
    render(<WsManager exchange={null} signals={null} toasts={[]} addToast={vi.fn()} />)
    expect(screen.getByText('WebSocket Manager')).toBeInTheDocument()
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('shows trading and replay status', () => {
    render(<WsManager exchange={mockExchange} signals={mockSignals} toasts={[]} addToast={vi.fn()} />)
    expect(screen.getByText('Trading Status')).toBeInTheDocument()
    expect(screen.getByText('Yes')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('shows recent errors from toasts', () => {
    const errorToasts = [
      { type: 'error', message: 'Connection timeout' },
      { type: 'error', message: 'Auth failed' },
    ]
    render(<WsManager exchange={mockExchange} signals={mockSignals} toasts={errorToasts} addToast={vi.fn()} />)
    expect(screen.getByText('Recent Errors')).toBeInTheDocument()
    expect(screen.getByText('Connection timeout')).toBeInTheDocument()
  })
})
