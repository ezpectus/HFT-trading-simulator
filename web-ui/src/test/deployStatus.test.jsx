import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DeployStatus from '../components/DeployStatus'

describe('DeployStatus', () => {
  it('renders the panel title', () => {
    render(<DeployStatus />)
    expect(screen.getByText('Deploy Status')).toBeInTheDocument()
  })

  it('discloses the missing feed instead of fabricating data', () => {
    render(<DeployStatus />)
    expect(screen.getByText(/No deployment pipeline feed — this data is not produced/)).toBeInTheDocument()
  })
})
