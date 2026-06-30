import { useMemo } from 'react'
import { Brain, Target } from 'lucide-react'
import { calcRSI, calcEMA, calcSMA, calcATR } from '../utils/indicators'
import { formatPrice } from '../utils/format'

export default function RegimeAdaptiveStrategy({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-60)
    if (symCandles.length < 20) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const volumes = symCandles.map(c => c.volume || 0)

    // Detect regime
    const sma20 = calcSMA(closes, 20)
    const sma50 = calcSMA(closes, Math.min(50, closes.length))
    const rsi = calcRSI(closes, 14)
    const atr = calcATR(highs, lows, closes, 14)
    const ema9 = calcEMA(closes, 9)
    const ema21 = calcEMA(closes, 21)

    const lastSma20 = sma20[sma20.length - 1]
    const lastSma50 = sma50[sma50.length - 1]
    const lastRsi = rsi[rsi.length - 1] || 50
    const validAtr = atr.filter(v => !isNaN(v))
    const lastAtr = validAtr.length > 0 ? validAtr[validAtr.length - 1] : 0
    const avgAtr = validAtr.length > 0 ? validAtr.reduce((s, v) => s + v, 0) / validAtr.length : 0
    const volRatio = avgAtr > 0 ? lastAtr / avgAtr : 1

    const smaSpread = lastSma50 > 0 ? ((lastSma20 - lastSma50) / lastSma50) * 100 : 0
    const lastPrice = closes[closes.length - 1]

    // ADX-like trend strength
    const recentRanges = symCandles.slice(-10).map(c => c.high - c.low)
    const avgRange = recentRanges.reduce((s, v) => s + v, 0) / recentRanges.length
    const directionalMoves = symCandles.slice(-10).map(c => Math.abs(c.close - c.open))
    const avgDirectional = directionalMoves.reduce((s, v) => s + v, 0) / directionalMoves.length
    const trendStrength = avgRange > 0 ? avgDirectional / avgRange : 0

    // Classify regime
    let regime = 'Ranging'
    let regimeColor = '#64748b'
    if (smaSpread > 0.5 && lastRsi > 55 && trendStrength > 0.5) {
      regime = 'Trending Up'
      regimeColor = '#22c55e'
    } else if (smaSpread < -0.5 && lastRsi < 45 && trendStrength > 0.5) {
      regime = 'Trending Down'
      regimeColor = '#ef4444'
    }
    if (volRatio > 1.8) {
      regime = 'Volatile'
      regimeColor = '#f97316'
    } else if (volRatio < 0.5 && Math.abs(smaSpread) < 0.3) {
      regime = 'Calm'
      regimeColor = '#3b82f6'
    }

    // Strategy recommendations per regime
    const strategies = {
      'Trending Up': {
        primary: 'Buy dips to EMA21',
        secondary: 'Trail stop below EMA21',
        indicators: 'EMA 9/21 cross, RSI > 50 pullbacks',
        risk: 'Low risk: trend following',
        entry: 'Buy on pullback to EMA21',
        stop: 'Below EMA21 or last swing low',
        target: 'Previous high + 1 ATR',
        positionSize: 'Full size (trend confirmation)',
        confidence: 'High',
      },
      'Trending Down': {
        primary: 'Sell rallies to EMA21',
        secondary: 'Trail stop above EMA21',
        indicators: 'EMA 9/21 cross, RSI < 50 bounces',
        risk: 'Low risk: trend following',
        entry: 'Sell on rally to EMA21',
        stop: 'Above EMA21 or last swing high',
        target: 'Previous low - 1 ATR',
        positionSize: 'Full size (trend confirmation)',
        confidence: 'High',
      },
      'Ranging': {
        primary: 'Buy support, sell resistance',
        secondary: 'Mean reversion at extremes',
        indicators: 'RSI overbought/oversold, BB bands',
        risk: 'Medium risk: range trading',
        entry: 'Buy at range bottom (RSI < 35)',
        stop: 'Below range bottom',
        target: 'Range top or SMA20',
        positionSize: 'Half size (no clear trend)',
        confidence: 'Medium',
      },
      'Volatile': {
        primary: 'Reduce position size',
        secondary: 'Wait for volatility to subside',
        indicators: 'ATR ratio, widen stops',
        risk: 'High risk: unpredictable',
        entry: 'Wait for volatility contraction',
        stop: '2x ATR from entry',
        target: '1x ATR (quick scalps)',
        positionSize: 'Quarter size or stand aside',
        confidence: 'Low',
      },
      'Calm': {
        primary: 'Prepare for breakout',
        secondary: 'Set breakout orders',
        indicators: 'BB squeeze, volume spike watch',
        risk: 'Low risk: low volatility',
        entry: 'Buy breakout above range',
        stop: 'Below range midpoint',
        target: '2x ATR on breakout',
        positionSize: 'Build position on breakout confirmation',
        confidence: 'Medium',
      },
    }

    const strat = strategies[regime] || strategies['Ranging']

    // EMA values for display
    const lastEma9 = ema9[ema9.length - 1]
    const lastEma21 = ema21[ema21.length - 1]

    // Suggested levels
    const suggestedEntry = regime === 'Trending Up' ? lastEma21 :
      regime === 'Trending Down' ? lastEma21 :
      regime === 'Ranging' ? lastPrice * 0.98 :
      regime === 'Calm' ? lastPrice * 1.01 :
      lastPrice
    const suggestedStop = regime === 'Trending Up' ? lastEma21 - lastAtr :
      regime === 'Trending Down' ? lastEma21 + lastAtr :
      regime === 'Volatile' ? lastPrice - lastAtr * 2 :
      lastPrice - lastAtr * 1.5
    const suggestedTarget = regime === 'Trending Up' ? lastPrice + lastAtr :
      regime === 'Trending Down' ? lastPrice - lastAtr :
      regime === 'Ranging' ? lastPrice * 1.02 :
      lastPrice + lastAtr * 2

    return {
      regime, regimeColor, strat,
      lastPrice, lastEma9, lastEma21, lastAtr,
      suggestedEntry, suggestedStop, suggestedTarget,
      trendStrength, volRatio, smaSpread, lastRsi,
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Brain size={12} className="text-accent-purple" />
          Regime Strategy
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 20+ candles</div>
      </div>
    )
  }

  const { regime, regimeColor, strat, lastPrice, lastEma9, lastEma21, lastAtr, suggestedEntry, suggestedStop, suggestedTarget, trendStrength, volRatio, smaSpread, lastRsi } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Brain size={12} className="text-accent-purple" />
        Regime Adaptive Strategy
      </div>

      {/* Regime badge */}
      <div className="rounded px-2 py-1.5 mb-2 text-center" style={{ backgroundColor: regimeColor + '15' }}>
        <div className="text-[8px] text-gray-600">Detected Regime</div>
        <div className="text-sm font-bold" style={{ color: regimeColor }}>{regime}</div>
      </div>

      {/* Strategy recommendation */}
      <div className="bg-bg-800 rounded p-2 mb-2">
        <div className="flex items-center gap-1 mb-1">
          <Target size={9} className="text-accent-blue" />
          <span className="text-[9px] font-medium text-gray-300">Recommended Strategy</span>
        </div>
        <div className="text-[10px] text-gray-200 font-medium mb-1">{strat.primary}</div>
        <div className="text-[8px] text-gray-500">{strat.secondary}</div>
      </div>

      {/* Entry/Stop/Target */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-1">
          <span className="text-gray-600">Entry</span>
          <div className="font-mono text-accent-blue">{formatPrice(suggestedEntry)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-1">
          <span className="text-gray-600">Stop</span>
          <div className="font-mono text-accent-red">{formatPrice(suggestedStop)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-1">
          <span className="text-gray-600">Target</span>
          <div className="font-mono text-accent-green">{formatPrice(suggestedTarget)}</div>
        </div>
      </div>

      {/* Strategy details */}
      <div className="space-y-0.5 mb-2">
        <div className="flex justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Indicators</span>
          <span className="text-gray-400 text-right">{strat.indicators}</span>
        </div>
        <div className="flex justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Risk Level</span>
          <span className="text-gray-400">{strat.risk}</span>
        </div>
        <div className="flex justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Position Size</span>
          <span className="text-gray-400">{strat.positionSize}</span>
        </div>
        <div className="flex justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Confidence</span>
          <span className={strat.confidence === 'High' ? 'text-accent-green' : strat.confidence === 'Medium' ? 'text-accent-yellow' : 'text-accent-red'}>
            {strat.confidence}
          </span>
        </div>
      </div>

      {/* Regime metrics */}
      <div className="grid grid-cols-4 gap-1 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Trend Str</span>
          <div className="font-mono text-gray-400">{(trendStrength * 100).toFixed(0)}%</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Vol Ratio</span>
          <div className="font-mono text-gray-400">{volRatio.toFixed(2)}x</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">SMA Spread</span>
          <div className="font-mono text-gray-400">{smaSpread.toFixed(2)}%</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">RSI</span>
          <div className="font-mono text-gray-400">{lastRsi.toFixed(0)}</div>
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Adapts strategy to current market regime. Trend=follow, Range=mean-revert, Volatile=reduce, Calm=prepare.
      </div>
    </div>
  )
}
