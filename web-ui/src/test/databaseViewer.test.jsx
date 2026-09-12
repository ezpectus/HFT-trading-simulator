import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DatabaseViewer from '../components/DatabaseViewer'

describe('DatabaseViewer', () => {
  it('renders the panel title', () => {
    render(<DatabaseViewer />)
    expect(screen.getByText('Database Viewer')).toBeInTheDocument()
  })

  it('discloses there is no database introspection feed', () => {
    render(<DatabaseViewer />)
    expect(screen.getByText(/No database schema feed — this data is not produced/)).toBeInTheDocument()
    expect(screen.getByText(/table\/row browsing is not exposed/)).toBeInTheDocument()
  })
})
