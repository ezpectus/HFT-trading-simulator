import { memo, useMemo, useState } from 'react'
import { Database, Table, RefreshCw, Search, HardDrive, FileText } from 'lucide-react'
import { EmptyState } from './LoadingSkeleton'

const MOCK_TABLES = [
  { name: 'signals', rows: 15234, size: '2.4 MB', columns: ['id', 'symbol', 'direction', 'confidence', 'strategy', 'timestamp'] },
  { name: 'fills', rows: 3421, size: '1.1 MB', columns: ['id', 'order_id', 'symbol', 'exchange', 'side', 'quantity', 'price', 'timestamp'] },
  { name: 'candles', rows: 125000, size: '15.6 MB', columns: ['id', 'exchange', 'symbol', 'timestamp', 'open', 'high', 'low', 'close', 'volume'] },
  { name: 'positions', rows: 45, size: '0.02 MB', columns: ['id', 'exchange', 'symbol', 'side', 'quantity', 'entry_price', 'current_price', 'pnl'] },
  { name: 'orders', rows: 8902, size: '3.2 MB', columns: ['id', 'exchange', 'symbol', 'side', 'type', 'quantity', 'price', 'status', 'timestamp'] },
  { name: 'accounts', rows: 3, size: '0.01 MB', columns: ['exchange', 'balance', 'equity', 'total_pnl', 'total_trades'] },
]

const MOCK_ROWS = {
  signals: [
    { id: 1, symbol: 'BTC/USDT', direction: 'LONG', confidence: 78, strategy: 'trend', timestamp: 1700000000 },
    { id: 2, symbol: 'ETH/USDT', direction: 'SHORT', confidence: 65, strategy: 'meanrev', timestamp: 1700000060 },
    { id: 3, symbol: 'SOL/USDT', direction: 'LONG', confidence: 82, strategy: 'ml_ensemble', timestamp: 1700000120 },
  ],
  fills: [
    { id: 1, order_id: 101, symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', quantity: 0.1, price: 43200, timestamp: 1700000000 },
    { id: 2, order_id: 102, symbol: 'ETH/USDT', exchange: 'okx', side: 'SELL', quantity: 1.5, price: 2580, timestamp: 1700000060 },
  ],
}

const DatabaseViewer = memo(function DatabaseViewer({ addToast }) {
  const [selectedTable, setSelectedTable] = useState(null)
  const [search, setSearch] = useState('')

  const filteredTables = useMemo(() => {
    if (!search) return MOCK_TABLES
    return MOCK_TABLES.filter(t => t.name.includes(search.toLowerCase()))
  }, [search])

  const totalSize = useMemo(() => {
    return MOCK_TABLES.reduce((sum, t) => {
      const mb = parseFloat(t.size)
      return sum + (isNaN(mb) ? 0 : mb)
    }, 0)
  }, [])

  const totalRows = MOCK_TABLES.reduce((sum, t) => sum + t.rows, 0)
  const rows = selectedTable ? (MOCK_ROWS[selectedTable] || []) : []

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Database size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Database Viewer</span>
        </div>
        <span className="text-[10px] text-gray-600">{MOCK_TABLES.length} tables</span>
      </div>

      {/* DB Stats */}
      <div className="grid grid-cols-3 gap-1 p-2 bg-bg-700 border border-bg-600">
        <div className="flex flex-col items-center">
          <HardDrive size={11} className="text-gray-600 mb-0.5" />
          <span className="text-[9px] text-gray-600">Total Size</span>
          <span className="text-[11px] text-accent-blue">{totalSize.toFixed(1)} MB</span>
        </div>
        <div className="flex flex-col items-center">
          <Table size={11} className="text-gray-600 mb-0.5" />
          <span className="text-[9px] text-gray-600">Total Rows</span>
          <span className="text-[11px] text-gray-300">{totalRows.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-center">
          <FileText size={11} className="text-gray-600 mb-0.5" />
          <span className="text-[9px] text-gray-600">Engine</span>
          <span className="text-[11px] text-gray-300">SQLite</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tables..."
          className="w-full pl-6 pr-2 py-1 text-[10px] bg-bg-700 border border-bg-600 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue"
        />
      </div>

      {/* Table list */}
      <div className="space-y-0.5 max-h-[150px] overflow-y-auto scrollbar-thin">
        {filteredTables.map(table => (
          <button
            key={table.name}
            onClick={() => setSelectedTable(selectedTable === table.name ? null : table.name)}
            className={`w-full flex items-center justify-between px-2 py-1 text-[10px] transition-colors ${
              selectedTable === table.name ? 'bg-accent-blue/20 text-accent-blue' : 'bg-bg-700 text-gray-400 hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-1">
              <Table size={10} />
              {table.name}
            </span>
            <span className="text-gray-600">{table.rows.toLocaleString()} rows</span>
          </button>
        ))}
      </div>

      {/* Selected table data */}
      {selectedTable && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-600 uppercase">{selectedTable} — preview</span>
            <button
              onClick={() => addToast?.('info', `Refreshing ${selectedTable}...`)}
              className="text-gray-600 hover:text-gray-400"
            >
              <RefreshCw size={10} />
            </button>
          </div>
          <div className="bg-bg-700 border border-bg-600 overflow-x-auto">
            {rows.length > 0 ? (
              <table className="w-full text-[9px]">
                <thead>
                  <tr className="border-b border-bg-600">
                    {Object.keys(rows[0]).map(col => (
                      <th key={col} className="px-1.5 py-1 text-left text-gray-600 font-medium">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-bg-600/50">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-1.5 py-0.5 text-gray-400">{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-2 text-[10px] text-gray-600 text-center">No preview data available</div>
            )}
          </div>
        </div>
      )}

      {filteredTables.length === 0 && (
        <EmptyState icon={Database} title="No tables found" subtitle="Try a different search" />
      )}
    </div>
  )
})

export default memo(DatabaseViewer)
