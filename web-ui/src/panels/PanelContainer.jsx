import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, Settings2 } from 'lucide-react'
import { CATEGORIES, PANELS, DEFAULT_VISIBLE, getPanelsByCategory, preloadCategory } from './registry'
import PanelErrorBoundary from '../components/PanelErrorBoundary'
import ChunkRetryBoundary from '../components/ChunkRetryBoundary'

const VISIBILITY_KEY = 'trading-sim-panel-visibility'
const COLLAPSED_KEY = 'trading-sim-panel-collapsed'

export default function PanelContainer({ context }) {
  const [visible, setVisible] = useState(DEFAULT_VISIBLE)
  const [collapsed, setCollapsed] = useState({})
  const [showSettings, setShowSettings] = useState(false)

  // Load from localStorage
  useEffect(() => {
    try {
      const v = localStorage.getItem(VISIBILITY_KEY)
      if (v) setVisible(JSON.parse(v))
      const c = localStorage.getItem(COLLAPSED_KEY)
      if (c) setCollapsed(JSON.parse(c))
    } catch (e) {
      console.warn('[PanelContainer] Failed to load panel settings:', e)
    }
  }, [])

  // Save to localStorage
  useEffect(() => {
    try { localStorage.setItem(VISIBILITY_KEY, JSON.stringify(visible)) } catch (e) {
      console.warn('[PanelContainer] Failed to save visibility:', e)
    }
  }, [visible])

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed)) } catch (e) {
      console.warn('[PanelContainer] Failed to save collapsed state:', e)
    }
  }, [collapsed])

  const togglePanel = (id) => {
    setVisible(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id])
  }

  const toggleCategory = (catId) => {
    setCollapsed(prev => ({ ...prev, [catId]: !prev[catId] }))
  }

  // Preload all panels in a category on hover (desktop only)
  const handleCategoryHover = useCallback((catId) => {
    if (window.matchMedia('(hover: hover)').matches) {
      preloadCategory(catId)
    }
  }, [])

  const visibleCount = visible.length
  const totalCount = PANELS.length

  return (
    <div className="space-y-1">
      {/* Settings toggle */}
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[8px] text-gray-600 uppercase">{visibleCount}/{totalCount} panels</span>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={'flex items-center gap-1 px-1.5 py-0.5 text-[8px] rounded transition-colors ' +
            (showSettings ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-600 hover:text-gray-400')}
        >
          <Settings2 size={9} />
          Panels
        </button>
      </div>

      {/* Panel visibility settings */}
      {showSettings && (
        <div className="bg-bg-800 rounded-lg p-2 mb-2 max-h-[200px] overflow-y-auto scrollbar-thin">
          <div className="text-[8px] text-gray-600 uppercase mb-1">Toggle Panels</div>
          {CATEGORIES.map(cat => {
            const catPanels = getPanelsByCategory(cat.id)
            if (catPanels.length === 0) return null
            return (
              <div key={cat.id} className="mb-1.5">
                <div className="text-[8px] text-gray-500 font-medium mb-0.5">{cat.label}</div>
                <div className="grid grid-cols-2 gap-0.5">
                  {catPanels.map(p => (
                    <button
                      key={p.id}
                      onClick={() => togglePanel(p.id)}
                      className={'flex items-center gap-1 px-1 py-0.5 text-[8px] rounded text-left ' +
                        (visible.includes(p.id) ? 'bg-accent-green/10 text-accent-green' : 'bg-bg-600 text-gray-600')}
                    >
                      {visible.includes(p.id) ? <Eye size={8} /> : <EyeOff size={8} />}
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Render panels by category */}
      {CATEGORIES.sort((a, b) => a.order - b.order).map(cat => {
        const catPanels = getPanelsByCategory(cat.id)
        const visiblePanels = catPanels.filter(p => visible.includes(p.id))
        if (visiblePanels.length === 0) return null

        const isCollapsed = collapsed[cat.id]

        return (
          <div key={cat.id}>
            {/* Category header */}
            <button
              onClick={() => toggleCategory(cat.id)}
              onMouseEnter={() => handleCategoryHover(cat.id)}
              aria-expanded={!isCollapsed}
              aria-controls={`category-${cat.id}`}
              className="w-full flex items-center gap-1 px-1 py-0.5 text-[9px] text-gray-500 uppercase hover:text-gray-400 transition-colors sticky top-0 bg-bg-900/80 backdrop-blur-sm z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue rounded"
            >
              {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              <span className="font-medium">{cat.label}</span>
              <span className="text-gray-700 ml-auto">{visiblePanels.length}</span>
            </button>

            {/* Panels */}
            {!isCollapsed && (
              <div id={`category-${cat.id}`} role="tabpanel" className="space-y-1 mt-0.5">
                {visiblePanels.map(panel => {
                  const Component = panel.component
                  const props = panel.props(context)
                  return (
                    <PanelErrorBoundary key={panel.id} panelName={panel.name}>
                      <ChunkRetryBoundary panelName={panel.name}>
                        <Component {...props} />
                      </ChunkRetryBoundary>
                    </PanelErrorBoundary>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
