import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MultiLegOptions from '../components/MultiLegOptions'

describe('MultiLegOptions', () => {
  it('renders strategies, payoff chart and stats', () => {
    const { container } = render(<MultiLegOptions currentPrice={65000} />)
    expect(screen.getByText('Multi-Leg Options')).toBeInTheDocument()
    expect(screen.getByText('Max Profit')).toBeInTheDocument()
    expect(screen.getByText('Max Loss')).toBeInTheDocument()
    const path = container.querySelector('path')
    expect(path.getAttribute('d')).not.toContain('NaN')
  })

  it('flat-collapses instead of NaN when spot input is 0 (-class)', () => {
    const { container } = render(<MultiLegOptions currentPrice={65000} />)
    const spotInput = screen.getByText('Spot').parentElement.querySelector('input')
    fireEvent.change(spotInput, { target: { value: '0' } })
    for (const el of container.querySelectorAll('path, circle, line')) {
      for (const attr of ['d', 'cx', 'cy', 'x1', 'x2', 'y1', 'y2']) {
        const v = el.getAttribute(attr)
        if (v != null) expect(v).not.toContain('NaN')
      }
    }
  })

  it('survives non-numeric spot input', () => {
    const { container } = render(<MultiLegOptions currentPrice={65000} />)
    const spotInput = screen.getByText('Spot').parentElement.querySelector('input')
    fireEvent.change(spotInput, { target: { value: 'abc' } })
    for (const el of container.querySelectorAll('path, circle, line')) {
      for (const attr of ['d', 'cx', 'cy', 'x1', 'x2', 'y1', 'y2']) {
        const v = el.getAttribute(attr)
        if (v != null) expect(v).not.toContain('NaN')
      }
    }
  })
})
