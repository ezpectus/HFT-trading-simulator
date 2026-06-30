import { Loader2 } from 'lucide-react'

export default function PanelLoadingFallback({ name }) {
  return (
    <div className="bg-bg-700 rounded-lg p-2.5 animate-pulse">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Loader2 size={12} className="text-gray-600 animate-spin" />
        {name || 'Loading'}…
      </div>
      <div className="space-y-1.5">
        <div className="h-2 bg-bg-600 rounded w-3/4" />
        <div className="h-2 bg-bg-600 rounded w-1/2" />
        <div className="h-2 bg-bg-600 rounded w-2/3" />
      </div>
    </div>
  )
}
