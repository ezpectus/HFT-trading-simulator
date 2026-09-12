import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamCollab from '../components/TeamCollab'

describe('TeamCollab', () => {
  it('renders the panel title', () => {
    render(<TeamCollab />)
    expect(screen.getByText('Team Collaboration')).toBeInTheDocument()
  })

  it('discloses the missing feed instead of fabricating data', () => {
    render(<TeamCollab />)
    expect(screen.getByText(/No collaboration feed — this data is not produced/)).toBeInTheDocument()
  })
})
