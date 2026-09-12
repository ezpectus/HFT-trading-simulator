import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ApiPlayground from '../components/ApiPlayground'

describe('ApiPlayground', () => {
  it('renders the panel title', () => {
    render(<ApiPlayground />)
    expect(screen.getByText('API Playground')).toBeInTheDocument()
  })

  it('discloses the missing feed instead of fabricating data', () => {
    render(<ApiPlayground />)
    expect(screen.getByText(/No REST API feed — this data is not produced/)).toBeInTheDocument()
  })
})
