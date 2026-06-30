import { useState } from 'react'
import { Settings, Save, RotateCcw } from 'lucide-react'

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']
const EXCHANGES = ['binance', 'bybit', 'okx']

export default function ConfigPanel({ onConfigUpdate, fundingRates, weekendMode }) {
  const [expanded, setExpanded] = useState(false)
  const [volatility, setVolatility] = useState({
    'BTC/USDT': 0.8,
    'ETH/USDT': 1.2,
    'SOL/USDT': 2.0,
  })
  const [fees, setFees] = useState({ binance: 0.04, bybit: 0.06, okx: 0.05 })
  const [slippage, setSlippage] = useState({ binance: 2.0, bybit: 3.0, okx: 2.5 })
  const [leverage, setLeverage] = useState({ binance: 10, bybit: 10, okx: 10 })
  const [savedMsg, setSavedMsg] = useState(null)

  const handleSave = () => {
    onConfigUpdate({ volatility, fees, slippage, leverage })
    setSavedMsg({ type: 'success', text: 'Config applied (hot-reload)' })
    setTimeout(() => setSavedMsg(null), 3000)
  }

  const handleReset = () => {
    setVolatility({ 'BTC/USDT': 0.8, 'ETH/USDT': 1.2, 'SOL/USDT': 2.0 })
    setFees({ binance: 0.04, bybit: 0.06, okx: 0.05 })
    setSlippage({ binance: 2.0, bybit: 3.0, okx: 2.5 })
    setLeverage({ binance: 10, bybit: 10, okx: 10 })
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase w-full"
      >
        <Settings size={12} className="text-accent-blue" />
        Simulator Config
        <span className="ml-auto text-gray-600">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Volatility */}
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Volatility (annualized)</div>
            {SYMBOLS.map(sym => (
              <div key={sym} className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-gray-400 w-16">{sym.split('/')[0]}</span>
                <input
                  type="range"
                  min="0.1"
                  max="5.0"
                  step="0.1"
                  value={volatility[sym]}
                  onChange={e => setVolatility(prev => ({ ...prev, [sym]: parseFloat(e.target.value) }))}
                  className="flex-1 accent-accent-blue"
                />
                <span className="text-[10px] font-mono text-gray-300 w-8 text-right">{volatility[sym].toFixed(1)}</span>
              </div>
            ))}
          </div>

          {/* Fees */}
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Trading Fee (%)</div>
            {EXCHANGES.map(ex => (
              <div key={ex} className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-gray-400 w-16">{ex}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={fees[ex]}
                  onChange={e => setFees(prev => ({ ...prev, [ex]: parseFloat(e.target.value) }))}
                  className="w-16 bg-bg-600 text-gray-200 text-[10px] rounded px-1.5 py-0.5 border border-bg-500 font-mono"
                />
                <span className="text-[10px] text-gray-600">%</span>
              </div>
            ))}
          </div>

          {/* Slippage */}
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Slippage (bps)</div>
            {EXCHANGES.map(ex => (
              <div key={ex} className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-gray-400 w-16">{ex}</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="20"
                  value={slippage[ex]}
                  onChange={e => setSlippage(prev => ({ ...prev, [ex]: parseFloat(e.target.value) }))}
                  className="w-16 bg-bg-600 text-gray-200 text-[10px] rounded px-1.5 py-0.5 border border-bg-500 font-mono"
                />
                <span className="text-[10px] text-gray-600">bps</span>
              </div>
            ))}
          </div>

          {/* Leverage */}
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Leverage (x)</div>
            {EXCHANGES.map(ex => (
              <div key={ex} className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-gray-400 w-16">{ex}</span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={leverage[ex]}
                  onChange={e => setLeverage(prev => ({ ...prev, [ex]: parseInt(e.target.value) }))}
                  className="w-16 bg-bg-600 text-gray-200 text-[10px] rounded px-1.5 py-0.5 border border-bg-500 font-mono"
                />
                <span className="text-[10px] text-gray-600">x</span>
              </div>
            ))}
          </div>

          {/* Funding rates display */}
          {fundingRates && Object.keys(fundingRates).length > 0 && (
            <div className="text-[10px] text-gray-500 pt-1 border-t border-bg-600">
              <span>Funding: </span>
              {EXCHANGES.map(ex => (
                <span key={ex} className="ml-1 font-mono">
                  {ex}: <span className={fundingRates[ex] >= 0 ? 'text-accent-red' : 'text-accent-green'}>
                    {(fundingRates[ex] * 100).toFixed(4)}%
                  </span>
                </span>
              ))}
            </div>
          )}

          {weekendMode && (
            <div className="text-[10px] text-gray-500 italic">Weekend mode active (30% vol)</div>
          )}

          {/* Actions */}
          <div className="flex gap-1 pt-1">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-accent-green/20 text-accent-green hover:bg-accent-green/30 transition-colors"
            >
              <Save size={10} />
              Apply
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-bg-600 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <RotateCcw size={10} />
              Reset
            </button>
          </div>

          {savedMsg && (
            <div className={'text-[10px] ' + (savedMsg.type === 'success' ? 'text-accent-green' : 'text-accent-red')}>
              {savedMsg.text}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
