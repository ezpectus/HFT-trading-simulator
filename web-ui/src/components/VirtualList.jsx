import { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

function VirtualList({ 
  items, 
  itemHeight = 28, 
  maxHeight = 300, 
  renderItem, 
  overscan = 5, 
  onScroll, 
  keyExtractor,
  dynamicHeight = false,
  enableKeyboardNav = true,
  smoothScroll = true
}) {
  const [scrollTop, setScrollTop] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const containerRef = useRef(null)
  const itemHeightsRef = useRef(new Map())
  const scrollToIndexRef = useRef(null)

  // Measure item heights for dynamic sizing
  const measureItemHeight = useCallback((index, height) => {
    if (dynamicHeight) {
      itemHeightsRef.current.set(index, height)
    }
  }, [dynamicHeight])

  // Calculate item height (dynamic or fixed)
  const getItemHeight = useCallback((index) => {
    if (dynamicHeight) {
      return itemHeightsRef.current.get(index) || itemHeight
    }
    return itemHeight
  }, [dynamicHeight, itemHeight])

  // Calculate total height and visible items
  const { visibleItems, totalHeight, startIndex, endIndex } = useMemo(() => {
    const total = items.length
    const containerHeight = maxHeight
    
    // Calculate total height
    let totalH = 0
    const offsets = []
    for (let i = 0; i < total; i++) {
      offsets.push(totalH)
      totalH += getItemHeight(i)
    }

    // Find visible range
    let start = 0
    let currentOffset = 0
    for (let i = 0; i < total; i++) {
      if (currentOffset + getItemHeight(i) > scrollTop - overscan * itemHeight) {
        start = Math.max(0, i - overscan)
        break
      }
      currentOffset += getItemHeight(i)
    }

    let end = start
    let endOffset = offsets[start] || 0
    for (let i = start; i < total; i++) {
      if (endOffset > scrollTop + containerHeight + overscan * itemHeight) {
        end = Math.min(total, i + overscan)
        break
      }
      endOffset += getItemHeight(i)
      end = i + 1
    }

    const visible = []
    for (let i = start; i < end; i++) {
      visible.push({ 
        index: i, 
        item: items[i], 
        offsetTop: offsets[i],
        height: getItemHeight(i)
      })
    }

    return { visibleItems: visible, totalHeight: totalH, startIndex: start, endIndex: end }
  }, [items, itemHeight, scrollTop, maxHeight, overscan, getItemHeight])

  const handleScroll = useCallback((e) => {
    const st = e.target.scrollTop !== undefined ? e.target.scrollTop : (e.detail && e.detail.scrollTop) || 0
    setScrollTop(st)
    if (onScroll) onScroll(e)
  }, [onScroll])

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!enableKeyboardNav) return
    
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex(prev => Math.min(items.length - 1, prev + 1))
      scrollToIndexRef.current = Math.min(items.length - 1, focusedIndex + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex(prev => Math.max(0, prev - 1))
      scrollToIndexRef.current = Math.max(0, focusedIndex - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setFocusedIndex(0)
      scrollToIndexRef.current = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      setFocusedIndex(items.length - 1)
      scrollToIndexRef.current = items.length - 1
    }
  }, [enableKeyboardNav, items.length, focusedIndex])

  // Scroll to focused index
  useEffect(() => {
    if (scrollToIndexRef.current !== null && containerRef.current) {
      const index = scrollToIndexRef.current
      let offset = 0
      for (let i = 0; i < index; i++) {
        offset += getItemHeight(i)
      }
      
      containerRef.current.scrollTo({
        top: offset - maxHeight / 2,
        behavior: smoothScroll ? 'smooth' : 'auto'
      })
      scrollToIndexRef.current = null
    }
  }, [focusedIndex, getItemHeight, maxHeight, smoothScroll])

  if (items.length === 0) {
    return (
      <div className="text-[10px] text-gray-600 italic py-2 text-center">No items</div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      tabIndex={enableKeyboardNav ? 0 : -1}
      className={`overflow-y-auto scrollbar-thin ${enableKeyboardNav ? 'focus:outline-none' : ''}`}
      style={{ maxHeight, position: 'relative' }}
    >
      <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
        {visibleItems.map(({ item, index, offsetTop, height }) => (
          <div
            key={keyExtractor ? keyExtractor(item, index) : index}
            style={{
              position: 'absolute',
              top: offsetTop,
              left: 0,
              right: 0,
              height: height,
            }}
            ref={dynamicHeight ? (el) => {
              if (el) measureItemHeight(index, el.offsetHeight)
            } : null}
            className={focusedIndex === index ? 'bg-blue-500/10' : ''}
          >
            {renderItem(item, index, focusedIndex === index)}
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(VirtualList)
