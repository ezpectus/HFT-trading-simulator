import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Auth from '../components/Auth'

// Real token-probe auth (S232): the component opens a WebSocket, sends
// {type:'auth',token}, and marks Authenticated only on a real auth_ok.
vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (key, defaultValue) => {
    const [value, setValue] = useState(() => {
      try { return localStorage.getItem(key) ?? defaultValue } catch { return defaultValue }
    })
    const setter = (v) => {
      setValue(v)
      try { v ? localStorage.setItem(key, v) : localStorage.removeItem(key) } catch { }
    }
    return [value, setter, () => { }]
  },
}))
vi.mock('../hooks/useExchangeData', () => ({
  WS_EXCHANGE: 'ws://test:8765',
  readAuthToken: () => { try { return localStorage.getItem('trading-sim-auth-token') || '' } catch { return '' } },
}))

let lastWs = null
class FakeWs {
  constructor(url) { this.url = url; lastWs = this; FakeWs.instances.push(this) }
  send() { }
  close() { this.onclose?.() }
  respond(type) { this.onmessage?.({ data: JSON.stringify({ type }) }) }
}
FakeWs.instances = []

describe('Auth (S232 real token flow)', () => {
  beforeEach(() => {
    localStorage.clear()
    FakeWs.instances = []
    vi.stubGlobal('WebSocket', FakeWs)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('renders the token form when not authenticated', () => {
    render(<Auth addToast={vi.fn()} />)
    expect(screen.getByText('Authentication')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Control token/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Username')).not.toBeInTheDocument()
  })

  it('warns on empty token', () => {
    const addToast = vi.fn()
    render(<Auth addToast={addToast} />)
    fireEvent.click(screen.getByText(/Verify & apply token/))
    expect(addToast).toHaveBeenCalledWith('warning', 'Control token required')
    expect(FakeWs.instances.length).toBe(0)
  })

  it('marks authenticated only on real auth_ok', () => {
    const addToast = vi.fn()
    render(<Auth addToast={addToast} />)
    fireEvent.change(screen.getByPlaceholderText(/Control token/i), { target: { value: 'tok-1' } })
    fireEvent.click(screen.getByText(/Verify & apply token/))
    expect(FakeWs.instances.length).toBe(1)
    act(() => { lastWs.onopen?.() })
    act(() => { lastWs.respond('auth_ok') })
    expect(localStorage.getItem('trading-sim-auth-token')).toBe('tok-1')
    expect(addToast).toHaveBeenCalledWith('success', expect.stringContaining('Authenticated'))
    expect(screen.getByText('Authenticated')).toBeInTheDocument()
  })

  it('auth_failed does not store the token', () => {
    const addToast = vi.fn()
    render(<Auth addToast={addToast} />)
    fireEvent.change(screen.getByPlaceholderText(/Control token/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByText(/Verify & apply token/))
    act(() => { lastWs.onopen?.() })
    act(() => { lastWs.respond('auth_failed') })
    expect(localStorage.getItem('trading-sim-auth-token')).toBe(null)
    expect(addToast).toHaveBeenCalledWith('error', 'Server rejected the token')
    expect(screen.getByText(/Authentication failed/)).toBeInTheDocument()
  })
})
