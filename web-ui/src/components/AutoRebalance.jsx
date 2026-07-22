import { useState, useMemo } from 'react'
import { RefreshCw, Play, Info } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function AutoRebalance({ accounts, candles, symbols, exchange, onSubmit }) {
  const [targetWeights, setTargetWeights] = useState({})
  const [threshold, setThreshold] = useState(5)
  const [rebalanceLog, setRebalanceLog] = useState([])

  // Initialize default equal weights
  useMemo(() => {
    if (Object.keys(targetWeights).length === 0 && symbols.length > 0) {
      const w = {}
      symbols.forEach(s => { w[s] = 100 / symbols.length })
      setTargetWeights(w)
    }
  }, [symbols])

  const portfolio = useMemo(() => {
    const acc = accounts?.[exchange]
    if (!acc) return null

    // Get current prices
    const prices = {}
    for (const sym of symbols) {
      const symCandles = candles.filter(c => c.exchange === exchange && c.symbol === sym)
      prices[sym] = symCandles[symCandles.length - 1]?.close || 0
    }

    // Calculate current allocations
    let totalValue = acc.balance || 0
    const positions = {}
    for (const p of Object.values(acc.positions || {})) {
      const value = (p.quantity || 0) * (prices[p.symbol] || 0)
      positions[p.symbol] = { quantity: p.quantity, value, side: p.side }
      totalValue += value
    }

    // Current weights
    const currentWeights = {}
    for (const sym of symbols) {
      const posValue = positions[sym]?.value || 0
      currentWeights[sym] = totalValue > 0 ? (posValue / totalValue) * 100 : 0
    }

    // Cash weight
    const cashValue = acc.balance || 0
    const cashWeight = totalValue > 0 ? (cashValue / totalValue) * 100 : 100

    // Calculate drift from target
    const drift = {}
    let maxDrift = 0
    for (const sym of symbols) {
      const target = targetWeights[sym] || 0
      const current = currentWeights[sym] || 0
      drift[sym] = current - target
      if (Math.abs(drift[sym]) > maxDrift) maxDrift = Math.abs(drift[sym])
    }

    // Calculate required trades
    const trades = []
    for (const sym of symbols) {
      const target = targetWeights[sym] || 0
      const targetValue = totalValue * (target / 100)
      const currentValue = positions[sym]?.value || 0
      const diff = targetValue - currentValue
      const price = prices[sym] || 0
      if (price > 0 && Math.abs(diff) > 1) {
        trades.push({
          symbol: sym,
          side: diff > 0 ? 'BUY' : 'SELL',
          quantity: Math.abs(diff / price),
          value: Math.abs(diff),
          price,
        })
      }
    }

    return {
      totalValue,
      positions,
      currentWeights,
      cashWeight,
      drift,
      maxDrift,
      trades,
      needsRebalance: maxDrift > threshold,
    }
  }, [accounts, candles, symbols, exchange, targetWeights, threshold])

  if (!portfolio) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <RefreshCw size={12} className="text-accent-blue" />
          Auto-Rebalance
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No account data</div>
      </div>
    )
  }

  const handleRebalance = () => {
    if (!portfolio.needsRebalance || !onSubmit) return
    for (const t of portfolio.trades) {
      onSubmit({
        type: 'MARKET',
        side: t.side,
        quantity: t.quantity,
        symbol: t.symbol,
      })
    }
    setRebalanceLog(prev => [...prev.slice(-4), {
      time: Date.now(),
      trades: portfolio.trades.length,
      msg: `Rebalanced ${portfolio.trades.length} positions`,
    }])
  }

  const updateWeight = (sym, value) => {
    setTargetWeights(prev => ({ ...prev, [sym]: Number(value) }))
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <RefreshCw size={12} className="text-accent-blue" />
        Auto-Rebalance Portfolio
      </div>

      {/* Status */}
      <div className={'flex items-center gap-1.5 rounded px-2 py-1 mb-2 ' +
        (portfolio.needsRebalance ? 'bg-accent-yellow/10 border border-accent-yellow/20' : 'bg-accent-green/10 border border-accent-green/20')}>
        {portfolio.needsRebalance ? (
          <>
            <span className="text-[9px] text-accent-yellow font-medium">⚠ Rebalance needed</span>
            <span className="text-[8px] text-gray-500">max drift {portfolio.maxDrift.toFixed(1)}% &gt; {threshold}%</span>
          </>
        ) : (
          <span className="text-[9px] text-accent-green">✓ Within target range</span>
        )}
      </div>

      {/* Target weights */}
      <div className="space-y-1 mb-2">
        {symbols.map(sym => {
          const target = targetWeights[sym] || 0
          const current = portfolio.currentWeights[sym] || 0
          const drift = portfolio.drift[sym] || 0
          return (
            <div key={sym} className="flex items-center gap-1.5">
              <span className="text-[9px] text-gray-400 w-10">{sym.split('/')[0]}</span>
              <input
                type="number"
                step="1"
                value={target.toFixed(0)}
                onChange={e => updateWeight(sym, e.target.value)}
                className="w-10 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 font-mono outline-none"
              />
              <span className="text-[8px] text-gray-600">%</span>
              {/* Current weight bar */}
              <div className="flex-1 h-2 bg-bg-600 rounded-full overflow-hidden relative">
                <div
                  className={'absolute h-full rounded-full ' + (drift > 0 ? 'bg-accent-green/50 left-1/2' : 'bg-accent-red/50 right-1/2')}
                  style={{ width: `${Math.min(50, Math.abs(drift) * 2)}%` }}
                />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-bg-500" />
              </div>
              <span className={'text-[8px] font-mono w-10 text-right ' + (drift > 0 ? 'text-accent-green' : drift < 0 ? 'text-accent-red' : 'text-gray-400')}>
                {current.toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>

      {/* Threshold */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[8px] text-gray-600">Trigger at</span>
        <input
          type="number"
          step="0.5"
          value={threshold}
          onChange={e => setThreshold(Number(e.target.value))}
          className="w-10 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 font-mono outline-none"
        />
        <span className="text-[8px] text-gray-600">% drift</span>
      </div>

      {/* Rebalance button */}
      <button
        onClick={handleRebalance}
        disabled={!portfolio.needsRebalance || !onSubmit}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 disabled:opacity-50"
      >
        <Play size={10} />
        Rebalance Now ({portfolio.trades.length} trades)
      </button>

      {/* Log */}
      {rebalanceLog.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-bg-600 space-y-0.5">
          {rebalanceLog.map((l, i) => (
            <div key={i} className="text-[8px] text-gray-500 font-mono">
              {new Date(l.time).toLocaleTimeString()} · {l.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
