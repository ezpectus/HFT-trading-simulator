import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AlertWebhook from '../components/AlertWebhook'

describe('AlertWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders with empty state', () => {
    render(<AlertWebhook />)
    expect(screen.getByText(/No webhooks configured/i)).toBeInTheDocument()
  })

  it('shows add form when + button clicked', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    expect(screen.getByPlaceholderText(/Webhook URL/i)).toBeInTheDocument()
  })

  it('adds a webhook', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    const urlInput = screen.getByPlaceholderText(/Webhook URL/i)
    fireEvent.change(urlInput, { target: { value: 'https://discord.com/api/webhooks/test' } })
    fireEvent.click(screen.getByText('Add Webhook'))
    expect(screen.queryByText('Add Webhook')).not.toBeInTheDocument()
    expect(screen.getByText('Webhook')).toBeInTheDocument()
  })

  it('does not add webhook without URL', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    fireEvent.click(screen.getByText('Add Webhook'))
    expect(screen.getByText('Add Webhook')).toBeInTheDocument()
  })

  it('removes a webhook', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    const urlInput = screen.getByPlaceholderText(/Webhook URL/i)
    fireEvent.change(urlInput, { target: { value: 'https://discord.com/api/webhooks/test' } })
    fireEvent.click(screen.getByText('Add Webhook'))
    const removeBtn = screen.getByLabelText(/Remove webhook/i)
    fireEvent.click(removeBtn)
    expect(screen.getByText(/No webhooks configured/i)).toBeInTheDocument()
  })

  it('toggles webhook enabled state', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    const urlInput = screen.getByPlaceholderText(/Webhook URL/i)
    fireEvent.change(urlInput, { target: { value: 'https://discord.com/api/webhooks/test' } })
    fireEvent.click(screen.getByText('Add Webhook'))
    const toggleBtn = screen.getByLabelText(/Enable webhook/i)
    fireEvent.click(toggleBtn)
    expect(screen.getByLabelText(/Disable webhook/i)).toBeInTheDocument()
  })

  it('toggles event selection in add form', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    const slTpBtn = screen.getByText('SL/TP Hit')
    fireEvent.click(slTpBtn)
    expect(slTpBtn.className).toContain('accent-blue')
  })

  it('persists webhooks to localStorage', () => {
    render(<AlertWebhook />)
    fireEvent.click(screen.getByLabelText('Add new webhook'))
    const urlInput = screen.getByPlaceholderText(/Webhook URL/i)
    fireEvent.change(urlInput, { target: { value: 'https://discord.com/api/webhooks/test' } })
    fireEvent.click(screen.getByText('Add Webhook'))
    const saved = JSON.parse(localStorage.getItem('trading-sim-webhooks'))
    expect(saved).toHaveLength(1)
    expect(saved[0].url).toBe('https://discord.com/api/webhooks/test')
  })
})
