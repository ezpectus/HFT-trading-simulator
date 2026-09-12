import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScenarioSim from '../components/ScenarioSim'

describe('ScenarioSim', () => {
  it('renders the panel title', () => {
    render(<ScenarioSim />)
    expect(screen.getByText('Scenario Simulator')).toBeInTheDocument()
  })

  it('discloses the missing feed instead of fabricating data', () => {
    render(<ScenarioSim />)
    expect(screen.getByText(/No scenario engine feed — this data is not produced/)).toBeInTheDocument()
  })
})
