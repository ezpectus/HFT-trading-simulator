import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ABTesting from '../components/ABTesting'

describe('ABTesting', () => {
  it('renders the panel title', () => {
    render(<ABTesting />)
    expect(screen.getByText('A/B Testing')).toBeInTheDocument()
  })

  it('discloses the missing feed instead of fabricating data', () => {
    render(<ABTesting />)
    expect(screen.getByText(/No experiment results feed — this data is not produced/)).toBeInTheDocument()
  })
})
