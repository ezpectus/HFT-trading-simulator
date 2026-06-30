import { ExternalLink, X } from 'lucide-react'

export default function DetachablePanel({ panelId, onDetach, isDetached, children, title }) {
  return (
    <div className="relative bg-bg-800 rounded-lg overflow-hidden h-full">
      {/* Detach button overlay */}
      <button
        onClick={() => onDetach(panelId)}
        className="absolute top-1 right-1 z-10 p-1 rounded bg-bg-700/80 text-gray-500 hover:text-accent-blue transition-colors"
        title={isDetached ? 'Panel detached — click to re-attach' : 'Detach to separate window'}
      >
        {isDetached ? <X size={11} /> : <ExternalLink size={11} />}
      </button>
      {children}
    </div>
  )
}
