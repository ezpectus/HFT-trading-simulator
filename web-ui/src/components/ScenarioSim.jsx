import { memo } from 'react'
import { Beaker } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const ScenarioSim = memo(function ScenarioSim() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <Beaker size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">Scenario Simulator</span>
      </div>

      <NoDataFeed feed="scenario engine" />
      <div className="text-[10px] text-gray-600">No scenario engine feed — shock simulations are not produced by the backend.</div>
    </div>
  )
})

export default ScenarioSim
