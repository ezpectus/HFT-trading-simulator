import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PacketInspector from '../components/PacketInspector'

describe('PacketInspector', () => {
  it('renders the panel title', () => {
    render(<PacketInspector />)
    expect(screen.getByText('Packet Inspector')).toBeInTheDocument()
  })

  it('discloses there is no packet capture feed instead of fabricating packets', () => {
    render(<PacketInspector />)
    expect(screen.getByText(/No packet capture feed — this data is not produced/)).toBeInTheDocument()
    expect(screen.getByText(/does not publish raw message captures/)).toBeInTheDocument()
  })

  it('renders no fabricated packet rows', () => {
    render(<PacketInspector />)
    // previously asserted fake timestamps like 12:45:32.100 — none may exist now
    expect(screen.queryByText(/\d{2}:\d{2}:\d{2}\.\d{3}/)).not.toBeInTheDocument()
  })
})
