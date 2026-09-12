import { memo } from 'react'
import { Users } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const TeamCollab = memo(function TeamCollab() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <Users size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">Team Collaboration</span>
      </div>

      <NoDataFeed feed="collaboration" />
      <div className="text-[10px] text-gray-600">No collaboration feed — team presence/messages are not produced by the backend.</div>
    </div>
  )
})

export default TeamCollab
