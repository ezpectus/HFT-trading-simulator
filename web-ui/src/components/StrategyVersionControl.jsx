import { memo } from 'react'
import { GitBranch } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const StrategyVersionControl = memo(function StrategyVersionControl() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <GitBranch size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">Strategy Version Control</span>
      </div>

      <NoDataFeed feed="strategy versioning" />
      <div className="text-[10px] text-gray-600">No versioning feed — strategy version history is not tracked by the backend.</div>
    </div>
  )
})

export default StrategyVersionControl
