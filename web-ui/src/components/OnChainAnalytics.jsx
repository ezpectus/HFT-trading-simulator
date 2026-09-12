import { memo } from 'react'
import { Link2 } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const OnChainAnalytics = memo(function OnChainAnalytics() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <Link2 size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">On-Chain Analytics</span>
      </div>

      <NoDataFeed feed="on-chain data" />
      <div className="text-[10px] text-gray-600">No on-chain data source is connected — exchange flows and whale metrics are not produced by the backend.</div>
    </div>
  )
})

export default OnChainAnalytics
