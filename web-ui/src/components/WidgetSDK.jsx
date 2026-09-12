import { memo } from 'react'
import { Puzzle } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const WidgetSDK = memo(function WidgetSDK() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <Puzzle size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">Widget SDK</span>
      </div>

      <NoDataFeed feed="widget registry" />
      <div className="text-[10px] text-gray-600">No published widget registry — this was a static demo catalog, not a live SDK surface.</div>
    </div>
  )
})

export default WidgetSDK
