import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ModelDashboard from '../components/ModelDashboard'

describe('ModelDashboard', () => {
  it('renders model list with names and statuses', () => {
    render(<ModelDashboard addToast={vi.fn()} />)
    expect(screen.getByText('Model Dashboard')).toBeInTheDocument()
    expect(screen.getByText('LSTM BTC/USDT')).toBeInTheDocument()
    expect(screen.getByText('Transformer ETH/USDT')).toBeInTheDocument()
    expect(screen.getByText('LightGBM Ensemble')).toBeInTheDocument()
  })

  it('shows summary stats', () => {
    render(<ModelDashboard addToast={vi.fn()} />)
    expect(screen.getByText('Deployed')).toBeInTheDocument()
    expect(screen.getByText('Training')).toBeInTheDocument()
    expect(screen.getByText('Avg Acc')).toBeInTheDocument()
  })

  it('expands model details on click', () => {
    render(<ModelDashboard addToast={vi.fn()} />)
    fireEvent.click(screen.getByText('LSTM BTC/USDT'))
    expect(screen.getByText('Accuracy')).toBeInTheDocument()
    expect(screen.getByText('Retrain')).toBeInTheDocument()
  })

  it('handles null addToast gracefully', () => {
    render(<ModelDashboard addToast={null} />)
    expect(screen.getByText('Model Dashboard')).toBeInTheDocument()
  })
})
