import { memo } from 'react'
import { Rocket } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const DeployStatus = memo(function DeployStatus() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <Rocket size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">Deploy Status</span>
      </div>

      <NoDataFeed feed="deployment pipeline" />
      <div className="text-[10px] text-gray-600">No deployment-status feed — CI/deploy state is not published to this UI.</div>
    </div>
  )
})

export default DeployStatus
