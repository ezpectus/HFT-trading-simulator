export function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      {Icon && <Icon size={32} className="text-gray-600 mb-2" aria-hidden="true" />}
      <p className="text-sm text-gray-400 font-medium">{title}</p>
      {subtitle && <p className="text-xs text-gray-600 mt-1">{subtitle}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
