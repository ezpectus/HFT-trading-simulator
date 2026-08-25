import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OptionsChain from '../components/OptionsChain'

describe('OptionsChain', () => {
  it('renders options chain with strikes', () => {
    render(<OptionsChain currentPrice={44100} />)
    expect(screen.getByText('Options Chain')).toBeInTheDocument()
    expect(screen.getByText('$38,000')).toBeInTheDocument()
    expect(screen.getByText('$44,000')).toBeInTheDocument()
    expect(screen.getByText('$50,000')).toBeInTheDocument()
  })

  it('shows summary stats (PCR, IV, volumes)', () => {
    render(<OptionsChain currentPrice={44100} />)
    expect(screen.getByText('PCR')).toBeInTheDocument()
    expect(screen.getByText('Avg IV')).toBeInTheDocument()
    expect(screen.getByText('Call Vol')).toBeInTheDocument()
    expect(screen.getByText('Put Vol')).toBeInTheDocument()
  })

  it('shows strike details on click', () => {
    render(<OptionsChain currentPrice={44100} />)
    fireEvent.click(screen.getByText('$44,000'))
    expect(screen.getByText('Delta: 0.58')).toBeInTheDocument()
    expect(screen.getByText('Delta: -0.42')).toBeInTheDocument()
  })

  it('handles null currentPrice with fallback', () => {
    render(<OptionsChain currentPrice={null} />)
    expect(screen.getByText('Options Chain')).toBeInTheDocument()
    expect(screen.getByText('BTC/USDT @ $44,100')).toBeInTheDocument()
  })
})
