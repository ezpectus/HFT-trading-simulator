import { memo, useMemo, useState } from 'react'
import { FlaskConical, Sliders, TrendingUp, PieChart } from 'lucide-react'

const MOCK_ASSETS = [
  { symbol: 'BTC', return: 12.5, vol: 45.2, weight: 35, optimal: 28 },
  { symbol: 'ETH', return: 18.2, vol: 52.8, weight: 25, optimal: 32 },
  { symbol: 'SOL', return: 25.8, vol: 68.5, weight: 15, optimal: 22 },
  { symbol: 'LINK', return: 6.2, vol: 42.5, weight: 10, optimal: 8 },
  { symbol: 'DOT', return: -2.8, vol: 48.5, weight: 8, optimal: 0 },
  { symbol: 'MATIC', return: 15.2, vol: 55.8, weight: 7, optimal: 10 },
]

const MOCK_METHODS = [
  { method: 'Markowitz', sharpe: 1.85, return: 14.2, vol: 38.5, maxDD: -12.5 },
  { method: 'Risk Parity', sharpe: 1.62, return: 11.8, vol: 32.2, maxDD: -8.8 },
  { method: 'Black-Litterman', sharpe: 2.05, return: 15.5, vol: 35.8, maxDD: -10.2 },
  { method: 'Kelly', sharpe: 1.92, return: 16.8, vol: 42.1, maxDD: -15.5 },
  { method: 'Min Variance', sharpe: 1.45, return: 8.5, vol: 25.2, maxDD: -5.5 },
]

const MOCK_EFFICIENT_FRONTIER = [
  { risk: 15, ret: 5.2 }, { risk: 20, ret: 7.8 }, { risk: 25, ret: 9.5 },
  { risk: 30, ret: 11.2 }, { risk: 35, ret: 12.8 }, { risk: 40, ret: 14.0 },
  { risk: 45, ret: 14.8 }, { risk: 50, ret: 15.2 }, { risk: 55, ret: 15.5 },
  { risk: 60, ret: 15.8 }, { risk: 65, ret: 15.5 },
]

const PortfolioOptLab = memo(function PortfolioOptLab() {
  const [method, setMethod] = useState('Black-Litterman')

  const selectedMethod = useMemo(() => {
    return MOCK_METHODS.find(m => m.method === method) ?? MOCK_METHODS[0]
  }, [method])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FlaskConical size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Portfolio Optimization Lab</span>
        </div>
        <span className="text-[10px] text-gray-600">{method}</span>
      </div>

      {/* Method selector */}
      <div className="flex items-center gap-1 flex-wrap">
        <Sliders size={10} className="text-gray-600" />
        {MOCK_METHODS.map(m => (
          <button
            key={m.method}
            onClick={() => setMethod(m.method)}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              method === m.method ? 'bg-accent-purple/20 text-accent-purple' : 'bg-bg-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            {m.method}
          </button>
        ))}
      </div>

      {/* Selected method stats */}
      <div className="grid grid-cols-4 gap-1">
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Sharpe</div>
          <span className="text-sm font-mono text-accent-green">{selectedMethod.sharpe.toFixed(2)}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Return</div>
          <span className="text-sm font-mono text-accent-blue">{selectedMethod.return.toFixed(1)}%</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Volatility</div>
          <span className="text-sm font-mono text-accent-yellow">{selectedMethod.vol.toFixed(1)}%</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Max DD</div>
          <span className="text-sm font-mono text-accent-red">{selectedMethod.maxDD.toFixed(1)}%</span>
        </div>
      </div>

      {/* Efficient frontier */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <TrendingUp size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Efficient Frontier</span>
        </div>
        <div className="flex items-end gap-1 h-16">
          {MOCK_EFFICIENT_FRONTIER.map((pt, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div
                className={`w-full ${pt.ret >= 14 ? 'bg-accent-green' : pt.ret >= 10 ? 'bg-accent-yellow' : 'bg-accent-orange'} opacity-70`}
                style={{ height: `${(pt.ret / 16) * 100}%` }}
              />
              <span className="text-[7px] text-gray-600 mt-0.5">{pt.risk}</span>
            </div>
          ))}
        </div>
        <div className="text-[7px] text-gray-600 text-center mt-0.5">Risk (volatility %)</div>
      </div>

      {/* Current vs optimal weights */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <PieChart size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Current vs Optimal Weights</span>
        </div>
        <div className="space-y-0.5">
          {MOCK_ASSETS.map(a => (
            <div key={a.symbol} className="py-0.5 px-1.5 bg-bg-700">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-300 w-12">{a.symbol}</span>
                <span className="text-[9px] font-mono text-gray-400 w-10">{a.weight}%</span>
                <span className="text-gray-600 text-[8px]">→</span>
                <span className="text-[9px] font-mono text-accent-purple w-10">{a.optimal}%</span>
                <span className="text-[9px] font-mono text-gray-500 w-12 text-right">{a.return >= 0 ? '+' : ''}{a.return.toFixed(1)}%</span>
                <span className="text-[9px] font-mono text-gray-600 w-10 text-right">{a.vol.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="flex-1 h-1.5 bg-bg-600 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-blue opacity-50" style={{ width: `${a.weight}%` }} />
                </div>
                <div className="flex-1 h-1.5 bg-bg-600 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-purple opacity-70" style={{ width: `${a.optimal}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[8px] text-gray-600">
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-blue opacity-50" />Current</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-purple opacity-70" />Optimal</span>
        </div>
      </div>
    </div>
  )
})

export default PortfolioOptLab
