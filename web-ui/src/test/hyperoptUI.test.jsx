import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import HyperoptUI from '../components/HyperoptUI'

describe('HyperoptUI', () => {
  it('renders the panel title', () => {
    render(<HyperoptUI />)
    expect(screen.getByText('Hyperopt')).toBeInTheDocument()
  })

  it('discloses the missing feed instead of fabricating data', () => {
    render(<HyperoptUI />)
    expect(screen.getByText(/No hyperparameter runs feed — this data is not produced/)).toBeInTheDocument()
  })
})
