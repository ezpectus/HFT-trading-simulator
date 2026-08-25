import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TickReplay from '../components/TickReplay'

describe('TickReplay', () => {
  it('renders tick list and controls', () => {
    render(<TickReplay symbol="BTC/USDT" />)
    expect(screen.getByText('Tick Replay')).toBeInTheDocument()
    expect(screen.getByText('1/12')).toBeInTheDocument()
  })

  it('shows first tick data on initial render', () => {
    render(<TickReplay symbol="BTC/USDT" />)
    expect(screen.getByText('12:45:32.100')).toBeInTheDocument()
    expect(screen.getByText('BUY')).toBeInTheDocument()
  })

  it('advances ticks on step forward', () => {
    render(<TickReplay symbol="BTC/USDT" />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[3])
    expect(screen.getByText('2/12')).toBeInTheDocument()
  })

  it('shows speed controls', () => {
    render(<TickReplay symbol="BTC/USDT" />)
    expect(screen.getByText('0.5x')).toBeInTheDocument()
    expect(screen.getByText('1x')).toBeInTheDocument()
    expect(screen.getByText('10x')).toBeInTheDocument()
  })

  it('handles null symbol with fallback', () => {
    render(<TickReplay symbol={null} />)
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
  })
})
