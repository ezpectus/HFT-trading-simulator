import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RetrainingPipeline from '../components/RetrainingPipeline'

describe('RetrainingPipeline', () => {
  it('renders pipeline list with model names and statuses', () => {
    render(<RetrainingPipeline />)
    expect(screen.getByText('Retraining Pipeline')).toBeInTheDocument()
    expect(screen.getByText('TrendFollowing Model')).toBeInTheDocument()
    expect(screen.getByText('MeanReversion Model')).toBeInTheDocument()
    expect(screen.getByText('Sentiment Classifier')).toBeInTheDocument()
  })

  it('shows summary stats (running, completed, failed, avg acc)', () => {
    render(<RetrainingPipeline />)
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Avg Acc')).toBeInTheDocument()
  })

  it('renders pipeline steps for current model', () => {
    render(<RetrainingPipeline />)
    expect(screen.getByText('MeanReversion Pipeline Steps')).toBeInTheDocument()
    expect(screen.getByText('Data Collection')).toBeInTheDocument()
    expect(screen.getByText('Model Training')).toBeInTheDocument()
    expect(screen.getByText('Validation')).toBeInTheDocument()
  })

  it('shows drift alert for high drift models', () => {
    render(<RetrainingPipeline />)
    expect(screen.getByText(/high drift/)).toBeInTheDocument()
  })

  it('shows auto-retrain threshold info', () => {
    render(<RetrainingPipeline />)
    expect(screen.getByText(/Auto-retrain triggered/)).toBeInTheDocument()
  })
})
