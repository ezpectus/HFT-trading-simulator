import { useCallback, useRef } from 'react'

type SoundType = 'fill' | 'sl' | 'tp' | 'alert' | 'connect' | 'disconnect'

interface SoundConfig {
  freq: number
  duration: number
  type: OscillatorType
}

const SOUND_TYPES: Record<SoundType, SoundConfig> = {
  fill: { freq: 800, duration: 0.1, type: 'sine' },
  sl: { freq: 300, duration: 0.3, type: 'sawtooth' },
  tp: { freq: 1200, duration: 0.15, type: 'sine' },
  alert: { freq: 600, duration: 0.2, type: 'square' },
  connect: { freq: 500, duration: 0.1, type: 'sine' },
  disconnect: { freq: 200, duration: 0.3, type: 'sawtooth' },
}

export function useSoundAlerts(enabled: boolean = true) {
  const ctxRef = useRef<AudioContext | null>(null)
  const enabledRef = useRef(enabled)

  const ensureCtx = useCallback((): AudioContext | null => {
    if (!ctxRef.current) {
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        ctxRef.current = new Ctor()
      } catch {
        return null
      }
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume()
    }
    return ctxRef.current
  }, [])

  const play = useCallback((soundType: SoundType) => {
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

  const setEnabled = useCallback((val: boolean) => {
    enabledRef.current = val
  }, [])

  return { play, setEnabled }
}
