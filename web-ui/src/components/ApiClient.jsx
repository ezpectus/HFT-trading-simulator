import { memo, useMemo, useState, useCallback } from 'react'
import { Link2, Key, Copy, Check, ExternalLink, Terminal, Shield } from 'lucide-react'
import { EmptyState } from './LoadingSkeleton'
import { Label } from '../utils/ui-helpers'

const DEFAULT_ENDPOINTS = [
  { id: 'exchange-ws', label: 'Exchange WS', url: 'ws://localhost:8765', type: 'ws', status: 'connected' },
  { id: 'signal-ws', label: 'Signal Bot WS', url: 'ws://localhost:8766', type: 'ws', status: 'connected' },
  { id: 'rest-candles', label: 'REST Candles', url: 'http://localhost:8080/api/candles', type: 'rest', status: 'unknown' },
  { id: 'rest-accounts', label: 'REST Accounts', url: 'http://localhost:8080/api/accounts', type: 'rest', status: 'unknown' },
  { id: 'rest-signals', label: 'REST Signals', url: 'http://localhost:8080/api/signals', type: 'rest', status: 'unknown' },
  { id: 'rest-health', label: 'REST Health', url: 'http://localhost:8080/api/health', type: 'rest', status: 'unknown' },
]

function StatusBadge({ status }) {
  const colors = {
    connected: 'text-accent-green bg-accent-green/10',
    disconnected: 'text-accent-red bg-accent-red/10',
    unknown: 'text-gray-500 bg-bg-600',
  }
  const labels = { connected: 'Connected', disconnected: 'Offline', unknown: 'Unknown' }
  return (
    <span className={`px-1.5 py-0.5 text-[9px] rounded ${colors[status] || colors.unknown}`}>
      {labels[status] || 'Unknown'}
    </span>
  )
}

function EndpointRow({ endpoint, onCopy }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    onCopy(endpoint.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [endpoint.url, onCopy])

  return (
    <div className="flex items-center justify-between py-1 px-1.5 hover:bg-bg-700 transition-colors">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${endpoint.type === 'ws' ? 'text-accent-purple bg-accent-purple/10' : 'text-accent-blue bg-accent-blue/10'}`}>
          {endpoint.type.toUpperCase()}
        </span>
        <span className="text-[11px] text-gray-400 truncate">{endpoint.label}</span>
        <span className="text-[10px] text-gray-600 truncate font-mono">{endpoint.url}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <StatusBadge status={endpoint.status} />
        <button onClick={handleCopy} className="text-gray-600 hover:text-gray-400 transition-colors" title="Copy URL">
          {copied ? <Check size={11} className="text-accent-green" /> : <Copy size={11} />}
        </button>
        <a href={endpoint.url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-400 transition-colors" title="Open">
          <ExternalLink size={11} />
        </a>
      </div>
    </div>
  )
}

const ApiClient = memo(function ApiClient({ exchange, signals, addToast }) {
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)

  const endpoints = useMemo(() => {
    return DEFAULT_ENDPOINTS.map(ep => {
      if (ep.id === 'exchange-ws') return { ...ep, status: exchange?.connected ? 'connected' : 'disconnected' }
      if (ep.id === 'signal-ws') return { ...ep, status: signals?.connected ? 'connected' : 'disconnected' }
      return ep
    })
  }, [exchange?.connected, signals?.connected])

  const connectedCount = endpoints.filter(e => e.status === 'connected').length

  const handleCopy = useCallback((url) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url)
      addToast?.('success', `Copied: ${url}`)
    }
  }, [addToast])

  const handleSaveKeys = useCallback(() => {
    if (!apiKey || !apiSecret) {
      addToast?.('warning', 'API key and secret are required')
      return
    }
    addToast?.('success', 'API credentials saved')
  }, [apiKey, apiSecret, addToast])

  const curlExample = useMemo(() => {
    return `curl -X GET http://localhost:8080/api/candles \\
  -H "X-API-Key: ${apiKey || 'YOUR_API_KEY'}" \\
  -H "Content-Type: application/json"`
  }, [apiKey])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link2 size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">API Client</span>
        </div>
        <span className="text-[10px] text-gray-500">{connectedCount}/{endpoints.length} connected</span>
      </div>

      {/* Endpoints */}
      <div>
        <Label className="mb-1">Endpoints</Label>
        <div className="bg-bg-700 border border-bg-600 rounded">
          {endpoints.map(ep => (
            <EndpointRow key={ep.id} endpoint={ep} onCopy={handleCopy} />
          ))}
        </div>
      </div>

      {/* API Credentials */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <Key size={11} className="text-accent-yellow" />
          <Label>API Credentials</Label>
        </div>
        <div className="space-y-1.5">
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key"
            className="w-full px-2 py-1 text-[11px] bg-bg-700 border border-bg-600 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue"
          />
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="API Secret"
              className="w-full px-2 py-1 text-[11px] bg-bg-700 border border-bg-600 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue pr-12"
            />
            <button
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-gray-600 hover:text-gray-400"
            >
              {showSecret ? 'Hide' : 'Show'}
            </button>
          </div>
          <button
            onClick={handleSaveKeys}
            className="w-full px-2 py-1 text-[11px] bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors"
          >
            Save Credentials
          </button>
        </div>
      </div>

      {/* cURL Example */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <Terminal size={11} className="text-accent-green" />
          <Label>cURL Example</Label>
        </div>
        <pre className="bg-bg-900 border border-bg-600 p-2 text-[10px] text-gray-400 font-mono overflow-x-auto whitespace-pre-wrap">
          {curlExample}
        </pre>
      </div>

      {/* Security Warning */}
      <div className="flex items-start gap-1.5 p-2 bg-accent-yellow/5 border border-accent-yellow/20">
        <Shield size={11} className="text-accent-yellow shrink-0 mt-0.5" />
        <span className="text-[10px] text-gray-500">
          Credentials kept in memory only and cleared on page refresh. Do not use production keys in dev mode.
        </span>
      </div>

      {endpoints.length === 0 && (
        <EmptyState icon={Link2} title="No API endpoints" subtitle="Endpoints will appear when connected" />
      )}
    </div>
  )
})

export default ApiClient
