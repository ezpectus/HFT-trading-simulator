import { memo, useMemo } from 'react'
import { Grid3x3, TrendingUp, TrendingDown } from 'lucide-react'
import { StatCard } from '../utils/ui-helpers'
import { groupCandles } from '../utils/candles'

function corrColor(corr) {
  if (corr >= 0.8) return 'text-accent-red bg-accent-red/20'
  if (corr >= 0.6) return 'text-accent-orange bg-accent-orange/15'
  if (corr >= 0.4) return 'text-accent-yellow bg-accent-yellow/10'
  if (corr >= 0.2) return 'text-gray-400 bg-bg-600'
  return 'text-accent-blue bg-accent-blue/10'
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 3) return 0
  const x = a.slice(-n), y = b.slice(-n)
  const mx = x.reduce((s, v) => s + v, 0) / n
  const my = y.reduce((s, v) => s + v, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my)
    dx += (x[i] - mx) ** 2
    dy += (y[i] - my) ** 2
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0
}

/**
 * Cross-Asset Matrix — real correlation computed from streamed candles
 * on the selected exchange. Window: last 60 closes per symbol.
 */
const CrossAssetMatrix = memo(function CrossAssetMatrix({ candles, symbols, exchange }) {
  const data = useMemo(() => {
    const bySym = groupCandles(candles, exchange)
    const syms = (symbols || []).filter(s => (bySym[s]?.length || 0) >= 10).slice(0, 8)
    if (syms.length < 2) return null

    const N = 60
    const rets = {}
    const assetStats = []
    for (const s of syms) {
      const closes = bySym[s].slice(-N - 1).map(c => c.close)
      const r = []
      for (let i = 1; i < closes.length; i++) r.push((closes[i] - closes[i - 1]) / closes[i - 1])
      rets[s] = r
      const totalRet = closes.length > 1 ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 : 0
      const mean = r.length ? r.reduce((a, v) => a + v, 0) / r.length : 0
      const vol = r.length > 1 ? Math.sqrt(r.reduce((a, v) => a + (v - mean) ** 2, 0) / (r.length - 1)) * 100 : 0
      const sharpe = vol > 0 ? (mean / vol) * Math.sqrt(r.length) : 0
      assetStats.push({ asset: s.replace('/USDT', ''), return: totalRet, vol, sharpe })
    }

    const corr = syms.map((a, i) => syms.map((b, j) => (i === j ? 1 : pearson(rets[a], rets[b]))))
    const labels = syms.map(s => s.replace('/USDT', ''))

    let highCorr = 0, lowCorr = 0, total = 0
    for (let i = 0; i < corr.length; i++) {
      for (let j = i + 1; j < corr.length; j++) {
        total++
        if (corr[i][j] >= 0.7) highCorr++
        if (corr[i][j] < 0.4) lowCorr++
      }
    }
    const avgReturn = assetStats.reduce((s, r) => s + r.return, 0) / assetStats.length
    const bestAsset = assetStats.reduce((m, r) => (r.return > m.return ? r : m), assetStats[0])
    const worstAsset = assetStats.reduce((m, r) => (r.return < m.return ? r : m), assetStats[0])
    return { labels, corr, assetStats, highCorr, lowCorr, total, avgReturn, bestAsset, worstAsset }
  }, [candles, symbols, exchange])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Grid3x3 size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Cross-Asset Matrix</span>
        </div>
        <span className="text-[10px] text-gray-600">{data ? `${data.labels.length} assets · ${exchange}` : 'waiting'}</span>
      </div>

      {!data ? (
        <div className="text-gray-500 text-[10px] p-2">Need ≥2 symbols with 10+ candles on {exchange} — waiting for data</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="High Corr" value={data.highCorr} color="text-accent-red" compact />
            <StatCard label="Low Corr" value={data.lowCorr} color="text-accent-green" compact />
            <StatCard label="Avg Return" value={`${data.avgReturn.toFixed(1)}%`} color="text-accent-green" compact />
            <StatCard label="Best" value={data.bestAsset.asset} color="text-accent-green" size="xs" compact />
          </div>

          {/* Correlation matrix */}
          <div className="p-2 bg-bg-700 border border-bg-600 rounded">
            <div className="text-[10px] text-gray-600 uppercase mb-1">Correlation Matrix (60 bars)</div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-[8px] text-gray-600 p-0.5"></th>
                    {data.labels.map(a => (
                      <th key={a} className="text-[7px] text-gray-600 text-center p-0.5">{a}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.corr.map((row, i) => (
                    <tr key={i}>
                      <td className="text-[7px] text-gray-500 p-0.5 font-mono">{data.labels[i]}</td>
                      {row.map((corr, j) => (
                        <td key={j} className="p-0.5">
                          <div className={`text-center text-[8px] font-mono rounded py-0.5 ${corrColor(corr)}`}>
                            {corr.toFixed(2)}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[7px] text-gray-600">
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-red/20" />&gt;0.8</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-orange/15" />&gt;0.6</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-yellow/10" />&gt;0.4</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-blue/10" />&lt;0.2</span>
            </div>
          </div>

          {/* Asset returns */}
          <div>
            <div className="text-[10px] text-gray-600 uppercase mb-1">Asset Performance (60 bars)</div>
            <div className="space-y-0.5">
              {data.assetStats.map(r => (
                <div key={r.asset} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
                  <span className="text-[10px] text-gray-300 w-12">{r.asset}</span>
                  <span className={`text-[9px] font-mono w-12 ${r.return >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {r.return >= 0 ? '+' : ''}{r.return.toFixed(1)}%
                  </span>
                  <span className="text-[9px] font-mono text-gray-400 w-12">{r.vol.toFixed(2)}%</span>
                  <span className={`text-[9px] font-mono w-10 ${r.sharpe >= 1.5 ? 'text-accent-green' : r.sharpe >= 1 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                    {r.sharpe.toFixed(2)}
                  </span>
                  {r.return >= 0 ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
              <span>Asset / Return / Vol / Sharpe</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(CrossAssetMatrix)
