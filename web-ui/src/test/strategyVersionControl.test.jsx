import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StrategyVersionControl from '../components/StrategyVersionControl'

describe('StrategyVersionControl', () => {
  it('renders version list with version IDs', () => {
    render(<StrategyVersionControl />)
    expect(screen.getByText('Strategy Version Control')).toBeInTheDocument()
    expect(screen.getAllByText('v2.3.1').length).toBeGreaterThan(0)
    expect(screen.getByText('v2.0.0')).toBeInTheDocument()
  })

  it('shows summary stats (active, total changes, latest)', () => {
    render(<StrategyVersionControl />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Total Changes')).toBeInTheDocument()
    expect(screen.getByText('Latest')).toBeInTheDocument()
  })

  it('shows version details on click', () => {
    render(<StrategyVersionControl />)
    fireEvent.click(screen.getByText('v2.2.0'))
    expect(screen.getAllByText('Major refactor: strategy plugin system').length).toBeGreaterThan(0)
  })

  it('shows rollback button for non-latest versions', () => {
    render(<StrategyVersionControl />)
    fireEvent.click(screen.getByText('v2.2.0'))
    expect(screen.getByText(/Rollback to v2.2.0/)).toBeInTheDocument()
  })

  it('shows tags for latest and stable versions', () => {
    render(<StrategyVersionControl />)
    expect(screen.getAllByText('latest').length).toBeGreaterThan(0)
    expect(screen.getAllByText('stable').length).toBeGreaterThan(0)
  })
})
