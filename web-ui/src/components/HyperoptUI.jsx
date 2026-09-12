import { memo } from 'react'
import { Sliders } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const HyperoptUI = memo(function HyperoptUI() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <Sliders size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">Hyperopt</span>
      </div>

      <NoDataFeed feed="hyperparameter runs" />
      <div className="text-[10px] text-gray-600">No hyperopt feed — optimization trial results are not produced by the backend.</div>
    </div>
  )
})

export default HyperoptUI
