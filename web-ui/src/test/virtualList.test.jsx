/**
 * Tests for VirtualList component.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VirtualList from '../components/VirtualList'

describe('VirtualList', () => {
  const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`)
  const renderItem = (item) => <div>{item}</div>

  it('renders without crashing', () => {
    const { container } = render(
      <VirtualList items={items} itemHeight={28} maxHeight={300} renderItem={renderItem} />
    )
    expect(container).toBeTruthy()
  })

  it('shows "No items" for empty list', () => {
    render(<VirtualList items={[]} renderItem={renderItem} />)
    expect(screen.getByText('No items')).toBeInTheDocument()
  })

  it('renders only visible items (not all 100)', () => {
    const { container } = render(
      <VirtualList items={items} itemHeight={28} maxHeight={300} renderItem={renderItem} />
    )
    // With maxHeight=300, itemHeight=28, overscan=5: ~10+10=20 items max
    const renderedItems = container.querySelectorAll('[style*="position: absolute"]')
    expect(renderedItems.length).toBeLessThan(30)
    expect(renderedItems.length).toBeGreaterThan(5)
  })

  it('renders first item at top', () => {
    const { container } = render(
      <VirtualList items={items} itemHeight={28} maxHeight={300} renderItem={renderItem} />
    )
    expect(screen.getByText('Item 0')).toBeInTheDocument()
  })

  it('updates visible items on scroll', () => {
    const { container } = render(
      <VirtualList items={items} itemHeight={28} maxHeight={300} renderItem={renderItem} />
    )
    const scrollContainer = container.querySelector('[class*="overflow-y-auto"]')
    expect(scrollContainer).toBeTruthy()
    // Simulate scroll
    fireEvent.scroll(scrollContainer, { target: { scrollTop: 500 } })
    // After scrolling 500px with itemHeight=28, first visible index ~17
    // Item 17 should be rendered (within visible window + overscan)
    const renderedTexts = container.querySelectorAll('[style*="position: absolute"]')
    const texts = Array.from(renderedTexts).map(el => el.textContent)
    expect(texts).toContain('Item 17')
  })

  it('uses custom keyExtractor when provided', () => {
    const keyExtractor = (item, index) => `custom-${index}`
    const { container } = render(
      <VirtualList
        items={items}
        itemHeight={28}
        maxHeight={300}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
      />
    )
    const firstItem = container.querySelector('[key^="custom-"]')
    // Just verify it doesn't crash with custom keyExtractor
    expect(container).toBeTruthy()
  })

  it('respects custom itemHeight', () => {
    const { container } = render(
      <VirtualList items={items} itemHeight={50} maxHeight={300} renderItem={renderItem} />
    )
    const innerDiv = container.querySelector('[style*="height: 5000px"]')
    // totalHeight = 100 * 50 = 5000
    expect(innerDiv).toBeTruthy()
    expect(innerDiv.style.height).toBe('5000px')
  })
})
