import { useState, useEffect } from 'react'
import { Search, Download, Filter, X, Calendar, AlertTriangle, CheckCircle, XCircle, Activity, Settings } from 'lucide-react'

export default function AuditLogViewer({ auditLogs = [], onExport, onFilter }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEventType, setSelectedEventType] = useState('ALL')
  const [selectedExchange, setSelectedExchange] = useState('ALL')
  const [selectedSymbol, setSelectedSymbol] = useState('ALL')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [expandedLog, setExpandedLog] = useState(null)

  // Get unique values for filters
  const eventTypes = ['ALL', ...new Set(auditLogs.map(log => log.event_type))]
  const exchanges = ['ALL', ...new Set(auditLogs.map(log => log.exchange).filter(Boolean))]
  const symbols = ['ALL', ...new Set(auditLogs.map(log => log.symbol).filter(Boolean))]

  // Filter logs
  const filteredLogs = auditLogs.filter(log => {
    if (searchTerm && !JSON.stringify(log).toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }
    if (selectedEventType !== 'ALL' && log.event_type !== selectedEventType) {
      return false
    }
    if (selectedExchange !== 'ALL' && log.exchange !== selectedExchange) {
      return false
    }
    if (selectedSymbol !== 'ALL' && log.symbol !== selectedSymbol) {
      return false
    }
    if (dateRange.start && log.timestamp < new Date(dateRange.start).getTime() / 1000) {
      return false
    }
    if (dateRange.end && log.timestamp > new Date(dateRange.end).getTime() / 1000) {
      return false
    }
    return true
  }).sort((a, b) => b.timestamp - a.timestamp)

  const getEventIcon = (eventType) => {
    const icons = {
      ORDER_SUBMITTED: <Activity size={16} className="text-blue-400" />,
      ORDER_FILLED: <CheckCircle size={16} className="text-green-400" />,
      ORDER_CANCELLED: <XCircle size={16} className="text-yellow-400" />,
      ORDER_REJECTED: <XCircle size={16} className="text-red-400" />,
      POSITION_OPENED: <CheckCircle size={16} className="text-green-400" />,
      POSITION_CLOSED: <XCircle size={16} className="text-yellow-400" />,
      POSITION_MODIFIED: <Settings size={16} className="text-blue-400" />,
      ACCOUNT_BALANCE_CHANGE: <Activity size={16} className="text-purple-400" />,
      CONFIG_CHANGE: <Settings size={16} className="text-gray-400" />,
      SYSTEM_START: <CheckCircle size={16} className="text-green-400" />,
      SYSTEM_STOP: <XCircle size={16} className="text-red-400" />,
      ERROR: <AlertTriangle size={16} className="text-red-400" />,
      WARNING: <AlertTriangle size={16} className="text-yellow-400" />,
    }
    return icons[eventType] || <Activity size={16} className="text-gray-400" />
  }

  const getEventColor = (eventType) => {
    const colors = {
      ORDER_SUBMITTED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      ORDER_FILLED: 'bg-green-500/10 text-green-400 border-green-500/20',
      ORDER_CANCELLED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      ORDER_REJECTED: 'bg-red-500/10 text-red-400 border-red-500/20',
      POSITION_OPENED: 'bg-green-500/10 text-green-400 border-green-500/20',
      POSITION_CLOSED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      POSITION_MODIFIED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      ACCOUNT_BALANCE_CHANGE: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      CONFIG_CHANGE: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
      SYSTEM_START: 'bg-green-500/10 text-green-400 border-green-500/20',
      SYSTEM_STOP: 'bg-red-500/10 text-red-400 border-red-500/20',
      ERROR: 'bg-red-500/10 text-red-400 border-red-500/20',
      WARNING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    }
    return colors[eventType] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'
  }

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  const clearFilters = () => {
    setSearchTerm('')
    setSelectedEventType('ALL')
    setSelectedExchange('ALL')
    setSelectedSymbol('ALL')
    setDateRange({ start: '', end: '' })
  }

  const handleExport = (format) => {
    if (onExport) {
      onExport(filteredLogs, format)
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-800  overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-600">
        <h3 className="text-sm font-medium text-white">Audit Logs</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-1.5  hover:bg-bg-700 transition-colors"
            title="Toggle filters"
          >
            <Filter size={16} className="text-gray-400" />
          </button>
          <div className="relative group">
            <button className="p-1.5  hover:bg-bg-700 transition-colors" title="Export">
              <Download size={16} className="text-gray-400" />
            </button>
            <div className="absolute right-0 top-full mt-1 bg-bg-700 border border-bg-600  shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={() => handleExport('json')}
                className="block w-full px-4 py-2 text-xs text-left hover:bg-bg-600 text-gray-300"
              >
                Export JSON
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="block w-full px-4 py-2 text-xs text-left hover:bg-bg-600 text-gray-300"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-4 py-3 border-b border-bg-600 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs  bg-bg-700 border border-bg-600 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue"
              />
            </div>
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="px-3 py-1.5 text-xs  bg-bg-700 border border-bg-600 text-white focus:outline-none focus:border-accent-blue"
            >
              {eventTypes.map(type => (
                <option key={type} value={type}>{type.replace('_', ' ')}</option>
              ))}
            </select>
            <select
              value={selectedExchange}
              onChange={(e) => setSelectedExchange(e.target.value)}
              className="px-3 py-1.5 text-xs  bg-bg-700 border border-bg-600 text-white focus:outline-none focus:border-accent-blue"
            >
              {exchanges.map(exch => (
                <option key={exch} value={exch}>{exch}</option>
              ))}
            </select>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="px-3 py-1.5 text-xs  bg-bg-700 border border-bg-600 text-white focus:outline-none focus:border-accent-blue"
            >
              {symbols.map(sym => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-1">
              <Calendar size={14} className="text-gray-500" />
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="px-2 py-1 text-xs  bg-bg-700 border border-bg-600 text-white focus:outline-none focus:border-accent-blue"
              />
              <span className="text-gray-500 text-xs">to</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="px-2 py-1 text-xs  bg-bg-700 border border-bg-600 text-white focus:outline-none focus:border-accent-blue"
              />
            </div>
            <button
              onClick={clearFilters}
              className="px-2 py-1 text-xs  bg-bg-700 border border-bg-600 text-gray-400 hover:text-white hover:bg-bg-600 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Activity size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No audit logs found</p>
          </div>
        ) : (
          <div className="divide-y divide-bg-600">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="px-4 py-3 hover:bg-bg-700/50 transition-colors cursor-pointer"
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getEventIcon(log.event_type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs font-medium  border ${getEventColor(log.event_type)}`}>
                        {log.event_type.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-500">{formatTimestamp(log.timestamp)}</span>
                      {log.exchange && (
                        <span className="text-xs text-gray-400">{log.exchange}</span>
                      )}
                      {log.symbol && (
                        <span className="text-xs text-accent-blue">{log.symbol}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 truncate">
                      {log.reason || log.order_id || log.position_id || 'System event'}
                    </p>
                    {expandedLog === log.id && (
                      <div className="mt-2 p-2 bg-bg-900  text-xs space-y-1">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-gray-500">User ID:</span>
                            <span className="ml-1 text-gray-300">{log.user_id}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Session ID:</span>
                            <span className="ml-1 text-gray-300">{log.session_id || 'N/A'}</span>
                          </div>
                          {log.order_id && (
                            <div>
                              <span className="text-gray-500">Order ID:</span>
                              <span className="ml-1 text-gray-300">{log.order_id}</span>
                            </div>
                          )}
                          {log.position_id && (
                            <div>
                              <span className="text-gray-500">Position ID:</span>
                              <span className="ml-1 text-gray-300">{log.position_id}</span>
                            </div>
                          )}
                          {log.old_value !== 0 && (
                            <div>
                              <span className="text-gray-500">Old Value:</span>
                              <span className="ml-1 text-gray-300">{log.old_value}</span>
                            </div>
                          )}
                          {log.new_value !== 0 && (
                            <div>
                              <span className="text-gray-500">New Value:</span>
                              <span className="ml-1 text-gray-300">{log.new_value}</span>
                            </div>
                          )}
                        </div>
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="mt-2">
                            <span className="text-gray-500">Metadata:</span>
                            <pre className="mt-1 p-2 bg-bg-800  overflow-x-auto text-gray-300">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-bg-600 text-xs text-gray-500 flex justify-between">
        <span>Showing {filteredLogs.length} of {auditLogs.length} logs</span>
        <span>Max memory: 10,000 entries</span>
      </div>
    </div>
  )
}
