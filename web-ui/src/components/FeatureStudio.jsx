import { memo, useMemo, useState } from 'react'
import { FlaskConical, Plus, Star, Trash2, BarChart3 } from 'lucide-react'
import { StatCard } from '../utils/ui-helpers'

const MOCK_FEATURES = [
  { id: 1, name: 'rsi_14', category: 'Momentum', importance: 0.82, correlation: 0.45, stability: 0.78, status: 'active' },
  { id: 2, name: 'ema_cross_5_20', category: 'Trend', importance: 0.75, correlation: 0.38, stability: 0.85, status: 'active' },
  { id: 3, name: 'volatility_20d', category: 'Volatility', importance: 0.68, correlation: 0.22, stability: 0.72, status: 'active' },
  { id: 4, name: 'volume_ratio', category: 'Volume', importance: 0.55, correlation: 0.18, stability: 0.65, status: 'active' },
  { id: 5, name: 'funding_rate', category: 'Derivatives', importance: 0.48, correlation: 0.31, stability: 0.58, status: 'active' },
  { id: 6, name: 'bid_ask_imbalance', category: 'Microstructure', importance: 0.42, correlation: 0.15, stability: 0.52, status: 'active' },
  { id: 7, name: 'atr_14', category: 'Volatility', importance: 0.38, correlation: 0.28, stability: 0.70, status: 'inactive' },
  { id: 8, name: 'macd_hist', category: 'Momentum', importance: 0.35, correlation: 0.41, stability: 0.62, status: 'inactive' },
  { id: 9, name: 'oi_change', category: 'Derivatives', importance: 0.28, correlation: 0.12, stability: 0.48, status: 'inactive' },
  { id: 10, name: 'spread_bps', category: 'Microstructure', importance: 0.22, correlation: 0.08, stability: 0.55, status: 'inactive' },
]

const CATEGORIES = ['All', 'Momentum', 'Trend', 'Volatility', 'Volume', 'Derivatives', 'Microstructure']

function importanceColor(val) {
  if (val >= 0.7) return 'text-accent-green'
  if (val >= 0.5) return 'text-accent-yellow'
  if (val >= 0.3) return 'text-accent-orange'
  return 'text-accent-red'
}

const FeatureStudio = memo(function FeatureStudio() {
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState(null)

  const filtered = useMemo(() => {
    if (category === 'All') return MOCK_FEATURES
    return MOCK_FEATURES.filter(f => f.category === category)
  }, [category])

  const stats = useMemo(() => {
    const active = MOCK_FEATURES.filter(f => f.status === 'active').length
    const avgImportance = MOCK_FEATURES.filter(f => f.status === 'active').reduce((s, f) => s + f.importance, 0) / active
    const highCorr = MOCK_FEATURES.filter(f => Math.abs(f.correlation) > 0.4).length
    return { active, total: MOCK_FEATURES.length, avgImportance, highCorr }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FlaskConical size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Feature Studio</span>
        </div>
        <span className="text-[10px] text-gray-600">{stats.active}/{stats.total} active</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1">
        <StatCard label="Avg Importance" value={`${(stats.avgImportance * 100).toFixed(0)}%`} color="text-accent-green" compact />
        <StatCard label="High Corr" value={stats.highCorr} color="text-accent-yellow" compact />
        <StatCard label="Features" value={stats.total} color="text-gray-300" compact />
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-1 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              category === cat ? 'bg-accent-blue/20 text-accent-blue' : 'bg-bg-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Feature list */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <BarChart3 size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Features</span>
        </div>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {filtered.map(f => (
            <div
              key={f.id}
              onClick={() => setSelected(f.id)}
              className={`flex items-center gap-2 py-0.5 px-1.5 bg-bg-700 cursor-pointer hover:bg-bg-600 transition-colors ${selected === f.id ? 'ring-1 ring-accent-blue' : ''}`}
            >
              <span className={`text-[8px] px-1 rounded ${f.status === 'active' ? 'bg-accent-green/20 text-accent-green' : 'bg-bg-600 text-gray-600'} w-10 text-center`}>
                {f.status === 'active' ? 'ON' : 'OFF'}
              </span>
              <span className="text-[10px] text-gray-300 font-mono flex-1 truncate">{f.name}</span>
              <span className="text-[8px] text-gray-600 w-16 truncate">{f.category}</span>
              <span className={`text-[9px] font-mono w-10 text-right ${importanceColor(f.importance)}`}>
                {(f.importance * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected feature detail */}
      {selected && (() => {
        const feat = MOCK_FEATURES.find(f => f.id === selected)
        if (!feat) return null
        return (
          <div className="p-2 bg-bg-700 border border-bg-600 rounded">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-accent-blue">{feat.name}</span>
              <span className="text-[9px] text-gray-600">{feat.category}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[9px]">
              <div>
                <span className="text-gray-600">Importance</span>
                <div className={`font-mono ${importanceColor(feat.importance)}`}>{(feat.importance * 100).toFixed(0)}%</div>
              </div>
              <div>
                <span className="text-gray-600">Correlation</span>
                <div className="font-mono text-gray-300">{feat.correlation.toFixed(2)}</div>
              </div>
              <div>
                <span className="text-gray-600">Stability</span>
                <div className="font-mono text-gray-300">{(feat.stability * 100).toFixed(0)}%</div>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <button className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-accent-yellow/20 text-accent-yellow rounded">
                <Star size={9} /> Favorite
              </button>
              <button className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-accent-red/20 text-accent-red rounded">
                <Trash2 size={9} /> Remove
              </button>
              <button className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-accent-green/20 text-accent-green rounded">
                <Plus size={9} /> {feat.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
})

export default FeatureStudio
