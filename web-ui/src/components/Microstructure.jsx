import { memo, useMemo } from 'react'
import { BarChart3, Waves, Gauge } from 'lucide-react'
import { formatVolume } from '../utils/format'
import { StatCard, Label, SectionTitle } from '../utils/ui-helpers'

function spreadBpsColor(bps) {
  if (bps <= 2) return 'text-accent-green'
  if (bps <= 5) return 'text-accent-yellow'
  return 'text-accent-red'
}

/**
 * Microstructure — live order book for the selected exchange+symbol.
 * orderbooks: {"exchange|symbol": {bids: [[p,q]], asks: [[p,q]], timestamp}}
 */
const Microstructure = memo(function Microstructure({ symbol, exchange, orderbooks }) {
  const book = orderbooks?.[`${exchange}|${symbol}`]

  const data = useMemo(() => {
    if (!book?.bids?.length || !book?.asks?.length) return null
    const bids = book.bids
    const asks = book.asks
    const bestBid = bids[0].price
    const bestAsk = asks[0].price
    const mid = (bestBid + bestAsk) / 2
    const spread = bestAsk - bestBid
    const spreadBps = mid > 0 ? (spread / mid) * 10000 : 0

    // Cumulative depth per level (base units)
    const levels = []
    let cumBid = 0, cumAsk = 0
    const n = Math.min(10, Math.max(bids.length, asks.length))
    for (let i = 0; i < n; i++) {
      if (bids[i]) cumBid += bids[i].quantity
      if (asks[i]) cumAsk += asks[i].quantity
      levels.push({ level: `L${i + 1}`, bidVol: cumBid, askVol: cumAsk, imbalance: (cumBid - cumAsk) / (cumBid + cumAsk || 1) })
    }

    // Order flow proxy: size distribution of resting bids vs asks
    const bidNotional = bids.reduce((s, l) => s + l.price * l.quantity, 0)
    const askNotional = asks.reduce((s, l) => s + l.price * l.quantity, 0)
    const totalNotional = bidNotional + askNotional || 1

    // Largest resting levels ("walls")
    const walls = [...bids.map(l => ({ side: 'BID', p: l.price, q: l.quantity })), ...asks.map(l => ({ side: 'ASK', p: l.price, q: l.quantity }))]
      .sort((a, b) => b.q * b.p - a.q * a.p)
      .slice(0, 4)

    return {
      mid, spread, spreadBps,
      bidNotional, askNotional,
      buyPressure: (bidNotional / totalNotional) * 100,
      levels,
      l10Imbalance: levels[levels.length - 1]?.imbalance ?? 0,
      totalDepth: cumBid + cumAsk,
      walls,
      nLevels: n,
    }
  }, [book])

  const maxVol = data ? Math.max(...data.levels.map(l => Math.max(l.bidVol, l.askVol)), 1) : 1

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Waves} title="Microstructure" iconColor="text-accent-purple" right={<span className="text-[10px] text-gray-600">{symbol ?? '—'} · {exchange ?? '—'}</span>} />

      {!data ? (
        <div className="text-gray-500 text-[10px] p-2">No order book for {symbol} on {exchange} — waiting for book updates</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="Spread" value={`${data.spreadBps.toFixed(1)}bps`} color={spreadBpsColor(data.spreadBps)} size="xs" compact />
            <StatCard label="Depth" value={formatVolume(data.totalDepth)} color="text-accent-blue" size="xs" compact />
            <StatCard label="Bid Press" value={`${data.buyPressure.toFixed(1)}%`} color={data.buyPressure > 55 ? 'text-accent-green' : data.buyPressure < 45 ? 'text-accent-red' : 'text-gray-300'} size="xs" compact />
            <StatCard label="Imbalance" value={`${(data.l10Imbalance * 100).toFixed(1)}%`} color="text-accent-yellow" size="xs" compact />
          </div>

          {/* Bid/ask notional bar */}
          <div className="p-2 bg-bg-700 border border-bg-600">
            <div className="flex items-center gap-1 mb-1">
              <BarChart3 size={11} className="text-accent-green" />
              <Label>Book Notional (${formatVolume(data.bidNotional)} / ${formatVolume(data.askNotional)})</Label>
            </div>
            <div className="flex h-3 rounded overflow-hidden">
              <div className="bg-accent-green flex items-center" style={{ width: `${data.buyPressure}%` }}>
                <span className="text-[7px] text-white pl-0.5">{data.buyPressure.toFixed(0)}%</span>
              </div>
              <div className="bg-accent-red flex items-center justify-end" style={{ width: `${100 - data.buyPressure}%` }}>
                <span className="text-[7px] text-white pr-0.5">{(100 - data.buyPressure).toFixed(0)}%</span>
              </div>
            </div>
            <div className="flex justify-between text-[8px] text-gray-600 mt-0.5">
              <span>Bids ${formatVolume(data.bidNotional)}</span>
              <span>Mid: {data.mid.toFixed(2)} · Spread {data.spread.toFixed(2)}</span>
              <span>Asks ${formatVolume(data.askNotional)}</span>
            </div>
          </div>

          {/* Depth profile */}
          <div className="p-2 bg-bg-700 border border-bg-600">
            <div className="flex items-center gap-1 mb-1">
              <Gauge size={11} className="text-accent-purple" />
              <Label>Depth Profile (cumulative L1-L{data.nLevels})</Label>
            </div>
            <div className="space-y-0.5">
              {data.levels.map(level => (
                <div key={level.level} className="flex items-center gap-2">
                  <span className="text-[8px] text-gray-600 w-6">{level.level}</span>
                  <div className="flex-1 flex h-2 rounded overflow-hidden">
                    <div className="bg-accent-green" style={{ width: `${(level.bidVol / maxVol) * 50}%` }} />
                    <div className="bg-accent-red" style={{ width: `${(level.askVol / maxVol) * 50}%` }} />
                  </div>
                  <span className="text-[8px] font-mono text-gray-500 w-16 text-right">
                    {level.bidVol.toFixed(1)} / {level.askVol.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Largest resting orders */}
          {data.walls.length > 0 && (
            <div className="p-2 bg-bg-700 border border-bg-600">
              <Label className="mb-1">Largest Levels (walls)</Label>
              <div className="space-y-0.5">
                {data.walls.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-[9px] font-mono">
                    <span className={w.side === 'BID' ? 'text-accent-green w-8' : 'text-accent-red w-8'}>{w.side}</span>
                    <span className="text-gray-400 w-16">${w.p.toFixed(2)}</span>
                    <span className="text-gray-500 flex-1 text-right">{w.q} (${formatVolume(w.p * w.q)})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
})

export default memo(Microstructure)
