import { memo, useMemo, useState } from 'react'
import { Layers, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { StatCard } from '../utils/ui-helpers'

const MOCK_CALLS = [
  { strike: 38000, iv: 45, delta: 0.12, gamma: 0.0001, theta: -8.5, volume: 1250, oi: 5420, bid: 120, ask: 125 },
  { strike: 40000, iv: 42, delta: 0.25, gamma: 0.0002, theta: -12.3, volume: 2100, oi: 8900, bid: 450, ask: 460 },
  { strike: 42000, iv: 40, delta: 0.42, gamma: 0.0003, theta: -15.8, volume: 3400, oi: 12500, bid: 980, ask: 995 },
  { strike: 44000, iv: 38, delta: 0.58, gamma: 0.0003, theta: -14.2, volume: 2800, oi: 10200, bid: 1650, ask: 1670 },
  { strike: 46000, iv: 39, delta: 0.72, gamma: 0.0002, theta: -10.5, volume: 1800, oi: 7300, bid: 2400, ask: 2420 },
  { strike: 48000, iv: 41, delta: 0.85, gamma: 0.0001, theta: -6.2, volume: 950, oi: 4100, bid: 3300, ask: 3320 },
  { strike: 50000, iv: 43, delta: 0.92, gamma: 0.0001, theta: -3.1, volume: 420, oi: 2100, bid: 4200, ask: 4250 },
]

const MOCK_PUTS = [
  { strike: 38000, iv: 48, delta: -0.88, gamma: 0.0001, theta: -5.2, volume: 890, oi: 3200, bid: 80, ask: 85 },
  { strike: 40000, iv: 44, delta: -0.75, gamma: 0.0002, theta: -8.8, volume: 1450, oi: 5600, bid: 180, ask: 190 },
  { strike: 42000, iv: 41, delta: -0.58, gamma: 0.0003, theta: -12.5, volume: 2200, oi: 8800, bid: 380, ask: 395 },
  { strike: 44000, iv: 39, delta: -0.42, gamma: 0.0003, theta: -14.8, volume: 2600, oi: 9500, bid: 680, ask: 695 },
  { strike: 46000, iv: 40, delta: -0.28, gamma: 0.0002, theta: -11.2, volume: 1600, oi: 6200, bid: 1100, ask: 1120 },
  { strike: 48000, iv: 42, delta: -0.15, gamma: 0.0001, theta: -7.5, volume: 720, oi: 3400, bid: 1650, ask: 1675 },
  { strike: 50000, iv: 44, delta: -0.08, gamma: 0.0001, theta: -4.0, volume: 310, oi: 1800, bid: 2300, ask: 2350 },
]

function moneynessColor(strike, currentPrice, isCall) {
  const diff = isCall ? strike - currentPrice : currentPrice - strike
  if (diff < 0) return 'text-accent-green'
  if (diff === 0) return 'text-accent-yellow'
  return 'text-gray-400'
}

const OptionsChain = memo(function OptionsChain({ currentPrice }) {
  const [selected, setSelected] = useState(null)
  const price = currentPrice ?? 44100

  const stats = useMemo(() => {
    const totalCallVol = MOCK_CALLS.reduce((s, c) => s + c.volume, 0)
    const totalPutVol = MOCK_PUTS.reduce((s, p) => s + p.volume, 0)
    const totalCallOI = MOCK_CALLS.reduce((s, c) => s + c.oi, 0)
    const totalPutOI = MOCK_PUTS.reduce((s, p) => s + p.oi, 0)
    const pcr = (totalPutOI / totalCallOI).toFixed(2)
    const avgIV = [...MOCK_CALLS, ...MOCK_PUTS].reduce((s, o) => s + o.iv, 0) / (MOCK_CALLS.length + MOCK_PUTS.length)
    return { totalCallVol, totalPutVol, totalCallOI, totalPutOI, pcr, avgIV }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Options Chain</span>
        </div>
        <span className="text-[10px] text-gray-600">BTC/USDT @ ${formatPrice(price, 0)}</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="PCR" value={stats.pcr} color="text-accent-yellow" size="xs" compact />
        <StatCard label="Avg IV" value={`${stats.avgIV.toFixed(0)}%`} color="text-gray-300" size="xs" compact />
        <StatCard label="Call Vol" value={stats.totalCallVol.toLocaleString()} color="text-accent-green" size="xs" compact />
        <StatCard label="Put Vol" value={stats.totalPutVol.toLocaleString()} color="text-accent-red" size="xs" compact />
      </div>

      {/* Chain table */}
      <div className="bg-bg-900 border border-bg-600 rounded overflow-hidden">
        <div className="grid grid-cols-2 text-[9px] text-gray-600 uppercase py-1 px-2 border-b border-bg-600">
          <span className="flex items-center gap-1"><TrendingUp size={9} className="text-accent-green" />Calls</span>
          <span className="flex items-center gap-1 justify-end">Puts<TrendingDown size={9} className="text-accent-red" /></span>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {MOCK_CALLS.map((call, i) => {
            const put = MOCK_PUTS[i]
            const isATM = Math.abs(call.strike - price) < 1500
            return (
              <div
                key={call.strike}
                onClick={() => setSelected(call.strike)}
                className={`grid grid-cols-2 py-0.5 px-2 border-b border-bg-800 cursor-pointer hover:bg-bg-800 ${isATM ? 'bg-accent-yellow/5' : ''} ${selected === call.strike ? 'ring-1 ring-accent-blue' : ''}`}
              >
                {/* Call side */}
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-mono w-10 ${moneynessColor(call.strike, price, true)}`}>
                    ${formatPrice(call.strike, 0)}
                  </span>
                  <span className="text-[9px] font-mono text-gray-400 w-8">{call.iv}%</span>
                  <span className="text-[9px] font-mono text-accent-green w-10">{call.bid}</span>
                  <span className="text-[9px] font-mono text-gray-500 w-10">{call.volume}</span>
                </div>
                {/* Put side */}
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="text-[9px] font-mono text-gray-500 w-10 text-right">{put.volume}</span>
                  <span className="text-[9px] font-mono text-accent-red w-10 text-right">{put.bid}</span>
                  <span className="text-[9px] font-mono text-gray-400 w-8 text-right">{put.iv}%</span>
                  <span className={`text-[9px] font-mono w-10 text-right ${moneynessColor(put.strike, price, false)}`}>
                    ${formatPrice(put.strike, 0)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected option details */}
      {selected && (
        <div className="p-2 bg-bg-700 border border-bg-600 rounded">
          <div className="text-[10px] text-gray-600 uppercase mb-1">Strike ${formatPrice(selected, 0)} Details</div>
          <div className="grid grid-cols-2 gap-2">
            {(() => {
              const call = MOCK_CALLS.find(c => c.strike === selected)
              const put = MOCK_PUTS.find(p => p.strike === selected)
              return (
                <>
                  <div>
                    <div className="text-[9px] text-accent-green mb-0.5">Call</div>
                    <div className="text-[9px] text-gray-400">Delta: {call.delta.toFixed(2)}</div>
                    <div className="text-[9px] text-gray-400">Gamma: {call.gamma.toFixed(4)}</div>
                    <div className="text-[9px] text-gray-400">Theta: {call.theta.toFixed(1)}</div>
                    <div className="text-[9px] text-gray-400">OI: {call.oi.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-accent-red mb-0.5">Put</div>
                    <div className="text-[9px] text-gray-400">Delta: {put.delta.toFixed(2)}</div>
                    <div className="text-[9px] text-gray-400">Gamma: {put.gamma.toFixed(4)}</div>
                    <div className="text-[9px] text-gray-400">Theta: {put.theta.toFixed(1)}</div>
                    <div className="text-[9px] text-gray-400">OI: {put.oi.toLocaleString()}</div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <DollarSign size={9} />
          PCR {'>'} 1 = bearish sentiment
        </span>
        <span>ATM highlighted</span>
      </div>
    </div>
  )
})

export default OptionsChain
