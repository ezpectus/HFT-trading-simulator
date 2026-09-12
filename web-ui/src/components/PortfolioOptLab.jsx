import { memo } from 'react'
import { PieChart } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const PortfolioOptLab = memo(function PortfolioOptLab() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <PieChart size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">Portfolio Optimization Lab</span>
      </div>

      <NoDataFeed feed="portfolio optimizer" />
      <div className="text-[10px] text-gray-600">No optimizer-run feed — portfolio optimization results are not produced by the backend.</div>
    </div>
  )
})

export default PortfolioOptLab
