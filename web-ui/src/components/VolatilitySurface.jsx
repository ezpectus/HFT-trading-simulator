import { useMemo } from 'react'
import { Box, Info } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function VolatilitySurface({ candles, symbols, exchange }) {
  const surface = useMemo(() => {
    const data = {}
    const windows = [5, 10, 20, 50, 100]
    let hasData = false

    for (const sym of symbols) {
      const symCandles = candles
        .filter(c => c.exchange === exchange && c.symbol === sym)
        .map(c => c.close)

      if (symCandles.length < 10) continue
      hasData = true

      const vols = {}
      for (const w of windows) {
        if (symCandles.length < w + 1) {
          vols[w] = null
          continue
        }
        const slice = symCandles.slice(-w - 1)
        const returns = []
        for (let i = 1; i < slice.length; i++) {
          if (slice[i - 1] > 0) {
            returns.push((slice[i] - slice[i - 1]) / slice[i - 1])
          }
        }
        if (returns.length === 0) { vols[w] = null; continue }
        const mean = returns.reduce((s, v) => s + v, 0) / returns.length
        const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length
        // Annualized volatility (252 periods)
        vols[w] = Math.sqrt(variance) * Math.sqrt(252) * 100
      }

      const lastPrice = symCandles[symCandles.length - 1]
      const dayReturn = symCandles.length >= 2
        ? ((symCandles[symCandles.length - 1] - symCandles[symCandles.length - 2]) / symCandles[symCandles.length - 2]) * 100
        : 0

      data[sym] = { vols, lastPrice, dayReturn }
    }

    if (!hasData) return null

    // Find min/max for color scaling
    const allVols = Object.values(data)
      .flatMap(d => Object.values(d.vols))
      .filter(v => v !== null)
    const minVol = Math.min(...allVols, 0)
    const maxVol = Math.max(...allVols, 100)

    // Term structure slope (short vs long vol)
    const slopes = {}
    for (const sym of symbols) {
      if (data[sym]?.vols[5] != null && data[sym]?.vols[100] != null) {
        slopes[sym] = data[sym].vols[100] - data[sym].vols[5]
      }
    }

    return { data, windows, minVol, maxVol, slopes }
  }, [candles, symbols, exchange])

  if (!surface) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Box size={12} className="text-accent-purple" />
          Volatility Surface
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { data, windows, minVol, maxVol, slopes } = surface

  function volColor(vol) {
    if (vol === null) return 'bg-bg-600/20 text-gray-700'
    const t = (vol - minVol) / (maxVol - minVol || 1)
    if (t > 0.75) return 'bg-accent-red/60 text-white'
    if (t > 0.5) return 'bg-accent-orange/50 text-gray-100'
    if (t > 0.25) return 'bg-accent-yellow/40 text-gray-200'
    return 'bg-accent-green/30 text-gray-200'
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Box size={12} className="text-accent-purple" />
        Volatility Surface
      </div>

      {/* Surface grid */}
      <table className="w-full text-[9px]">
        <thead>
          <tr className="text-gray-600 border-b border-bg-600">
            <th className="text-left py-1">Symbol</th>
            {windows.map(w => (
              <th key={w} className="text-right px-1">{w}p</th>
            ))}
            <th className="text-right px-1">Slope</th>
          </tr>
        </thead>
        <tbody>
          {symbols.map(sym => {
            const d = data[sym]
            if (!d) return null
            const slope = slopes[sym]
            return (
              <tr key={sym} className="border-b border-bg-600/30">
                <td className="py-1 text-gray-300 font-medium">{sym.split('/')[0]}</td>
                {windows.map(w => (
                  <td key={w} className="text-right px-1">
                    <span className={'inline-block px-1.5 py-0.5 rounded font-mono ' + volColor(d.vols[w])}>
                      {d.vols[w] !== null ? `${d.vols[w].toFixed(1)}%` : '—'}
                    </span>
                  </td>
                ))}
                <td className="text-right px-1">
                  <span className={'font-mono ' + (slope > 0 ? 'text-accent-yellow' : 'text-accent-blue')}>
                    {slope !== undefined ? `${slope > 0 ? '+' : ''}${slope.toFixed(1)}` : '—'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Term structure interpretation */}
      <div className="mt-2 pt-2 border-t border-bg-600 space-y-0.5">
        {symbols.map(sym => {
          const slope = slopes[sym]
          if (slope === undefined) return null
          const interpretation = slope > 5 ? 'Contango (long vol > short, stable)' :
            slope < -5 ? 'Backwardation (short vol > long, stress)' :
            'Flat term structure'
          const color = slope > 5 ? 'text-accent-green' : slope < -5 ? 'text-accent-red' : 'text-gray-400'
          return (
            <div key={sym} className="flex items-center gap-1.5 text-[8px]">
              <span className="text-gray-500 w-8">{sym.split('/')[0]}</span>
              <span className={color}>{interpretation}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-1.5 pt-1.5 border-t border-bg-600 flex items-start gap-1 text-[8px] text-gray-600">
        <Info size={9} className="shrink-0 mt-0.5" />
        <span>Annualized volatility (×√252) across lookback windows. Slope = long vol − short vol.</span>
      </div>
    </div>
  )
}
