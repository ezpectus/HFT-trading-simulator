import { memo, useState } from 'react'
import { Send, Code2, Clock, CheckCircle, XCircle, Terminal } from 'lucide-react'

const MOCK_ENDPOINTS = [
  { method: 'GET', path: '/api/v1/signals', desc: 'Get active signals' },
  { method: 'GET', path: '/api/v1/positions', desc: 'Get open positions' },
  { method: 'POST', path: '/api/v1/orders', desc: 'Submit new order' },
  { method: 'DELETE', path: '/api/v1/orders/:id', desc: 'Cancel order' },
  { method: 'GET', path: '/api/v1/account/balance', desc: 'Get account balance' },
  { method: 'GET', path: '/api/v1/market/candles', desc: 'Get candlestick data' },
  { method: 'GET', path: '/api/v1/market/orderbook', desc: 'Get order book' },
  { method: 'POST', path: '/api/v1/config/update', desc: 'Update bot config' },
]

const MOCK_RESPONSES = {
  '/api/v1/signals': { status: 200, time: 45, body: '{\n  "signals": [\n    {"symbol": "BTC/USDT", "side": "LONG", "confidence": 0.82},\n    {"symbol": "ETH/USDT", "side": "SHORT", "confidence": 0.67}\n  ]\n}' },
  '/api/v1/positions': { status: 200, time: 32, body: '{\n  "positions": [\n    {"symbol": "BTC/USDT", "qty": 0.5, "pnl": 425.0},\n    {"symbol": "SOL/USDT", "qty": -50, "pnl": 115.0}\n  ]\n}' },
  '/api/v1/orders': { status: 201, time: 128, body: '{\n  "orderId": "ord_8a3f2b",\n  "status": "PENDING",\n  "timestamp": 1708905600\n}' },
  default: { status: 200, time: 28, body: '{\n  "status": "ok",\n  "data": []\n}' },
}

function methodColor(method) {
  if (method === 'GET') return 'text-accent-blue'
  if (method === 'POST') return 'text-accent-green'
  if (method === 'DELETE') return 'text-accent-red'
  return 'text-accent-yellow'
}

function methodBg(method) {
  if (method === 'GET') return 'bg-accent-blue/20'
  if (method === 'POST') return 'bg-accent-green/20'
  if (method === 'DELETE') return 'bg-accent-red/20'
  return 'bg-accent-yellow/20'
}

const ApiPlayground = memo(function ApiPlayground({ addToast }) {
  const [selected, setSelected] = useState(null)
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSend = (endpoint) => {
    setSelected(endpoint)
    setLoading(true)
    setResponse(null)
    setTimeout(() => {
      const resp = MOCK_RESPONSES[endpoint.path] || MOCK_RESPONSES.default
      setResponse(resp)
      setLoading(false)
      if (addToast) addToast('success', `GET ${endpoint.path} — ${resp.status}`)
    }, 300)
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <Terminal size={14} className="text-accent-green" />
        <span className="text-sm font-medium">API Playground</span>
      </div>

      {/* Endpoint list */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Endpoints</div>
        <div className="space-y-0.5">
          {MOCK_ENDPOINTS.map(ep => (
            <button
              key={ep.path}
              onClick={() => handleSend(ep)}
              className={`w-full flex items-center gap-2 py-1 px-1.5 bg-bg-700 hover:bg-bg-600 transition-colors ${selected?.path === ep.path ? 'ring-1 ring-accent-blue' : ''}`}
            >
              <span className={`text-[9px] font-mono px-1 rounded ${methodBg(ep.method)} ${methodColor(ep.method)} w-12 text-center`}>
                {ep.method}
              </span>
              <span className="text-[10px] text-gray-300 font-mono flex-1 text-left truncate">{ep.path}</span>
              <Send size={10} className="text-gray-600 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Response panel */}
      <div className="bg-bg-900 border border-bg-600 rounded p-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <Code2 size={11} className="text-gray-500" />
            <span className="text-[10px] text-gray-600 uppercase">Response</span>
          </div>
          {response && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5 text-[9px]">
                <Clock size={9} className="text-gray-600" />
                <span className="text-gray-500 font-mono">{response.time}ms</span>
              </span>
              <span className={`flex items-center gap-0.5 text-[9px] font-mono ${response.status < 300 ? 'text-accent-green' : 'text-accent-red'}`}>
                {response.status < 300 ? <CheckCircle size={9} /> : <XCircle size={9} />}
                {response.status}
              </span>
            </div>
          )}
        </div>
        {loading && (
          <div className="text-[10px] text-gray-600 italic py-2">Sending request...</div>
        )}
        {!loading && !response && (
          <div className="text-[10px] text-gray-600 italic py-2">Select an endpoint to send a request</div>
        )}
        {!loading && response && (
          <pre className="text-[10px] font-mono text-accent-green overflow-x-auto whitespace-pre-wrap break-all">
            {response.body}
          </pre>
        )}
      </div>

      {/* Selected endpoint info */}
      {selected && (
        <div className="p-1.5 bg-bg-700 border border-bg-600 rounded">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-mono px-1 rounded ${methodBg(selected.method)} ${methodColor(selected.method)}`}>
              {selected.method}
            </span>
            <span className="text-[10px] text-gray-300 font-mono">{selected.path}</span>
          </div>
          <div className="text-[9px] text-gray-600 mt-0.5">{selected.desc}</div>
        </div>
      )}
    </div>
  )
})

export default memo(ApiPlayground)
