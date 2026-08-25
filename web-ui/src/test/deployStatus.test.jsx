import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DeployStatus from '../components/DeployStatus'

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (key, defaultValue) => {
    const [value, setValue] = vi.requireActual('react').useState(defaultValue)
    return [value, setValue]
  },
}))

describe('DeployStatus', () => {
  it('renders service list with statuses', () => {
    render(<DeployStatus addToast={vi.fn()} />)
    expect(screen.getByText('Deploy Status')).toBeInTheDocument()
    expect(screen.getByText('AI Signal Bot')).toBeInTheDocument()
    expect(screen.getByText('Exchange Simulator')).toBeInTheDocument()
    expect(screen.getByText('Web UI')).toBeInTheDocument()
  })

  it('shows running count', () => {
    render(<DeployStatus addToast={vi.fn()} />)
    expect(screen.getByText(/4\/5 running/)).toBeInTheDocument()
  })

  it('handles deploy button click', () => {
    const addToast = vi.fn()
    render(<DeployStatus addToast={addToast} />)
    fireEvent.click(screen.getByText('Deploy All'))
    expect(addToast).toHaveBeenCalledWith('info', 'Deployment started...')
  })

  it('handles null addToast gracefully', () => {
    render(<DeployStatus addToast={null} />)
    expect(screen.getByText('Deploy Status')).toBeInTheDocument()
  })
})
