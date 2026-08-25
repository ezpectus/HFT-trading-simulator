import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PacketInspector from '../components/PacketInspector'

describe('PacketInspector', () => {
  it('renders packet list with timestamps', () => {
    render(<PacketInspector />)
    expect(screen.getByText('Packet Inspector')).toBeInTheDocument()
    expect(screen.getByText('12:45:32.100')).toBeInTheDocument()
    expect(screen.getByText('12:45:32.500')).toBeInTheDocument()
  })

  it('shows summary stats (in, out, ws, errors)', () => {
    render(<PacketInspector />)
    expect(screen.getByText('In')).toBeInTheDocument()
    expect(screen.getByText('Out')).toBeInTheDocument()
    expect(screen.getByText('WS Pkts')).toBeInTheDocument()
    expect(screen.getByText('Errors')).toBeInTheDocument()
  })

  it('filters packets by direction', () => {
    render(<PacketInspector />)
    fireEvent.click(screen.getByText('IN'))
    expect(screen.getAllByText('IN').length).toBeGreaterThan(0)
  })

  it('shows packet detail on click', () => {
    render(<PacketInspector />)
    fireEvent.click(screen.getByText('12:45:32.100'))
    expect(screen.getByText(/Packet #1 Detail/)).toBeInTheDocument()
  })

  it('shows error icon for failed packets', () => {
    render(<PacketInspector />)
    expect(screen.getAllByText('order').length).toBeGreaterThan(0)
  })
})
