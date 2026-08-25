import { memo, useMemo } from 'react'
import { TrendingDown, BarChart3, Activity, Zap } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'
import { EmptyState } from './LoadingSkeleton'

const MOCK_IMPACT_LEVELS = [
  { size: '1k', cost: 0.5, priceImpact: 0.01, marketShare: 0.1 },
  { size: '5k', cost: 2.1, priceImpact: 0.04, marketShare: 0.5 },
  { size: '10k', cost: 4.8, priceImpact: 0.12, marketShare: 1.2 },
  { size: '25k', cost: 12.3, priceImpact: 0.35, marketShare: 3.1 },
  { size: '50k', cost: 28.7, priceImpact: 0.82, marketShare: 6.5 },
  { size: '100k', cost: 65.4, priceImpact: 1.95, marketShare: 13.2 },
  { size: '250k', cost: 180.2, priceImpact: 5.4, marketShare: 32.8 },
  { size: '500k', cost: 410.6, priceImpact: 12.3, marketShare: 65.5 },
]

function impactColor(pct) {
  if (pct < 0.1) return 'text-accent-green'
  if (pct < 0.5) return 'text-accent-yellow'
  if (pct < 2) return 'text-accent-orange'
  return 'text-accent-red'
}

function impactBg(pct) {
  if (pct < 0.1) return 'bg-accent-green'
  if (pct < 0.5) return 'bg-accent-yellow'
  if (pct < 2) return 'bg-accent-orange'
  return 'bg-accent-red'
}

const MarketImpact = memo(function MarketImpact({ candles, symbol, exchange, currentPrice, orderbooks }) {
  const price = currentPrice ?? (candles?.length > 0 ? candles[candles.length - 1].close : null)

  const liquidity = useMemo(() => {
    if (!orderbooks) return null
    const book = orderbooks[`${exchange}|${symbol}`]
    if (!book) return null
    const bidVol = (book.bids || []).slice(0, 10).reduce((s, l) => s + l[1], 0)
    const askVol = (book.asks || []).slice(0, 10).reduce((s, l) => s + l[1], 0)
    return { bidVol, askVol, total: bidVol + askVol, imbalance: (bidVol - askVol) / (bidVol + askVol) }
  }, [orderbooks, symbol, exchange])

  if (!price) {
    return (
      <div className="p-3 bg-bg-800 text-gray-200 text-xs">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingDown size={14} className="text-accent-red" />
          <span className="text-sm font-medium">Market Impact</span>
        </div>
        <EmptyState icon={TrendingDown} title="No price data" subtitle="Market impact analysis requires live price data" />
      </div>
    )
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingDown size={14} className="text-accent-red" />
          <span className="text-sm font-medium">Market Impact</span>
        </div>
        <span className="text-[10px] text-gray-600">{symbol}</span>
      </div>

      {/* Current price + liquidity */}
      <div className="grid grid-cols-2 gap-1">
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Current Price</div>
          <span className="text-sm font-mono text-gray-200">${formatPrice(price)}</span>
        </div>
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Top-10 Liquidity</div>
          <span className="text-sm font-mono text-accent-blue">
            {liquidity ? formatVolume(liquidity.total) : '—'}
          </span>
        </div>
      </div>

      {/* Impact table */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <BarChart3 size={11} className="text-accent-blue" />
          <span className="text-[10px] text-gray-600 uppercase">Impact by Order Size</span>
        </div>
        <div className="space-y-0.5">
          {MOCK_IMPACT_LEVELS.map(level => (
            <div key={level.size} className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] text-gray-400 w-10">${level.size}</span>
              <div className="flex-1 flex items-center gap-1">
                <div className="flex-1 h-2 bg-bg-600 rounded overflow-hidden">
                  <div
                    className={`h-full ${impactBg(level.priceImpact)} opacity-70`}
                    style={{ width: `${Math.min(level.priceImpact / 12.3 * 100, 100)}%` }}
                  />
                </div>
              </div>
              <span className={`text-[10px] font-mono w-12 text-right ${impactColor(level.priceImpact)}`}>
                {level.priceImpact.toFixed(2)}%
              </span>
              <span className="text-[10px] font-mono text-gray-500 w-14 text-right">
                ${level.cost.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[8px] text-gray-600">
          <span>Size</span>
          <span>Price Impact</span>
          <span>Cost (bps)</span>
        </div>
      </div>

      {/* Liquidity imbalance */}
      {liquidity && (
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="flex items-center gap-1 mb-1">
            <Activity size={11} className="text-accent-purple" />
            <span className="text-[10px] text-gray-600 uppercase">Order Book Imbalance</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex h-4 rounded overflow-hidden">
              <div className="bg-accent-green flex items-center justify-center" style={{ width: `${(liquidity.bidVol / liquidity.total) * 100}%` }}>
                <span className="text-[8px] text-white">{((liquidity.bidVol / liquidity.total) * 100).toFixed(0)}%</span>
              </div>
              <div className="bg-accent-red flex items-center justify-center" style={{ width: `${(liquidity.askVol / liquidity.total) * 100}%` }}>
                <span className="text-[8px] text-white">{((liquidity.askVol / liquidity.total) * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
          <div className="flex justify-between mt-1 text-[9px]">
            <span className="text-accent-green">Bids: {formatVolume(liquidity.bidVol)}</span>
            <span className="text-accent-red">Asks: {formatVolume(liquidity.askVol)}</span>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="flex items-center gap-1.5 p-1.5 bg-accent-yellow/10 border border-accent-yellow/30">
        <Zap size={11} className="text-accent-yellow" />
        <span className="text-[10px] text-accent-yellow">
          Orders {'>'} $50k may move price {'>'} 0.8%
        </span>
      </div>
    </div>
  )
})

export default MarketImpact
