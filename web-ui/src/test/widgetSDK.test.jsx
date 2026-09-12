import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WidgetSDK from '../components/WidgetSDK'

describe('WidgetSDK', () => {
  it('renders the panel title', () => {
    render(<WidgetSDK />)
    expect(screen.getByText('Widget SDK')).toBeInTheDocument()
  })

  it('discloses the missing feed instead of fabricating data', () => {
    render(<WidgetSDK />)
    expect(screen.getByText(/No widget registry feed — this data is not produced/)).toBeInTheDocument()
  })
})
