import { memo } from 'react'
import { Gauge } from 'lucide-react'
import { SectionTitle, NoDataFeed } from '../utils/ui-helpers'


const CapacityAnalysis = memo(function CapacityAnalysis() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Gauge} title="Capacity Analysis" />

      <NoDataFeed feed="strategy capacity" />
      <div className="text-[10px] text-gray-600">No capacity/AUM feed — strategy capacity limits are not tracked by the backend.</div>
    </div>
  )
})

export default CapacityAnalysis
