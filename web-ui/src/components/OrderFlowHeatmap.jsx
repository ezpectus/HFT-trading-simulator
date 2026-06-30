import { useMemo } from 'react'
import { Grid3x3, TrendingUp, TrendingDown } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function OrderFlowHeatmap({ candles, fills, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-30)
    if (symCandles.length < 10) return null

    // Build per-candle imbalance data
    const candleData = symCandles.map((c, i) => {
      const buyVol = c.close >= c.open ? c.volume : c.volume * (c.close - c.low) / Math.max(c.high - c.low, 0.0001)
      const sellVol = c.volume - buyVol
      const delta = buyVol - sellVol
      const totalVol = c.volume || 0
      const imbalance = totalVol > 0 ? delta / totalVol : 0
      const cvd = i > 0 ? 0 : delta // relative CVD
      return {
        idx: i,
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: totalVol,
        buyVol,
        sellVol,
        delta,
        imbalance, // -1 to +1
        isBull: c.close >= c.open,
        range: c.high - c.low,
        body: Math.abs(c.close - c.open),
        bodyEfficiency: (c.high - c.low) > 0 ? Math.abs(c.close - c.open) / (c.high - c.low) : 0,
      }
    })

    // Cumulative delta
    let cumDelta = 0
    candleData.forEach(c => {
      cumDelta += c.delta
      c.cumDelta = cumDelta
    })

    // Aggregate fills into candle buckets
    const symFills = (fills || []).filter(f => f.symbol === symbol && f.status === 'FILLED')
    const fillsByTimestamp = {}
    for (const f of symFills) {
      const ts = f.timestamp || f.received_at || 0
      // Find nearest candle
      let nearest = null
      let minDiff = Infinity
      for (const c of candleData) {
        const diff = Math.abs(c.timestamp - ts)
        if (diff < minDiff) { minDiff = diff; nearest = c }
      }
      if (nearest && minDiff < 300) {
        if (!fillsByTimestamp[nearest.timestamp]) {
          fillsByTimestamp[nearest.timestamp] = { buys: 0, sells: 0, buyVol: 0, sellVol: 0 }
        }
        if (f.side === 'BUY') {
          fillsByTimestamp[nearest.timestamp].buys++
          fillsByTimestamp[nearest.timestamp].buyVol += f.filled_quantity || 0
        } else {
          fillsByTimestamp[nearest.timestamp].sells++
          fillsByTimestamp[nearest.timestamp].sellVol += f.filled_quantity || 0
        }
      }
    }

    // Merge fill data into candle data
    candleData.forEach(c => {
      const fd = fillsByTimestamp[c.timestamp]
      c.fillBuys = fd?.buys || 0
      c.fillSells = fd?.sells || 0
      c.fillBuyVol = fd?.buyVol || 0
      c.fillSellVol = fd?.sellVol || 0
      c.fillDelta = c.fillBuyVol - c.fillSellVol
      c.fillImbalance = (c.fillBuyVol + c.fillSellVol) > 0
        ? c.fillDelta / (c.fillBuyVol + c.fillSellVol) : 0
    })

    // Statistics
    const totalBuyVol = candleData.reduce((s, c) => s + c.buyVol, 0)
    const totalSellVol = candleData.reduce((s, c) => s + c.sellVol, 0)
    const totalDelta = totalBuyVol - totalSellVol
    const avgImbalance = candleData.reduce((s, c) => s + c.imbalance, 0) / candleData.length

    // Detect absorption: high volume + low price movement
    const absorptionCandles = candleData.filter(c =>
      c.volume > candleData.reduce((s, x) => s + x.volume, 0) / candleData.length * 1.5 &&
      c.bodyEfficiency < 0.3
    )

    // Detect momentum: high volume + high body efficiency
    const momentumCandles = candleData.filter(c =>
      c.volume > candleData.reduce((s, x) => s + x.volume, 0) / candleData.length * 1.5 &&
      c.bodyEfficiency > 0.7
    )

    return {
      candleData,
      totalBuyVol, totalSellVol, totalDelta, avgImbalance,
      absorptionCandles, momentumCandles,
    }
  }, [candles, fills, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Grid3x3 size={12} className="text-accent-purple" />
          Order Flow Heatmap
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 10+ candles</div>
      </div>
    )
  }

  const { candleData, totalBuyVol, totalSellVol, totalDelta, avgImbalance, absorptionCandles, momentumCandles } = data

  // Heatmap grid: rows = candles, columns = metrics
  const w = 280
  const labelW = 50
  const cellW = (w - labelW) / 5 // 5 metric columns
  const rowH = 14
  const maxCandles = Math.min(candleData.length, 20)
  const recentCandles = candleData.slice(-maxCandles)
  const gridH = maxCandles * rowH + 20

  function imbalanceColor(imb) {
    if (imb > 0.3) return `rgba(34,197,94,${0.3 + Math.abs(imb) * 0.7})`
    if (imb < -0.3) return `rgba(239,68,68,${0.3 + Math.abs(imb) * 0.7})`
    return 'rgba(71,85,105,0.3)'
  }

  function volColor(vol, maxVol) {
    const ratio = vol / maxVol
    return `rgba(59,130,246,${0.15 + ratio * 0.85})`
  }

  const maxVol = Math.max(...recentCandles.map(c => c.volume), 1)

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Grid3x3 size={12} className="text-accent-purple" />
        Order Flow Heatmap
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Net Delta</span>
          <div className={'font-mono ' + (totalDelta > 0 ? 'text-accent-green' : 'text-accent-red')}>
            {totalDelta > 0 ? '+' : ''}{(totalDelta / 1000).toFixed(1)}K
          </div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Avg Imbalance</span>
          <div className={'font-mono ' + (avgImbalance > 0.1 ? 'text-accent-green' : avgImbalance < -0.1 ? 'text-accent-red' : 'text-gray-400')}>
            {(avgImbalance * 100).toFixed(0)}%
          </div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">B/S Ratio</span>
          <div className="font-mono text-gray-400">
            {(totalBuyVol / Math.max(totalSellVol, 1)).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="mb-2 flex justify-center overflow-x-auto">
        <svg width={w} height={gridH}>
          {/* Column headers */}
          {['Vol', 'Delta', 'Imb', 'Body', 'Fills'].map((label, j) => (
            <text
              key={j}
              x={labelW + j * cellW + cellW / 2}
              y={10}
              fill="#64748b"
              fontSize={6}
              textAnchor="middle"
            >
              {label}
            </text>
          ))}

          {/* Rows */}
          {recentCandles.map((c, i) => {
            const y = 14 + i * rowH
            const isAbsorption = absorptionCandles.includes(c)
            const isMomentum = momentumCandles.includes(c)
            return (
              <g key={i}>
                {/* Time label */}
                <text x={labelW - 2} y={y + rowH / 2 + 2} fill="#475569" fontSize={5} textAnchor="end">
                  {new Date(c.timestamp * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </text>
                {/* Volume cell */}
                <rect x={labelW} y={y} width={cellW - 1} height={rowH - 1} rx={1} fill={volColor(c.volume, maxVol)} />
                {/* Delta cell */}
                <rect x={labelW + cellW} y={y} width={cellW - 1} height={rowH - 1} rx={1}
                  fill={c.delta > 0 ? `rgba(34,197,94,${0.2 + Math.min(Math.abs(c.delta) / maxVol, 1) * 0.8})` : `rgba(239,68,68,${0.2 + Math.min(Math.abs(c.delta) / maxVol, 1) * 0.8})`} />
                {/* Imbalance cell */}
                <rect x={labelW + cellW * 2} y={y} width={cellW - 1} height={rowH - 1} rx={1} fill={imbalanceColor(c.imbalance)} />
                {/* Body efficiency cell */}
                <rect x={labelW + cellW * 3} y={y} width={cellW - 1} height={rowH - 1} rx={1}
                  fill={`rgba(${c.isBull ? '34,197,94' : '239,68,68'},${0.15 + c.bodyEfficiency * 0.85})`} />
                {/* Fills cell */}
                <rect x={labelW + cellW * 4} y={y} width={cellW - 1} height={rowH - 1} rx={1}
                  fill={imbalanceColor(c.fillImbalance)} />
                {/* Absorption/momentum markers */}
                {isAbsorption && (
                  <circle cx={labelW + cellW * 4 + cellW - 3} cy={y + 3} r={2} fill="#f97316" />
                )}
                {isMomentum && (
                  <circle cx={labelW + cellW * 4 + cellW - 3} cy={y + 3} r={2} fill="#22c55e" />
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[7px] text-gray-600 mb-2">
        <span className="flex items-center gap-0.5">
          <span className="w-2 h-2 rounded-full bg-accent-orange" /> Absorption
        </span>
        <span className="flex items-center gap-0.5">
          <span className="w-2 h-2 rounded-full bg-accent-green" /> Momentum
        </span>
        <span>Green=Buy Red=Sell</span>
      </div>

      {/* Cumulative delta chart */}
      <div className="pt-1.5 border-t border-bg-600">
        <div className="text-[8px] text-gray-600 mb-0.5">Cumulative Delta:</div>
        <svg width={w} height={30} className="w-full">
          <line x1={0} y1={15} x2={w} y2={15} stroke="#334155" strokeWidth={0.5} />
          {recentCandles.map((c, i) => {
            const x = (i / Math.max(recentCandles.length - 1, 1)) * w
            const maxDelta = Math.max(...recentCandles.map(x => Math.abs(x.cumDelta)), 1)
            const y = 15 - (c.cumDelta / maxDelta) * 13
            return (
              <g key={i}>
                {i > 0 && (
                  <line
                    x1={((i - 1) / Math.max(recentCandles.length - 1, 1)) * w}
                    y1={15 - (recentCandles[i - 1].cumDelta / maxDelta) * 13}
                    x2={x}
                    y2={y}
                    stroke={c.cumDelta > 0 ? '#22c55e' : '#ef4444'}
                    strokeWidth={0.8}
                  />
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Aggregated order flow: volume, delta, imbalance, body efficiency, fill direction per candle. Detects absorption vs momentum.
      </div>
    </div>
  )
}
