import { memo, useMemo } from 'react'
import { TrendingUp, Activity, BarChart3 } from 'lucide-react'
import { calcLogReturns, calcGARCH, calcEWMAVol, calcParkinsonVol } from '../utils/garchMath'

function GARCHVolatility({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-120)
    if (symCandles.length < 35) return null

    const closes = symCandles.map(c => c.close)
    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const returns = calcLogReturns(closes)

    const garch = calcGARCH(returns)
    const ewma = calcEWMAVol(returns, 0.94)
    const ewmaShort = calcEWMAVol(returns, 0.9)
    const parkinson = calcParkinsonVol(highs, lows, 20)

    if (!garch || !ewma || !parkinson) return null

    const garchSlice = garch.volSeries.slice(-60)
    const ewmaSlice = ewma.volSeries.slice(-60)
    const parkSlice = parkinson.volSeries.slice(-60)

    const allVols = [...garchSlice, ...ewmaSlice, ...parkSlice].filter(v => !isNaN(v) && v > 0)
    const minVol = Math.min(...allVols) * 0.9
    const maxVol = Math.max(...allVols) * 1.1
    const volRange = maxVol - minVol || 1

    const volRegime = garch.currentVol < minVol + volRange * 0.33 ? 'LOW' :
                      garch.currentVol > minVol + volRange * 0.66 ? 'HIGH' : 'MEDIUM'

    const volChange = garch.forecastVol - garch.currentVol
    const volTrend = volChange > 0.5 ? 'RISING' : volChange < -0.5 ? 'FALLING' : 'STABLE'

    const n = Math.min(garchSlice.length, ewmaSlice.length, parkSlice.length)

    return {
      garch, ewma, ewmaShort, parkinson,
      garchSlice, ewmaSlice, parkSlice,
      minVol, maxVol, volRange,
      volRegime, volTrend, volChange,
      n, lastPrice: closes[closes.length - 1],
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700  p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <BarChart3 size={12} className="text-accent-orange" />
          GARCH Volatility
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 35+ candles</div>
      </div>
    )
  }

  const { garch, ewma, parkinson, garchSlice, ewmaSlice, parkSlice, minVol, volRange, volRegime, volTrend, n } = data

  const toY = (v) => 100 - ((v - minVol) / volRange) * 85 - 7.5
  const toX = (i) => (i / Math.max(n - 1, 1)) * 100

  const garchPath = garchSlice.slice(-n).map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')
  const ewmaPath = ewmaSlice.slice(-n).map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')
  const parkPath = parkSlice.slice(-n).map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')

  const regimeColor = volRegime === 'LOW' ? 'text-accent-green' : volRegime === 'HIGH' ? 'text-accent-red' : 'text-accent-yellow'
  const trendColor = volTrend === 'RISING' ? 'text-accent-red' : volTrend === 'FALLING' ? 'text-accent-green' : 'text-gray-400'

  return (
    <div className="bg-bg-700  p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <BarChart3 size={12} className="text-accent-orange" />
        GARCH(1,1) Volatility Forecaster
      </div>

      {/* Model parameters */}
      <div className="grid grid-cols-4 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800  px-1.5 py-0.5">
          <span className="text-gray-600">α (ARCH)</span>
          <div className="font-mono text-gray-400">{garch.alpha.toFixed(4)}</div>
        </div>
        <div className="bg-bg-800  px-1.5 py-0.5">
          <span className="text-gray-600">β (GARCH)</span>
          <div className="font-mono text-gray-400">{garch.beta.toFixed(4)}</div>
        </div>
        <div className="bg-bg-800  px-1.5 py-0.5">
          <span className="text-gray-600">Persist.</span>
          <div className="font-mono text-gray-400">{garch.persistence.toFixed(3)}</div>
        </div>
        <div className="bg-bg-800  px-1.5 py-0.5">
          <span className="text-gray-600">Half-life</span>
          <div className="font-mono text-gray-400">{isFinite(garch.halfLife) ? garch.halfLife.toFixed(1) + 'd' : '∞'}</div>
        </div>
      </div>

      {/* Volatility estimates */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800  px-1.5 py-0.5">
          <span className="text-gray-600 flex items-center gap-0.5"><TrendingUp size={7} /> GARCH Forecast</span>
          <div className="font-mono text-accent-orange">{garch.forecastVol.toFixed(2)}%</div>
        </div>
        <div className="bg-bg-800  px-1.5 py-0.5">
          <span className="text-gray-600">EWMA (λ=0.94)</span>
          <div className="font-mono text-accent-blue">{ewma.currentVol.toFixed(2)}%</div>
        </div>
        <div className="bg-bg-800  px-1.5 py-0.5">
          <span className="text-gray-600">Parkinson (H/L)</span>
          <div className="font-mono text-accent-teal">{parkinson.currentVol.toFixed(2)}%</div>
        </div>
      </div>

      {/* Regime + trend */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[8px]">
          <span className="text-gray-600">Regime:</span>
          <span className={'font-bold ' + regimeColor}>{volRegime}</span>
        </div>
        <div className="flex items-center gap-2 text-[8px]">
          <span className="text-gray-600">Trend:</span>
          <span className={'font-bold ' + trendColor}>{volTrend}</span>
        </div>
        <div className="flex items-center gap-2 text-[8px]">
          <span className="text-gray-600">Uncond. Vol:</span>
          <span className="font-mono text-gray-400">{(Math.sqrt(garch.unconditionalVar) * Math.sqrt(252) * 100).toFixed(2)}%</span>
        </div>
      </div>

      {/* Chart */}
      <div className="pt-1.5 border-t border-bg-600">
        <div className="text-[8px] text-gray-600 mb-0.5 flex items-center gap-0.5"><Activity size={7} /> Volatility Comparison (annualized %):</div>
        <svg viewBox="0 0 100 100" className="w-full h-[100px]">
          <line x1={0} y1={toY(minVol + volRange * 0.33)} x2={100} y2={toY(minVol + volRange * 0.33)} stroke="#1e2530" strokeWidth={0.3} strokeDasharray="2,1" />
          <line x1={0} y1={toY(minVol + volRange * 0.66)} x2={100} y2={toY(minVol + volRange * 0.66)} stroke="#1e2530" strokeWidth={0.3} strokeDasharray="2,1" />
          <path d={parkPath} fill="none" stroke="#14b8a6" strokeWidth={0.8} opacity={0.6} />
          <path d={ewmaPath} fill="none" stroke="#3b82f6" strokeWidth={0.8} opacity={0.7} />
          <path d={garchPath} fill="none" stroke="#f97316" strokeWidth={1.2} />
        </svg>
        <div className="flex justify-between text-[7px] mt-0.5">
          <span className="text-accent-orange">━ GARCH</span>
          <span className="text-accent-blue">━ EWMA</span>
          <span className="text-accent-teal">━ Parkinson</span>
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        GARCH(1,1): ω={garch.omega.toFixed(6)}, α+β={garch.persistence.toFixed(3)} {garch.persistence < 1 ? '(stationary)' : '(non-stationary!)'}. Forecast: {garch.forecastVol.toFixed(2)}% annualized vol.
      </div>
    </div>
  )
}

export default memo(GARCHVolatility)
