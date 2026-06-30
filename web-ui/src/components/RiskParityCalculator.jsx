import { useState, useMemo } from 'react'
import { Calculator, Info } from 'lucide-react'

export default function RiskParityCalculator({ candles, symbols, exchange }) {
  const [totalCapital, setTotalCapital] = useState(10000)
  const [riskPct, setRiskPct] = useState(1.0)
  const [stopLossPct, setStopLossPct] = useState(2.0)

  // Calculate volatility (stdev of returns) for each symbol
  const volatilities = useMemo(() => {
    const result = {}
    for (const sym of symbols) {
      const symCandles = candles
        .filter(c => c.exchange === exchange && c.symbol === sym)
        .map(c => c.close)
      if (symCandles.length < 10) {
        result[sym] = 0.01
        continue
      }
      const returns = []
      for (let i = 1; i < symCandles.length; i++) {
        if (symCandles[i - 1] > 0) {
          returns.push((symCandles[i] - symCandles[i - 1]) / symCandles[i - 1])
        }
      }
      if (returns.length === 0) { result[sym] = 0.01; continue }
      const mean = returns.reduce((s, v) => s + v, 0) / returns.length
      const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length
      result[sym] = Math.sqrt(variance)
    }
    return result
  }, [candles, exchange, symbols])

  // Risk parity: allocate inversely proportional to volatility
  const allocations = useMemo(() => {
    const invVols = {}
    let sumInvVol = 0
    for (const sym of symbols) {
      const v = volatilities[sym] || 0.01
      invVols[sym] = 1 / v
      sumInvVol += invVols[sym]
    }

    const result = []
    const riskPerTrade = (totalCapital * riskPct) / 100
    const stopLossDecimal = stopLossPct / 100

    for (const sym of symbols) {
      const weight = invVols[sym] / sumInvVol
      const allocatedCapital = totalCapital * weight
      const positionRisk = riskPerTrade * weight
      const positionSize = stopLossDecimal > 0 ? positionRisk / (stopLossDecimal * 100) : 0
      const lastPrice = candles
        .filter(c => c.exchange === exchange && c.symbol === sym)
        .slice(-1)[0]?.close || 0

      result.push({
        symbol: sym,
        volatility: (volatilities[sym] || 0) * 100,
        weight: weight * 100,
        allocatedCapital,
        positionRisk,
        positionSize: lastPrice > 0 ? positionSize / lastPrice : 0,
        quantity: lastPrice > 0 ? allocatedCapital / lastPrice : 0,
        lastPrice,
      })
    }
    return result
  }, [volatilities, totalCapital, riskPct, stopLossPct, symbols, candles, exchange])

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Calculator size={12} className="text-accent-yellow" />
        Risk Parity Calculator
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] text-gray-600">Capital ($)</span>
          <input
            type="number"
            value={totalCapital}
            onChange={e => setTotalCapital(Number(e.target.value))}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-yellow"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] text-gray-600">Risk (%)</span>
          <input
            type="number"
            step="0.1"
            value={riskPct}
            onChange={e => setRiskPct(Number(e.target.value))}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-yellow"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] text-gray-600">Stop (%)</span>
          <input
            type="number"
            step="0.1"
            value={stopLossPct}
            onChange={e => setStopLossPct(Number(e.target.value))}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-yellow"
          />
        </label>
      </div>

      {/* Results table */}
      <table className="w-full text-[9px]">
        <thead>
          <tr className="text-gray-600 border-b border-bg-600">
            <th className="text-left py-1">Symbol</th>
            <th className="text-right">Vol%</th>
            <th className="text-right">Weight</th>
            <th className="text-right">Capital</th>
            <th className="text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map(a => (
            <tr key={a.symbol} className="border-b border-bg-600/30">
              <td className="py-1 text-gray-300">{a.symbol.split('/')[0]}</td>
              <td className="text-right text-gray-400 font-mono">{a.volatility.toFixed(2)}%</td>
              <td className="text-right text-accent-yellow font-mono">{a.weight.toFixed(1)}%</td>
              <td className="text-right text-gray-300 font-mono">${a.allocatedCapital.toFixed(0)}</td>
              <td className="text-right text-gray-400 font-mono">{a.quantity.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 pt-2 border-t border-bg-600 flex items-start gap-1.5 text-[8px] text-gray-600">
        <Info size={9} className="shrink-0 mt-0.5" />
        <span>
          Risk parity allocates more capital to less volatile assets. Position size = (risk × weight) / (stop% × price).
        </span>
      </div>
    </div>
  )
}
