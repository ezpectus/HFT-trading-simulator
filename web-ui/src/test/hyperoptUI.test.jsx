import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HyperoptUI from '../components/HyperoptUI'

describe('HyperoptUI', () => {
  it('renders trial list with params and scores', () => {
    render(<HyperoptUI />)
    expect(screen.getByText('Hyperparameter Optimization')).toBeInTheDocument()
    expect(screen.getByText('Trial History')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#10')).toBeInTheDocument()
  })

  it('shows summary stats (trials, best score, avg score, best sharpe)', () => {
    render(<HyperoptUI />)
    expect(screen.getByText('Trials')).toBeInTheDocument()
    expect(screen.getByText('Best Score')).toBeInTheDocument()
    expect(screen.getByText('Avg Score')).toBeInTheDocument()
    expect(screen.getByText('Best Sharpe')).toBeInTheDocument()
  })

  it('shows best trial highlighted', () => {
    render(<HyperoptUI />)
    expect(screen.getByText(/Best Trial/)).toBeInTheDocument()
  })

  it('renders parameter ranges with best values', () => {
    render(<HyperoptUI />)
    expect(screen.getByText('Parameter Ranges')).toBeInTheDocument()
    expect(screen.getByText('learning_rate')).toBeInTheDocument()
    expect(screen.getByText('batch_size')).toBeInTheDocument()
  })

  it('toggles running state on Start/Stop button', () => {
    render(<HyperoptUI />)
    const btn = screen.getByText('Start')
    fireEvent.click(btn)
    expect(screen.getByText('Stop')).toBeInTheDocument()
  })
})
