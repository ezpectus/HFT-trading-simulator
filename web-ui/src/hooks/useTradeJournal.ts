import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'trading-sim-journal'

export interface TradeJournalEntry {
  exchange: string
  symbol: string
  side: string
  entry_price: number
  exit_price: number
  quantity: number
  pnl: number
  reason?: string
  closed_at: number
}

export interface JournalEntry {
  note: string
  tags: string[]
  savedAt: number
}

type JournalData = Record<string, JournalEntry | string>

export function useTradeJournal() {
  const [data, setData] = useLocalStorage<JournalData>(STORAGE_KEY, {})

  const saveEntry = useCallback((key: string, note: string, tags: string[] = []) => {
    setData(prev => {
      const next = { ...prev }
      if (note && note.trim()) {
        next[key] = { note: note.trim(), tags, savedAt: Date.now() }
      } else {
        delete next[key]
      }
      return next
    })
  }, [setData])

  const saveNote = useCallback((key: string, text: string) => {
    setData(prev => {
      const next = { ...prev }
      if (text && text.trim()) {
        const existing = next[key]
        const existingTags = typeof existing === 'object' && existing !== null ? existing.tags : []
        next[key] = { note: text.trim(), tags: existingTags, savedAt: Date.now() }
      } else {
        delete next[key]
      }
      return next
    })
  }, [setData])

  const getNote = useCallback((key: string): string => {
    const entry = data[key]
    if (!entry) return ''
    if (typeof entry === 'string') return entry
    return entry.note || ''
  }, [data])

  const getEntry = useCallback((key: string): JournalEntry | null => {
    const entry = data[key]
    if (!entry) return null
    if (typeof entry === 'string') return { note: entry, tags: [], savedAt: 0 }
    return entry
  }, [data])

  const getTags = useCallback((key: string): string[] => {
    const entry = data[key]
    if (typeof entry === 'object' && entry !== null) return entry.tags || []
    return []
  }, [data])

  const deleteEntry = useCallback((key: string) => {
    setData(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [setData])

  const deleteNote = useCallback((key: string) => {
    setData(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [setData])

  const allTags = useCallback((): string[] => {
    const tags = new Set<string>()
    for (const entry of Object.values(data)) {
      if (typeof entry === 'object' && entry !== null) {
        for (const t of (entry.tags || [])) tags.add(t)
      }
    }
    return [...tags]
  }, [data])

  const exportJournalCSV = useCallback((trades: TradeJournalEntry[]) => {
    const headers = ['Exchange', 'Symbol', 'Side', 'Entry Price', 'Exit Price', 'Quantity', 'PnL', 'Reason', 'Closed At', 'Note', 'Tags']
    const rows = trades.map(t => {
      const key = tradeKey(t)
      const entry = data[key]
      const note = typeof entry === 'string' ? entry : (entry?.note || '')
      const tags = typeof entry === 'object' && entry !== null ? (entry.tags || []).join(';') : ''
      return [
        t.exchange,
        t.symbol,
        t.side,
        t.entry_price,
        t.exit_price,
        t.quantity,
        t.pnl,
        t.reason || 'MANUAL',
        new Date(t.closed_at * 1000).toISOString(),
        note.replace(/,/g, ';').replace(/\n/g, ' '),
        tags,
      ]
    })
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trade_journal_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [data])

  return { data, saveEntry, saveNote, getNote, getEntry, getTags, deleteEntry, deleteNote, allTags, exportJournalCSV }
}

export function tradeKey(trade: TradeJournalEntry): string {
  return `${trade.exchange}|${trade.symbol}|${trade.closed_at}|${trade.entry_price}`
}

export function tradeKeyFromId(id: string): string {
  return id.replace(/_/g, '|')
}

export interface ExtractedTrade extends TradeJournalEntry {
  id: string
}

export function extractTradesFromAccounts(accounts: Record<string, any> | null | undefined): ExtractedTrade[] {
  if (!accounts) return []
  const trades: ExtractedTrade[] = []
  for (const [exId, acc] of Object.entries(accounts)) {
    for (const t of (acc.trade_history || [])) {
      trades.push({
        ...t,
        exchange: exId,
        id: `${exId}_${t.symbol}_${t.closed_at || t.timestamp || Math.random()}`,
      })
    }
  }
  return trades.sort((a, b) => (b.closed_at || 0) - (a.closed_at || 0))
}
