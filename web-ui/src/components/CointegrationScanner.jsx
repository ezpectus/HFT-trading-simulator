import { memo, useMemo } from 'react'
import { Link2, GitCompare, AlertCircle } from 'lucide-react'
import { calcADF, calcHalfLife, linearRegression, calcCorrelation } from '../utils/cointegrationMath'

function CointegrationScanner({ candles, symbols, exchange }) {
  const pairs = useMemo(() => {
    if (!candles || candles.length < 50 || !symbols || symbols.length < 2) return []

    const results = []
    const minLen = 60

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const symA = symbols[i]
        const symB = symbols[j]

        const candlesA = candles
          .filter(c => c.exchange === exchange && c.symbol === symA)
          .slice(-minLen)
          .map(c => c.close)
        const candlesB = candles
          .filter(c => c.exchange === exchange && c.symbol === symB)
          .slice(-minLen)
          .map(c => c.close)

        if (candlesA.length < 30 || candlesB.length < 30) continue

        const n = Math.min(candlesA.length, candlesB.length)
        const closesA = candlesA.slice(-n)
        const closesB = candlesB.slice(-n)

        const correlation = calcCorrelation(closesA, closesB)

        const reg = linearRegression(closesA, closesB)
        if (!reg) continue

        const adf = calcADF(reg.residuals)
        if (!adf) continue

        const halfLife = calcHalfLife(reg.residuals)

        const spreadStd = reg.stdResidual
        const currentSpread = reg.residuals[reg.residuals.length - 1]
        const zScore = spreadStd > 0 ? currentSpread / spreadStd : 0

        let signal = 'neutral'
        if (adf.isStationary) {
          if (zScore > 2) signal = 'short_A_long_B'
          else if (zScore < -2) signal = 'long_A_short_B'
          else if (Math.abs(zScore) > 1) signal = 'watch'
        }

        results.push({
          symA, symB,
          correlation,
          beta: reg.beta,
          rSquared: reg.rSquared,
          adfTStat: adf.tStat,
          isCointegrated: adf.isStationary,
          significance: adf.significance,
          halfLife,
          zScore,
          currentSpread,
          spreadStd,
          signal,
          alpha: reg.alpha,
        })
      }
    }

    return results.sort((a, b) => {
      if (a.isCointegrated && !b.isCointegrated) return -1
      if (!a.isCointegrated && b.isCointegrated) return 1
      return Math.abs(b.zScore) - Math.abs(a.zScore)
    })
  }, [candles, symbols, exchange])

  const cointegratedPairs = pairs.filter(p => p.isCointegrated)
  const topSignal = pairs.find(p => p.signal !== 'neutral' && p.isCointegrated)

  if (pairs.length === 0) {
    return (
      <div className="bg-bg-700  p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <GitCompare size={12} className="text-accent-purple" />
          Cointegration Scanner
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 50+ candles for 2+ symbols</div>
      </div>
    )
  }

  return (
    <div className="bg-bg-700  p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <GitCompare size={12} className="text-accent-purple" />
        Cointegration Pairs Scanner
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800  px-1.5 py-0.5">
          <span className="text-gray-600">Pairs Tested</span>
          <div className="font-mono text-gray-400">{pairs.length}</div>
        </div>
        <div className="bg-bg-800  px-1.5 py-0.5">
          <span className="text-gray-600">Cointegrated</span>
          <div className={'font-mono ' + (cointegratedPairs.length > 0 ? 'text-accent-green' : 'text-gray-500')}>{cointegratedPairs.length}</div>
        </div>
        <div className="bg-bg-800  px-1.5 py-0.5">
          <span className="text-gray-600">Active Signal</span>
          <div className={'font-mono ' + (topSignal ? 'text-accent-yellow' : 'text-gray-500')}>{topSignal ? 'YES' : 'NONE'}</div>
        </div>
      </div>

      {/* Top signal alert */}
      {topSignal && (
        <div className="bg-accent-yellow/10 border border-accent-yellow/20  px-2 py-1 mb-2 flex items-center gap-1">
          <AlertCircle size={10} className="text-accent-yellow shrink-0" />
          <span className="text-[8px] text-accent-yellow">
            {topSignal.signal === 'short_A_long_B'
              ? `Short ${topSignal.symA} / Long ${topSignal.symB} (z=${topSignal.zScore.toFixed(2)})`
              : topSignal.signal === 'long_A_short_B'
              ? `Long ${topSignal.symA} / Short ${topSignal.symB} (z=${topSignal.zScore.toFixed(2)})`
              : `Watch ${topSignal.symA}/${topSignal.symB} (z=${topSignal.zScore.toFixed(2)})`}
          </span>
        </div>
      )}

      {/* Pairs table */}
      <div className="space-y-1">
        {pairs.slice(0, 6).map((p, i) => (
          <div key={i} className="bg-bg-800  px-2 py-1">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1">
                <Link2 size={9} className={p.isCointegrated ? 'text-accent-green' : 'text-gray-600'} />
                <span className="text-[9px] font-mono text-gray-300">{p.symA} / {p.symB}</span>
                {p.isCointegrated && (
                  <span className="text-[7px] bg-accent-green/10 text-accent-green  px-1">
                    {p.significance}
                  </span>
                )}
              </div>
              <span className={'text-[8px] font-mono ' + (
                p.signal === 'long_A_short_B' ? 'text-accent-green' :
                p.signal === 'short_A_long_B' ? 'text-accent-red' :
                p.signal === 'watch' ? 'text-accent-yellow' : 'text-gray-600'
              )}>
                z={p.zScore.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[7px] font-mono text-gray-500">
              <span>ρ={p.correlation.toFixed(2)}</span>
              <span>β={p.beta.toFixed(3)}</span>
              <span>R²={p.rSquared.toFixed(2)}</span>
              <span>HL={isFinite(p.halfLife) ? `${p.halfLife.toFixed(0)}d` : '∞'}</span>
            </div>
            <div className="text-[7px] font-mono text-gray-600 mt-0.5">
              ADF t={p.adfTStat.toFixed(2)} {p.isCointegrated ? '(stationary)' : '(not coint.)'}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1.5 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Engle-Granger 2-step: OLS regression → ADF test on residuals. Stationary residuals = cointegrated pair. Z-score on spread for entry/exit signals.
      </div>
    </div>
  )
}

export default memo(CointegrationScanner)
