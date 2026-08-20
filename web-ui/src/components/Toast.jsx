import { useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X, Trash2 } from 'lucide-react'

let toastId = 0

export function useToasts() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((type, message, duration = 5000) => {
    const id = ++toastId
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration }])
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    setToasts([])
  }, [])

  return { toasts, addToast, removeToast, clearAll }
}

export function ToastContainer({ toasts, onRemove, onClearAll }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" role="region" aria-label="Notifications">
      {toasts.length >= 2 && onClearAll && (
        <button
          onClick={onClearAll}
          className="self-end text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors mb-0.5"
          aria-label="Clear all notifications"
        >
          <Trash2 size={11} /> Clear all
        </button>
      )}
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

function Toast({ toast, onRemove }) {
  const config = {
    success: { icon: CheckCircle, color: 'text-accent-green', border: 'border-accent-green/30', bg: 'bg-accent-green/10', bar: 'bg-accent-green' },
    error: { icon: XCircle, color: 'text-accent-red', border: 'border-accent-red/30', bg: 'bg-accent-red/10', bar: 'bg-accent-red' },
    warning: { icon: AlertTriangle, color: 'text-accent-yellow', border: 'border-accent-yellow/30', bg: 'bg-accent-yellow/10', bar: 'bg-accent-yellow' },
    info: { icon: Info, color: 'text-accent-blue', border: 'border-accent-blue/30', bg: 'bg-accent-blue/10', bar: 'bg-accent-blue' },
  }

  const { icon: Icon, color, border, bg, bar } = config[toast.type] || config.info

  return (
    <div
      className={`relative overflow-hidden flex items-start gap-2 px-3 py-2  bg-bg-800 border ${border} ${bg} shadow-lg animate-slide-in`}
      role="alert"
    >
      <Icon size={16} className={`${color} shrink-0 mt-0.5`} aria-hidden="true" />
      <span className="text-xs text-gray-200 flex-1">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-gray-500 hover:text-gray-300 shrink-0 transition-colors"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
      {toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 h-0.5 w-full opacity-50">
          <div
            className={`h-full ${bar} toast-progress`}
            style={{ animationDuration: `${toast.duration}ms` }}
          />
        </div>
      )}
    </div>
  )
}
