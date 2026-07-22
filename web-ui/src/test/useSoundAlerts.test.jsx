/**
 * Tests for useSoundAlerts hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSoundAlerts } from '../hooks/useSoundAlerts'

// Mock AudioContext — must be a proper class to work with `new`
const createOsc = () => ({
  type: 'sine',
  frequency: { value: 0 },
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
})
const createGain = () => ({
  gain: {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
  connect: vi.fn(),
})

class MockAudioContext {
  static instances = []
  static mockClear() { MockAudioContext.instances = [] }

  constructor() {
    this.state = 'running'
    this.currentTime = 0
    this.destination = { _isDestination: true }
    MockAudioContext.instances.push(this)
  }
  resume() { this.state = 'running' }
  createOscillator() { return createOsc() }
  createGain() { return createGain() }
}

describe('useSoundAlerts', () => {

  beforeEach(() => {
    MockAudioContext.mockClear()
    vi.stubGlobal('AudioContext', MockAudioContext)
    vi.stubGlobal('webkitAudioContext', MockAudioContext)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns play and setEnabled functions', () => {
    const { result } = renderHook(() => useSoundAlerts())
    expect(typeof result.current.play).toBe('function')
    expect(typeof result.current.setEnabled).toBe('function')
  })

  it('play does not throw for valid sound types', () => {
    const { result } = renderHook(() => useSoundAlerts())
    const types = ['fill', 'sl', 'tp', 'alert', 'connect', 'disconnect']
    for (const type of types) {
      expect(() => act(() => result.current.play(type))).not.toThrow()
    }
  })

  it('play does nothing for invalid sound type', () => {
    const { result } = renderHook(() => useSoundAlerts())
    expect(() => act(() => result.current.play('invalid'))).not.toThrow()
  })

  it('play does nothing when disabled', () => {
    const { result } = renderHook(() => useSoundAlerts(false))
    act(() => result.current.play('fill'))
    expect(MockAudioContext.instances).toHaveLength(0)
  })

  it('setEnabled toggles sound playback', () => {
    const { result } = renderHook(() => useSoundAlerts(false))
    act(() => result.current.play('fill'))
    expect(MockAudioContext.instances).toHaveLength(0)

    act(() => result.current.setEnabled(true))
    act(() => result.current.play('fill'))
    expect(MockAudioContext.instances).toHaveLength(1)
  })

  it('creates AudioContext lazily on first play', () => {
    const { result } = renderHook(() => useSoundAlerts())
    expect(MockAudioContext.instances).toHaveLength(0)

    act(() => result.current.play('fill'))
    expect(MockAudioContext.instances).toHaveLength(1)
  })

  it('reuses AudioContext on subsequent plays', () => {
    const { result } = renderHook(() => useSoundAlerts())
    act(() => result.current.play('fill'))
    act(() => result.current.play('sl'))
    act(() => result.current.play('tp'))
    expect(MockAudioContext.instances).toHaveLength(1)
  })

  it('creates oscillator and gain nodes on play', () => {
    const { result } = renderHook(() => useSoundAlerts())
    // First play creates the AudioContext instance
    act(() => result.current.play('fill'))
    const ctx = MockAudioContext.instances[0]
    expect(ctx).toBeDefined()
    const createOscSpy = vi.spyOn(ctx, 'createOscillator')
    const createGainSpy = vi.spyOn(ctx, 'createGain')

    act(() => result.current.play('alert'))

    expect(createOscSpy).toHaveBeenCalledTimes(1)
    expect(createGainSpy).toHaveBeenCalledTimes(1)
  })

  it('sets oscillator type and frequency from config', () => {
    const { result } = renderHook(() => useSoundAlerts())
    // First play creates the AudioContext instance
    act(() => result.current.play('fill'))
    const ctx = MockAudioContext.instances[0]
    expect(ctx).toBeDefined()
    const createOscSpy = vi.spyOn(ctx, 'createOscillator')

    act(() => result.current.play('sl'))

    const osc = createOscSpy.mock.results[0].value
    expect(osc.type).toBe('sawtooth')
    expect(osc.frequency.value).toBe(300)
  })

  it('resumes suspended AudioContext', () => {
    const { result } = renderHook(() => useSoundAlerts())
    // First play creates the AudioContext instance
    act(() => result.current.play('fill'))
    const ctx = MockAudioContext.instances[0]
    expect(ctx).toBeDefined()
    ctx.state = 'suspended'
    const resumeSpy = vi.spyOn(ctx, 'resume')

    act(() => result.current.play('alert'))
    expect(resumeSpy).toHaveBeenCalled()
  })
})
