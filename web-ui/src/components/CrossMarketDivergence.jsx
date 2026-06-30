import { useMemo } from 'react'
import { Globe, AlertCircle, ArrowRight } from 'lucide-react'
import { calcRSI, calcSMA } from '../utils/indicators'

export default function CrossMarketDivergence({ candles, symbols, exchange }) {
  const data = useMemo(() => {
    if (!symbols || symbols.length < 2) return null

    // Collect price data for each symbol
    const symbolData = {}
    for (const sym of symbols) {
      const symCandles = candles
        .filter(c => c.exchange === exchange && c.symbol === sym)
        .slice(-30)
      if (symCandles.length < 10) continue
      const closes = symCandles.map(c => c.close)
      const rsi = calcRSI(closes, 14)
      const sma = calcSMA(closes, Math.min(20, closes.length))
      symbolData[sym] = {
        closes,
        lastPrice: closes[closes.length - 1],
        prevPrice: closes[closes.length - 2] || closes[0],
        change: closes.length > 1 ? ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100 : 0,
        change5: closes.length > 5 ? ((closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5]) * 100 : 0,
        rsi: rsi[rsi.length - 1] || 50,
        sma: sma[sma.length - 1] || closes[closes.length - 1],
        aboveSma: closes[closes.length - 1] > (sma[sma.length - 1] || 0),
      }
    }

    const symList = Object.keys(symbolData)
    if (symList.length < 2) return null

    // Find BTC/ETH as "market proxy"
    const btc = symbolData['BTC/USDT'] || symbolData['BTC/USDC']
    const eth = symbolData['ETH/USDT'] || symbolData['ETH/USDC']

    // Correlations (simplified: same-direction movement)
    const divergences = []
    const correlations = []

    for (let i = 0; i < symList.length; i++) {
      for (let j = i + 1; j < symList.length; j++) {
        const a = symbolData[symList[i]]
        const b = symbolData[symList[j]]
        const aDir = a.change > 0 ? 1 : a.change < 0 ? -1 : 0
        const bDir = b.change > 0 ? 1 : b.change < 0 ? -1 : 0
        const aDir5 = a.change5 > 0 ? 1 : a.change5 < 0 ? -1 : 0
        const bDir5 = b.change5 > 0 ? 1 : b.change5 < 0 ? -1 : 0

        const correlated = aDir === bDir
        const correlated5 = aDir5 === bDir5

        // Divergence: opposite directions
        if (!correlated && aDir !== 0 && bDir !== 0) {
          divergences.push({
            pair: `${symList[i].split('/')[0]} / ${symList[j].split('/')[0]}`,
            symA: symList[i], symB: symList[j],
            changeA: a.change, changeB: b.change,
            type: aDir > 0 ? 'A-up-B-down' : 'A-down-B-up',
          })
        }

        // Correlation strength
        const corrScore = (correlated ? 1 : 0) + (correlated5 ? 1 : 0) +
          (Math.abs(a.rsi - b.rsi) < 10 ? 1 : 0) + (a.aboveSma === b.aboveSma ? 1 : 0)
        correlations.push({
          pair: `${symList[i].split('/')[0]} / ${symList[j].split('/')[0]}`,
          symA: symList[i], symB: symList[j],
          score: corrScore / 4,
          sameDir: correlated,
        })
      }
    }

    // BTC dominance proxy: BTC vs alts
    const altSymbols = symList.filter(s => !s.includes('BTC'))
    let btcDominance = null
    if (btc) {
      const altChanges = altSymbols.map(s => symbolData[s].change)
      const avgAltChange = altChanges.length > 0 ? altChanges.reduce((s, v) => s + v, 0) / altChanges.length : 0
      btcDominance = {
        btcChange: btc.change,
        avgAltChange,
        btcOutperforming: btc.change > avgAltChange,
        spread: btc.change - avgAltChange,
      }
    }

    // ETH/BTC ratio
    let ethBtcRatio = null
    if (btc && eth) {
      const ratio = eth.lastPrice / btc.lastPrice
      const prevRatio = eth.prevPrice / btc.prevPrice
      ethBtcRatio = {
        current: ratio,
        change: ((ratio - prevRatio) / prevRatio) * 100,
        ethStronger: ratio > prevRatio,
      }
    }

    // Sort divergences by magnitude
    divergences.sort((a, b) => Math.abs(b.changeA - b.changeB) - Math.abs(a.changeA - a.changeB))
    const topDivergences = divergences.slice(0, 4)

    // Sort correlations
    correlations.sort((a, b) => b.score - a.score)
    const topCorrelations = correlations.slice(0, 4)

    return {
      symbolData, symList,
      topDivergences, topCorrelations,
      btcDominance, ethBtcRatio,
      totalDivergences: divergences.length,
    }
  }, [candles, symbols, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Globe size={12} className="text-accent-teal" />
          Cross-Market
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 2+ symbols</div>
      </div>
    )
  }

  const { symbolData, symList, topDivergences, btcDominance, ethBtcRatio, totalDivergences } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Globe size={12} className="text-accent-teal" />
        Cross-Market Divergence
      </div>

      {/* BTC dominance */}
      {btcDominance && (
        <div className="bg-bg-800 rounded px-2 py-1.5 mb-2">
          <div className="text-[8px] text-gray-600 mb-0.5">BTC vs Alts</div>
          <div className="flex items-center justify-between text-[9px]">
            <span className="font-mono text-accent-orange">BTC: {btcDominance.btcChange >= 0 ? '+' : ''}{btcDominance.btcChange.toFixed(2)}%</span>
            <span className="text-gray-600">vs</span>
            <span className="font-mono text-gray-400">Alts: {btcDominance.avgAltChange >= 0 ? '+' : ''}{btcDominance.avgAltChange.toFixed(2)}%</span>
          </div>
          <div className={'text-[8px] mt-0.5 ' + (btcDominance.btcOutperforming ? 'text-accent-orange' : 'text-accent-green')}>
            {btcDominance.btcOutperforming ? 'BTC dominance rising' : 'Alts outperforming BTC'}
            <span className="text-gray-600 ml-1">({btcDominance.spread >= 0 ? '+' : ''}{btcDominance.spread.toFixed(2)}%)</span>
          </div>
        </div>
      )}

      {/* ETH/BTC ratio */}
      {ethBtcRatio && (
        <div className="bg-bg-800 rounded px-2 py-1 mb-2 flex justify-between text-[8px]">
          <span className="text-gray-600">ETH/BTC ratio</span>
          <span className={'font-mono ' + (ethBtcRatio.ethStronger ? 'text-accent-green' : 'text-accent-red')}>
            {ethBtcRatio.change >= 0 ? '+' : ''}{ethBtcRatio.change.toFixed(3)}%
          </span>
        </div>
      )}

      {/* All symbols overview */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-1">Market Overview:</div>
        <div className="grid grid-cols-2 gap-0.5">
          {symList.slice(0, 8).map(sym => {
            const d = symbolData[sym]
            return (
              <div key={sym} className="flex items-center justify-between text-[7px] bg-bg-800 rounded px-1 py-0.5">
                <span className="text-gray-500 truncate">{sym.split('/')[0]}</span>
                <span className={'font-mono ' + (d.change >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                  {d.change >= 0 ? '+' : ''}{d.change.toFixed(2)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Divergences */}
      {topDivergences.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-bg-600">
          <div className="flex items-center gap-1 mb-1">
            <AlertCircle size={9} className="text-accent-yellow" />
            <span className="text-[8px] text-gray-600">Divergences ({totalDivergences}):</span>
          </div>
          <div className="space-y-0.5">
            {topDivergences.map((d, i) => (
              <div key={i} className="bg-bg-800 rounded px-1.5 py-0.5">
                <div className="flex items-center justify-between text-[8px]">
                  <span className="text-gray-400">{d.pair}</span>
                  <span className="text-accent-yellow">Divergent</span>
                </div>
                <div className="flex items-center gap-1 text-[7px] mt-0.5">
                  <span className={d.changeA >= 0 ? 'text-accent-green' : 'text-accent-red'}>
                    {d.changeA >= 0 ? '+' : ''}{d.changeA.toFixed(2)}%
                  </span>
                  <ArrowRight size={7} className="text-gray-700" />
                  <span className={d.changeB >= 0 ? 'text-accent-green' : 'text-accent-red'}>
                    {d.changeB >= 0 ? '+' : ''}{d.changeB.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Cross-market: BTC dominance, ETH/BTC ratio, pair divergences. Divergence = potential rotation.
      </div>
    </div>
  )
}
