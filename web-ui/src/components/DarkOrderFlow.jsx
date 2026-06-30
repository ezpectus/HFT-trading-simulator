import { useMemo } from 'react'
import { Eye, AlertTriangle, TrendingUp } from 'lucide-react'
import { formatPrice, formatTime } from '../utils/format'

export default function DarkOrderFlow({ candles, symbol, exchange: selectedExchange }) {
  const anomalies = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === selectedExchange && c.symbol === symbol)
      .slice(-100)

    if (symCandles.length < 20) return []

    // Calculate average volume and detect spikes
    const volumes = symCandles.map(c => c.volume)
    const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length
    const stdVol = Math.sqrt(volumes.reduce((s, v) => s + (v - avgVol) ** 2, 0) / volumes.length)
    const threshold = avgVol + 2.5 * stdVol

    const results = []
    for (let i = 0; i < symCandles.length; i++) {
      const c = symCandles[i]
      if (c.volume > threshold) {
        const ratio = (c.volume / avgVol).toFixed(1)
        const isBullish = c.close > c.open
        const bodySize = Math.abs(c.close - c.open)
        const upperWick = c.high - Math.max(c.open, c.close)
        const lowerWick = Math.min(c.open, c.close) - c.low
        const totalRange = c.high - c.low || 0.001

        // Detect hidden/dark order patterns:
        // 1. Large volume but small body → hidden accumulation/distribution
        // 2. Large volume + large body → directional pressure
        const bodyRatio = bodySize / totalRange
        const isHidden = bodyRatio < 0.3 // small body, large volume = hidden
        const direction = isBullish ? 'ACCUMULATION' : 'DISTRIBUTION'

        results.push({
          time: c.time,
          volume: c.volume,
          avgVol,
          ratio,
          isBullish,
          isHidden,
          direction: isHidden ? `HIDDEN ${direction}` : direction,
          bodyRatio: (bodyRatio * 100).toFixed(0),
          price: c.close,
        })
      }
    }

    return results.slice(-8).reverse()
  }, [candles, symbol, selectedExchange])

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Eye size={12} className="text-accent-purple" />
        Dark Order Flow
      </div>

      {anomalies.length === 0 ? (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">
          No anomalous volume detected
        </div>
      ) : (
        <div className="space-y-1 max-h-[180px] overflow-y-auto scrollbar-thin">
          {anomalies.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-2 py-1 px-1.5 rounded bg-bg-600/50"
            >
              <div className={'shrink-0 ' + (a.isBullish ? 'text-accent-green' : 'text-accent-red')}>
                {a.isHidden ? (
                  <AlertTriangle size={11} className="text-accent-yellow" />
                ) : (
                  <TrendingUp size={11} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={'text-[10px] font-medium ' +
                    (a.isHidden ? 'text-accent-yellow' : a.isBullish ? 'text-accent-green' : 'text-accent-red')}>
                    {a.direction}
                  </span>
                  <span className="text-[9px] text-gray-500">
                    {a.ratio}x avg vol
                  </span>
                </div>
                <div className="text-[8px] text-gray-600">
                  {formatTime(a.time)} · ${formatPrice(a.price)} · body {a.bodyRatio}%
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-1.5 pt-1.5 border-t border-bg-600 text-[8px] text-gray-600">
        Detects volume spikes &gt;2.5σ. Hidden = small body + large volume (dark pool activity).
      </div>
    </div>
  )
}
