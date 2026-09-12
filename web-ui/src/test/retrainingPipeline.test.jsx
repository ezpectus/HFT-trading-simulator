import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RetrainingPipeline from '../components/RetrainingPipeline'

describe('RetrainingPipeline', () => {
  it('renders the panel title', () => {
    render(<RetrainingPipeline />)
    expect(screen.getByText('Retraining Pipeline')).toBeInTheDocument()
  })

  it('discloses the missing feed instead of fabricating data', () => {
    render(<RetrainingPipeline />)
    expect(screen.getByText(/No retraining pipeline feed — this data is not produced/)).toBeInTheDocument()
  })
})
