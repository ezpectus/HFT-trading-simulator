import { memo, useMemo } from 'react'
import { Box, Layers, Eye } from 'lucide-react'
import { StatCard } from '../utils/ui-helpers'

const MOCK_LIQUIDITY = [
  { priceLevel: 43900, bidVol: 12.5, askVol: 8.2, depth: 20.7, imbalance: 0.60 },
  { priceLevel: 44000, bidVol: 18.3, askVol: 15.1, depth: 33.4, imbalance: 0.55 },
  { priceLevel: 44100, bidVol: 25.8, askVol: 22.5, depth: 48.3, imbalance: 0.53 },
  { priceLevel: 44200, bidVol: 32.1, askVol: 28.8, depth: 60.9, imbalance: 0.53 },
  { priceLevel: 44300, bidVol: 45.5, askVol: 38.2, depth: 83.7, imbalance: 0.54 },
  { priceLevel: 44400, bidVol: 28.3, askVol: 35.5, depth: 63.8, imbalance: 0.44 },
  { priceLevel: 44500, bidVol: 15.2, askVol: 22.8, depth: 38.0, imbalance: 0.40 },
  { priceLevel: 44600, bidVol: 8.5, askVol: 14.2, depth: 22.7, imbalance: 0.37 },
]

const MOCK_ZONES = [
  { zone: 'Bid Wall', price: 44300, volume: 45.5, type: 'support' },
  { zone: 'Ask Wall', price: 44400, volume: 35.5, type: 'resistance' },
  { zone: 'Bid Cluster', price: 44100, volume: 25.8, type: 'support' },
  { zone: 'Ask Cluster', price: 44500, volume: 22.8, type: 'resistance' },
]

function imbalanceColor(imb) {
  if (imb >= 0.55) return 'text-accent-green'
  if (imb <= 0.45) return 'text-accent-red'
  return 'text-gray-400'
}

const LiquidityMap3D = memo(function LiquidityMap3D({ currentPrice }) {
  const midPrice = currentPrice ?? 44200

  const stats = useMemo(() => {
    const totalBid = MOCK_LIQUIDITY.reduce((s, l) => s + l.bidVol, 0)
    const totalAsk = MOCK_LIQUIDITY.reduce((s, l) => s + l.askVol, 0)
    const totalDepth = MOCK_LIQUIDITY.reduce((s, l) => s + l.depth, 0)
    const maxDepth = Math.max(...MOCK_LIQUIDITY.map(l => l.depth))
    const overallImb = totalBid / (totalBid + totalAsk)
    return { totalBid, totalAsk, totalDepth, maxDepth, overallImb }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Box size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Liquidity Map 3D</span>
        </div>
        <span className="text-[10px] text-gray-600">${midPrice.toLocaleString()}</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Bid Depth" value={stats.totalBid.toFixed(1)} color="text-accent-green" compact />
        <StatCard label="Ask Depth" value={stats.totalAsk.toFixed(1)} color="text-accent-red" compact />
        <StatCard label="Imbalance" value={`${(stats.overallImb * 100).toFixed(0)}%`} color={imbalanceColor(stats.overallImb)} compact />
        <StatCard label="Max Depth" value={stats.maxDepth.toFixed(1)} color="text-accent-purple" compact />
      </div>

      {/* 3D-style depth visualization */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <div className="flex items-center gap-1 mb-1">
          <Layers size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Depth Profile</span>
        </div>
        <div className="space-y-0.5">
          {MOCK_LIQUIDITY.map(l => (
            <div key={l.priceLevel} className="flex items-center gap-1">
              <span className={`text-[8px] font-mono w-14 ${l.priceLevel === midPrice ? 'text-accent-yellow font-bold' : 'text-gray-500'}`}>
                ${l.priceLevel.toLocaleString()}
              </span>
              <div className="flex-1 flex items-center gap-0.5">
                <div className="flex-1 flex justify-end">
                  <div className="bg-accent-green opacity-60" style={{ width: `${(l.bidVol / 50) * 100}%`, height: '10px' }} />
                </div>
                <div className="w-1" />
                <div className="flex-1">
                  <div className="bg-accent-red opacity-60" style={{ width: `${(l.askVol / 50) * 100}%`, height: '10px' }} />
                </div>
              </div>
              <span className={`text-[8px] font-mono w-10 text-right ${imbalanceColor(l.imbalance)}`}>
                {(l.imbalance * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-1 text-[8px] text-gray-600">
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-green opacity-60" />Bids</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-red opacity-60" />Asks</span>
        </div>
      </div>

      {/* Liquidity zones */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Eye size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Liquidity Zones</span>
        </div>
        <div className="space-y-0.5">
          {MOCK_ZONES.map((z, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className={`text-[8px] px-1 rounded ${z.type === 'support' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'} w-16 text-center`}>
                {z.type === 'support' ? 'SUPPORT' : 'RESIST'}
              </span>
              <span className="text-[10px] text-gray-300 flex-1">{z.zone}</span>
              <span className="text-[9px] font-mono text-gray-400">${z.price.toLocaleString()}</span>
              <span className="text-[9px] font-mono text-accent-purple">{z.volume.toFixed(1)} BTC</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span>Overall: {stats.overallImb > 0.5 ? 'bid-heavy (bullish)' : 'ask-heavy (bearish)'}</span>
        <span>Total depth: {stats.totalDepth.toFixed(1)} BTC</span>
      </div>
    </div>
  )
})

export default memo(LiquidityMap3D)
