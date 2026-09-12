import { memo } from 'react'
import { RefreshCw } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const RetrainingPipeline = memo(function RetrainingPipeline() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <RefreshCw size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">Retraining Pipeline</span>
      </div>

      <NoDataFeed feed="retraining pipeline" />
      <div className="text-[10px] text-gray-600">No retraining feed — model retraining state is not produced by the backend.</div>
    </div>
  )
})

export default RetrainingPipeline
