import { memo, useMemo } from 'react'
import { Server, Wifi, Clock, MapPin } from 'lucide-react'
import { ICONS, statusColor } from '../utils/ui-helpers'

const MOCK_DATACENTERS = [
  { id: 'dc-tokyo', name: 'Tokyo (TY3)', region: 'APAC', latency: 0.3, status: 'online', uptime: 99.98, colo: true },
  { id: 'dc-london', name: 'London (LD4)', region: 'EMEA', latency: 1.2, status: 'online', uptime: 99.95, colo: true },
  { id: 'dc-newyork', name: 'New York (NY4)', region: 'AMER', latency: 0.8, status: 'online', uptime: 99.99, colo: true },
  { id: 'dc-singapore', name: 'Singapore (SG1)', region: 'APAC', latency: 2.1, status: 'degraded', uptime: 98.50, colo: false },
  { id: 'dc-frankfurt', name: 'Frankfurt (FR2)', region: 'EMEA', latency: 1.5, status: 'offline', uptime: 0, colo: false },
]

const MOCK_SERVICES = [
  { name: 'Matching Engine', dc: 'Tokyo', status: 'online', cpu: 23, mem: 45, conns: 142 },
  { name: 'Risk Gateway', dc: 'Tokyo', status: 'online', cpu: 18, mem: 38, conns: 89 },
  { name: 'Order Router', dc: 'New York', status: 'online', cpu: 31, mem: 52, conns: 215 },
  { name: 'Market Data Feed', dc: 'London', status: 'online', cpu: 45, mem: 61, conns: 340 },
  { name: 'Signal Processor', dc: 'London', status: 'degraded', cpu: 78, mem: 82, conns: 95 },
  { name: 'WS Broadcaster', dc: 'New York', status: 'online', cpu: 28, mem: 44, conns: 1280 },
]

function statusIcon(status) {
  if (status === 'online') return ICONS.green()
  if (status === 'degraded') return ICONS.yellow()
  return ICONS.red()
}

const STATUS_MAP = {
  online: 'text-accent-green',
  degraded: 'text-accent-yellow',
  default: 'text-accent-red',
}

const Colocation = memo(function Colocation() {
  const stats = useMemo(() => {
    const online = MOCK_DATACENTERS.filter(d => d.status === 'online').length
    const coloCount = MOCK_DATACENTERS.filter(d => d.colo).length
    const avgLatency = MOCK_DATACENTERS.filter(d => d.status === 'online')
      .reduce((s, d) => s + d.latency, 0) / online
    const totalConns = MOCK_SERVICES.reduce((s, svc) => s + svc.conns, 0)
    return { online, coloCount, avgLatency, totalConns, total: MOCK_DATACENTERS.length }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Server size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Colocation Status</span>
        </div>
        <span className="text-[10px] text-gray-600">{stats.online}/{stats.total} DCs</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1">
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Avg Latency</div>
          <span className="text-sm font-mono text-accent-green">{stats.avgLatency.toFixed(1)}ms</span>
        </div>
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Colo Sites</div>
          <span className="text-sm font-mono text-accent-blue">{stats.coloCount}</span>
        </div>
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Connections</div>
          <span className="text-sm font-mono text-gray-300">{stats.totalConns}</span>
        </div>
      </div>

      {/* Datacenters */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Datacenters</div>
        <div className="space-y-0.5">
          {MOCK_DATACENTERS.map(dc => (
            <div key={dc.id} className="flex items-center gap-2 py-1 px-1.5 bg-bg-700">
              <MapPin size={10} className={statusColor(dc.status, STATUS_MAP)} />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-gray-300 truncate">{dc.name}</span>
              </div>
              <span className="text-[9px] text-gray-600 w-10">{dc.region}</span>
              {dc.colo && (
                <span className="text-[8px] text-accent-purple bg-accent-purple/10 px-1 rounded">COLO</span>
              )}
              <span className={`text-[10px] font-mono w-12 text-right ${statusColor(dc.status, STATUS_MAP)}`}>
                {dc.status === 'offline' ? '—' : `${dc.latency.toFixed(1)}ms`}
              </span>
              {statusIcon(dc.status)}
            </div>
          ))}
        </div>
      </div>

      {/* Services */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Services</div>
        <div className="space-y-0.5">
          {MOCK_SERVICES.map(svc => (
            <div key={svc.name} className="flex items-center gap-2 py-1 px-1.5 bg-bg-700">
              {statusIcon(svc.status)}
              <span className="text-[10px] text-gray-300 flex-1 truncate">{svc.name}</span>
              <span className="text-[9px] text-gray-600 w-16">{svc.dc}</span>
              <div className="flex items-center gap-1 w-20">
                <span className="text-[8px] text-gray-600">CPU</span>
                <div className="w-8 h-1.5 bg-bg-600 rounded overflow-hidden">
                  <div
                    className={`h-full ${svc.cpu > 70 ? 'bg-accent-red' : svc.cpu > 50 ? 'bg-accent-yellow' : 'bg-accent-green'}`}
                    style={{ width: `${svc.cpu}%` }}
                  />
                </div>
              </div>
              <span className="text-[9px] font-mono text-gray-500 w-10 text-right">{svc.conns}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Uptime footer */}
      <div className="flex justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <Clock size={9} />
          Best uptime: 99.99%
        </span>
        <span className="flex items-center gap-1">
          <Wifi size={9} />
          {stats.totalConns} active conns
        </span>
      </div>
    </div>
  )
})

export default Colocation
