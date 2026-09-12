import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ModelDashboard from '../components/ModelDashboard'

describe('ModelDashboard', () => {
  it('renders the panel title', () => {
    render(<ModelDashboard />)
    expect(screen.getByText('Model Dashboard')).toBeInTheDocument()
  })

  it('discloses there is no model registry feed', () => {
    render(<ModelDashboard />)
    expect(screen.getByText(/No model registry feed — this data is not produced/)).toBeInTheDocument()
    expect(screen.getByText(/model status\/accuracy is not produced by the backend/)).toBeInTheDocument()
  })

  it('renders no fabricated model rows', () => {
    render(<ModelDashboard />)
    expect(screen.queryByText('LSTM BTC/USDT')).not.toBeInTheDocument()
    expect(screen.queryByText('LightGBM Ensemble')).not.toBeInTheDocument()
  })
})
