import { memo } from 'react'
import { Terminal } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const ApiPlayground = memo(function ApiPlayground() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <Terminal size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">API Playground</span>
      </div>

      <NoDataFeed feed="REST API" />
      <div className="text-[10px] text-gray-600">Requests here previously returned fabricated responses. The backend exposes WebSocket feeds, not REST endpoints — there is nothing to call.</div>
    </div>
  )
})

export default ApiPlayground
