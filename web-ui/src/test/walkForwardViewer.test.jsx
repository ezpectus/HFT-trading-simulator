import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WalkForwardViewer from '../components/WalkForwardViewer'

describe('WalkForwardViewer', () => {
  it('renders walk-forward windows with dates', () => {
    render(<WalkForwardViewer />)
    expect(screen.getByText('Walk-Forward Analysis')).toBeInTheDocument()
    expect(screen.getByText('Walk-Forward Windows')).toBeInTheDocument()
    expect(screen.getByText('2024-04-01 → 2024-04-30')).toBeInTheDocument()
  })

  it('shows summary stats (pass rate, avg test return, avg sharpe, overfit)', () => {
    render(<WalkForwardViewer />)
    expect(screen.getByText('Pass Rate')).toBeInTheDocument()
    expect(screen.getByText('Avg Test Ret')).toBeInTheDocument()
    expect(screen.getByText('Avg Sharpe')).toBeInTheDocument()
    expect(screen.getByText('Overfit')).toBeInTheDocument()
  })

  it('shows train vs test comparison chart', () => {
    render(<WalkForwardViewer />)
    expect(screen.getByText('Train vs Test Return')).toBeInTheDocument()
  })

  it('shows pass/fail status for each window', () => {
    render(<WalkForwardViewer />)
    expect(screen.getByText(/5 passed, 1 failed/)).toBeInTheDocument()
  })

  it('shows overfit warning when score is high', () => {
    render(<WalkForwardViewer />)
    expect(screen.getByText(/Overfit score/)).toBeInTheDocument()
  })
})
