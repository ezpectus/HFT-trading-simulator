import { useRef, useCallback, useState, useEffect } from 'react'

const SCHEMA_VERSION = 1
const MAX_SNAPSHOTS = 5000
const SNAPSHOT_INTERVAL_MS = 1000

export interface SessionSnapshot {
  t: number
  accounts: Record<string, any>
  fills: any[]
  signals: any[]
  candles: Record<string, any[][]>
  prices: Record<string, number>
  orderbooks: Record<string, any>
}

export interface SessionRecording {
  id: string
  name: string
  startTime: number
  endTime: number
  symbol: string
  exchange: string
  snapshots: SessionSnapshot[]
  metadata: {
    schemaVersion: number
    totalTrades: number
    finalBalance: number
    peakEquity: number
    maxDrawdown: number
  }
}

export function useSessionRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [snapshotCount, setSnapshotCount] = useState(0)
  const [savedRecordings, setSavedRecordings] = useState<SessionRecording[]>([])

  const recordingRef = useRef<SessionRecording | null>(null)
  const dataRef = useRef<any>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('trading-sim-session-recordings')
      if (saved) setSavedRecordings(JSON.parse(saved))
    } catch (e) {
      console.warn('[SessionRecorder] Failed to load recordings:', e)
    }
  }, [])

  const persistRecordings = useCallback((recordings: SessionRecording[]) => {
    setSavedRecordings(recordings)
    try {
      localStorage.setItem('trading-sim-session-recordings', JSON.stringify(recordings))
    } catch (e) {
      console.warn('[SessionRecorder] Failed to persist:', e)
    }
  }, [])

  const startRecording = useCallback((name: string, symbol: string, exchange: string) => {
    const id = `session-${Date.now()}`
    recordingRef.current = {
      id,
      name: name || `Session ${new Date().toLocaleString()}`,
      startTime: Date.now(),
      endTime: 0,
      symbol,
      exchange,
      snapshots: [],
      metadata: {
        schemaVersion: SCHEMA_VERSION,
        totalTrades: 0,
        finalBalance: 0,
        peakEquity: 0,
        maxDrawdown: 0,
      },
    }
    setIsRecording(true)
    setSnapshotCount(0)
  }, [])

  const updateData = useCallback((data: {
    accounts: Record<string, any>
    fills: any[]
    signals: any[]
    candles: Record<string, any[][]>
    prices: Record<string, number>
    orderbooks: Record<string, any>
  }) => {
    dataRef.current = data
  }, [])

  const captureSnapshot = useCallback(() => {
    if (!recordingRef.current || !dataRef.current) return
    if (recordingRef.current.snapshots.length >= MAX_SNAPSHOTS) return

    const data = dataRef.current
    const snapshot: SessionSnapshot = {
      t: Date.now(),
      accounts: JSON.parse(JSON.stringify(data.accounts)),
      fills: data.fills.slice(-200),
      signals: data.signals.slice(-50),
      candles: {},
      prices: { ...data.prices },
      orderbooks: {},
    }

    for (const [key, candles] of Object.entries(data.candles as Record<string, any[][]>)) {
      snapshot.candles[key] = candles.slice(-100)
    }

    recordingRef.current.snapshots.push(snapshot)
    setSnapshotCount(recordingRef.current.snapshots.length)
  }, [])

  const stopRecording = useCallback((): SessionRecording | null => {
    if (!recordingRef.current) return null
    const rec = recordingRef.current
    rec.endTime = Date.now()

    let peak = 0
    let maxDD = 0
    let totalTrades = 0
    let finalBalance = 0

    for (const snap of rec.snapshots) {
      for (const acc of Object.values<any>(snap.accounts)) {
        const equity = acc.equity || acc.balance || 0
        if (equity > peak) peak = equity
        const dd = peak > 0 ? (peak - equity) / peak : 0
        if (dd > maxDD) maxDD = dd
        totalTrades += (acc.trade_history?.length || 0)
        finalBalance = Math.max(finalBalance, acc.balance || 0)
      }
    }

    rec.metadata.totalTrades = totalTrades
    rec.metadata.finalBalance = finalBalance
    rec.metadata.peakEquity = peak
    rec.metadata.maxDrawdown = maxDD

    const next = [rec, ...savedRecordings].slice(0, 20)
    persistRecordings(next)

    setIsRecording(false)
    setSnapshotCount(0)
    recordingRef.current = null

    return rec
  }, [savedRecordings, persistRecordings])

  const deleteRecording = useCallback((id: string) => {
    persistRecordings(savedRecordings.filter(r => r.id !== id))
  }, [savedRecordings, persistRecordings])

  const exportRecording = useCallback((rec: SessionRecording) => {
    const json = JSON.stringify(rec, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `replay_${rec.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const importRecording = useCallback((jsonStr: string): { ok: boolean; error?: string; rec?: SessionRecording } => {
    try {
      const parsed = JSON.parse(jsonStr)
      if (!parsed.snapshots || !Array.isArray(parsed.snapshots)) {
        return { ok: false, error: 'Invalid recording format' }
      }
      const rec = parsed as SessionRecording
      const next = [rec, ...savedRecordings].slice(0, 20)
      persistRecordings(next)
      return { ok: true, rec }
    } catch (e) {
      return { ok: false, error: `Parse error: ${(e as Error).message}` }
    }
  }, [savedRecordings, persistRecordings])

  const getSnapshotAt = useCallback((rec: SessionRecording, timestamp: number): SessionSnapshot | null => {
    let best: SessionSnapshot | null = null
    let bestDiff = Infinity
    for (const snap of rec.snapshots) {
      const diff = Math.abs(snap.t - timestamp)
      if (diff < bestDiff) {
        bestDiff = diff
        best = snap
      }
    }
    return best
  }, [])

  return {
    isRecording,
    snapshotCount,
    savedRecordings,
    startRecording,
    updateData,
    captureSnapshot,
    stopRecording,
    deleteRecording,
    exportRecording,
    importRecording,
    getSnapshotAt,
    SNAPSHOT_INTERVAL_MS,
  }
}
