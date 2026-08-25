import { memo, useMemo, useState } from 'react'
import { GitBranch, Tag, RotateCcw, AlertTriangle } from 'lucide-react'
import { ICONS, StatCard } from '../utils/ui-helpers'

const MOCK_VERSIONS = [
  { id: 'v2.3.1', tag: 'latest', date: '2024-08-25', author: 'Alice', changes: 3, status: 'active', desc: 'Tighten risk limits, add CVaR check' },
  { id: 'v2.3.0', tag: 'stable', date: '2024-08-20', author: 'Bob', changes: 8, status: 'archived', desc: 'Add ensemble voting, improve signal confidence' },
  { id: 'v2.2.5', tag: null, date: '2024-08-15', author: 'Carol', changes: 2, status: 'archived', desc: 'Fix funding rate calculation bug' },
  { id: 'v2.2.4', tag: null, date: '2024-08-10', author: 'Alice', changes: 5, status: 'archived', desc: 'Add Kelly criterion position sizing' },
  { id: 'v2.2.3', tag: null, date: '2024-08-05', author: 'Bob', changes: 1, status: 'archived', desc: 'Hotfix: WS reconnection logic' },
  { id: 'v2.2.0', tag: null, date: '2024-07-28', author: 'Carol', changes: 12, status: 'archived', desc: 'Major refactor: strategy plugin system' },
  { id: 'v2.1.0', tag: null, date: '2024-07-15', author: 'Alice', changes: 7, status: 'archived', desc: 'Add multi-exchange support, price comparison' },
  { id: 'v2.0.0', tag: null, date: '2024-07-01', author: 'Alice', changes: 25, status: 'archived', desc: 'Initial production release' },
]

const MOCK_DIFF = [
  { file: 'strategies/trend_following.py', additions: 12, deletions: 3, type: 'modified' },
  { file: 'risk/manager.py', additions: 8, deletions: 5, type: 'modified' },
  { file: 'config/settings.yaml', additions: 2, deletions: 1, type: 'modified' },
]

function statusIcon(status) {
  if (status === 'active') return ICONS.green()
  return ICONS.gray()
}

const StrategyVersionControl = memo(function StrategyVersionControl({ addToast }) {
  const [selected, setSelected] = useState('v2.3.1')

  const stats = useMemo(() => {
    const totalChanges = MOCK_VERSIONS.reduce((s, v) => s + v.changes, 0)
    const activeCount = MOCK_VERSIONS.filter(v => v.status === 'active').length
    return { totalChanges, activeCount, totalVersions: MOCK_VERSIONS.length }
  }, [])

  const selectedVersion = MOCK_VERSIONS.find(v => v.id === selected)

  const handleRollback = (version) => {
    setSelected(version.id)
    if (addToast) addToast('warning', `Rollback to ${version.id} initiated`)
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GitBranch size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Strategy Version Control</span>
        </div>
        <span className="text-[10px] text-gray-600">{stats.totalVersions} versions</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1">
        <StatCard label="Active" value={stats.activeCount} color="text-accent-green" />
        <StatCard label="Total Changes" value={stats.totalChanges} color="text-accent-blue" />
        <StatCard label="Latest" value="v2.3.1" color="text-gray-300" />
      </div>

      {/* Version list */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Versions</div>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {MOCK_VERSIONS.map(version => (
            <div
              key={version.id}
              onClick={() => setSelected(version.id)}
              className={`flex items-center gap-2 py-1 px-1.5 bg-bg-700 cursor-pointer hover:bg-bg-600 transition-colors ${selected === version.id ? 'ring-1 ring-accent-purple' : ''}`}
            >
              {statusIcon(version.status)}
              <span className="text-[10px] font-mono text-gray-300 w-14">{version.id}</span>
              {version.tag && (
                <span className={`text-[8px] px-1 rounded ${version.tag === 'latest' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-blue/20 text-accent-blue'}`}>
                  <Tag size={7} className="inline mr-0.5" />{version.tag}
                </span>
              )}
              <span className="text-[9px] text-gray-600 flex-1 truncate">{version.desc}</span>
              <span className="text-[9px] text-gray-500 shrink-0">{version.changes} ch</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected version details */}
      {selectedVersion && (
        <div className="p-2 bg-bg-700 border border-bg-600 rounded">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-accent-purple">{selectedVersion.id}</span>
            <span className="text-[9px] text-gray-600">{selectedVersion.date} by {selectedVersion.author}</span>
          </div>
          <div className="text-[10px] text-gray-400 mb-1">{selectedVersion.desc}</div>
          <div className="space-y-0.5">
            {MOCK_DIFF.map((diff, i) => (
              <div key={i} className="flex items-center gap-2 text-[9px]">
                <span className="text-gray-500 font-mono truncate flex-1">{diff.file}</span>
                <span className="text-accent-green font-mono">+{diff.additions}</span>
                <span className="text-accent-red font-mono">-{diff.deletions}</span>
              </div>
            ))}
          </div>
          {selectedVersion.id !== 'v2.3.1' && (
            <button
              onClick={() => handleRollback(selectedVersion)}
              className="flex items-center gap-1 mt-1.5 px-2 py-0.5 bg-accent-yellow/20 text-accent-yellow text-[9px] rounded hover:bg-accent-yellow/30 transition-colors"
            >
              <RotateCcw size={9} />
              Rollback to {selectedVersion.id}
            </button>
          )}
        </div>
      )}

      {selectedVersion && selectedVersion.id !== 'v2.3.1' && (
        <div className="flex items-center gap-1.5 p-1.5 bg-accent-yellow/10 border border-accent-yellow/30">
          <AlertTriangle size={11} className="text-accent-yellow" />
          <span className="text-[10px] text-accent-yellow">
            Rolling back will deactivate v2.3.1
          </span>
        </div>
      )}
    </div>
  )
})

export default StrategyVersionControl
