import { memo, useState, useCallback } from 'react'
import { Pencil, Ruler, TrendingUp, Minus, Circle, Square, Trash2, Undo2, Redo2, MousePointer2 } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'

const TOOLS = [
  { id: 'cursor', label: 'Cursor', icon: MousePointer2 },
  { id: 'trendline', label: 'Trend Line', icon: TrendingUp },
  { id: 'horizontal', label: 'Horizontal', icon: Minus },
  { id: 'vertical', label: 'Vertical', icon: Ruler },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'brush', label: 'Brush', icon: Pencil },
]

const COLORS = [
  { id: 'blue', class: 'bg-accent-blue' },
  { id: 'green', class: 'bg-accent-green' },
  { id: 'red', class: 'bg-accent-red' },
  { id: 'yellow', class: 'bg-accent-yellow' },
  { id: 'purple', class: 'bg-accent-purple' },
  { id: 'white', class: 'bg-gray-200' },
]

const DrawingTools = memo(function DrawingTools({ symbol, addToast }) {
  const [activeTool, setActiveTool] = useState('cursor')
  const [activeColor, setActiveColor] = useState('blue')
  const [drawings, setDrawings] = useLocalStorage(`trading-drawings-${symbol}`, [])

  const handleToolSelect = useCallback((toolId) => {
    setActiveTool(toolId)
    addToast?.('info', `Tool: ${TOOLS.find(t => t.id === toolId)?.label}`)
  }, [addToast])

  const handleClear = useCallback(() => {
    setDrawings([])
    addToast?.('warning', `Cleared all drawings for ${symbol}`)
  }, [setDrawings, symbol, addToast])

  const handleUndo = useCallback(() => {
    setDrawings(prev => prev.slice(0, -1))
  }, [setDrawings])

  const drawingCount = drawings?.length || 0

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Pencil size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Drawing Tools</span>
        </div>
        <span className="text-[10px] text-gray-600">{drawingCount} drawings</span>
      </div>

      {/* Tool palette */}
      <div className="grid grid-cols-4 gap-1">
        {TOOLS.map(tool => {
          const Icon = tool.icon
          const isActive = activeTool === tool.id
          return (
            <button
              key={tool.id}
              onClick={() => handleToolSelect(tool.id)}
              title={tool.label}
              className={`flex flex-col items-center gap-0.5 p-1.5 transition-colors ${
                isActive ? 'bg-accent-blue/20 text-accent-blue' : 'bg-bg-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon size={14} />
              <span className="text-[8px]">{tool.label}</span>
            </button>
          )
        })}
      </div>

      {/* Color palette */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Color</div>
        <div className="flex gap-1">
          {COLORS.map(color => (
            <button
              key={color.id}
              onClick={() => setActiveColor(color.id)}
              className={`w-5 h-5 rounded ${color.class} transition-transform ${
                activeColor === color.id ? 'ring-2 ring-white scale-110' : ''
              }`}
              title={color.id}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1">
        <button
          onClick={handleUndo}
          disabled={drawingCount === 0}
          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-bg-700 text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
        >
          <Undo2 size={11} />
          Undo
        </button>
        <button
          onClick={() => addToast?.('info', 'Redo not available')}
          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-bg-700 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <Redo2 size={11} />
          Redo
        </button>
        <button
          onClick={handleClear}
          disabled={drawingCount === 0}
          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-bg-700 text-accent-red hover:bg-accent-red/10 disabled:opacity-30 transition-colors ml-auto"
        >
          <Trash2 size={11} />
          Clear
        </button>
      </div>

      {/* Active tool info */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-600">Active Tool</span>
          <span className="text-gray-400">{TOOLS.find(t => t.id === activeTool)?.label || 'None'}</span>
        </div>
        <div className="flex items-center justify-between text-[10px] mt-0.5">
          <span className="text-gray-600">Symbol</span>
          <span className="text-gray-400">{symbol}</span>
        </div>
      </div>
    </div>
  )
})

export default DrawingTools
