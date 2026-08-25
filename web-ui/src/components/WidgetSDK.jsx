import { memo, useMemo, useState } from 'react'
import { Code2, Copy, Puzzle, BookOpen } from 'lucide-react'

const MOCK_WIDGETS = [
  { id: 'candle-chart', name: 'CandleChart', category: 'Chart', desc: 'Real-time candlestick chart with indicators', props: '[candles, symbol, timeframe]' },
  { id: 'order-book', name: 'OrderBook', category: 'Order Flow', desc: 'Live order book depth visualization', props: '[orderbook, symbol]' },
  { id: 'trade-tape', name: 'TradeTape', category: 'Order Flow', desc: 'Scrolling list of recent trades', props: '[trades, symbol]' },
  { id: 'risk-meter', name: 'RiskMeter', category: 'Risk', desc: 'Current portfolio risk exposure gauge', props: '[positions, riskMetrics]' },
  { id: 'signal-list', name: 'SignalList', category: 'Strategy', desc: 'Active trading signals with confidence', props: '[signals]' },
  { id: 'position-table', name: 'PositionTable', category: 'Portfolio', desc: 'Open positions with PnL', props: '[positions, currentPrice]' },
]

const MOCK_CODE_SAMPLE = `import { CandleChart, OrderBook } from 'hft-widgets'

const config = {
  exchange: 'binance',
  symbol: 'BTC/USDT',
  theme: 'dark',
  onUpdate: (data) => console.log(data)
}

const chart = new CandleChart('#chart-container', config)
chart.render()

const book = new OrderBook('#book-container', {
  symbol: 'BTC/USDT',
  depth: 20
})
book.start()`

const CATEGORIES = ['All', 'Chart', 'Order Flow', 'Risk', 'Strategy', 'Portfolio']

const WidgetSDK = memo(function WidgetSDK({ addToast }) {
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState(MOCK_WIDGETS[0])

  const filtered = useMemo(() => {
    if (category === 'All') return MOCK_WIDGETS
    return MOCK_WIDGETS.filter(w => w.category === category)
  }, [category])

  const handleCopy = () => {
    if (addToast) addToast('success', 'Code sample copied to clipboard')
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Puzzle size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Widget SDK</span>
        </div>
        <span className="text-[10px] text-gray-600">{MOCK_WIDGETS.length} widgets</span>
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

      {/* Widget list */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Available Widgets</div>
        <div className="space-y-0.5">
          {filtered.map(widget => (
            <div
              key={widget.id}
              onClick={() => setSelected(widget)}
              className={`p-1.5 bg-bg-700 cursor-pointer hover:bg-bg-600 transition-colors rounded ${selected?.id === widget.id ? 'ring-1 ring-accent-blue' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-300 font-mono">{widget.name}</span>
                <span className="text-[8px] text-gray-600 uppercase">{widget.category}</span>
              </div>
              <div className="text-[9px] text-gray-500 mt-0.5">{widget.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected widget props */}
      {selected && (
        <div className="p-2 bg-bg-700 border border-bg-600 rounded">
          <div className="flex items-center gap-1 mb-1">
            <BookOpen size={10} className="text-gray-500" />
            <span className="text-[10px] text-gray-600 uppercase">{selected.name} Props</span>
          </div>
          <div className="text-[10px] font-mono text-accent-blue">{selected.props}</div>
        </div>
      )}

      {/* Code sample */}
      <div className="bg-bg-900 border border-bg-600 rounded">
        <div className="flex items-center justify-between p-1.5 border-b border-bg-600">
          <div className="flex items-center gap-1">
            <Code2 size={11} className="text-gray-500" />
            <span className="text-[10px] text-gray-600 uppercase">Usage Example</span>
          </div>
          <button onClick={handleCopy} className="flex items-center gap-1 text-[9px] text-gray-500 hover:text-gray-300 transition-colors">
            <Copy size={9} />
            Copy
          </button>
        </div>
        <pre className="text-[10px] font-mono text-accent-green p-2 overflow-x-auto whitespace-pre">
{MOCK_CODE_SAMPLE}
        </pre>
      </div>
    </div>
  )
})

export default WidgetSDK
