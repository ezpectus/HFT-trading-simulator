import { memo, useCallback } from 'react'
import { Layout, CandlestickChart, BarChart3, LineChart, AreaChart, Save } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'

const BUILTIN_TEMPLATES = [
  { id: 'default', name: 'Default', description: 'Candles + Volume', chartType: 'candlestick', indicators: ['EMA20', 'RSI'], color: 'bg-accent-blue' },
  { id: 'scalper', name: 'Scalper', description: 'Fast order flow view', chartType: 'candlestick', indicators: ['VWAP', 'ATR'], color: 'bg-accent-red' },
  { id: 'swing', name: 'Swing Trader', description: 'Daily candles + MACD', chartType: 'candlestick', indicators: ['EMA50', 'MACD', 'BB'], color: 'bg-accent-green' },
  { id: 'volume', name: 'Volume Analysis', description: 'Volume profile + bars', chartType: 'bar', indicators: ['Volume', 'OBV'], color: 'bg-accent-purple' },
  { id: 'line', name: 'Minimal Line', description: 'Clean line chart', chartType: 'line', indicators: [], color: 'bg-accent-yellow' },
  { id: 'area', name: 'Area View', description: 'Area chart with gradient', chartType: 'area', indicators: ['EMA20'], color: 'bg-accent-blue' },
]

const CHART_ICONS = {
  candlestick: CandlestickChart,
  bar: BarChart3,
  line: LineChart,
  area: AreaChart,
}

const ChartTemplates = memo(function ChartTemplates({ symbol, addToast }) {
  const [activeTemplate, setActiveTemplate] = useLocalStorage('trading-chart-template', 'default')
  const [customTemplates, setCustomTemplates] = useLocalStorage('trading-custom-templates', [])

  const allTemplates = [...BUILTIN_TEMPLATES, ...customTemplates]

  const handleSelect = useCallback((template) => {
    setActiveTemplate(template.id)
    addToast?.('info', `Chart template: ${template.name}`)
  }, [setActiveTemplate, addToast])

  const handleSave = useCallback(() => {
    const newTemplate = {
      id: `custom-${Date.now()}`,
      name: `Template ${customTemplates.length + 1}`,
      description: `${symbol} custom`,
      chartType: 'candlestick',
      indicators: ['EMA20'],
      color: 'bg-accent-blue',
    }
    setCustomTemplates(prev => [...prev, newTemplate])
    addToast?.('success', `Saved template: ${newTemplate.name}`)
  }, [customTemplates, setCustomTemplates, symbol, addToast])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layout size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Chart Templates</span>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] text-accent-green hover:bg-accent-green/10 transition-colors"
        >
          <Save size={10} />
          Save
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1">
        {allTemplates.map(tpl => {
          const Icon = CHART_ICONS[tpl.chartType] || CandlestickChart
          const isActive = activeTemplate === tpl.id
          return (
            <button
              key={tpl.id}
              onClick={() => handleSelect(tpl)}
              className={`flex flex-col items-start p-2 border transition-colors ${
                isActive ? 'border-accent-blue bg-accent-blue/10' : 'border-bg-600 bg-bg-700 hover:bg-bg-600'
              }`}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <Icon size={12} className={isActive ? 'text-accent-blue' : 'text-gray-500'} />
                <span className={`text-[10px] font-medium ${isActive ? 'text-accent-blue' : 'text-gray-300'}`}>
                  {tpl.name}
                </span>
              </div>
              <span className="text-[9px] text-gray-600">{tpl.description}</span>
              {tpl.indicators.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {tpl.indicators.map(ind => (
                    <span key={ind} className={`text-[8px] px-1 rounded ${tpl.color} text-white`}>{ind}</span>
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-600">Active Template</span>
          <span className="text-gray-400">
            {allTemplates.find(t => t.id === activeTemplate)?.name || 'None'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] mt-0.5">
          <span className="text-gray-600">Symbol</span>
          <span className="text-gray-400">{symbol}</span>
        </div>
      </div>
    </div>
  )
})

export default ChartTemplates
