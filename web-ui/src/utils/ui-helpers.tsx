import type { ReactNode, ElementType } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Activity, Clock, RefreshCw } from 'lucide-react'

export const CLASS: Record<string, string> = {
  mono10: 'text-[10px] font-mono text-gray-300',
  mono9: 'text-[9px] font-mono text-gray-400',
  mono10Bold: 'text-[10px] font-mono font-bold',
  label10: 'text-[10px] text-gray-600 uppercase',
  label9: 'text-[9px] text-gray-600 uppercase',
  panelBase: 'p-3 bg-bg-800 text-gray-200 text-xs space-y-2',
  cardBorder: 'p-2 bg-bg-700 border border-bg-600',
  rowBorder: 'flex items-center justify-between py-0.5 border-b border-bg-600/50',
}

export function pnlColor(pnl: number): string {
  return pnl >= 0 ? 'text-accent-green' : 'text-accent-red'
}

export function pnlBg(pnl: number): string {
  return pnl >= 0 ? 'bg-accent-green' : 'bg-accent-red'
}

export function sideColor(side: string): string {
  return side === 'BUY' || side === 'LONG' ? 'text-accent-green' : 'text-accent-red'
}

export function sideBg(side: string): string {
  return side === 'BUY' || side === 'LONG' ? 'bg-accent-green' : 'bg-accent-red'
}

export function statusColor(status: string, map: Record<string, string> = {}): string {
  return map[status] || map.default || 'text-accent-red'
}

export function statusBg(status: string, map: Record<string, string> = {}): string {
  return map[status] || map.default || 'bg-accent-red/20'
}

export function statusIcon(status: string, map: Record<string, ElementType> = {}): ElementType | null {
  const Icon = map[status] || map.default
  if (!Icon) return null
  return Icon
}

type IconSize = number

export const ICONS: Record<string, (size?: IconSize) => ReactNode> = {
  green: (size: IconSize = 10) => <CheckCircle size={size} className="text-accent-green" />,
  yellow: (size: IconSize = 10) => <AlertTriangle size={size} className="text-accent-yellow" />,
  red: (size: IconSize = 10) => <XCircle size={size} className="text-accent-red" />,
  blue: (size: IconSize = 10) => <Activity size={size} className="text-accent-blue" />,
  gray: (size: IconSize = 10) => <Clock size={size} className="text-gray-600" />,
  spinning: (size: IconSize = 10) => <RefreshCw size={size} className="text-accent-blue animate-spin" />,
}

interface StatCardProps {
  label: string
  value: string | number
  color?: string
  icon?: ElementType
  size?: 'sm' | 'xs' | 'lg'
  compact?: boolean
  rounded?: boolean
  bold?: boolean
}

export function StatCard({ label, value, color = 'text-gray-300', icon: Icon, size = 'sm', compact = false, rounded = false, bold = false }: StatCardProps) {
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

interface BarProps {
  value: number
  max: number
  color?: string
  height?: string
  className?: string
  opacity?: string
}

export function Bar({ value, max, color = 'bg-accent-blue', height = 'h-2', className = 'flex-1', opacity = 'opacity-70' }: BarProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className={`${className} ${height} bg-bg-600 rounded-full overflow-hidden`}>
      <div className={`h-full ${color} ${opacity}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

interface LabelProps {
  children: ReactNode
  className?: string
  size?: '9px' | '10px'
}

export function Label({ children, className = '', size = '10px' }: LabelProps) {
  const sizeClass = size === '9px' ? 'text-[9px]' : 'text-[10px]'
  return (
    <span className={`${sizeClass} text-gray-600 uppercase ${className}`}>{children}</span>
  )
}

interface SectionTitleProps {
  icon?: ElementType
  title: string
  right?: ReactNode
  className?: string
  iconColor?: string
}

export function SectionTitle({ icon: Icon, title, right, className = '', iconColor = 'text-accent-blue' }: SectionTitleProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={14} className={iconColor} />}
        <span className="text-sm font-medium">{title}</span>
      </div>
      {right}
    </div>
  )
}

interface WarningBannerProps {
  icon?: ElementType
  color?: string
  children: ReactNode
}

export function WarningBanner({ icon: Icon = AlertTriangle, color = 'text-accent-yellow', children }: WarningBannerProps) {
  const bg = color.replace('text-', 'bg-') + '/10'
  const border = color.replace('text-', 'border-') + '/30'
  return (
    <div className={`flex items-center gap-1.5 p-1.5 ${bg} border ${border}`}>
      {Icon && <Icon size={11} className={color} />}
      <span className={`text-[10px] ${color}`}>{children}</span>
    </div>
  )
}
