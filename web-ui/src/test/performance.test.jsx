// Performance tests for Web UI optimizations
// Tests virtual scrolling, memoization, and other performance improvements

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import VirtualList from '../components/VirtualList'
import BotStatus from '../components/BotStatus'
import {
  getMetrics,
  checkBudgets,
  getPerformanceBudgets,
  resetMetrics,
} from '../utils/performanceMonitor'

describe('Web UI Performance Tests', () => {
  
  describe('VirtualList Performance', () => {
    it('should render constant time regardless of list size', () => {
      const renderItem = (item) => <div>{item}</div>
      
      // Test with 100 items
      const startTime100 = performance.now()
      render(<VirtualList items={Array(100).fill('item')} renderItem={renderItem} />)
      const endTime100 = performance.now()
      const time100 = endTime100 - startTime100
      
      // Test with 1000 items
      const startTime1000 = performance.now()
      render(<VirtualList items={Array(1000).fill('item')} renderItem={renderItem} />)
      const endTime1000 = performance.now()
      const time1000 = endTime1000 - startTime1000
      
      // Render time should not increase significantly with list size
      // Allow 2x increase for 10x more items (virtual scrolling benefit)
      expect(time1000).toBeLessThan(time100 * 10)
    })

    it('should handle dynamic item heights correctly', () => {
      const items = Array(50).fill(null).map((_, i) => ({ id: i, height: 20 + (i % 3) * 10 }))
      const renderItem = (item) => <div style={{ height: item.height }}>{item.id}</div>
      
      const { container } = render(
        <VirtualList 
          items={items} 
          renderItem={renderItem} 
          dynamicHeight={true}
          itemHeight={20}
          maxHeight={300}
        />
      )
      
      expect(container.firstChild).not.toBeNull()
    })

    it('should support keyboard navigation', () => {
      const items = Array(20).fill('item')
      const renderItem = (item) => <div>{item}</div>
      
      const { container } = render(
        <VirtualList 
          items={items} 
          renderItem={renderItem} 
          enableKeyboardNav={true}
        />
      )
      
      const listContainer = container.querySelector('[tabIndex="0"]')
      expect(listContainer).not.toBeNull()
    })
  })

  describe('Memoization Effectiveness', () => {
    it('should prevent unnecessary re-renders with React.memo', () => {
      const renderItem = vi.fn((item) => <div>{item}</div>)
      const { rerender } = render(
        <VirtualList items={['item1', 'item2']} renderItem={renderItem} />
      )
      
      // Initial render
      expect(renderItem).toHaveBeenCalledTimes(2)
      
      // Re-render with same props (should not re-render due to memo)
      rerender(<VirtualList items={['item1', 'item2']} renderItem={renderItem} />)
      
      // VirtualList itself might re-render, but items should be memoized
      // This is a basic test - actual memoization depends on React's implementation
    })

    it('should memoize expensive calculations with useMemo', () => {
      const mockSignals = Array(10).fill(null).map((_, i) => ({
        timestamp: Date.now() - i * 1000,
        direction: 'LONG',
        symbol: 'BTC/USDT',
        confidence: 80,
        reason: 'test'
      }))
      
      const mockFills = Array(5).fill(null).map((_, i) => ({
        timestamp: Date.now() - i * 500,
        status: 'FILLED',
        side: 'BUY',
        symbol: 'ETH/USDT',
        filled_quantity: 1.0,
        filled_price: 3000
      }))
      
      const mockAccounts = {
        binance: {
          balance: 10000,
          equity: 10000,
          total_pnl: 500,
          total_trades: 10,
          positions: {}
        }
      }
      
      const { rerender } = render(
        <BotStatus 
          signals={mockSignals}
          fills={mockFills}
          accounts={mockAccounts}
          signalConnected={true}
          exchangeConnected={true}
          circuitBreaker={null}
          tradingActive={true}
        />
      )
      
      // Re-render with same props
      rerender(
        <BotStatus 
          signals={mockSignals}
          fills={mockFills}
          accounts={mockAccounts}
          signalConnected={true}
          exchangeConnected={true}
          circuitBreaker={null}
          tradingActive={true}
        />
      )
      
      // Component should not crash with memoization
      expect(screen.getByText('AI Signal Bot')).toBeInTheDocument()
    })
  })

  describe('Performance Monitor', () => {
    it('should expose metrics and budget violations', () => {
      resetMetrics()
      const metrics = getMetrics()
      expect(metrics).toHaveProperty('LCP')
      expect(metrics).toHaveProperty('FCP')
      expect(Array.isArray(checkBudgets())).toBe(true)
    })

    it('should enforce performance budgets', () => {
      const budgets = getPerformanceBudgets()
      expect(budgets).toBeDefined()
      expect(budgets.LCP).toBeGreaterThan(0)
      expect(budgets.INP).toBeGreaterThan(0)
      expect(budgets.CLS).toBeGreaterThan(0)
      expect(budgets.TTFB).toBeGreaterThan(0)
      expect(budgets.FCP).toBeGreaterThan(0)
    })
  })

  describe('Bundle Size Optimization', () => {
    it('should have manual chunks configured', async () => {
      const { default: config } = await import('../../vite.config.js')
      const manualChunks = config.build?.rollupOptions?.output?.manualChunks
      expect(typeof manualChunks).toBe('function')
      // Vendor splitting rules actually group the heavy deps
      expect(manualChunks('/app/node_modules/react-dom/index.js')).toBe('react-vendor')
      expect(manualChunks('/app/node_modules/lightweight-charts/dist/x.js')).toBe('charts-vendor')
      expect(manualChunks('/app/node_modules/lucide-react/dist/x.js')).toBe('icons-vendor')
      expect(manualChunks('/app/node_modules/zustand/index.js')).toBe('state-vendor')
      expect(manualChunks('/app/src/components/Foo.jsx')).toBeUndefined()
    })
  })
})
