import { memo } from 'react'
import { Server } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const Colocation = memo(function Colocation() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <Server size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">Colocation</span>
      </div>

      <NoDataFeed feed="datacenter telemetry" />
      <div className="text-[10px] text-gray-600">No datacenter/latency telemetry feed — colocation status is not produced by the backend.</div>
    </div>
  )
})

export default Colocation
