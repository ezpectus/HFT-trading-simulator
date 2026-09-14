import { useEffect, useRef, useState, useCallback } from 'react'

type MessageData = Record<string, unknown> & { type?: string; symbol?: string; timestamp?: number }

export interface UseWebSocketOptions {
  onMessage?: (data: MessageData) => void
  onOpen?: () => void
  onClose?: () => void
  autoConnect?: boolean
  /** Sent as the very first frame on every (re)connect — must precede
   *  the auto-subscribe so auth-required servers don't drop us. */
  authToken?: string
  syncOnReconnect?: boolean
  getLastTimestamp?: () => number
  maxReconnects?: number
}

export interface UseWebSocketReturn {
  connected: boolean
  error: string | null
  send: (data: string | object) => boolean
  connect: () => void
  disconnect: () => void
  latency: number | null
  reconnects: number
  nextReconnectIn: number | null
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    onMessage, onOpen, onClose, autoConnect = true,
    authToken, syncOnReconnect = false, getLastTimestamp,
    maxReconnects = 20,
  } = options

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPingRef = useRef<number>(0)
  // Counts failed attempts (each onclose/catch that schedules a retry), NOT
  // successful opens — the old code counted opens, so a never-connecting
  // server retried forever and the maxReconnects cap could never fire (S231).
  const reconnectAttempts = useRef<number>(0)
  const backoffRef = useRef<number>(1000)
  const maxReconnectsRef = useRef<number>(maxReconnects)
  const lastTimestampRef = useRef<number>(0)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const manualCloseRef = useRef<boolean>(false)
  const isRetryRef = useRef<boolean>(false)
  const outgoingQueueRef = useRef<(string | object)[]>([])

  const [connected, setConnected] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [reconnects, setReconnects] = useState<number>(0)
  const [nextReconnectIn, setNextReconnectIn] = useState<number | null>(null)

  const handlersRef = useRef({ onMessage, onOpen, onClose, getLastTimestamp })

  useEffect(() => {
    handlersRef.current = { onMessage, onOpen, onClose, getLastTimestamp }
  })

  const scheduleRetry = useCallback(() => {
    // One failed attempt counted per onclose — the cap is reachable for a
    // server that never accepts (S231).
    reconnectAttempts.current += 1
    if (!autoConnect || reconnectAttempts.current >= maxReconnectsRef.current) {
      setError(`Max reconnections (${maxReconnectsRef.current}) reached — call connect() to retry`)
      setNextReconnectIn(null)
      return
    }
    const delay = backoffRef.current
    backoffRef.current = Math.min(backoffRef.current * 2, 30000)
    setNextReconnectIn(Math.ceil(delay / 1000))
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    countdownTimer.current = setInterval(() => {
      setNextReconnectIn((prev) => (prev !== null && prev > 1 ? prev - 1 : null))
    }, 1000)
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null
      if (countdownTimer.current) clearInterval(countdownTimer.current)
      setNextReconnectIn(null)
      isRetryRef.current = true
      connect()
    }, delay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
    if (isRetryRef.current) {
      // Auto-retry path — keep the attempt count so maxReconnects can cap it.
      isRetryRef.current = false
    } else {
      // Manual/effect connect — fresh budget so "call connect() to retry" works.
      reconnectAttempts.current = 0
    }
    manualCloseRef.current = false

    try {
      // Second arg is subprotocols, NOT extensions — permessage-deflate is
      // offered by the browser automatically; passing it here was a no-op
      // knob that could poison subprotocol negotiation (S231).
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        const wasReconnect = reconnectAttempts.current > 0
        setConnected(true)
        setError(null)
        setNextReconnectIn(null)
        if (countdownTimer.current) {
          clearInterval(countdownTimer.current)
          countdownTimer.current = null
        }
        backoffRef.current = 1000
        reconnectAttempts.current = 0
        if (wasReconnect) setReconnects((r) => r + 1)

        if (authToken) {
          ws.send(JSON.stringify({ type: 'auth', token: authToken }))
        }

        if (syncOnReconnect && wasReconnect) {
          const lastTs = handlersRef.current.getLastTimestamp?.() || lastTimestampRef.current || 0
          ws.send(JSON.stringify({ type: 'sync_state', last_timestamp: lastTs }))
        } else {
          ws.send(JSON.stringify({ type: 'subscribe' }))
        }

        if (outgoingQueueRef.current.length > 0) {
          const queued = outgoingQueueRef.current
          outgoingQueueRef.current = []
          for (const msg of queued) {
            try {
              ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
            } catch {
              // Ignore individual flush errors
            }
          }
        }

        pingTimer.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            lastPingRef.current = Date.now()
            wsRef.current.send(JSON.stringify({ type: 'ping' }))
          }
        }, 5000)
        handlersRef.current.onOpen?.()
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data: MessageData = JSON.parse(event.data)

          if (data.type === 'pong' && lastPingRef.current > 0) {
            setLatency(Date.now() - lastPingRef.current)
            lastPingRef.current = 0
          }

          const ts = (data.timestamp || data.received_at || data.time || 0) as number
          if (ts > lastTimestampRef.current) lastTimestampRef.current = ts

          handlersRef.current.onMessage?.(data)
        } catch {
          console.error('[useWebSocket] Failed to parse message')
        }
      }

      ws.onerror = () => {
        setError(`WebSocket error: ${url} (attempt #${reconnectAttempts.current})`)
      }

      ws.onclose = () => {
        setConnected(false)
        setLatency(null)
        if (pingTimer.current) clearInterval(pingTimer.current)
        handlersRef.current.onClose?.()
        if (!manualCloseRef.current) scheduleRetry()
      }
    } catch (e) {
      const err = e as Error
      setError(err.message)
      scheduleRetry()
    }
  }, [url, autoConnect, authToken, syncOnReconnect, maxReconnects, scheduleRetry])

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
    if (pingTimer.current) clearInterval(pingTimer.current)
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    setNextReconnectIn(null)
    outgoingQueueRef.current = []
    manualCloseRef.current = true
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    setLatency(null)
  }, [])

  const send = useCallback((data: string | object): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data))
      return true
    }
    if (outgoingQueueRef.current.length < 100) {
      outgoingQueueRef.current.push(data)
    }
    return false
  }, [])

  useEffect(() => {
    if (autoConnect) connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pingTimer.current) clearInterval(pingTimer.current)
      if (countdownTimer.current) clearInterval(countdownTimer.current)
      wsRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect, autoConnect])

  return {
    connected, error, send, connect, disconnect, latency, reconnects,
    nextReconnectIn,
  }
}
