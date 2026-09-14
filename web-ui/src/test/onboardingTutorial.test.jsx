import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OnboardingTutorial from '../components/OnboardingTutorial'

describe('OnboardingTutorial', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the modal for first-time users', () => {
    render(<OnboardingTutorial />)
    expect(screen.getByTestId('onboarding-modal')).toBeInTheDocument()
    expect(screen.getByText('Welcome to Trading Sim')).toBeInTheDocument()
  })

  it('stays hidden once the storage key is set', () => {
    localStorage.setItem('trading-sim-onboarded', '1')
    render(<OnboardingTutorial />)
    expect(screen.queryByTestId('onboarding-modal')).not.toBeInTheDocument()
  })

  it('dismisses and persists the flag on skip', () => {
    render(<OnboardingTutorial />)
    fireEvent.click(screen.getByText('Skip tutorial'))
    expect(screen.queryByTestId('onboarding-modal')).not.toBeInTheDocument()
    expect(localStorage.getItem('trading-sim-onboarded')).toBe('1')
  })

  it('steps forward and finishes on the last step', () => {
    render(<OnboardingTutorial />)
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText("You're All Set!")).toBeInTheDocument()
    fireEvent.click(screen.getByText('Get Started'))
    expect(screen.queryByTestId('onboarding-modal')).not.toBeInTheDocument()
  })
})
