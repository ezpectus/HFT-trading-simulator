import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

export default function VirtualList({ items, itemHeight = 28, maxHeight = 300, renderItem, overscan = 5, onScroll, keyExtractor }) {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef(null)

  const { visibleItems, totalHeight, startIndex, endIndex } = useMemo(() => {
    const total = items.length
    const containerHeight = maxHeight
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const visibleCount = Math.ceil(containerHeight / itemHeight) + overscan * 2
    const end = Math.min(total, start + visibleCount)
    const visible = []
    for (let i = start; i < end; i++) {
      visible.push({ index: i, item: items[i], offsetTop: i * itemHeight })
    }
    return { visibleItems: visible, totalHeight: total * itemHeight, startIndex: start, endIndex: end }
  }, [items, itemHeight, scrollTop, maxHeight, overscan])

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop)
    if (onScroll) onScroll(e)
  }, [onScroll])

  if (items.length === 0) {
    return (
      <div className="text-[10px] text-gray-600 italic py-2 text-center">No items</div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="overflow-y-auto scrollbar-thin"
      style={{ maxHeight, position: 'relative' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map(({ item, index, offsetTop }) => (
          <div
            key={keyExtractor ? keyExtractor(item, index) : index}
            style={{
              position: 'absolute',
              top: offsetTop,
              left: 0,
              right: 0,
              height: itemHeight,
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  )
}
