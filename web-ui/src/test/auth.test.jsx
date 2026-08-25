import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Auth from '../components/Auth'

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (_key, defaultValue) => {
    const [value, setValue] = useState(defaultValue)
    return [value, setValue, () => {}]
  },
}))

describe('Auth', () => {
  it('renders login form when not authenticated', () => {
    render(<Auth addToast={vi.fn()} />)
    expect(screen.getByText('Authentication')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    expect(screen.getAllByText('Login').length).toBeGreaterThan(0)
  })

  it('switches to register mode', () => {
    render(<Auth addToast={vi.fn()} />)
    fireEvent.click(screen.getByText('Register'))
    expect(screen.getAllByText('Register').length).toBeGreaterThan(0)
  })

  it('shows warning on empty login', () => {
    const addToast = vi.fn()
    render(<Auth addToast={addToast} />)
    fireEvent.click(screen.getAllByText('Login')[1])
    expect(addToast).toHaveBeenCalledWith('warning', 'Username and password required')
  })

  it('logs in with valid credentials', () => {
    const addToast = vi.fn()
    render(<Auth addToast={addToast} />)
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'trader1' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass123' } })
    fireEvent.click(screen.getAllByText('Login')[1])
    expect(addToast).toHaveBeenCalledWith('success', 'Logged in as trader1')
  })
})
