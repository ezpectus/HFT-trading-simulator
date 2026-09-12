import { memo } from 'react'
import { Brain } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const ModelDashboard = memo(function ModelDashboard() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <Brain size={14} className="text-accent-purple" />
        <span className="text-sm font-medium">Model Dashboard</span>
      </div>

      <NoDataFeed feed="model registry" />
      <div className="text-[10px] text-gray-600">No model registry feed — model status/accuracy is not produced by the backend.</div>
    </div>
  )
})

export default ModelDashboard
