import { memo } from 'react'
import { XCircle } from 'lucide-react'
import { SectionTitle, NoDataFeed } from '../utils/ui-helpers'


const CancelMonitor = memo(function CancelMonitor() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={XCircle} title="Cancel Monitor" iconColor="text-accent-red" />

      <NoDataFeed feed="order cancellation" />
      <div className="text-[10px] text-gray-600">The simulator logs ORDER_CANCELLED audit events (OCO sibling resolution), but no cancellation feed is broadcast over WebSocket.</div>
    </div>
  )
})

export default CancelMonitor
