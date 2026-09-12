import { memo, useMemo } from 'react'
import { TrendingDown, BarChart3, Activity, Zap } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'
import { EmptyState } from './LoadingSkeleton'
import { StatCard, WarningBanner, SectionTitle } from '../utils/ui-helpers'

const ORDER_SIZES_USD = [1e3, 5e3, 1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5]

// Walk the ask side of a real book: VWAP fill + slippage vs best ask.
function impactForSizeUsd(asks, sizeUsd) {
  let remaining = sizeUsd
  let filled = 0
  let cost = 0
  let lastPrice = null
  for (const level of asks) {
    const p = level.price ?? level[0]
    const q = level.quantity ?? level[1]
    if (p == null || q == null) continue
    const levelUsd = p * q
    const takeUsd = Math.min(remaining, levelUsd)
    filled += takeUsd / p
    cost += takeUsd
    lastPrice = p
    remaining -= takeUsd
    if (remaining <= 0) break
  }
  if (filled <= 0) return null
  const bestAsk = asks[0].price ?? asks[0][0]
  const vwap = cost / filled
  const priceImpact = ((vwap - bestAsk) / bestAsk) * 100
  return {
    filledUsd: cost,
    exhausted: remaining > 0,
    priceImpact,
    costBps: priceImpact * 100 / 2, // half-spread-style cost vs mid estimate
    lastPrice,
  }
}

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

  const book = orderbooks?.[`${exchange}|${symbol}`]

  const liquidity = useMemo(() => {
    if (!book) return null
    const getQ = (l) => l.quantity ?? l[1] ?? 0
    const bidVol = (book.bids || []).slice(0, 10).reduce((s, l) => s + getQ(l), 0)
    const askVol = (book.asks || []).slice(0, 10).reduce((s, l) => s + getQ(l), 0)
    return { bidVol, askVol, total: bidVol + askVol, imbalance: (bidVol - askVol) / (bidVol + askVol) }
  }, [book])

  const impactLevels = useMemo(() => {
    if (!book?.asks?.length) return []
    return ORDER_SIZES_USD.map(usd => {
      const r = impactForSizeUsd(book.asks, usd)
      return r ? { usd, ...r } : null
    }).filter(Boolean)
  }, [book])

  const maxImpact = impactLevels.length ? Math.max(...impactLevels.map(l => l.priceImpact)) : 1

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
      <SectionTitle icon={TrendingDown} title="Market Impact" iconColor="text-accent-red" right={<span className="text-[10px] text-gray-600">{symbol}</span>} />

      {/* Current price + liquidity */}
      <div className="grid grid-cols-2 gap-1">
        <StatCard label="Current Price" value={`$${formatPrice(price)}`} color="text-gray-200" />
        <StatCard label="Top-10 Liquidity" value={liquidity ? formatVolume(liquidity.total) : '—'} color="text-accent-blue" />
      </div>

      {/* Impact table */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <BarChart3 size={11} className="text-accent-blue" />
          <span className="text-[10px] text-gray-600 uppercase">Impact by Order Size</span>
        </div>
        <div className="space-y-0.5">
          {impactLevels.length === 0 ? (
            <div className="text-[10px] text-gray-600 py-1">No order book — impact cannot be estimated.</div>
          ) : impactLevels.map(level => (
            <div key={level.usd} className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] text-gray-400 w-10">${level.usd >= 1e3 ? `${level.usd / 1e3}k` : level.usd}</span>
              <div className="flex-1 flex items-center gap-1">
                <div className="flex-1 h-2 bg-bg-600 rounded overflow-hidden">
                  <div
                    className={`h-full ${impactBg(level.priceImpact)} opacity-70`}
                    style={{ width: `${Math.min(level.priceImpact / Math.max(maxImpact, 1e-9) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <span className={`text-[10px] font-mono w-12 text-right ${impactColor(level.priceImpact)}`}>
                {level.priceImpact.toFixed(2)}%
              </span>
              <span className="text-[10px] font-mono text-gray-500 w-14 text-right">
                {level.exhausted ? 'book+' : `$${formatPrice(level.lastPrice)}`}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[8px] text-gray-600">
          <span>Size</span>
          <span>VWAP slippage vs best ask</span>
          <span>Last level</span>
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

      {/* Warning — derived from the real book */}
      {impactLevels.some(l => l.priceImpact > 0.5) && (
        <WarningBanner icon={Zap} color="text-accent-yellow">
          ${(impactLevels.find(l => l.priceImpact > 0.5).usd / 1e3).toFixed(0)}k buy slips {'>'} 0.5% on current book
        </WarningBanner>
      )}
    </div>
  )
})

export default memo(MarketImpact)
