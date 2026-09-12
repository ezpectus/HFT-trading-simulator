import { memo } from 'react'
import { Database } from 'lucide-react'
import { NoDataFeed } from '../utils/ui-helpers'


const DatabaseViewer = memo(function DatabaseViewer() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <Database size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">Database Viewer</span>
      </div>

      <NoDataFeed feed="database schema" />
      <div className="text-[10px] text-gray-600">No database introspection feed — table/row browsing is not exposed by the backend.</div>
    </div>
  )
})

export default DatabaseViewer
