import { useEffect, useRef, useState, useCallback } from 'react'

type MessageData = Record<string, unknown> & { type?: string; symbol?: string; timestamp?: number }

interface RingBuffer {
  push(item: MessageData): void
  toArray(): MessageData[]
  size: number
  clear(): void
}

function createRingBuffer(maxSize: number = 5000): RingBuffer {
  const buffer: (MessageData | undefined)[] = new Array(maxSize)
  let head = 0
  let count = 0

  return {
    push(item: MessageData) {
      buffer[head] = item
      head = (head + 1) % maxSize
      if (count < maxSize) count++
    },
    toArray(): MessageData[] {
      if (count < maxSize) return buffer.slice(0, count) as MessageData[]
      return [...buffer.slice(head), ...buffer.slice(0, head)] as MessageData[]
    },
    get size() { return count },
    clear() { head = 0; count = 0; buffer.fill(undefined) },
  }
}

export interface UseWebSocketOptions {
  onMessage?: (data: MessageData) => void
  onOpen?: () => void
  onClose?: () => void
  autoConnect?: boolean
  syncOnReconnect?: boolean
  getLastTimestamp?: () => number
  maxBufferSize?: number
  batchInterval?: number
  batchTypes?: string[]
  perMessageDeflate?: boolean
}

export interface UseWebSocketReturn {
  connected: boolean
  error: string | null
  send: (data: string | object) => boolean
  connect: () => void
  disconnect: () => void
  latency: number | null
  reconnects: number
  bufferSize: number
  getBufferedMessages: () => MessageData[]
  clearBuffer: () => void
  nextReconnectIn: number | null
  queueSize: number
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    onMessage, onOpen, onClose, autoConnect = true,
    syncOnReconnect = false, getLastTimestamp,
    maxBufferSize = 5000,
    batchInterval = 50,
    batchTypes = [],
    perMessageDeflate = true,
  } = options

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPingRef = useRef<number>(0)
  const reconnectCount = useRef<number>(0)
  const backoffRef = useRef<number>(1000)
  const ringBufferRef = useRef<RingBuffer>(createRingBuffer(maxBufferSize))
  const batchQueueRef = useRef<MessageData[]>([])
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTimestampRef = useRef<number>(0)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const outgoingQueueRef = useRef<(string | object)[]>([])

  const [connected, setConnected] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [reconnects, setReconnects] = useState<number>(0)
  const [bufferSize, setBufferSize] = useState<number>(0)
  const [nextReconnectIn, setNextReconnectIn] = useState<number | null>(null)
  const [queueSize, setQueueSize] = useState<number>(0)

  const handlersRef = useRef({ onMessage, onOpen, onClose, getLastTimestamp })

  useEffect(() => {
    handlersRef.current = { onMessage, onOpen, onClose, getLastTimestamp }
  })

  const flushBatch = useCallback(() => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current)
      batchTimerRef.current = null
    }
    const queue = batchQueueRef.current
    if (queue.length === 0) return

    const merged = new Map<string, MessageData>()
    for (const msg of queue) {
      const key = (msg.type || '') + (msg.symbol ? `:${msg.symbol}` : '')
      merged.set(key, msg)
    }

    for (const msg of merged.values()) {
      handlersRef.current.onMessage?.(msg)
    }

    batchQueueRef.current = []
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }

    try {
      const ws = new WebSocket(url, perMessageDeflate ? ['permessage-deflate'] : undefined)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        setError(null)
        setNextReconnectIn(null)
        if (countdownTimer.current) {
          clearInterval(countdownTimer.current)
          countdownTimer.current = null
        }
        backoffRef.current = 1000
        reconnectCount.current += 1
        if (reconnectCount.current > 1) {
          setReconnects(reconnectCount.current - 1)
        }

        if (syncOnReconnect && reconnectCount.current > 1) {
          const lastTs = handlersRef.current.getLastTimestamp?.() || lastTimestampRef.current || 0
          ws.send(JSON.stringify({ type: 'sync_state', last_timestamp: lastTs }))
        } else {
          ws.send(JSON.stringify({ type: 'subscribe' }))
        }

        if (outgoingQueueRef.current.length > 0) {
          const queued = outgoingQueueRef.current
          outgoingQueueRef.current = []
          setQueueSize(0)
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

          ringBufferRef.current.push(data)
          setBufferSize(ringBufferRef.current.size)

          const shouldBatch = batchTypes.length > 0 && batchTypes.includes(data.type || '')

          if (shouldBatch) {
            batchQueueRef.current.push(data)
            if (!batchTimerRef.current) {
              batchTimerRef.current = setTimeout(flushBatch, batchInterval)
            }
          } else {
            if (batchQueueRef.current.length > 0) flushBatch()
            handlersRef.current.onMessage?.(data)
          }
        } catch (e) {
          const raw = typeof event.data === 'string' ? event.data : String(event.data)
          const sanitized = raw.replace(/[\n\r]/g, ' ').slice(0, 200)
          console.error('[useWebSocket] Failed to parse message:', e, sanitized)
        }
      }

      ws.onerror = () => {
        setError(`WebSocket error: ${url} (reconnect #${reconnectCount.current})`)
      }

      ws.onclose = () => {
        setConnected(false)
        setLatency(null)
        if (pingTimer.current) clearInterval(pingTimer.current)
        flushBatch()
        handlersRef.current.onClose?.()
        if (autoConnect) {
          const delay = backoffRef.current
          backoffRef.current = Math.min(backoffRef.current * 2, 30000)
          setNextReconnectIn(Math.ceil(delay / 1000))
          if (countdownTimer.current) clearInterval(countdownTimer.current)
          countdownTimer.current = setInterval(() => {
            setNextReconnectIn((prev) => (prev !== null && prev > 1 ? prev - 1 : null))
          }, 1000)
          reconnectTimer.current = setTimeout(() => {
            if (countdownTimer.current) clearInterval(countdownTimer.current)
            setNextReconnectIn(null)
            connect()
          }, delay)
        }
      }
    } catch (e) {
      const err = e as Error
      setError(err.message)
      if (autoConnect) {
        const delay = backoffRef.current
        backoffRef.current = Math.min(backoffRef.current * 2, 30000)
        setNextReconnectIn(Math.ceil(delay / 1000))
        if (countdownTimer.current) clearInterval(countdownTimer.current)
        countdownTimer.current = setInterval(() => {
          setNextReconnectIn((prev) => (prev !== null && prev > 1 ? prev - 1 : null))
        }, 1000)
        reconnectTimer.current = setTimeout(() => {
          if (countdownTimer.current) clearInterval(countdownTimer.current)
          setNextReconnectIn(null)
          connect()
        }, delay)
      }
    }
  }, [url, autoConnect, perMessageDeflate, batchInterval, flushBatch, syncOnReconnect])

  const batchTypesKey = batchTypes.join(',')

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    if (pingTimer.current) clearInterval(pingTimer.current)
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    setNextReconnectIn(null)
    outgoingQueueRef.current = []
    setQueueSize(0)
    flushBatch()
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    setLatency(null)
  }, [flushBatch])

  const send = useCallback((data: string | object): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data))
      return true
    }
    if (outgoingQueueRef.current.length < 100) {
      outgoingQueueRef.current.push(data)
      setQueueSize(outgoingQueueRef.current.length)
    }
    return false
  }, [])

  const getBufferedMessages = useCallback((): MessageData[] => {
    return ringBufferRef.current.toArray()
  }, [])

  const clearBuffer = useCallback(() => {
    ringBufferRef.current.clear()
    setBufferSize(0)
  }, [])

  useEffect(() => {
    if (autoConnect) connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pingTimer.current) clearInterval(pingTimer.current)
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
      if (countdownTimer.current) clearInterval(countdownTimer.current)
      flushBatch()
      wsRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect, autoConnect, flushBatch, batchTypesKey])

  return {
    connected, error, send, connect, disconnect, latency, reconnects,
    bufferSize, getBufferedMessages, clearBuffer, nextReconnectIn, queueSize,
  }
}
