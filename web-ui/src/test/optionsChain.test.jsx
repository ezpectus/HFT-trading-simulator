import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OptionsChain from '../components/OptionsChain'

describe('OptionsChain', () => {
  it('renders options chain with strikes', () => {
    render(<OptionsChain currentPrice={44100} />)
    expect(screen.getByText('Options Chain')).toBeInTheDocument()
    expect(screen.getAllByText('$38,000').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('$44,000').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('$50,000').length).toBeGreaterThanOrEqual(1)
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
    const strikeEls = screen.getAllByText('$44,000')
    fireEvent.click(strikeEls[0].closest('div[class*="cursor"]') || strikeEls[0])
    expect(screen.getByText('Delta: 0.58')).toBeInTheDocument()
    expect(screen.getByText('Delta: -0.42')).toBeInTheDocument()
  })

  it('handles null currentPrice with fallback', () => {
    render(<OptionsChain currentPrice={null} />)
    expect(screen.getByText('Options Chain')).toBeInTheDocument()
    expect(screen.getByText('BTC/USDT @ $44,100')).toBeInTheDocument()
  })
})
