import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Metric from '../components/backtest/Metric'

describe('Metric', () => {
  it('renders label and value', () => {
    render(<Metric label="Win Rate" value="61%" />)
    expect(screen.getByText('Win Rate')).toBeInTheDocument()
    expect(screen.getByText('61%')).toBeInTheDocument()
  })

  it('applies the color class to the value', () => {
    render(<Metric label="PnL" value="+$5" color="text-green-400" />)
    expect(screen.getByText('+$5').className).toContain('text-green-400')
  })

  it('defaults value color to text-gray-200', () => {
    render(<Metric label="X" value="1" />)
    expect(screen.getByText('1').className).toContain('text-gray-200')
  })
})
