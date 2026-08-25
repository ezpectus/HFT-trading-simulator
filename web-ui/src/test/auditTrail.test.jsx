import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AuditTrail from '../components/AuditTrail'

describe('AuditTrail', () => {
  it('renders audit entries with timestamps and users', () => {
    render(<AuditTrail />)
    expect(screen.getByText('Audit Trail')).toBeInTheDocument()
    expect(screen.getByText('2024-08-25 12:45')).toBeInTheDocument()
    expect(screen.getAllByText('admin').length).toBeGreaterThan(0)
    expect(screen.getAllByText('trader1').length).toBeGreaterThan(0)
  })

  it('shows summary counts (config changes, orders, circuit breaks)', () => {
    render(<AuditTrail />)
    expect(screen.getByText('Config Changes')).toBeInTheDocument()
    expect(screen.getByText('Orders')).toBeInTheDocument()
    expect(screen.getByText('Circuit Breaks')).toBeInTheDocument()
  })

  it('filters entries by user on button click', () => {
    render(<AuditTrail />)
    const traderBtns = screen.getAllByText('trader1')
    const traderBtn = traderBtns.find(el => el.tagName === 'BUTTON')
    fireEvent.click(traderBtn)
    expect(screen.getAllByText('ORDER_SUBMIT').length).toBeGreaterThan(0)
    expect(screen.queryByText('CONFIG_UPDATE')).not.toBeInTheDocument()
  })

  it('shows old and new values for config changes', () => {
    render(<AuditTrail />)
    expect(screen.getAllByText('0.10').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0.08').length).toBeGreaterThan(0)
  })

  it('shows retention info in footer', () => {
    render(<AuditTrail />)
    expect(screen.getByText('Retention: 90 days')).toBeInTheDocument()
  })
})
