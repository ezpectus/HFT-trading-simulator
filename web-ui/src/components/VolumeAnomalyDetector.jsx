import { useMemo } from 'react'
import { Zap, AlertTriangle, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'
import { formatVolume } from '../utils/format'

export default function VolumeAnomalyDetector({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 20) return null

    const volumes = symCandles.map(c => c.volume || 0)
    const closes = symCandles.map(c => c.close)
    const opens = symCandles.map(c => c.open)

    // Rolling statistics
    const lookback = 20
    const anomalies = []
    const volSeries = []

    for (let i = 0; i < volumes.length; i++) {
      const window = volumes.slice(Math.max(0, i - lookback), i)
      if (window.length < 10) {
        volSeries.push({ idx: i, volume: volumes[i], isAnomaly: false, zScore: 0 })
        continue
      }
      const mean = window.reduce((s, v) => s + v, 0) / window.length
      const std = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length) || 1
      const zScore = (volumes[i] - mean) / std

      const isAnomaly = Math.abs(zScore) > 2.5
      const isHigh = zScore > 2.5
      const isLow = zScore < -2.5

      volSeries.push({ idx: i, volume: volumes[i], mean, std, zScore, isAnomaly, isHigh, isLow })

      if (isAnomaly) {
        const isBull = closes[i] >= opens[i]
        const priceChange = Math.abs((closes[i] - opens[i]) / opens[i]) * 100
        anomalies.push({
          idx: i,
          volume: volumes[i],
          mean,
          zScore,
          type: isHigh ? 'spike' : 'drought',
          direction: isBull ? 'bullish' : 'bearish',
          priceChange,
          price: closes[i],
          significance: Math.abs(zScore),
        })
      }
    }

    // Volume trend
    const recentVol = volumes.slice(-5).reduce((s, v) => s + v, 0) / 5
    const olderVol = volumes.slice(-15, -5).reduce((s, v) => s + v, 0) / 10
    const volTrend = olderVol > 0 ? recentVol / olderVol : 1

    // Average volume
    const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length
    const maxVol = Math.max(...volumes)
    const lastVol = volumes[volumes.length - 1]

    // Current z-score
    const lastZ = volSeries[volSeries.length - 1].zScore || 0

    // Chart
    const slice = volSeries.slice(-30)
    const maxV = Math.max(...slice.map(s => s.volume))
    const meanV = slice[0]?.mean || avgVol

    const bars = slice.map((s, i) => ({
      x: (i / slice.length) * 100,
      w: 100 / slice.length * 0.7,
      h: (s.volume / maxV) * 80,
      isAnomaly: s.isAnomaly,
      isHigh: s.isHigh,
      direction: closes[s.idx] >= opens[s.idx] ? 'bull' : 'bear',
    }))

    // Mean line
    const meanY = 100 - (meanV / maxV) * 80 - 10

    // Recent anomalies
    const recentAnomalies = anomalies.slice(-5)

    // Anomaly summary
    const spikeCount = anomalies.filter(a => a.type === 'spike').length
    const droughtCount = anomalies.filter(a => a.type === 'drought').length
    const bullAnomalies = anomalies.filter(a => a.direction === 'bullish').length
    const bearAnomalies = anomalies.filter(a => a.direction === 'bearish').length

    return {
      bars, meanY, recentAnomalies,
      avgVol, maxVol, lastVol, lastZ, volTrend,
      spikeCount, droughtCount, bullAnomalies, bearAnomalies,
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Zap size={12} className="text-accent-orange" />
          Volume Anomaly
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 20+ candles</div>
      </div>
    )
  }

  const { bars, meanY, recentAnomalies, avgVol, lastVol, lastZ, volTrend, spikeCount, droughtCount, bullAnomalies, bearAnomalies } = data

  const zColor = Math.abs(lastZ) > 2.5 ? 'text-accent-red' : Math.abs(lastZ) > 1.5 ? 'text-accent-yellow' : 'text-gray-400'

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Zap size={12} className="text-accent-orange" />
        Volume Anomaly Detector
      </div>

      {/* Current status */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Current Vol</span>
          <div className="font-mono text-gray-300">{formatVolume(lastVol)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Avg Vol</span>
          <div className="font-mono text-gray-400">{formatVolume(avgVol)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Z-Score</span>
          <div className={'font-mono font-bold ' + zColor}>{lastZ >= 0 ? '+' : ''}{lastZ.toFixed(2)}</div>
        </div>
      </div>

      {/* Volume chart */}
      <svg viewBox="0 0 100 100" className="w-full h-[40px]" preserveAspectRatio="none">
        {/* Mean line */}
        <line x1="0" y1={meanY} x2="100" y2={meanY} stroke="#64748b" strokeWidth="0.3" strokeDasharray="1 3" opacity="0.4" />
        {/* Bars */}
        {bars.map((b, i) => (
          <rect
            key={i}
            x={b.x + (100 / bars.length) * 0.15}
            y={100 - b.h}
            width={b.w}
            height={b.h}
            fill={b.isAnomaly
              ? (b.isHigh ? '#f97316' : '#3b82f6')
              : (b.direction === 'bull' ? '#22c55e' : '#ef4444')}
            fillOpacity={b.isAnomaly ? 0.8 : 0.3}
          />
        ))}
      </svg>
      <div className="flex items-center justify-between mt-0.5 text-[7px]">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-accent-orange" />
          <span className="text-gray-600">Spike</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-accent-blue" />
          <span className="text-gray-600">Drought</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-gray-500" />
          <span className="text-gray-600">Normal</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-1 mt-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Spikes</span>
          <div className="font-mono text-accent-orange">{spikeCount}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Droughts</span>
          <div className="font-mono text-accent-blue">{droughtCount}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Bull</span>
          <div className="font-mono text-accent-green">{bullAnomalies}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Bear</span>
          <div className="font-mono text-accent-red">{bearAnomalies}</div>
        </div>
      </div>

      {/* Recent anomalies */}
      {recentAnomalies.length > 0 && (
        <div className="mt-2">
          <div className="text-[8px] text-gray-600 mb-1">Recent anomalies:</div>
          <div className="space-y-0.5">
            {recentAnomalies.map((a, i) => (
              <div key={i} className="flex items-center gap-1 text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
                {a.type === 'spike' ? <Zap size={8} className="text-accent-orange" /> : <BarChart3 size={8} className="text-accent-blue" />}
                <span className={a.type === 'spike' ? 'text-accent-orange' : 'text-accent-blue'}>
                  {a.type === 'spike' ? 'Volume spike' : 'Volume drought'}
                </span>
                <span className={a.direction === 'bullish' ? 'text-accent-green' : 'text-accent-red'}>
                  {a.direction === 'bullish' ? '↑' : '↓'} {a.priceChange.toFixed(2)}%
                </span>
                <span className="text-gray-500 ml-auto">z={a.zScore.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alert */}
      {Math.abs(lastZ) > 2.5 && (
        <div className="mt-1.5 bg-accent-orange/10 border border-accent-orange/20 rounded px-1.5 py-0.5 flex items-center gap-1">
          <AlertTriangle size={9} className="text-accent-orange shrink-0" />
          <span className="text-[8px] text-accent-orange">
            {lastZ > 0 ? 'Volume spike detected' : 'Volume drought detected'} — {lastZ > 0 ? 'institutional activity' : 'low interest'}
          </span>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Z-score &gt;2.5σ = anomaly. Spikes + price move = institutional. Droughts = consolidation.
      </div>
    </div>
  )
}
