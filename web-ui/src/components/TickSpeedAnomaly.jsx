import { useMemo } from 'react'
import { Gauge, Zap, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'

export default function TickSpeedAnomaly({ candles, fills, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-60)
    if (symCandles.length < 15) return null

    // Calculate inter-candle time gaps
    const gaps = []
    for (let i = 1; i < symCandles.length; i++) {
      gaps.push({
        idx: i,
        gap: symCandles[i].timestamp - symCandles[i - 1].timestamp,
        volume: symCandles[i].volume || 0,
        change: ((symCandles[i].close - symCandles[i - 1].close) / symCandles[i - 1].close) * 100,
      })
    }

    if (gaps.length < 5) return null

    // Z-score on gaps
    const meanGap = gaps.reduce((s, g) => s + g.gap, 0) / gaps.length
    const stdGap = Math.sqrt(gaps.reduce((s, g) => s + (g.gap - meanGap) ** 2, 0) / gaps.length) || 1

    // Z-score on volume
    const vols = gaps.map(g => g.volume)
    const meanVol = vols.reduce((s, v) => s + v, 0) / vols.length
    const stdVol = Math.sqrt(vols.reduce((s, v) => s + (v - meanVol) ** 2, 0) / vols.length) || 1

    // Detect anomalies: fast ticks (low gap z-score) with high volume
    const anomalies = gaps.map(g => {
      const gapZ = (g.gap - meanGap) / stdGap
      const volZ = (g.volume - meanVol) / stdVol
      const isFastTick = gapZ < -1.5
      const isSlowTick = gapZ > 1.5
      const isHighVol = volZ > 1.5
      const isAnomaly = (isFastTick || isSlowTick) && isHighVol
      return {
        ...g,
        gapZ,
        volZ,
        isFastTick,
        isSlowTick,
        isHighVol,
        isAnomaly,
        type: isFastTick && isHighVol ? 'burst' : isSlowTick && isHighVol ? 'block' : isFastTick ? 'fast' : isSlowTick ? 'slow' : 'normal',
      }
    })

    const anomalyEvents = anomalies.filter(a => a.isAnomaly)
    const fastTicks = anomalies.filter(a => a.isFastTick).length
    const slowTicks = anomalies.filter(a => a.isSlowTick).length

    // Fill speed (trades per candle)
    const symFills = (fills || []).filter(f => f.symbol === symbol && f.status === 'FILLED')
    const fillsByCandle = {}
    for (const f of symFills) {
      const ts = f.timestamp || f.received_at || 0
      // Find nearest candle
      let nearest = null
      let minDiff = Infinity
      for (const c of symCandles) {
        const diff = Math.abs(c.timestamp - ts)
        if (diff < minDiff) { minDiff = diff; nearest = c }
      }
      if (nearest && minDiff < meanGap * 2) {
        const key = nearest.timestamp
        fillsByCandle[key] = (fillsByCandle[key] || 0) + 1
      }
    }

    const fillSpeeds = symCandles.map(c => fillsByCandle[c.timestamp] || 0)
    const meanFillSpeed = fillSpeeds.reduce((s, v) => s + v, 0) / fillSpeeds.length
    const maxFillSpeed = Math.max(...fillSpeeds, 1)

    // Recent activity score
    const recentGaps = gaps.slice(-5)
    const avgRecentGap = recentGaps.reduce((s, g) => s + g.gap, 0) / recentGaps.length
    const speedRatio = avgRecentGap > 0 ? meanGap / avgRecentGap : 1

    let activity = 'Normal'
    let activityColor = 'text-gray-400'
    if (speedRatio > 1.5) { activity = 'Accelerating'; activityColor = 'text-accent-green' }
    else if (speedRatio < 0.6) { activity = 'Decelerating'; activityColor = 'text-accent-orange' }

    return {
      anomalies, anomalyEvents, fastTicks, slowTicks,
      meanGap, meanVol, meanFillSpeed, maxFillSpeed,
      fillSpeeds, speedRatio, activity, activityColor,
      symCandles,
    }
  }, [candles, fills, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Gauge size={12} className="text-accent-yellow" />
          Tick Speed
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 15+ candles</div>
      </div>
    )
  }

  const { anomalies, anomalyEvents, fastTicks, slowTicks, meanGap, meanFillSpeed, fillSpeeds, speedRatio, activity, activityColor, symCandles } = data

  // SVG sparkline for gap z-scores
  const w = 280, h = 40
  const recentAnoms = anomalies.slice(-30)
  const zMin = -3, zMax = 3
  const xStep = w / Math.max(recentAnoms.length - 1, 1)

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Gauge size={12} className="text-accent-yellow" />
        Tick Speed Anomaly
      </div>

      {/* Activity status */}
      <div className="bg-bg-800 rounded px-2 py-1.5 mb-2 text-center">
        <div className="text-[8px] text-gray-600">Tick Activity</div>
        <div className={'text-sm font-bold ' + activityColor}>{activity}</div>
        <div className="text-[8px] text-gray-500">
          {speedRatio.toFixed(2)}x normal | {anomalyEvents.length} anomalies
        </div>
      </div>

      {/* Z-score sparkline */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5">Gap Z-Score (last 30):</div>
        <svg width={w} height={h} className="w-full">
          <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#334155" strokeWidth={0.5} />
          <line x1={0} y1={h * 0.2} x2={w} y2={h * 0.2} stroke="#334155" strokeWidth={0.3} strokeDasharray="2,2" />
          <line x1={0} y1={h * 0.8} x2={w} y2={h * 0.8} stroke="#334155" strokeWidth={0.3} strokeDasharray="2,2" />
          {recentAnoms.map((a, i) => {
            const x = i * xStep
            const y = h / 2 - (a.gapZ / zMax) * (h / 2 - 2)
            const color = a.isAnomaly ? (a.type === 'burst' ? '#ef4444' : a.type === 'block' ? '#f97316' : '#eab308') : '#64748b'
            return (
              <g key={i}>
                {i > 0 && (
                  <line
                    x1={(i - 1) * xStep}
                    y1={h / 2 - (recentAnoms[i - 1].gapZ / zMax) * (h / 2 - 2)}
                    x2={x}
                    y2={y}
                    stroke="#475569"
                    strokeWidth={0.5}
                  />
                )}
                <circle cx={x} cy={y} r={a.isAnomaly ? 2.5 : 1} fill={color} />
              </g>
            )
          })}
        </svg>
        <div className="flex justify-between text-[7px] text-gray-700">
          <span className="text-accent-red">Burst (fast+vol)</span>
          <span className="text-accent-orange">Block (slow+vol)</span>
          <span className="text-gray-600">Normal</span>
        </div>
      </div>

      {/* Fill speed bars */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5">Fills per Candle:</div>
        <div className="flex items-end gap-px h-6">
          {fillSpeeds.slice(-20).map((s, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-accent-blue transition-all"
              style={{ height: `${(s / Math.max(...fillSpeeds.slice(-20), 1)) * 100}%`, opacity: 0.3 + (s / Math.max(...fillSpeeds.slice(-20), 1)) * 0.7 }}
            />
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-1 text-[8px] mb-2">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Avg Gap</span>
          <div className="font-mono text-gray-400">{meanGap.toFixed(0)}s</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Fast Ticks</span>
          <div className="font-mono text-accent-green">{fastTicks}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Slow Ticks</span>
          <div className="font-mono text-accent-orange">{slowTicks}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Fill/Candle</span>
          <div className="font-mono text-gray-400">{meanFillSpeed.toFixed(1)}</div>
        </div>
      </div>

      {/* Recent anomalies */}
      {anomalyEvents.length > 0 && (
        <div className="pt-1.5 border-t border-bg-600">
          <div className="flex items-center gap-1 mb-1">
            <AlertTriangle size={9} className="text-accent-yellow" />
            <span className="text-[8px] text-gray-600">Recent Anomalies:</span>
          </div>
          <div className="space-y-0.5">
            {anomalyEvents.slice(-3).reverse().map((a, i) => (
              <div key={i} className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
                <span className="flex items-center gap-1">
                  {a.type === 'burst' ? <Zap size={7} className="text-accent-red" /> : <AlertTriangle size={7} className="text-accent-orange" />}
                  <span className={a.type === 'burst' ? 'text-accent-red' : 'text-accent-orange'}>
                    {a.type === 'burst' ? 'Burst' : a.type === 'block' ? 'Block' : a.isFastTick ? 'Fast' : 'Slow'}
                  </span>
                </span>
                <span className="text-gray-500">gapZ: {a.gapZ.toFixed(1)}</span>
                <span className="text-gray-500">volZ: {a.volZ.toFixed(1)}</span>
                <span className={a.change >= 0 ? 'text-accent-green' : 'text-accent-red'}>
                  {a.change >= 0 ? '+' : ''}{a.change.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Detects abnormal tick speed (burst/block) with volume confirmation. Burst = institutional activity, Block = absorption.
      </div>
    </div>
  )
}
