/**
 * Tests for PriceAlerts component
 * Tests: rendering, add/remove alerts, trigger on price cross, sound toggle, empty state, distance display
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PriceAlerts from '../components/PriceAlerts'

// Mock AudioContext
const mockOscillator = {
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  frequency: { value: 0 },
  type: '',
}
const mockGain = {
  connect: vi.fn(),
  gain: {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
}
const mockAudioContext = {
  currentTime: 0,
  createOscillator: vi.fn(() => mockOscillator),
  createGain: vi.fn(() => mockGain),
  destination: {},
}

describe('PriceAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.AudioContext = vi.fn(() => mockAudioContext)
    window.webkitAudioContext = undefined
  })

  it('renders header label', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText('Price Alerts')).toBeInTheDocument()
  })

  it('shows empty state when no alerts', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText('No alerts set')).toBeInTheDocument()
  })

  it('shows Add button', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText('Add')).toBeInTheDocument()
  })

  it('shows form when Add clicked', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.click(screen.getByText('Add'))
    expect(screen.getByText('Set Alert')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('50,000.00')).toBeInTheDocument()
  })

  it('shows direction buttons in form', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.click(screen.getByText('Add'))
    expect(screen.getByText('Above')).toBeInTheDocument()
    expect(screen.getByText('Below')).toBeInTheDocument()
  })

  it('adds alert above threshold', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.click(screen.getByText('Add'))
    const input = screen.getByPlaceholderText('50,000.00')
    fireEvent.change(input, { target: { value: '51000' } })
    fireEvent.click(screen.getByText('Set Alert'))
    expect(screen.getByText(/\$51,000/)).toBeInTheDocument()
  })

  it('adds alert below threshold', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.click(screen.getByText('Add'))
    fireEvent.click(screen.getByText('Below'))
    const input = screen.getByPlaceholderText('50,000.00')
    fireEvent.change(input, { target: { value: '49000' } })
    fireEvent.click(screen.getByText('Set Alert'))
    expect(screen.getByText(/\$49,000/)).toBeInTheDocument()
  })

  it('does not add alert with empty threshold', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.click(screen.getByText('Add'))
    fireEvent.click(screen.getByText('Set Alert'))
    expect(screen.getByText('No alerts set')).toBeInTheDocument()
  })

  it('does not add alert with zero threshold', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.click(screen.getByText('Add'))
    const input = screen.getByPlaceholderText('50,000.00')
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.click(screen.getByText('Set Alert'))
    expect(screen.getByText('No alerts set')).toBeInTheDocument()
  })

  it('does not add alert with negative threshold', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.click(screen.getByText('Add'))
    const input = screen.getByPlaceholderText('50,000.00')
    fireEvent.change(input, { target: { value: '-100' } })
    fireEvent.click(screen.getByText('Set Alert'))
    expect(screen.getByText('No alerts set')).toBeInTheDocument()
  })

  it('hides form after adding alert', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.click(screen.getByText('Add'))
    const input = screen.getByPlaceholderText('50,000.00')
    fireEvent.change(input, { target: { value: '51000' } })
    fireEvent.click(screen.getByText('Set Alert'))
    expect(screen.queryByText('Set Alert')).not.toBeInTheDocument()
  })

  it('removes alert when X clicked', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.click(screen.getByText('Add'))
    const input = screen.getByPlaceholderText('50,000.00')
    fireEvent.change(input, { target: { value: '51000' } })
    fireEvent.click(screen.getByText('Set Alert'))
    expect(screen.getByText(/\$51,000/)).toBeInTheDocument()
    // Click remove
    const removeBtn = screen.getAllByRole('button').find(
      btn => btn.querySelector('svg.lucide-x')
    )
    fireEvent.click(removeBtn)
    expect(screen.getByText('No alerts set')).toBeInTheDocument()
  })

  it('shows distance percentage from current price', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.click(screen.getByText('Add'))
    const input = screen.getByPlaceholderText('50,000.00')
    fireEvent.change(input, { target: { value: '51000' } })
    fireEvent.click(screen.getByText('Set Alert'))
    // Distance: |50000 - 51000| / 50000 * 100 = 2.00%
    expect(screen.getByText('2.00% away')).toBeInTheDocument()
  })

  it('shows sound toggle button', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByTitle('Sound on')).toBeInTheDocument()
  })

  it('toggles sound off', () => {
    render(<PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.click(screen.getByTitle('Sound on'))
    expect(screen.getByTitle('Sound off')).toBeInTheDocument()
  })

  it('calls onAlert callback when price crosses above threshold', async () => {
    const onAlert = vi.fn()
    const { rerender } = render(
      <PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" onAlert={onAlert} />
    )
    fireEvent.click(screen.getByText('Add'))
    const input = screen.getByPlaceholderText('50,000.00')
    fireEvent.change(input, { target: { value: '51000' } })
    fireEvent.click(screen.getByText('Set Alert'))

    // Price goes above threshold
    rerender(
      <PriceAlerts currentPrice={51000} symbol="BTC/USDT" exchange="binance" onAlert={onAlert} />
    )

    await waitFor(() => {
      expect(onAlert).toHaveBeenCalledTimes(1)
    })
  })

  it('calls onAlert callback when price crosses below threshold', async () => {
    const onAlert = vi.fn()
    const { rerender } = render(
      <PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" onAlert={onAlert} />
    )
    fireEvent.click(screen.getByText('Add'))
    fireEvent.click(screen.getByText('Below'))
    const input = screen.getByPlaceholderText('50,000.00')
    fireEvent.change(input, { target: { value: '49000' } })
    fireEvent.click(screen.getByText('Set Alert'))

    // Price goes below threshold
    rerender(
      <PriceAlerts currentPrice={49000} symbol="BTC/USDT" exchange="binance" onAlert={onAlert} />
    )

    await waitFor(() => {
      expect(onAlert).toHaveBeenCalledTimes(1)
    })
  })

  it('does not trigger alert when price does not cross threshold', () => {
    const onAlert = vi.fn()
    const { rerender } = render(
      <PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" onAlert={onAlert} />
    )
    fireEvent.click(screen.getByText('Add'))
    const input = screen.getByPlaceholderText('50,000.00')
    fireEvent.change(input, { target: { value: '51000' } })
    fireEvent.click(screen.getByText('Set Alert'))

    // Price stays below threshold
    rerender(
      <PriceAlerts currentPrice={50500} symbol="BTC/USDT" exchange="binance" onAlert={onAlert} />
    )

    expect(onAlert).not.toHaveBeenCalled()
  })

  it('shows triggered alert in triggered section', async () => {
    const onAlert = vi.fn()
    const { rerender } = render(
      <PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" onAlert={onAlert} />
    )
    fireEvent.click(screen.getByText('Add'))
    const input = screen.getByPlaceholderText('50,000.00')
    fireEvent.change(input, { target: { value: '51000' } })
    fireEvent.click(screen.getByText('Set Alert'))

    rerender(
      <PriceAlerts currentPrice={51000} symbol="BTC/USDT" exchange="binance" onAlert={onAlert} />
    )

    await waitFor(() => {
      expect(screen.getByText('Triggered!')).toBeInTheDocument()
    })
  })

  it('does not trigger same alert twice', async () => {
    const onAlert = vi.fn()
    const { rerender } = render(
      <PriceAlerts currentPrice={50000} symbol="BTC/USDT" exchange="binance" onAlert={onAlert} />
    )
    fireEvent.click(screen.getByText('Add'))
    const input = screen.getByPlaceholderText('50,000.00')
    fireEvent.change(input, { target: { value: '51000' } })
    fireEvent.click(screen.getByText('Set Alert'))

    // First trigger
    rerender(
      <PriceAlerts currentPrice={51000} symbol="BTC/USDT" exchange="binance" onAlert={onAlert} />
    )
    await waitFor(() => {
      expect(onAlert).toHaveBeenCalledTimes(1)
    })

    // Price moves but alert already triggered
    rerender(
      <PriceAlerts currentPrice={51500} symbol="BTC/USDT" exchange="binance" onAlert={onAlert} />
    )
    expect(onAlert).toHaveBeenCalledTimes(1)
  })

  it('shows symbol and exchange in form description', () => {
    render(<PriceAlerts currentPrice={50000} symbol="ETH/USDT" exchange="bybit" />)
    fireEvent.click(screen.getByText('Add'))
    expect(screen.getByText(/ETH\/USDT/)).toBeInTheDocument()
    expect(screen.getByText(/bybit/)).toBeInTheDocument()
  })
})
