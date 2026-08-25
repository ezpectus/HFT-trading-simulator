import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConfigPanel from '../components/ConfigPanel'

describe('ConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders collapsed by default', () => {
    render(<ConfigPanel onConfigUpdate={vi.fn()} />)
    expect(screen.getByText('Simulator Config')).toBeInTheDocument()
    expect(screen.queryByText(/Volatility/i)).not.toBeInTheDocument()
  })

  it('expands when clicked', () => {
    render(<ConfigPanel onConfigUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Simulator Config'))
    expect(screen.getByText(/Volatility/i)).toBeInTheDocument()
  })

  it('shows funding rates when provided', () => {
    render(<ConfigPanel onConfigUpdate={vi.fn()} fundingRates={{ binance: 0.01 }} />)
    fireEvent.click(screen.getByText('Simulator Config'))
    expect(screen.getByText(/Funding/i)).toBeInTheDocument()
  })

  it('calls onConfigUpdate on save', () => {
    const onUpdate = vi.fn()
    render(<ConfigPanel onConfigUpdate={onUpdate} />)
    fireEvent.click(screen.getByText('Simulator Config'))
    fireEvent.click(screen.getByText('Apply'))
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        volatility: expect.any(Object),
        fees: expect.any(Object),
        slippage: expect.any(Object),
        leverage: expect.any(Object),
      }),
    )
  })

  it('shows success message after save', () => {
    render(<ConfigPanel onConfigUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Simulator Config'))
    fireEvent.click(screen.getByText('Apply'))
    expect(screen.getByText(/Config applied/i)).toBeInTheDocument()
  })

  it('resets config on reset button', () => {
    render(<ConfigPanel onConfigUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Simulator Config'))
    fireEvent.click(screen.getByText('Reset'))
  })
})
