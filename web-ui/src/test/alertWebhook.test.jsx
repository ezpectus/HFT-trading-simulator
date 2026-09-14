import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AlertWebhook from '../components/AlertWebhook'

describe('AlertWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders with empty state', () => {
    render(<AlertWebhook />)
    expect(screen.getByText(/No webhooks configured/i)).toBeInTheDocument()
  })

  it('shows add form when + button clicked', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    expect(screen.getByPlaceholderText(/Webhook URL/i)).toBeInTheDocument()
  })

  it('adds a webhook', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    const urlInput = screen.getByPlaceholderText(/Webhook URL/i)
    fireEvent.change(urlInput, { target: { value: 'https://discord.com/api/webhooks/test' } })
    fireEvent.click(screen.getByText('Add Webhook'))
    expect(screen.queryByText('Add Webhook')).not.toBeInTheDocument()
    expect(screen.getByText('Webhook')).toBeInTheDocument()
  })

  it('does not add webhook without URL', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    fireEvent.click(screen.getByText('Add Webhook'))
    expect(screen.getByText('Add Webhook')).toBeInTheDocument()
  })

  it('removes a webhook', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    const urlInput = screen.getByPlaceholderText(/Webhook URL/i)
    fireEvent.change(urlInput, { target: { value: 'https://discord.com/api/webhooks/test' } })
    fireEvent.click(screen.getByText('Add Webhook'))
    const removeBtn = screen.getByLabelText(/Remove webhook/i)
    fireEvent.click(removeBtn)
    expect(screen.getByText(/No webhooks configured/i)).toBeInTheDocument()
  })

  it('toggles webhook enabled state', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    const urlInput = screen.getByPlaceholderText(/Webhook URL/i)
    fireEvent.change(urlInput, { target: { value: 'https://discord.com/api/webhooks/test' } })
    fireEvent.click(screen.getByText('Add Webhook'))
    // New webhooks start enabled — label says "Disable webhook"
    const toggleBtn = screen.getByLabelText(/Disable webhook/i)
    fireEvent.click(toggleBtn)
    expect(screen.getByLabelText(/Enable webhook/i)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/Enable webhook/i))
    expect(screen.getByLabelText(/Disable webhook/i)).toBeInTheDocument()
  })

  it('toggles event selection in add form', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    const slTpBtn = screen.getByText('SL/TP Hit')
    fireEvent.click(slTpBtn)
    expect(slTpBtn.className).toContain('accent-blue')
  })

  it('dispatches fill events to enabled webhooks (S232)', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    try {
      localStorage.setItem('trading-sim-webhooks', JSON.stringify([
        { id: 1, name: 'h', url: 'https://hook.example/x', events: ['fill'], enabled: true },
        { id: 2, name: 'off', url: 'https://hook.example/off', events: ['fill'], enabled: false },
      ]))
      const fills = [
        { id: 'o1', status: 'FILLED', side: 'BUY', symbol: 'BTC/USDT', filled_price: 100, filled_quantity: 0.5, exchange: 'binance' },
      ]
      const { rerender } = render(<AlertWebhook fills={[]} toasts={[]} />)
      rerender(<AlertWebhook fills={fills} toasts={[]} />)
      expect(fetchMock).toHaveBeenCalledTimes(1) // disabled hook skipped
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://hook.example/x')
      expect(JSON.parse(init.body).text).toContain('Order filled')
      expect(JSON.parse(init.body).text).toContain('BTC/USDT')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('classifies close_reason into sl_tp/liquidation events (S232)', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    try {
      localStorage.setItem('trading-sim-webhooks', JSON.stringify([
        { id: 1, name: 'liq', url: 'https://hook.example/liq', events: ['liquidation'], enabled: true },
      ]))
      const fills = [
        { id: 'o2', status: 'FILLED', side: 'SELL', symbol: 'ETH/USDT', filled_price: 2000, filled_quantity: 1, exchange: 'binance', close_reason: 'LIQUIDATION' },
      ]
      const { rerender } = render(<AlertWebhook fills={[]} toasts={[]} />)
      rerender(<AlertWebhook fills={fills} toasts={[]} />)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toContain('LIQUIDATION')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not dispatch fill to webhook not subscribed to fills', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    try {
      localStorage.setItem('trading-sim-webhooks', JSON.stringify([
        { id: 1, name: 'liq-only', url: 'https://hook.example/liq', events: ['liquidation'], enabled: true },
      ]))
      const fills = [
        { id: 'o3', status: 'FILLED', side: 'BUY', symbol: 'BTC/USDT', filled_price: 100, filled_quantity: 0.5, exchange: 'binance' },
      ]
      const { rerender } = render(<AlertWebhook fills={[]} toasts={[]} />)
      rerender(<AlertWebhook fills={fills} toasts={[]} />)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('persists webhooks to localStorage', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    const urlInput = screen.getByPlaceholderText(/Webhook URL/i)
    fireEvent.change(urlInput, { target: { value: 'https://discord.com/api/webhooks/test' } })
    fireEvent.click(screen.getByText('Add Webhook'))
    const saved = JSON.parse(localStorage.getItem('trading-sim-webhooks'))
    expect(saved).toHaveLength(1)
    expect(saved[0].url).toBe('https://discord.com/api/webhooks/test')
  })
})
