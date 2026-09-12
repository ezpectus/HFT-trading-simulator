import { memo } from 'react'
import { Network } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const PacketInspector = memo(function PacketInspector() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <Network size={14} className="text-accent-purple" />
        <span className="text-sm font-medium">Packet Inspector</span>
      </div>

      <NoDataFeed feed="packet capture" />
      <div className="text-[10px] text-gray-600">No packet/frame feed — the WebSocket pipeline does not publish raw message captures.</div>
    </div>
  )
})

export default PacketInspector
