import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DatabaseViewer from '../components/DatabaseViewer'

describe('DatabaseViewer', () => {
  it('renders table list with row counts', () => {
    render(<DatabaseViewer addToast={vi.fn()} />)
    expect(screen.getByText('Database Viewer')).toBeInTheDocument()
    expect(screen.getByText('signals')).toBeInTheDocument()
    expect(screen.getByText('fills')).toBeInTheDocument()
    expect(screen.getByText('candles')).toBeInTheDocument()
  })

  it('shows database stats', () => {
    render(<DatabaseViewer addToast={vi.fn()} />)
    expect(screen.getByText('Total Size')).toBeInTheDocument()
    expect(screen.getByText('Total Rows')).toBeInTheDocument()
    expect(screen.getByText('SQLite')).toBeInTheDocument()
  })

  it('filters tables by search', () => {
    render(<DatabaseViewer addToast={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search tables...'), { target: { value: 'sig' } })
    expect(screen.getByText('signals')).toBeInTheDocument()
    expect(screen.queryByText('fills')).not.toBeInTheDocument()
  })

  it('handles null addToast gracefully', () => {
    render(<DatabaseViewer addToast={null} />)
    expect(screen.getByText('Database Viewer')).toBeInTheDocument()
  })
})
