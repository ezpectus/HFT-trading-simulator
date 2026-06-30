import { useMemo } from 'react'
import { Flame, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function LiquidationMap({ candles, accounts, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 10) return null

    const price = symCandles[symCandles.length - 1].close
    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const avgRange = (Math.max(...highs) - Math.min(...lows)) / symCandles.length

    // Estimate liquidation levels based on common leverage tiers
    const leverageTiers = [2, 5, 10, 25, 50, 100]
    const longLevels = leverageTiers.map(lev => {
      const liqPrice = price * (1 - 1 / lev)
      const distance = ((price - liqPrice) / price) * 100
      return { leverage: lev, price: liqPrice, distance, side: 'long' }
    })
    const shortLevels = leverageTiers.map(lev => {
      const liqPrice = price * (1 + 1 / lev)
      const distance = ((liqPrice - price) / price) * 100
      return { leverage: lev, price: liqPrice, distance, side: 'short' }
    })

    // Estimate liquidation magnitude based on volume at that level
    // (simplified: closer levels = more likely to cluster)
    const allLevels = [...longLevels, ...shortLevels].map(l => {
      const distancePct = l.distance
      // Magnitude: closer = higher (more positions clustered there)
      const magnitude = Math.max(0, 100 - distancePct * 2)
      return { ...l, magnitude }
    })

    // Get actual positions from accounts for real liquidation risk
    const positions = []
    for (const acc of Object.values(accounts || {})) {
      for (const pos of (acc.positions || [])) {
        if (pos.symbol === symbol) {
          const entry = pos.entry_price
          const leverage = pos.leverage || 10
          const isLong = pos.side === 'LONG' || pos.side === 'BUY'
          const liqPrice = isLong
            ? entry * (1 - 1 / leverage)
            : entry * (1 + 1 / leverage)
          const distance = Math.abs((price - liqPrice) / price) * 100
          positions.push({
            side: isLong ? 'long' : 'short',
            entry,
            liqPrice,
            distance,
            quantity: pos.quantity,
            leverage,
            unrealizedPnl: pos.unrealized_pnl,
          })
        }
      }
    }

    // Chart rendering
    const minP = Math.min(price * 0.9, ...allLevels.map(l => l.price))
    const maxP = Math.max(price * 1.1, ...allLevels.map(l => l.price))
    const range = maxP - minP || 1
    const toY = (v) => 100 - ((v - minP) / range) * 90 - 5

    const longBars = longLevels.map(l => ({
      y: toY(l.price),
      h: (l.magnitude / 100) * 15,
      leverage: l.leverage,
      price: l.price,
      distance: l.distance,
    }))
    const shortBars = shortLevels.map(l => ({
      y: toY(l.price),
      h: (l.magnitude / 100) * 15,
      leverage: l.leverage,
      price: l.price,
      distance: l.distance,
    }))

    const priceY = toY(price)

    // Danger zone: positions within 5% of liquidation
    const dangerPositions = positions.filter(p => p.distance < 5)

    return { price, longBars, shortBars, priceY, positions, dangerPositions, avgRange }
  }, [candles, accounts, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Flame size={12} className="text-accent-red" />
          Liquidation Map
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { price, longBars, shortBars, priceY, positions, dangerPositions } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Flame size={12} className="text-accent-red" />
        Liquidation Map
      </div>

      {/* Chart */}
      <svg viewBox="0 0 100 100" className="w-full h-[60px]" preserveAspectRatio="none">
        {/* Current price line */}
        <line x1="0" y1={priceY} x2="100" y2={priceY} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2 2" />
        <text x="2" y={priceY - 1} fontSize="3" fill="#94a3b8">{formatPrice(price)}</text>

        {/* Long liquidation levels (left side) */}
        {longBars.map((b, i) => (
          <g key={'l' + i}>
            <rect x="5" y={b.y - b.h / 2} width="35" height={b.h} fill="#ef4444" fillOpacity="0.3" rx="1" />
            <text x="7" y={b.y + 1} fontSize="2.5" fill="#fca5a5">{b.leverage}x</text>
          </g>
        ))}

        {/* Short liquidation levels (right side) */}
        {shortBars.map((b, i) => (
          <g key={'s' + i}>
            <rect x="60" y={b.y - b.h / 2} width="35" height={b.h} fill="#f97316" fillOpacity="0.3" rx="1" />
            <text x="88" y={b.y + 1} fontSize="2.5" fill="#fdba74" textAnchor="end">{b.leverage}x</text>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-between mt-1 text-[8px]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-accent-red/40 rounded-sm" />
          <span className="text-gray-500">Long Liq</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-accent-orange/40 rounded-sm" />
          <span className="text-gray-500">Short Liq</span>
        </div>
      </div>

      {/* Active positions */}
      {positions.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-bg-600">
          <div className="text-[8px] text-gray-600 mb-1">Your Positions:</div>
          <div className="space-y-0.5">
            {positions.map((p, i) => (
              <div key={i} className={'flex items-center justify-between text-[8px] rounded px-1 py-0.5 ' + (p.distance < 5 ? 'bg-accent-red/10' : 'bg-bg-800')}>
                <div className="flex items-center gap-1">
                  {p.side === 'long' ? <TrendingUp size={7} className="text-accent-green" /> : <TrendingDown size={7} className="text-accent-red" />}
                  <span className="text-gray-400">{p.leverage}x</span>
                </div>
                <span className="font-mono text-gray-500">Liq: {formatPrice(p.liqPrice)}</span>
                <span className={'font-mono ' + (p.distance < 5 ? 'text-accent-red' : 'text-gray-400')}>{p.distance.toFixed(1)}% away</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Danger warning */}
      {dangerPositions.length > 0 && (
        <div className="mt-1.5 bg-accent-red/10 border border-accent-red/20 rounded px-1.5 py-1 flex items-center gap-1">
          <AlertTriangle size={9} className="text-accent-red shrink-0" />
          <span className="text-[8px] text-accent-red">
            {dangerPositions.length} position(s) within 5% of liquidation!
          </span>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Estimated liquidation levels by leverage. Clusters = cascade risk.
      </div>
    </div>
  )
}
