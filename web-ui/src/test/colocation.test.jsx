import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Colocation from '../components/Colocation'

describe('Colocation', () => {
  it('renders datacenter list with regions', () => {
    render(<Colocation />)
    expect(screen.getByText('Colocation Status')).toBeInTheDocument()
    expect(screen.getByText('Tokyo (TY3)')).toBeInTheDocument()
    expect(screen.getByText('London (LD4)')).toBeInTheDocument()
    expect(screen.getByText('New York (NY4)')).toBeInTheDocument()
  })

  it('shows summary stats (avg latency, colo sites, connections)', () => {
    render(<Colocation />)
    expect(screen.getByText('Avg Latency')).toBeInTheDocument()
    expect(screen.getByText('Colo Sites')).toBeInTheDocument()
    expect(screen.getByText('Connections')).toBeInTheDocument()
  })

  it('renders services with CPU usage bars', () => {
    render(<Colocation />)
    expect(screen.getByText('Services')).toBeInTheDocument()
    expect(screen.getByText('Matching Engine')).toBeInTheDocument()
    expect(screen.getByText('Order Router')).toBeInTheDocument()
    expect(screen.getByText('WS Broadcaster')).toBeInTheDocument()
  })

  it('shows COLO badge for collocated datacenters', () => {
    render(<Colocation />)
    expect(screen.getAllByText('COLO').length).toBeGreaterThan(0)
  })

  it('shows uptime and connection info in footer', () => {
    render(<Colocation />)
    expect(screen.getByText(/Best uptime/)).toBeInTheDocument()
    expect(screen.getByText(/active conns/)).toBeInTheDocument()
  })
})
