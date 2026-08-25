import { memo, useMemo } from 'react'
import { Box, Layers, TrendingDown } from 'lucide-react'
import { StatCard, WarningBanner } from '../utils/ui-helpers'

const MOCK_VOL_SURFACE = [
  { strike: 38000, dte: 7, iv: 38 }, { strike: 40000, dte: 7, iv: 40 }, { strike: 42000, dte: 7, iv: 42 },
  { strike: 44000, dte: 7, iv: 45 }, { strike: 46000, dte: 7, iv: 48 }, { strike: 48000, dte: 7, iv: 52 },
  { strike: 38000, dte: 30, iv: 40 }, { strike: 40000, dte: 30, iv: 42 }, { strike: 42000, dte: 30, iv: 44 },
  { strike: 44000, dte: 30, iv: 47 }, { strike: 46000, dte: 30, iv: 50 }, { strike: 48000, dte: 30, iv: 54 },
  { strike: 38000, dte: 90, iv: 43 }, { strike: 40000, dte: 90, iv: 45 }, { strike: 42000, dte: 90, iv: 47 },
  { strike: 44000, dte: 90, iv: 50 }, { strike: 46000, dte: 90, iv: 53 }, { strike: 48000, dte: 90, iv: 57 },
]

const STRIKES = [38000, 40000, 42000, 44000, 46000, 48000]
const DTES = [7, 30, 90]

function ivColor(iv) {
  if (iv < 42) return 'bg-accent-green/60'
  if (iv < 48) return 'bg-accent-yellow/60'
  if (iv < 54) return 'bg-accent-orange/60'
  return 'bg-accent-red/60'
}

function ivTextColor(iv) {
  if (iv < 42) return 'text-accent-green'
  if (iv < 48) return 'text-accent-yellow'
  if (iv < 54) return 'text-accent-orange'
  return 'text-accent-red'
}

const VolSurface = memo(function VolSurface({ currentPrice }) {
  const atmStrike = currentPrice ?? 44100

  const stats = useMemo(() => {
    const minIV = Math.min(...MOCK_VOL_SURFACE.map(p => p.iv))
    const maxIV = Math.max(...MOCK_VOL_SURFACE.map(p => p.iv))
    const avgIV = MOCK_VOL_SURFACE.reduce((s, p) => s + p.iv, 0) / MOCK_VOL_SURFACE.length
    const termStructure = DTES.map(dte => {
      const slice = MOCK_VOL_SURFACE.filter(p => p.dte === dte)
      return { dte, avgIV: slice.reduce((s, p) => s + p.iv, 0) / slice.length }
    })
    return { minIV, maxIV, avgIV, termStructure }
  }, [])

  const getCell = (strike, dte) => {
    return MOCK_VOL_SURFACE.find(p => p.strike === strike && p.dte === dte)
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Box size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Volatility Surface</span>
        </div>
        <span className="text-[10px] text-gray-600">ATM ${formatPriceShort(atmStrike)}</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1">
        <StatCard label="Min IV" value={`${stats.minIV}%`} color="text-accent-green" />
        <StatCard label="Avg IV" value={`${stats.avgIV.toFixed(1)}%`} color="text-gray-300" />
        <StatCard label="Max IV" value={`${stats.maxIV}%`} color="text-accent-red" />
      </div>

      {/* Vol surface grid */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <div className="flex items-center gap-1 mb-1">
          <Layers size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">IV Grid (Strike x DTE)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-[8px] text-gray-600 text-left p-1">Strike</th>
                {DTES.map(dte => (
                  <th key={dte} className="text-[8px] text-gray-600 text-center p-1">{dte}d</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STRIKES.map(strike => (
                <tr key={strike}>
                  <td className={`text-[9px] font-mono p-1 ${Math.abs(strike - atmStrike) < 1500 ? 'text-accent-yellow font-bold' : 'text-gray-400'}`}>
                    ${formatPriceShort(strike)}
                  </td>
                  {DTES.map(dte => {
                    const cell = getCell(strike, dte)
                    if (!cell) return <td key={dte} className="p-1" />
                    return (
                      <td key={dte} className="p-0.5">
                        <div className={`text-center text-[9px] font-mono rounded py-1 ${ivColor(cell.iv)} ${ivTextColor(cell.iv)}`}>
                          {cell.iv}%
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[8px] text-gray-600">
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-green/60" />Low IV</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-yellow/60" />Mid IV</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-red/60" />High IV</span>
        </div>
      </div>

      {/* Term structure */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="text-[10px] text-gray-600 uppercase mb-1">Term Structure (ATM)</div>
        <div className="flex items-end gap-2 h-12">
          {stats.termStructure.map(ts => (
            <div key={ts.dte} className="flex-1 flex flex-col items-center">
              <div className="w-full bg-accent-purple opacity-70" style={{ height: `${(ts.avgIV / 60) * 100}%` }} />
              <span className="text-[8px] text-gray-600 mt-0.5">{ts.dte}d</span>
              <span className="text-[8px] font-mono text-accent-purple">{ts.avgIV.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Skew note */}
      <WarningBanner icon={TrendingDown} color="text-accent-yellow">
        Vol skew: puts trading at premium (bearish skew)
      </WarningBanner>
    </div>
  )
})

function formatPriceShort(price) {
  if (price >= 1000) return (price / 1000).toFixed(0) + 'k'
  return price.toFixed(0)
}

export default VolSurface
