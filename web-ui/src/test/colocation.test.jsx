import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Colocation from '../components/Colocation'

describe('Colocation', () => {
  it('renders the panel title', () => {
    render(<Colocation />)
    expect(screen.getByText('Colocation')).toBeInTheDocument()
  })

  it('discloses the missing feed instead of fabricating data', () => {
    render(<Colocation />)
    expect(screen.getByText(/No datacenter telemetry feed — this data is not produced/)).toBeInTheDocument()
  })
})
