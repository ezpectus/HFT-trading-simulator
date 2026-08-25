import { memo, useMemo, useState } from 'react'
import { Network, ArrowDown, ArrowUp, Filter, AlertTriangle } from 'lucide-react'
import { statusColor, StatCard } from '../utils/ui-helpers'
import { MOCK_PACKETS } from '../utils/mock-data'

const FILTERS = ['ALL', 'IN', 'OUT']

function dirIcon(dir) {
  return dir === 'IN' ? <ArrowDown size={10} className="text-accent-green" /> : <ArrowUp size={10} className="text-accent-blue" />
}

const STATUS_MAP = {
  ok: 'text-accent-green',
  default: 'text-accent-red',
}

function typeColor(type) {
  if (type === 'trade') return 'text-accent-green'
  if (type === 'depth') return 'text-accent-blue'
  if (type === 'order') return 'text-accent-yellow'
  if (type === 'cancel') return 'text-accent-red'
  if (type === 'ping') return 'text-gray-600'
  return 'text-gray-400'
}

const PacketInspector = memo(function PacketInspector() {
  const [filter, setFilter] = useState('ALL')
  const [selected, setSelected] = useState(null)

  const filtered = useMemo(() => {
    if (filter === 'ALL') return MOCK_PACKETS
    return MOCK_PACKETS.filter(p => p.dir === filter)
  }, [filter])

  const stats = useMemo(() => {
    const inBytes = MOCK_PACKETS.filter(p => p.dir === 'IN').reduce((s, p) => s + p.size, 0)
    const outBytes = MOCK_PACKETS.filter(p => p.dir === 'OUT').reduce((s, p) => s + p.size, 0)
    const errors = MOCK_PACKETS.filter(p => p.status === 'error').length
    const wsCount = MOCK_PACKETS.filter(p => p.proto === 'WS').length
    return { inBytes, outBytes, errors, wsCount, total: MOCK_PACKETS.length }
  }, [])

  const selectedPacket = MOCK_PACKETS.find(p => p.id === selected)

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Network size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Packet Inspector</span>
        </div>
        <span className="text-[10px] text-gray-600">{filtered.length} packets</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="In" value={`${(stats.inBytes / 1024).toFixed(1)}KB`} color="text-accent-green" size="xs" />
        <StatCard label="Out" value={`${(stats.outBytes / 1024).toFixed(1)}KB`} color="text-accent-blue" size="xs" />
        <StatCard label="WS Pkts" value={stats.wsCount} color="text-gray-300" size="xs" />
        <StatCard label="Errors" value={stats.errors} color="text-accent-red" size="xs" />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1">
        <Filter size={10} className="text-gray-600" />
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              filter === f ? 'bg-accent-purple/20 text-accent-purple' : 'bg-bg-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Packet list */}
      <div className="bg-bg-900 border border-bg-600 rounded max-h-40 overflow-y-auto">
        {filtered.map(pkt => (
          <div
            key={pkt.id}
            onClick={() => setSelected(pkt.id)}
            className={`flex items-center gap-2 py-0.5 px-2 border-b border-bg-800 cursor-pointer hover:bg-bg-800 ${selected === pkt.id ? 'bg-bg-800 ring-1 ring-accent-purple' : ''}`}
          >
            <span className="text-[9px] text-gray-600 font-mono shrink-0 w-20">{pkt.ts}</span>
            {dirIcon(pkt.dir)}
            <span className="text-[9px] font-mono text-gray-500 shrink-0 w-8">{pkt.proto}</span>
            <span className={`text-[9px] font-mono shrink-0 w-12 ${typeColor(pkt.type)}`}>{pkt.type}</span>
            <span className="text-[9px] text-gray-500 shrink-0 w-12">{pkt.size}B</span>
            <span className="text-[9px] text-gray-600 truncate flex-1">{pkt.src}</span>
            {pkt.status === 'error' && <AlertTriangle size={9} className="text-accent-red shrink-0" />}
          </div>
        ))}
      </div>

      {/* Selected packet detail */}
      {selectedPacket && (
        <div className="p-2 bg-bg-700 border border-bg-600 rounded">
          <div className="text-[10px] text-gray-600 uppercase mb-1">Packet #{selectedPacket.id} Detail</div>
          <div className="grid grid-cols-2 gap-1 text-[9px]">
            <div><span className="text-gray-600">Time:</span> <span className="text-gray-300 font-mono">{selectedPacket.ts}</span></div>
            <div><span className="text-gray-600">Direction:</span> <span className="text-gray-300">{selectedPacket.dir}</span></div>
            <div><span className="text-gray-600">Protocol:</span> <span className="text-gray-300">{selectedPacket.proto}</span></div>
            <div><span className="text-gray-600">Type:</span> <span className={typeColor(selectedPacket.type)}>{selectedPacket.type}</span></div>
            <div><span className="text-gray-600">Size:</span> <span className="text-gray-300 font-mono">{selectedPacket.size} bytes</span></div>
            <div><span className="text-gray-600">Status:</span> <span className={statusColor(selectedPacket.status, STATUS_MAP)}>{selectedPacket.status}</span></div>
            <div className="col-span-2"><span className="text-gray-600">Source:</span> <span className="text-gray-300 font-mono">{selectedPacket.src}</span></div>
          </div>
        </div>
      )}
    </div>
  )
})

export default memo(PacketInspector)
