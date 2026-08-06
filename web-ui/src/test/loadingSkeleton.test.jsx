/**
 * Tests for LoadingSkeleton components
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EmptyState } from '../components/LoadingSkeleton'
import { Activity } from 'lucide-react'

describe('EmptyState', () => {
  it('renders title and subtitle', () => {
    const { getByText } = render(<EmptyState title="No data" subtitle="Try again later" />)
    expect(getByText('No data')).toBeDefined()
    expect(getByText('Try again later')).toBeDefined()
  })

  it('renders icon when provided', () => {
    const { container } = render(<EmptyState icon={Activity} title="No activity" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeDefined()
  })
})
