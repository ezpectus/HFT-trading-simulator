import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StrategyVersionControl from '../components/StrategyVersionControl'

describe('StrategyVersionControl', () => {
  it('renders the panel title', () => {
    render(<StrategyVersionControl />)
    expect(screen.getByText('Strategy Version Control')).toBeInTheDocument()
  })

  it('discloses the missing feed instead of fabricating data', () => {
    render(<StrategyVersionControl />)
    expect(screen.getByText(/No strategy versioning feed — this data is not produced/)).toBeInTheDocument()
  })
})
