import { useMemo, useState } from 'react'
import { Zap, TrendingDown, TrendingUp, Flame } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'

export default function LiquidationCascade({ candles, accounts, symbol, exchange }) {
  const [triggerDrop, setTriggerDrop] = useState(5)

  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-30)
    if (symCandles.length < 10) return null

    const price = symCandles[symCandles.length - 1].close
    const avgVolume = symCandles.reduce((s, c) => s + (c.volume || 0), 0) / symCandles.length

    // Simulate cascade: price drops X%, triggers liquidations at each leverage tier
    const triggerPrice = price * (1 - triggerDrop / 100)

    const tiers = [2, 5, 10, 25, 50, 100]
    const cascade = []

    let cumulativeForce = 0
    let currentPrice = price

    for (const lev of tiers) {
      const liqLevel = price * (1 - 1 / lev)
      // Is this tier triggered by the initial drop?
      const triggered = triggerPrice <= liqLevel
      // Or triggered by cascade from previous tiers?
      const cascadeTriggered = currentPrice <= liqLevel

      if (triggered || cascadeTriggered) {
        // Estimated forced selling volume at this tier
        // Assume OI distribution: more positions at higher leverage
        const estimatedOI = avgVolume * 0.3 * (lev / 10)
        const forcedVolume = estimatedOI * 0.4 // 40% get liquidated
        const sellPressure = forcedVolume * currentPrice

        // Price impact: each liquidation pushes price down further
        const priceImpact = (sellPressure / (avgVolume * currentPrice)) * 100
        const newPrice = currentPrice * (1 - priceImpact / 100)

        cascade.push({
          leverage: lev,
          liqLevel,
          triggered: true,
          forcedVolume,
          priceImpact,
          priceBefore: currentPrice,
          priceAfter: newPrice,
        })

        cumulativeForce += priceImpact
        currentPrice = newPrice
      } else {
        cascade.push({
          leverage: lev,
          liqLevel,
          triggered: false,
          forcedVolume: 0,
          priceImpact: 0,
          priceBefore: currentPrice,
          priceAfter: currentPrice,
        })
      }
    }

    const totalDrop = ((price - currentPrice) / price) * 100
    const totalForcedVol = cascade.reduce((s, c) => s + c.forcedVolume, 0)

    // Real positions at risk
    const positions = []
    for (const acc of Object.values(accounts || {})) {
      for (const pos of Object.values(acc.positions || {})) {
        if (pos.symbol === symbol) {
          const isLong = pos.side === 'LONG' || pos.side === 'BUY'
          if (isLong) {
            const liqPrice = pos.entry_price * (1 - 1 / (pos.leverage || 10))
            const wouldTrigger = currentPrice <= liqPrice
            positions.push({
              side: 'long',
              leverage: pos.leverage || 10,
              liqPrice,
              wouldTrigger,
              quantity: pos.quantity,
            })
          }
        }
      }
    }

    const triggeredPositions = positions.filter(p => p.wouldTrigger)

    // Chart: cascade waterfall
    const triggeredTiers = cascade.filter(c => c.triggered)
    const maxImpact = Math.max(...triggeredTiers.map(c => c.priceImpact), 1)

    return {
      price, triggerPrice, cascade, totalDrop, totalForcedVol,
      positions, triggeredPositions, currentPrice, maxImpact,
    }
  }, [candles, accounts, symbol, exchange, triggerDrop])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Flame size={12} className="text-accent-red" />
          Liquidation Cascade
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { price, triggerPrice, cascade, totalDrop, totalForcedVol, positions, triggeredPositions, currentPrice, maxImpact } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Flame size={12} className="text-accent-red" />
        Liquidation Cascade Simulator
      </div>

      {/* Trigger control */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[8px] text-gray-600">Trigger drop:</span>
        <input
          type="range"
          min="1"
          max="20"
          value={triggerDrop}
          onChange={e => setTriggerDrop(Number(e.target.value))}
          className="flex-1 accent-accent-red"
        />
        <span className="text-[10px] font-mono text-accent-red w-10">{triggerDrop}%</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-1">
          <span className="text-gray-600">Start Price</span>
          <div className="font-mono text-gray-300">{formatPrice(price)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-1">
          <span className="text-gray-600">End Price</span>
          <div className="font-mono text-accent-red">{formatPrice(currentPrice)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-1">
          <span className="text-gray-600">Total Drop</span>
          <div className="font-mono text-accent-red font-bold">{totalDrop.toFixed(2)}%</div>
        </div>
      </div>

      {/* Cascade waterfall */}
      <div className="space-y-0.5 mb-2">
        {cascade.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[8px]">
            <span className="text-gray-500 w-8">{c.leverage}x</span>
            <span className="font-mono text-gray-600 w-16">{formatPrice(c.liqLevel)}</span>
            {c.triggered ? (
              <>
                <div className="flex-1 h-2 bg-bg-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-red rounded-full"
                    style={{ width: `${(c.priceImpact / maxImpact) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-accent-red w-12 text-right">-{c.priceImpact.toFixed(2)}%</span>
              </>
            ) : (
              <>
                <div className="flex-1 h-2 bg-bg-800 rounded-full" />
                <span className="text-gray-700 w-12 text-right">safe</span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Forced volume */}
      <div className="bg-bg-800 rounded px-2 py-1 mb-2 flex justify-between text-[8px]">
        <span className="text-gray-600">Total Forced Volume</span>
        <span className="font-mono text-accent-red">{formatVolume(totalForcedVol)}</span>
      </div>

      {/* Real positions at risk */}
      {positions.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-bg-600">
          <div className="text-[8px] text-gray-600 mb-1">Your positions at risk:</div>
          {triggeredPositions.length > 0 ? (
            <div className="bg-accent-red/10 border border-accent-red/20 rounded px-1.5 py-1">
              <div className="flex items-center gap-1">
                <Zap size={9} className="text-accent-red" />
                <span className="text-[8px] text-accent-red font-bold">
                  {triggeredPositions.length} position(s) would be liquidated!
                </span>
              </div>
              {triggeredPositions.map((p, i) => (
                <div key={i} className="flex justify-between text-[7px] mt-0.5">
                  <span className="text-gray-400">{p.leverage}x Long</span>
                  <span className="font-mono text-accent-red">Liq: {formatPrice(p.liqPrice)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[8px] text-accent-green flex items-center gap-1">
              <TrendingUp size={9} />
              No positions at risk in this scenario
            </div>
          )}
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Simulates cascading liquidations: initial drop triggers forced sells, pushing price further down.
      </div>
    </div>
  )
}
