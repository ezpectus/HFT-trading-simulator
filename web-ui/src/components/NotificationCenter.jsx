import { memo, useMemo, useState, useCallback } from 'react'
import { Bell, BellOff, CheckCheck, Trash2, Volume2, VolumeX, AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react'
import { EmptyState } from './LoadingSkeleton'
import { useLocalStorage } from '../hooks/useLocalStorage'

const TYPE_CONFIG = {
  success: { icon: CheckCircle, color: 'text-accent-green', bg: 'bg-accent-green/10' },
  error: { icon: XCircle, color: 'text-accent-red', bg: 'bg-accent-red/10' },
  warning: { icon: AlertTriangle, color: 'text-accent-yellow', bg: 'bg-accent-yellow/10' },
  info: { icon: Info, color: 'text-accent-blue', bg: 'bg-accent-blue/10' },
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'error', label: 'Errors' },
  { id: 'warning', label: 'Warnings' },
  { id: 'success', label: 'Success' },
  { id: 'info', label: 'Info' },
]

function NotificationItem({ notification, onDismiss }) {
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.info
  const Icon = config.icon

  return (
    <div className={`flex items-start gap-1.5 p-1.5 ${config.bg} border border-bg-600`}>
      <Icon size={12} className={`${config.color} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-gray-300">
            {notification.title || notification.type}
          </span>
          <button
            onClick={() => onDismiss(notification.id || notification.timestamp)}
            aria-label="Dismiss notification"
            className="text-gray-600 hover:text-gray-400 transition-colors shrink-0"
          >
            <Trash2 size={10} />
          </button>
        </div>
        {notification.message && (
          <p className="text-[10px] text-gray-500 mt-0.5 break-words">{notification.message}</p>
        )}
        {notification.timestamp && (
          <span className="text-[9px] text-gray-700">
            {new Date(notification.timestamp * 1000 || notification.timestamp).toLocaleTimeString('en-US', { hour12: false })}
          </span>
        )}
      </div>
    </div>
  )
}

const NotificationCenter = memo(function NotificationCenter({ toasts, addToast, removeToast, clearAll }) {
  const [filter, setFilter] = useState('all')
  const [soundEnabled, setSoundEnabled] = useLocalStorage('trading-sound-enabled', true)
  const [history, setHistory] = useLocalStorage('trading-notif-history', [])

  const allNotifications = useMemo(() => {
    const active = (toasts || []).map(t => ({ ...t, id: t.id || t.timestamp || Date.now() + Math.random() }))
    return [...active, ...history].slice(0, 50)
  }, [toasts, history])

  const filtered = useMemo(() => {
    if (filter === 'all') return allNotifications
    return allNotifications.filter(n => n.type === filter)
  }, [allNotifications, filter])

  const counts = useMemo(() => {
    const c = { all: allNotifications.length, error: 0, warning: 0, success: 0, info: 0 }
    for (const n of allNotifications) {
      if (c[n.type] != null) c[n.type]++
    }
    return c
  }, [allNotifications])

  const handleDismiss = useCallback((id) => {
    removeToast?.(id)
    setHistory(prev => prev.filter(n => (n.id || n.timestamp) !== id))
  }, [removeToast, setHistory])

  const handleClearAll = useCallback(() => {
    clearAll?.()
    setHistory([])
  }, [clearAll, setHistory])

  const handleMarkAllRead = useCallback(() => {
    addToast?.('info', 'All notifications marked as read')
  }, [addToast])

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => !prev)
    addToast?.('info', `Sound ${!soundEnabled ? 'enabled' : 'disabled'}`)
  }, [soundEnabled, setSoundEnabled, addToast])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Bell size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Notifications</span>
          {counts.all > 0 && (
            <span className="text-[9px] bg-accent-blue/20 text-accent-blue px-1.5 rounded-full">
              {counts.all}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleSound}
            className="text-gray-600 hover:text-gray-400 transition-colors p-0.5"
            title={soundEnabled ? 'Mute' : 'Unmute'}
          >
            {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
          </button>
          <button
            onClick={handleMarkAllRead}
            className="text-gray-600 hover:text-gray-400 transition-colors p-0.5"
            title="Mark all read"
          >
            <CheckCheck size={12} />
          </button>
          <button
            onClick={handleClearAll}
            className="text-gray-600 hover:text-accent-red transition-colors p-0.5"
            title="Clear all"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0.5">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-1.5 py-0.5 text-[9px] transition-colors ${
              filter === f.id
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {f.label} {counts[f.id] > 0 && `(${counts[f.id]})`}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-thin">
        {filtered.length > 0 ? (
          filtered.map(n => (
            <NotificationItem
              key={n.id || n.timestamp || Math.random()}
              notification={n}
              onDismiss={handleDismiss}
            />
          ))
        ) : (
          <EmptyState
            icon={BellOff}
            title="No notifications"
            subtitle={filter === 'all' ? 'Notifications will appear here' : `No ${filter} notifications`}
          />
        )}
      </div>
    </div>
  )
})

export default memo(NotificationCenter)
