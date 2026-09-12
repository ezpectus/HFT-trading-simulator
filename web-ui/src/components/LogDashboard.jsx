import { memo } from 'react'
import { ScrollText } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const LogDashboard = memo(function LogDashboard() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <ScrollText size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">Log Dashboard</span>
      </div>

      <NoDataFeed feed="log stream" />
      <div className="text-[10px] text-gray-600">Backend logs are written to run_logger files — no log stream is published over WebSocket.</div>
    </div>
  )
})

export default LogDashboard
