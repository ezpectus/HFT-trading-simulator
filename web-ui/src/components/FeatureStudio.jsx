import { memo, useMemo, useState } from 'react'
import { FlaskConical, BarChart3 } from 'lucide-react'
import { StatCard } from '../utils/ui-helpers'
import { selectCandles } from '../utils/candles'

const CATEGORIES = ['All', 'Momentum', 'Trend', 'Volatility', 'Volume']

/** Feature definitions — each computed from the real candle window. */
const FEATURE_DEFS = [
  { name: 'rsi_14', category: 'Momentum', compute: (c) => rsi(c.map(x => x.close), 14), series: (c) => rsiSeries(c.map(x => x.close), 14) },
  { name: 'ema_cross_5_20', category: 'Trend', compute: (c) => emaLast(c, 5) - emaLast(c, 20), series: (c) => emaSeries(c.map(x => x.close), 5).map((v, i) => v - emaSeries(c.map(x => x.close), 20)[i]) },
  { name: 'mom_10', category: 'Momentum', compute: (c) => pct(c[c.length - 1].close, c[c.length - 11]?.close), series: (c) => momSeries(c, 10) },
  { name: 'volatility_20', category: 'Volatility', compute: (c) => realizedVol(c, 20), series: (c) => volSeries(c, 20) },
  { name: 'atr_14', category: 'Volatility', compute: (c) => atr(c, 14), series: (c) => atrSeries(c, 14) },
  { name: 'volume_ratio', category: 'Volume', compute: (c) => volumeRatio(c, 20), series: (c) => volRatioSeries(c, 20) },
  { name: 'macd_hist', category: 'Momentum', compute: (c) => macdHist(c.map(x => x.close)), series: (c) => macdSeries(c.map(x => x.close)) },
]

function emaSeries(closes, n) {
  const k = 2 / (n + 1), out = []
  let e = closes[0]
  for (const c of closes) { e = c * k + e * (1 - k); out.push(e) }
  return out
}
const emaLast = (c, n) => emaSeries(c.map(x => x.close), n).pop()
const pct = (a, b) => (b ? ((a - b) / b) * 100 : 0)
const momSeries = (c, n) => c.map((x, i) => (i < n ? 0 : pct(x.close, c[i - n].close)))
const returns = (c) => c.slice(1).map((x, i) => Math.log(x.close / c[i].close))
function realizedVol(c, n) {
  const r = returns(c).slice(-n)
  const m = r.reduce((a, v) => a + v, 0) / (r.length || 1)
  return Math.sqrt(r.reduce((a, v) => a + (v - m) ** 2, 0) / (r.length || 1)) * 100
}
const volSeries = (c, n) => c.map((_, i) => realizedVol(c.slice(0, i + 1), Math.min(n, i || 1)))
function rsiSeries(closes, n) {
  const out = [50]
  for (let i = 1; i < closes.length; i++) {
    const w = closes.slice(Math.max(0, i - n), i + 1)
    let g = 0, l = 0
    for (let j = 1; j < w.length; j++) { const d = w[j] - w[j - 1]; if (d > 0) g += d; else l -= d }
    out.push(l === 0 ? 100 : 100 - 100 / (1 + g / l))
  }
  return out
}
const rsi = (closes, n) => rsiSeries(closes, n).pop()
function atrSeries(c, n) {
  const out = []
  for (let i = 0; i < c.length; i++) {
    if (i === 0) { out.push(0); continue }
    const tr = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close))
    const w = Math.min(i, n)
    out.push((atrSeriesPrev(out, w) * (w - 1) + tr) / w)
  }
  return out
}
const atrSeriesPrev = (arr, _w) => arr[arr.length - 1] ?? 0
const atr = (c, n) => atrSeries(c, n).pop()
const volumeRatio = (c, n) => {
  const w = c.slice(-n)
  const avg = w.reduce((a, x) => a + (x.volume || 0), 0) / (w.length || 1)
  return avg > 0 ? (c[c.length - 1].volume || 0) / avg : 1
}
const volRatioSeries = (c, n) => c.map((_, i) => volumeRatio(c.slice(0, i + 1), n))
function macdSeries(closes) {
  const f = emaSeries(closes, 12), s = emaSeries(closes, 26)
  const macd = f.map((v, i) => v - s[i])
  const sig = emaSeries(macd, 9)
  return macd.map((v, i) => v - sig[i])
}
const macdHist = (closes) => macdSeries(closes).pop()

/** Correlation of feature value at t vs next-bar return — real predictive signal. */
function corrFwdRet(cds, series) {
  const r = returns(cds)
  const n = Math.min(r.length, series.length - 1)
  if (n < 15) return null
  const xs = series.slice(-n - 1, -1), ys = r.slice(-n)
  const mx = xs.reduce((a, v) => a + v, 0) / n, my = ys.reduce((a, v) => a + v, 0) / n
  let cov = 0, vx = 0, vy = 0
  for (let i = 0; i < n; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2 }
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0
}

function corrColor(v) {
  const a = Math.abs(v)
  if (a >= 0.15) return 'text-accent-green'
  if (a >= 0.08) return 'text-accent-yellow'
  return 'text-gray-500'
}

/**
 * Feature Studio — computes REAL indicator values on the streamed candle
 * window and their correlation with next-bar returns (a real, if crude,
 * predictive-power proxy). Toggle ON/OFF is local UI state.
 */
const FeatureStudio = memo(function FeatureStudio({ candles, symbol, exchange }) {
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState(null)
  const [disabled, setDisabled] = useState(new Set())

  const features = useMemo(() => {
    const cds = selectCandles(candles, exchange, symbol)
    if (!cds || cds.length < 30) return null
    return FEATURE_DEFS.map((f, i) => {
      const value = f.compute(cds)
      const corr = corrFwdRet(cds, f.series(cds))
      return { id: i, name: f.name, category: f.category, value, corr, n: cds.length }
    })
  }, [candles, exchange, symbol])

  const filtered = useMemo(
    () => (features || []).filter(f => category === 'All' || f.category === category),
    [features, category]
  )

  const stats = useMemo(() => {
    if (!features) return null
    const active = features.filter(f => !disabled.has(f.id))
    const corrs = active.map(f => f.corr).filter(v => v != null)
    return {
      active: active.length,
      total: features.length,
      avgCorr: corrs.length ? corrs.reduce((a, v) => a + Math.abs(v), 0) / corrs.length : 0,
      strong: corrs.filter(v => Math.abs(v) > 0.1).length,
    }
  }, [features, disabled])

  const toggle = (id) => setDisabled(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const fmt = (f) => f.name === 'volume_ratio' ? `${f.value.toFixed(2)}x`
    : f.name.startsWith('rsi') ? f.value.toFixed(0)
    : Math.abs(f.value) >= 100 ? f.value.toFixed(0)
    : f.value.toFixed(2)

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FlaskConical size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Feature Studio</span>
        </div>
        {stats && <span className="text-[10px] text-gray-600">{stats.active}/{stats.total} active</span>}
      </div>

      {!features ? (
        <div className="text-gray-500 text-[10px] p-2">Need ≥30 candles for {symbol ?? 'symbol'} — collecting stream data</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1">
            <StatCard label="Avg |Corr|" value={`${(stats.avgCorr * 100).toFixed(1)}%`} color="text-accent-green" compact />
            <StatCard label="Strong (>0.1)" value={stats.strong} color="text-accent-yellow" compact />
            <StatCard label="Window" value={`${features[0].n} bars`} color="text-gray-300" compact />
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                  category === cat ? 'bg-accent-blue/20 text-accent-blue' : 'bg-bg-700 text-gray-500 hover:text-gray-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div>
            <div className="flex items-center gap-1 mb-1">
              <BarChart3 size={11} className="text-gray-500" />
              <span className="text-[10px] text-gray-600 uppercase">Features (live values)</span>
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {filtered.map(f => (
                <div
                  key={f.id}
                  onClick={() => setSelected(selected === f.id ? null : f.id)}
                  className={`flex items-center gap-2 py-0.5 px-1.5 bg-bg-700 cursor-pointer hover:bg-bg-600 transition-colors ${selected === f.id ? 'ring-1 ring-accent-blue' : ''}`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); toggle(f.id) }}
                    className={`text-[8px] px-1 rounded w-10 text-center ${disabled.has(f.id) ? 'bg-bg-600 text-gray-600' : 'bg-accent-green/20 text-accent-green'}`}
                  >
                    {disabled.has(f.id) ? 'OFF' : 'ON'}
                  </button>
                  <span className="text-[10px] text-gray-300 font-mono flex-1 truncate">{f.name}</span>
                  <span className="text-[8px] text-gray-600 w-14 truncate">{f.category}</span>
                  <span className="text-[9px] font-mono w-12 text-right text-gray-300">{fmt(f)}</span>
                  <span className={`text-[9px] font-mono w-10 text-right ${f.corr != null ? corrColor(f.corr) : 'text-gray-600'}`}>
                    {f.corr != null ? f.corr.toFixed(2) : '—'}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
              <span>feature / value / corr vs next-bar return</span>
            </div>
          </div>

          <div className="text-[8px] text-gray-600 leading-relaxed pt-1 border-t border-bg-600">
            Corr = Pearson(feature_t, next-bar return) over the streamed window — a real
            univariate proxy, not trained-model importance.
          </div>
        </>
      )}
    </div>
  )
})

export default memo(FeatureStudio)
