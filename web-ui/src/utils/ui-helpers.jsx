import { CheckCircle, AlertTriangle, XCircle, Activity, Clock, RefreshCw } from 'lucide-react'

export function pnlColor(pnl) {
  return pnl >= 0 ? 'text-accent-green' : 'text-accent-red'
}

export function pnlBg(pnl) {
  return pnl >= 0 ? 'bg-accent-green' : 'bg-accent-red'
}

export function sideColor(side) {
  return side === 'BUY' || side === 'LONG' ? 'text-accent-green' : 'text-accent-red'
}

export function sideBg(side) {
  return side === 'BUY' || side === 'LONG' ? 'bg-accent-green' : 'bg-accent-red'
}

export function statusColor(status, map = {}) {
  return map[status] || map.default || 'text-accent-red'
}

export function statusBg(status, map = {}) {
  return map[status] || map.default || 'bg-accent-red/20'
}

export function statusIcon(status, map = {}) {
  const Icon = map[status] || map.default
  if (!Icon) return null
  return Icon
}

export const ICONS = {
  green: (size = 10) => <CheckCircle size={size} className="text-accent-green" />,
  yellow: (size = 10) => <AlertTriangle size={size} className="text-accent-yellow" />,
  red: (size = 10) => <XCircle size={size} className="text-accent-red" />,
  blue: (size = 10) => <Activity size={size} className="text-accent-blue" />,
  gray: (size = 10) => <Clock size={size} className="text-gray-600" />,
  spinning: (size = 10) => <RefreshCw size={size} className="text-accent-blue animate-spin" />,
}

export function StatCard({ label, value, color = 'text-gray-300', icon: Icon, size = 'sm', compact = false, rounded = false, bold = false }) {
  const valueSize = size === 'lg' ? 'text-sm' : size === 'xs' ? 'text-[11px]' : 'text-sm'
  const padding = compact ? 'p-1.5' : 'p-2'
  const rounding = rounded ? ' rounded' : ''
  const fontWeight = bold ? ' font-bold' : ''
  return (
    <div className={`${padding} bg-bg-700 border border-bg-600${rounding}`}>
      <div className="flex items-center gap-1 mb-0.5">
        {Icon && <Icon size={10} className="text-gray-600" />}
        <span className="text-[9px] text-gray-600">{label}</span>
      </div>
      <span className={`${valueSize} font-mono${fontWeight} ${color}`}>{value}</span>
    </div>
  )
}

export function Bar({ value, max, color = 'bg-accent-blue', height = 'h-2' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className={`flex-1 ${height} bg-bg-600 rounded overflow-hidden`}>
      <div className={`h-full ${color} opacity-70`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Label({ children, className = '', size = '10px' }) {
  const sizeClass = size === '9px' ? 'text-[9px]' : 'text-[10px]'
  return (
    <span className={`${sizeClass} text-gray-600 uppercase ${className}`}>{children}</span>
  )
}

export function WarningBanner({ icon: Icon = AlertTriangle, color = 'text-accent-yellow', children }) {
  const bg = color.replace('text-', 'bg-') + '/10'
  const border = color.replace('text-', 'border-') + '/30'
  return (
    <div className={`flex items-center gap-1.5 p-1.5 ${bg} border ${border}`}>
      <Icon size={11} className={color} />
      <span className={`text-[10px] ${color}`}>{children}</span>
    </div>
  )
}
