import { memo, useMemo } from 'react'
import { Clock, Globe, Sunrise, Sunset, Moon, Activity } from 'lucide-react'
import { EmptyState } from './LoadingSkeleton'

const SESSIONS = [
  { id: 'sydney', name: 'Sydney', start: '21:00', end: '06:00', timezone: 'UTC+10', icon: Sunrise, color: 'text-accent-yellow' },
  { id: 'tokyo', name: 'Tokyo', start: '00:00', end: '09:00', timezone: 'UTC+9', icon: Globe, color: 'text-accent-red' },
  { id: 'london', name: 'London', start: '08:00', end: '17:00', timezone: 'UTC+0', icon: Sunset, color: 'text-accent-blue' },
  { id: 'newyork', name: 'New York', start: '13:00', end: '22:00', timezone: 'UTC-5', icon: Moon, color: 'text-accent-green' },
]

function isSessionActive(session, currentHour) {
  const start = parseInt(session.start.split(':')[0])
  const end = parseInt(session.end.split(':')[0])
  if (start < end) {
    return currentHour >= start && currentHour < end
  }
  return currentHour >= start || currentHour < end
}

function getOverlap(sessions, currentHour) {
  const active = sessions.filter(s => isSessionActive(s, currentHour))
  return active
}

const SessionMarkers = memo(function SessionMarkers({ fills, symbol }) {
  const currentHour = new Date().getUTCHours()

  const activeSessions = useMemo(() => {
    return SESSIONS.map(s => ({
      ...s,
      active: isSessionActive(s, currentHour),
    }))
  }, [currentHour])

  const overlap = getOverlap(SESSIONS, currentHour)
  const overlapNames = overlap.map(s => s.name).join(' + ')

  const sessionFills = useMemo(() => {
    if (!fills || fills.length === 0) return {}
    const bySession = {}
    for (const s of SESSIONS) {
      bySession[s.id] = { count: 0, volume: 0 }
    }
    for (const fill of fills) {
      const fillHour = new Date((fill.timestamp || 0) * 1000).getUTCHours()
      for (const s of SESSIONS) {
        if (isSessionActive(s, fillHour)) {
          bySession[s.id].count++
          bySession[s.id].volume += fill.quantity || 0
        }
      }
    }
    return bySession
  }, [fills])

  const recentFills = useMemo(() => {
    if (!fills || fills.length === 0) return []
    return fills.slice(-5).reverse()
  }, [fills])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Trading Sessions</span>
        </div>
        <span className="text-[10px] text-gray-600">{currentHour.toString().padStart(2, '0')}:00 UTC</span>
      </div>

      {/* Overlap indicator */}
      <div className={`p-2 border ${overlap.length > 1 ? 'bg-accent-green/10 border-accent-green/30' : 'bg-bg-700 border-bg-600'}`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-600">Active Overlap</span>
          <span className={`text-[11px] font-medium ${overlap.length > 1 ? 'text-accent-green' : 'text-gray-400'}`}>
            {overlap.length > 0 ? overlapNames : 'No active session'}
          </span>
        </div>
        {overlap.length > 1 && (
          <div className="flex items-center gap-1 mt-0.5">
            <Activity size={9} className="text-accent-green" />
            <span className="text-[9px] text-accent-green">High liquidity period</span>
          </div>
        )}
      </div>

      {/* Session cards */}
      <div className="space-y-1">
        {activeSessions.map(session => {
          const Icon = session.icon
          const fills = sessionFills[session.id] || { count: 0, volume: 0 }
          return (
            <div
              key={session.id}
              className={`p-2 border transition-colors ${
                session.active
                  ? 'bg-bg-700 border-l-2 border-l-accent-blue'
                  : 'bg-bg-700/50 border-bg-600 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className={session.active ? session.color : 'text-gray-600'} />
                  <span className="text-[11px] font-medium text-gray-300">{session.name}</span>
                  {session.active && (
                    <span className="text-[8px] px-1 bg-accent-green/20 text-accent-green rounded">LIVE</span>
                  )}
                </div>
                <span className="text-[9px] text-gray-600">{session.timezone}</span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[9px]">
                <span className="text-gray-600">{session.start} - {session.end} UTC</span>
                <span className="text-gray-500">{fills.count} fills</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent fills with session markers */}
      {recentFills.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-600 uppercase mb-1">Recent Fills</div>
          <div className="space-y-0.5">
            {recentFills.map((fill, i) => {
              const fillHour = new Date((fill.timestamp || 0) * 1000).getUTCHours()
              const activeAtFill = SESSIONS.filter(s => isSessionActive(s, fillHour)).map(s => s.name)
              return (
                <div key={fill.id || i} className="flex items-center justify-between text-[9px] py-0.5 px-1 bg-bg-700">
                  <span className="text-gray-400">{fill.symbol || symbol}</span>
                  <span className={fill.side === 'BUY' ? 'text-accent-green' : 'text-accent-red'}>{fill.side}</span>
                  <span className="text-gray-600 truncate ml-1">{activeAtFill.join('/') || '—'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {SESSIONS.length === 0 && (
        <EmptyState icon={Clock} title="No sessions" subtitle="Trading session data will appear here" />
      )}
    </div>
  )
})

export default memo(SessionMarkers)
