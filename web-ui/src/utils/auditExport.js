/**
 * Audit Log Export Utilities
 * 
 * Functions for exporting audit logs to various formats (JSON, CSV)
 */

export function exportAuditLogsToJSON(logs) {
  const data = JSON.stringify(logs, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportAuditLogsToCSV(logs) {
  if (!logs || logs.length === 0) {
    console.warn('No logs to export')
    return
  }

  const headers = Object.keys(logs[0])
  const csvContent = [
    headers.join(','),
    ...logs.map(log => 
      headers.map(header => {
        const value = log[header]
        // Handle nested objects and arrays
        if (typeof value === 'object' && value !== null) {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`
        }
        // Escape quotes and commas
        const stringValue = String(value ?? '')
        return `"${stringValue.replace(/"/g, '""')}"`
      }).join(',')
    )
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportAuditLogsToExcel(logs) {
  // Simple CSV export for now - could use xlsx library for true Excel
  exportAuditLogsToCSV(logs)
}

export function getAuditLogStatistics(logs) {
  if (!logs || logs.length === 0) {
    return {
      total: 0,
      eventCounts: {},
      byExchange: {},
      bySymbol: {},
      timeRange: { start: null, end: null },
    }
  }

  const eventCounts = {}
  const byExchange = {}
  const bySymbol = {}
  let startTimestamp = Infinity
  let endTimestamp = -Infinity

  logs.forEach(log => {
    // Count by event type
    eventCounts[log.event_type] = (eventCounts[log.event_type] || 0) + 1
    
    // Count by exchange
    if (log.exchange) {
      byExchange[log.exchange] = (byExchange[log.exchange] || 0) + 1
    }
    
    // Count by symbol
    if (log.symbol) {
      bySymbol[log.symbol] = (bySymbol[log.symbol] || 0) + 1
    }
    
    // Track time range
    if (log.timestamp < startTimestamp) startTimestamp = log.timestamp
    if (log.timestamp > endTimestamp) endTimestamp = log.timestamp
  })

  return {
    total: logs.length,
    eventCounts,
    byExchange,
    bySymbol,
    timeRange: {
      start: startTimestamp !== Infinity ? new Date(startTimestamp * 1000).toISOString() : null,
      end: endTimestamp !== -Infinity ? new Date(endTimestamp * 1000).toISOString() : null,
    },
  }
}
