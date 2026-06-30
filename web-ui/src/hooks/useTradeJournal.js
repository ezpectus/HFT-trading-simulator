import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'trading-sim-journal'

export function useTradeJournal() {
  const [notes, setNotes] = useState({})

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setNotes(JSON.parse(saved))
    } catch (e) {
      console.warn('[useTradeJournal] Failed to load notes:', e)
    }
  }, [])

  const saveNote = useCallback((tradeKey, text) => {
    setNotes(prev => {
      const next = { ...prev }
      if (text && text.trim()) {
        next[tradeKey] = text.trim()
      } else {
        delete next[tradeKey]
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch (e) {
        console.warn('[useTradeJournal] Failed to save note:', e)
      }
      return next
    })
  }, [])

  const getNote = useCallback((tradeKey) => {
    return notes[tradeKey] || ''
  }, [notes])

  const deleteNote = useCallback((tradeKey) => {
    setNotes(prev => {
      const next = { ...prev }
      delete next[tradeKey]
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch (e) {
        console.warn('[useTradeJournal] Failed to delete note:', e)
      }
      return next
    })
  }, [])

  const exportJournalCSV = useCallback((trades) => {
    const headers = ['Exchange', 'Symbol', 'Side', 'Entry Price', 'Exit Price', 'Quantity', 'PnL', 'Reason', 'Closed At', 'Note']
    const rows = trades.map(t => {
      const key = tradeKey(t)
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
        (notes[key] || '').replace(/,/g, ';').replace(/\n/g, ' '),
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
  }, [notes])

  return { notes, saveNote, getNote, deleteNote, exportJournalCSV }
}

export function tradeKey(trade) {
  return `${trade.exchange}|${trade.symbol}|${trade.closed_at}|${trade.entry_price}`
}
