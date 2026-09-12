import { memo } from 'react'
import { Dna } from 'lucide-react'
import { SectionTitle, NoDataFeed } from '../utils/ui-helpers'


const GeneticViewer = memo(function GeneticViewer() {
  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Dna} title="Genetic Algorithm Viewer" iconColor="text-accent-purple" />

      <NoDataFeed feed="genetic run" />
      <div className="text-[10px] text-gray-600">The genetic-strategy backend module was removed as dead code — no evolution run state exists.</div>
    </div>
  )
})

export default GeneticViewer
