import { useEffect, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

let toastId = 0

export function useToasts() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((type, message, duration = 5000) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, type, message, duration }])
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

  return { toasts, addToast, removeToast }
}

export function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

function Toast({ toast, onRemove }) {
  const config = {
    success: { icon: CheckCircle, color: 'text-accent-green', border: 'border-accent-green/30', bg: 'bg-accent-green/10' },
    error: { icon: XCircle, color: 'text-accent-red', border: 'border-accent-red/30', bg: 'bg-accent-red/10' },
    warning: { icon: AlertTriangle, color: 'text-accent-yellow', border: 'border-accent-yellow/30', bg: 'bg-accent-yellow/10' },
    info: { icon: Info, color: 'text-accent-blue', border: 'border-accent-blue/30', bg: 'bg-accent-blue/10' },
  }

  const { icon: Icon, color, border, bg } = config[toast.type] || config.info

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg bg-bg-800 border ${border} ${bg} shadow-lg animate-slide-in`}>
      <Icon size={16} className={`${color} shrink-0 mt-0.5`} />
      <span className="text-xs text-gray-200 flex-1">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-gray-500 hover:text-gray-300 shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}
