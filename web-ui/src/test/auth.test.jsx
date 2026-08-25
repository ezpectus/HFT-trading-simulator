import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Auth from '../components/Auth'

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (key, defaultValue) => {
    const [value, setValue] = vi.requireActual('react').useState(defaultValue)
    return [value, setValue]
  },
}))

describe('Auth', () => {
  it('renders login form when not authenticated', () => {
    render(<Auth addToast={vi.fn()} />)
    expect(screen.getByText('Authentication')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    expect(screen.getByText('Login')).toBeInTheDocument()
  })

  it('switches to register mode', () => {
    render(<Auth addToast={vi.fn()} />)
    fireEvent.click(screen.getByText('Register'))
    expect(screen.getByText('Register')).toBeInTheDocument()
  })

  it('shows warning on empty login', () => {
    const addToast = vi.fn()
    render(<Auth addToast={addToast} />)
    fireEvent.click(screen.getByText('Login'))
    expect(addToast).toHaveBeenCalledWith('warning', 'Username and password required')
  })

  it('logs in with valid credentials', () => {
    const addToast = vi.fn()
    render(<Auth addToast={addToast} />)
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'trader1' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass123' } })
    fireEvent.click(screen.getByText('Login'))
    expect(addToast).toHaveBeenCalledWith('success', 'Logged in as trader1')
  })
})
