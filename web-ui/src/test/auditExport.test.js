import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAuditLogStatistics, exportAuditLogsToCSV, exportAuditLogsToJSON } from '../utils/auditExport'

const mockLogs = [
  { event_type: 'order_placed', exchange: 'binance', symbol: 'BTCUSDT', timestamp: 1700000000, side: 'buy' },
  { event_type: 'order_filled', exchange: 'binance', symbol: 'BTCUSDT', timestamp: 1700000005, side: 'buy' },
  { event_type: 'order_placed', exchange: 'okx', symbol: 'ETHUSDT', timestamp: 1700000010, side: 'sell' },
  { event_type: 'order_cancelled', exchange: 'bybit', symbol: 'SOLUSDT', timestamp: 1700000015, side: 'buy' },
]

describe('auditExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '', download: '', click: vi.fn(),
    })
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
    global.URL = { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() }
    global.Blob = vi.fn(() => ({}))
  })

  describe('getAuditLogStatistics', () => {
    it('returns empty stats for null/empty logs', () => {
      const stats = getAuditLogStatistics([])
      expect(stats.total).toBe(0)
      expect(stats.eventCounts).toEqual({})
      expect(stats.timeRange.start).toBeNull()
    })

    it('counts events by type', () => {
      const stats = getAuditLogStatistics(mockLogs)
      expect(stats.total).toBe(4)
      expect(stats.eventCounts.order_placed).toBe(2)
      expect(stats.eventCounts.order_filled).toBe(1)
      expect(stats.eventCounts.order_cancelled).toBe(1)
    })

    it('groups by exchange', () => {
      const stats = getAuditLogStatistics(mockLogs)
      expect(stats.byExchange.binance).toBe(2)
      expect(stats.byExchange.okx).toBe(1)
      expect(stats.byExchange.bybit).toBe(1)
    })

    it('groups by symbol', () => {
      const stats = getAuditLogStatistics(mockLogs)
      expect(stats.bySymbol.BTCUSDT).toBe(2)
      expect(stats.bySymbol.ETHUSDT).toBe(1)
    })

    it('computes time range', () => {
      const stats = getAuditLogStatistics(mockLogs)
      expect(stats.timeRange.start).toContain('2023')
      expect(stats.timeRange.end).toContain('2023')
    })
  })

  describe('exportAuditLogsToCSV', () => {
    it('does nothing for empty logs', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      exportAuditLogsToCSV([])
      expect(warnSpy).toHaveBeenCalledWith('No logs to export')
      warnSpy.mockRestore()
    })

    it('creates CSV blob for non-empty logs', () => {
      exportAuditLogsToCSV(mockLogs)
      expect(global.Blob).toHaveBeenCalled()
      expect(global.URL.createObjectURL).toHaveBeenCalled()
    })
  })

  describe('exportAuditLogsToJSON', () => {
    it('creates JSON blob', () => {
      exportAuditLogsToJSON(mockLogs)
      expect(global.Blob).toHaveBeenCalled()
      expect(global.URL.createObjectURL).toHaveBeenCalled()
    })
  })
})
