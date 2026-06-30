import { useCallback, useRef } from 'react'

const SOUND_TYPES = {
  fill: { freq: 800, duration: 0.1, type: 'sine' },
  sl: { freq: 300, duration: 0.3, type: 'sawtooth' },
  tp: { freq: 1200, duration: 0.15, type: 'sine' },
  alert: { freq: 600, duration: 0.2, type: 'square' },
  connect: { freq: 500, duration: 0.1, type: 'sine' },
  disconnect: { freq: 200, duration: 0.3, type: 'sawtooth' },
}

export function useSoundAlerts(enabled = true) {
  const ctxRef = useRef(null)
  const enabledRef = useRef(enabled)

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      try {
        ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      } catch (e) {
        return null
      }
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume()
    }
    return ctxRef.current
  }, [])

  const play = useCallback((soundType) => {
    if (!enabledRef.current) return
    const config = SOUND_TYPES[soundType]
    if (!config) return

    const ctx = ensureCtx()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = config.type
    osc.frequency.value = config.freq

    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + config.duration)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + config.duration)
  }, [ensureCtx])

  const setEnabled = useCallback((val) => {
    enabledRef.current = val
  }, [])

  return { play, setEnabled }
}
