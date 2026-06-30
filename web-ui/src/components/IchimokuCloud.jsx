import { useMemo } from 'react'
import { Cloud, TrendingUp, TrendingDown } from 'lucide-react'
import { calcIchimoku } from '../utils/indicators'
import { formatPrice } from '../utils/format'

export default function IchimokuCloud({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-80)
    if (symCandles.length < 52) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const ich = calcIchimoku(highs, lows, closes)

    const i = closes.length - 1
    const price = closes[i]
    const tenkan = ich.tenkan[i]
    const kijun = ich.kijun[i]
    const senkouA = ich.senkouA[i]
    const senkouB = ich.senkouB[i]
    const chikou = ich.chikou[i]

    if (isNaN(tenkan) || isNaN(kijun)) return null

    // Cloud color: green if A > B (bullish), red if A < B (bearish)
    const cloudBullish = senkouA > senkouB
    const priceAboveCloud = !isNaN(senkouA) && !isNaN(senkouB) && price > Math.max(senkouA, senkouB)
    const priceBelowCloud = !isNaN(senkouA) && !isNaN(senkouB) && price < Math.min(senkouA, senkouB)
    const priceInCloud = !priceAboveCloud && !priceBelowCloud

    // TK cross
    const tkBullish = tenkan > kijun
    const tkCross = (tenkan > kijun) !== (ich.tenkan[i - 1] <= ich.kijun[i - 1])

    // Overall signal
    let signal = 'Neutral'
    let signalColor = 'text-gray-400'
    if (priceAboveCloud && tkBullish) { signal = 'Strong Bullish'; signalColor = 'text-accent-green' }
    else if (priceBelowCloud && !tkBullish) { signal = 'Strong Bearish'; signalColor = 'text-accent-red' }
    else if (priceAboveCloud) { signal = 'Bullish'; signalColor = 'text-accent-green' }
    else if (priceBelowCloud) { signal = 'Bearish'; signalColor = 'text-accent-red' }

    // Sparkline: show last 30 candles with cloud
    const startIdx = Math.max(0, i - 29)
    const sliceLen = i - startIdx + 1
    const minPrice = Math.min(...lows.slice(startIdx), ...ich.senkouB.slice(startIdx, i + 1).filter(v => !isNaN(v)))
    const maxPrice = Math.max(...highs.slice(startIdx), ...ich.senkouA.slice(startIdx, i + 1).filter(v => !isNaN(v)))
    const range = maxPrice - minPrice || 1
    const toY = (v) => 100 - ((v - minPrice) / range) * 100

    const closePath = closes.slice(startIdx).map((v, idx) => {
      const x = (idx / (sliceLen - 1)) * 100
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${toY(v).toFixed(1)}`
    }).join(' ')

    const tenkanPath = ich.tenkan.slice(startIdx).map((v, idx) => {
      if (isNaN(v)) return ''
      const x = (idx / (sliceLen - 1)) * 100
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${toY(v).toFixed(1)}`
    }).filter(Boolean).join(' ')

    const kijunPath = ich.kijun.slice(startIdx).map((v, idx) => {
      if (isNaN(v)) return ''
      const x = (idx / (sliceLen - 1)) * 100
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${toY(v).toFixed(1)}`
    }).filter(Boolean).join(' ')

    // Cloud area
    const cloudTop = ich.senkouA.slice(startIdx).map((v, idx) => {
      if (isNaN(v)) return null
      return { x: (idx / (sliceLen - 1)) * 100, y: toY(v) }
    }).filter(Boolean)
    const cloudBot = ich.senkouB.slice(startIdx).map((v, idx) => {
      if (isNaN(v)) return null
      return { x: (idx / (sliceLen - 1)) * 100, y: toY(v) }
    }).filter(Boolean)

    let cloudPath = ''
    if (cloudTop.length > 1 && cloudBot.length > 1) {
      const top = cloudTop.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      const bot = cloudBot.reverse().map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      cloudPath = `M ${cloudTop[0].x.toFixed(1)} ${cloudTop[0].y.toFixed(1)} ${top} ${bot} Z`
    }

    return {
      price, tenkan, kijun, senkouA, senkouB, chikou,
      cloudBullish, priceAboveCloud, priceBelowCloud, priceInCloud,
      tkBullish, tkCross, signal, signalColor,
      closePath, tenkanPath, kijunPath, cloudPath,
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Cloud size={12} className="text-accent-blue" />
          Ichimoku Cloud
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 52+ candles</div>
      </div>
    )
  }

  const { price, tenkan, kijun, senkouA, senkouB, signal, signalColor, closePath, tenkanPath, kijunPath, cloudPath, cloudBullish, tkBullish, tkCross, priceAboveCloud, priceBelowCloud } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Cloud size={12} className="text-accent-blue" />
        Ichimoku Cloud
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-medium text-gray-300">{signal}</div>
        <div className={'text-[10px] font-medium ' + signalColor}>{signal}</div>
      </div>

      {/* Chart */}
      <svg viewBox="0 0 100 100" className="w-full h-[60px]" preserveAspectRatio="none">
        {cloudPath && <path d={cloudPath} fill={cloudBullish ? '#22c55e' : '#ef4444'} opacity="0.15" />}
        {cloudPath && <path d={cloudPath} fill="none" stroke={cloudBullish ? '#22c55e' : '#ef4444'} strokeWidth="0.4" opacity="0.4" />}
        <path d={kijunPath} fill="none" stroke="#eab308" strokeWidth="0.8" />
        <path d={tenkanPath} fill="none" stroke="#3b82f6" strokeWidth="0.8" />
        <path d={closePath} fill="none" stroke="#e2e8f0" strokeWidth="1" />
      </svg>

      {/* Values */}
      <div className="grid grid-cols-2 gap-1 mt-2 text-[9px]">
        <div className="flex justify-between">
          <span className="text-blue-400">Tenkan(9)</span>
          <span className="font-mono text-gray-300">{formatPrice(tenkan)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-yellow-400">Kijun(26)</span>
          <span className="font-mono text-gray-300">{formatPrice(kijun)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Senkou A</span>
          <span className="font-mono text-gray-400">{isNaN(senkouA) ? '--' : formatPrice(senkouA)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Senkou B</span>
          <span className="font-mono text-gray-400">{isNaN(senkouB) ? '--' : formatPrice(senkouB)}</span>
        </div>
      </div>

      {/* Signals */}
      <div className="mt-2 pt-1.5 border-t border-bg-600 space-y-0.5">
        <div className="flex items-center justify-between text-[8px]">
          <span className="text-gray-600">Price vs Cloud</span>
          <span className={priceAboveCloud ? 'text-accent-green' : priceBelowCloud ? 'text-accent-red' : 'text-gray-400'}>
            {priceAboveCloud ? 'Above' : priceBelowCloud ? 'Below' : 'Inside'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[8px]">
          <span className="text-gray-600">TK Cross</span>
          <span className={tkBullish ? 'text-accent-green' : 'text-accent-red'}>
            {tkBullish ? 'Bullish' : 'Bearish'}{tkCross ? ' (just crossed!)' : ''}
          </span>
        </div>
        <div className="flex items-center justify-between text-[8px]">
          <span className="text-gray-600">Cloud Color</span>
          <span className={cloudBullish ? 'text-accent-green' : 'text-accent-red'}>
            {cloudBullish ? 'Green (bullish)' : 'Red (bearish)'}
          </span>
        </div>
      </div>
    </div>
  )
}
