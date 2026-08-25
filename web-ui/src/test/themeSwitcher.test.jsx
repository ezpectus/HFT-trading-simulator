import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ThemeSwitcher from '../components/ThemeSwitcher'

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (key, defaultValue) => {
    const [value, setValue] = vi.requireActual('react').useState(defaultValue)
    return [value, setValue]
  },
}))

describe('ThemeSwitcher', () => {
  it('renders theme options', () => {
    render(<ThemeSwitcher addToast={vi.fn()} />)
    expect(screen.getByText('Theme Switcher')).toBeInTheDocument()
    expect(screen.getByText('Dark')).toBeInTheDocument()
    expect(screen.getByText('Light')).toBeInTheDocument()
    expect(screen.getByText('Midnight')).toBeInTheDocument()
    expect(screen.getByText('Forest')).toBeInTheDocument()
  })

  it('renders accent color palette', () => {
    render(<ThemeSwitcher addToast={vi.fn()} />)
    expect(screen.getByText('Accent Color')).toBeInTheDocument()
  })

  it('shows preview section', () => {
    render(<ThemeSwitcher addToast={vi.fn()} />)
    expect(screen.getByText('Preview')).toBeInTheDocument()
    expect(screen.getByText('Sample Text')).toBeInTheDocument()
  })

  it('handles null addToast gracefully', () => {
    render(<ThemeSwitcher addToast={null} />)
    expect(screen.getByText('Theme Switcher')).toBeInTheDocument()
  })
})
