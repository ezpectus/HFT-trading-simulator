import { memo } from 'react'
import { FlaskConical } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const ABTesting = memo(function ABTesting() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <FlaskConical size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">A/B Testing</span>
      </div>

      <NoDataFeed feed="experiment results" />
      <div className="text-[10px] text-gray-600">No experiment feed — A/B variant metrics are not produced by the backend.</div>
    </div>
  )
})

export default ABTesting
