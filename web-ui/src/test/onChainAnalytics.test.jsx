import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OnChainAnalytics from '../components/OnChainAnalytics'

describe('OnChainAnalytics', () => {
  it('renders the panel title', () => {
    render(<OnChainAnalytics />)
    expect(screen.getByText('On-Chain Analytics')).toBeInTheDocument()
  })

  it('discloses the missing feed instead of fabricating data', () => {
    render(<OnChainAnalytics />)
    expect(screen.getByText(/No on-chain data feed — this data is not produced/)).toBeInTheDocument()
  })
})
