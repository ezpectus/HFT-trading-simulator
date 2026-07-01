import { useMemo, useState } from 'react'
import { FlaskConical, TrendingUp, TrendingDown, Settings2, ArrowRight } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'
import { calcATR } from '../utils/indicators'

export default function SlippageSimulator({ candles, orderbooks, accounts, currentPrice, symbol, exchange }) {
  const [side, setSide] = useState('BUY')
  const [orderSize, setOrderSize] = useState('1000')
  const [slippageModel, setSlippageModel] = useState('linear')
  const [feeTier, setFeeTier] = useState('taker')

  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 10 || !currentPrice) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const volumes = symCandles.map(c => c.volume || 0)

    const atr = calcATR(highs, lows, closes, 14)
    const validAtr = atr.filter(v => !isNaN(v))
    const lastAtr = validAtr.length > 0 ? validAtr[validAtr.length - 1] : currentPrice * 0.01

    const avgVol = volumes.length > 0 ? volumes.reduce((s, v) => s + v, 0) / volumes.length : 1000
    const maxVol = Math.max(...volumes, 1)

    const qty = parseFloat(orderSize) || 0
    if (qty <= 0) return null

    // Get orderbook depth
    const ob = orderbooks?.[`${exchange}|${symbol}`]
    const bids = ob?.bids || []
    const asks = ob?.asks || []

    // Available liquidity at best price
    const bestBid = bids.length > 0 ? bids[0].price : currentPrice * 0.999
    const bestAsk = asks.length > 0 ? asks[0].price : currentPrice * 1.001
    const spread = bestAsk - bestBid

    // Top 5 level liquidity
    const top5BidVol = bids.slice(0, 5).reduce((s, b) => s + b.quantity, 0)
    const top5AskVol = asks.slice(0, 5).reduce((s, a) => s + a.quantity, 0)
    const topLiquidity = side === 'BUY' ? top5AskVol : top5BidVol

    // Market impact models
    let slippagePct = 0
    let executionPrice = currentPrice
    let priceImpact = 0

    const orderVsLiquidity = topLiquidity > 0 ? qty / topLiquidity : 1

    if (slippageModel === 'linear') {
      slippagePct = Math.min(orderVsLiquidity * 0.5, 5)
    } else if (slippageModel === 'square-root') {
      slippagePct = Math.min(Math.sqrt(orderVsLiquidity) * 0.3, 5)
    } else if (slippageModel === 'constant') {
      slippagePct = 0.1
    } else if (slippageModel === 'volume') {
      // Proportional to 1/avg volume
      const volRatio = avgVol > 0 ? qty / avgVol : 1
      slippagePct = Math.min(volRatio * 0.2, 5)
    }

    // Direction: buy = price goes up, sell = price goes down
    if (side === 'BUY') {
      executionPrice = currentPrice * (1 + slippagePct / 100)
      priceImpact = executionPrice - currentPrice
    } else {
      executionPrice = currentPrice * (1 - slippagePct / 100)
      priceImpact = currentPrice - executionPrice
    }

    // Fees
    const feeRate = feeTier === 'maker' ? 0.0002 : feeTier === 'taker' ? 0.0005 : 0.001
    const fee = executionPrice * qty * feeRate

    // Total cost
    const grossValue = currentPrice * qty
    const actualValue = executionPrice * qty
    const totalCost = actualValue + fee
    const slippageCost = Math.abs(priceImpact * qty)
    const totalRoundTrip = slippageCost + fee

    // Effective price (after slippage + fees)
    const effectivePrice = side === 'BUY'
      ? currentPrice + (totalRoundTrip / qty)
      : currentPrice - (totalRoundTrip / qty)

    // Breakdown percentages
    const slippagePctOfTotal = totalRoundTrip > 0 ? (slippageCost / totalRoundTrip) * 100 : 0
    const feePctOfTotal = totalRoundTrip > 0 ? (fee / totalRoundTrip) * 100 : 0

    // TWAP comparison (split into 5 slices)
    const slices = 5
    const sliceQty = qty / slices
    let twapSlippage = 0
    for (let i = 0; i < slices; i++) {
      const sliceImpact = slippageModel === 'square-root'
        ? Math.sqrt(sliceQty / topLiquidity) * 0.3
        : (sliceQty / topLiquidity) * 0.5
      twapSlippage += Math.min(sliceImpact, 5) * sliceQty
    }
    const twapSavings = slippageCost - twapSlippage
    const twapSavingsPct = slippageCost > 0 ? (twapSavings / slippageCost) * 100 : 0

    // Liquidity zones
    let liquidityZone = 'Deep'
    let liquidityColor = 'text-accent-green'
    if (orderVsLiquidity > 0.5) { liquidityZone = 'Thin'; liquidityColor = 'text-accent-red' }
    else if (orderVsLiquidity > 0.2) { liquidityZone = 'Moderate'; liquidityColor = 'text-accent-yellow' }

    return {
      qty, currentPrice, executionPrice, priceImpact, slippagePct,
      spread, bestBid, bestAsk, topLiquidity, top5BidVol, top5AskVol,
      fee, feeRate, grossValue, actualValue, totalCost,
      slippageCost, totalRoundTrip, effectivePrice,
      slippagePctOfTotal, feePctOfTotal,
      twapSavings, twapSavingsPct,
      orderVsLiquidity, liquidityZone, liquidityColor,
      lastAtr, avgVol, maxVol,
    }
  }, [candles, orderbooks, currentPrice, symbol, exchange, side, orderSize, slippageModel, feeTier])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <FlaskConical size={12} className="text-accent-teal" />
          Slippage Simulator
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 10+ candles and valid order size</div>
      </div>
    )
  }

  const { qty, executionPrice, priceImpact, slippagePct, spread, bestBid, bestAsk, topLiquidity, fee, feeRate, grossValue, actualValue, slippageCost, totalRoundTrip, effectivePrice, slippagePctOfTotal, feePctOfTotal, twapSavings, twapSavingsPct, orderVsLiquidity, liquidityZone, liquidityColor } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <FlaskConical size={12} className="text-accent-teal" />
        Slippage Simulator
      </div>

      {/* Side selector */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setSide('BUY')}
          className={'flex-1 py-1 text-[10px] font-medium rounded transition-colors ' +
            (side === 'BUY' ? 'bg-accent-green text-white' : 'bg-bg-600 text-gray-400')}
        >
          Buy
        </button>
        <button
          onClick={() => setSide('SELL')}
          className={'flex-1 py-1 text-[10px] font-medium rounded transition-colors ' +
            (side === 'SELL' ? 'bg-accent-red text-white' : 'bg-bg-600 text-gray-400')}
        >
          Sell
        </button>
      </div>

      {/* Order size */}
      <div className="mb-2">
        <label className="text-[8px] text-gray-600">Order Size (units)</label>
        <input
          type="number"
          value={orderSize}
          onChange={e => setOrderSize(e.target.value)}
          step="10"
          className="w-full bg-bg-800 text-[10px] text-gray-300 rounded px-2 py-1 border border-bg-600 focus:border-accent-teal outline-none"
        />
      </div>

      {/* Slippage model */}
      <div className="mb-2">
        <label className="text-[8px] text-gray-600 flex items-center gap-1">
          <Settings2 size={8} /> Slippage Model
        </label>
        <div className="grid grid-cols-2 gap-1">
          {[
            { id: 'linear', label: 'Linear' },
            { id: 'square-root', label: 'Square Root' },
            { id: 'constant', label: 'Constant' },
            { id: 'volume', label: 'Volume-based' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setSlippageModel(m.id)}
              className={'py-0.5 text-[8px] rounded transition-colors ' +
                (slippageModel === m.id ? 'bg-accent-teal text-white' : 'bg-bg-600 text-gray-400')}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fee tier */}
      <div className="mb-2">
        <label className="text-[8px] text-gray-600">Fee Tier</label>
        <div className="grid grid-cols-3 gap-1">
          {[
            { id: 'maker', label: 'Maker 0.02%' },
            { id: 'taker', label: 'Taker 0.05%' },
            { id: 'high', label: 'High 0.10%' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFeeTier(f.id)}
              className={'py-0.5 text-[7px] rounded transition-colors ' +
                (feeTier === f.id ? 'bg-accent-teal text-white' : 'bg-bg-600 text-gray-400')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="space-y-0.5 mb-2">
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Reference Price</span>
          <span className="font-mono text-gray-400">{formatPrice(currentPrice)}</span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Execution Price</span>
          <span className={'font-mono ' + (side === 'BUY' ? 'text-accent-red' : 'text-accent-green')}>
            {formatPrice(executionPrice)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Price Impact</span>
          <span className={'font-mono ' + (slippagePct > 1 ? 'text-accent-red' : 'text-accent-yellow')}>
            {slippagePct.toFixed(3)}% ({formatPrice(Math.abs(priceImpact))})
          </span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Spread</span>
          <span className="font-mono text-gray-400">{formatPrice(spread)}</span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Fee ({(feeRate * 100).toFixed(2)}%)</span>
          <span className="font-mono text-gray-400">${formatPrice(fee)}</span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Slippage Cost</span>
          <span className="font-mono text-accent-orange">${formatPrice(slippageCost)}</span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-accent-teal/10 border border-accent-teal/20 rounded px-1.5 py-0.5">
          <span className="text-accent-teal font-medium">Total Round-trip</span>
          <span className="font-mono text-accent-teal font-bold">${formatPrice(totalRoundTrip)}</span>
        </div>
      </div>

      {/* Cost breakdown bar */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5">Cost Breakdown:</div>
        <div className="h-3 bg-bg-800 rounded-full overflow-hidden flex">
          <div className="bg-accent-orange h-full" style={{ width: `${slippagePctOfTotal}%` }} />
          <div className="bg-accent-blue h-full" style={{ width: `${feePctOfTotal}%` }} />
        </div>
        <div className="flex justify-between text-[7px] mt-0.5">
          <span className="text-accent-orange">Slippage {slippagePctOfTotal.toFixed(0)}%</span>
          <span className="text-accent-blue">Fee {feePctOfTotal.toFixed(0)}%</span>
        </div>
      </div>

      {/* Liquidity zone */}
      <div className="bg-bg-800 rounded px-2 py-1 mb-2 flex items-center justify-between">
        <span className="text-[8px] text-gray-600">Liquidity Zone</span>
        <span className={'text-[10px] font-bold ' + liquidityColor}>{liquidityZone}</span>
        <span className="text-[8px] text-gray-700">order/liquidity: {(orderVsLiquidity * 100).toFixed(1)}%</span>
      </div>

      {/* TWAP comparison */}
      <div className="bg-bg-800 rounded px-2 py-1.5 mb-2">
        <div className="flex items-center gap-1 mb-0.5">
          <ArrowRight size={8} className="text-accent-green" />
          <span className="text-[8px] text-gray-600">TWAP (5 slices) Savings:</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={'text-[10px] font-mono ' + (twapSavings > 0 ? 'text-accent-green' : 'text-gray-500')}>
            ${formatPrice(Math.abs(twapSavings))}
          </span>
          <span className={'text-[8px] ' + (twapSavings > 0 ? 'text-accent-green' : 'text-gray-600')}>
            {twapSavingsPct.toFixed(0)}% less slippage
          </span>
        </div>
      </div>

      <div className="pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Models: Linear (proportional), Square-root (Almgren-Chriss), Volume-based (avg candle vol). Use to estimate real execution costs.
      </div>
    </div>
  )
}
