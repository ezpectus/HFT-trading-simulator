import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TeamCollab from '../components/TeamCollab'

describe('TeamCollab', () => {
  it('renders team members with roles and status', () => {
    render(<TeamCollab />)
    expect(screen.getByText('Team Collaboration')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Trader')).toBeInTheDocument()
  })

  it('shows online count in header', () => {
    render(<TeamCollab />)
    expect(screen.getByText(/online/)).toBeInTheDocument()
  })

  it('renders chat messages', () => {
    render(<TeamCollab />)
    expect(screen.getByText('BTC signal looking strong, confidence at 82%')).toBeInTheDocument()
    expect(screen.getByText('Agreed, already entered 0.5 BTC long position')).toBeInTheDocument()
  })

  it('sends message on input + Enter', () => {
    render(<TeamCollab />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('Test message')).toBeInTheDocument()
  })

  it('renders shared resources list', () => {
    render(<TeamCollab />)
    expect(screen.getByText('Shared Resources')).toBeInTheDocument()
    expect(screen.getByText('Scalping Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Trend + MeanRev Ensemble')).toBeInTheDocument()
  })
})
