import { memo, useState, useEffect, useRef, useMemo } from 'react'
import { PieChart, RefreshCw, Scale } from 'lucide-react'
import { selectCandles } from '../utils/candles'
import { NoDataFeed } from '../utils/ui-helpers'

const RESPONSE_TIMEOUT_MS = 30000
const MAX_CANDLES_SENT = 500
const MAX_ASSETS = 8

// Method ids must match src/communication/portfolio_requests.py _METHODS.
// black_litterman is API-only — it needs per-investor views which this
// panel doesn't collect.
const METHODS = [
  { id: 'max_sharpe', name: 'Max Sharpe' },
  { id: 'min_variance', name: 'Min Variance' },
  { id: 'risk_parity', name: 'Risk Parity' },
]

// Current weights from real positions: |qty| * last price / equity.
function positionWeights(accounts, prices, exchange, symbols) {
  const acc = accounts?.[exchange]
  if (!acc) return null
  const equity = acc.equity || acc.balance || 0
  if (equity <= 0) return null
  const notionals = symbols.map(() => 0)
  for (const p of acc.positions || []) {
    const i = symbols.indexOf(p.symbol)
    if (i < 0) continue
    const px = prices?.[exchange]?.[p.symbol] || p.current_price || p.entry_price || 0
    notionals[i] = Math.abs(p.quantity || 0) * px
  }
  const total = notionals.reduce((s, v) => s + v, 0)
  if (total <= 0) return null
  return { weights: notionals.map(v => v / equity), equity }
}

const PortfolioOptLab = memo(function PortfolioOptLab({ sendSignalMessage, portfolioResult, connected, candles, symbols, exchange, accounts, prices }) {
  const [method, setMethod] = useState('max_sharpe')
  const [selected, setSelected] = useState(null) // null = auto top-4
  const [withRebalance, setWithRebalance] = useState(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState(null)
  const timeoutRef = useRef(null)

  // Symbols with enough candles on this exchange to produce returns.
  const eligible = useMemo(() => {
    const counts = (symbols || []).map(sym => ({
      sym, n: selectCandles(candles, exchange, sym).length,
    })).filter(e => e.n >= 30)
    counts.sort((a, b) => b.n - a.n)
    return counts.map(e => e.sym)
  }, [symbols, candles, exchange])

  const chosen = selected ?? eligible.slice(0, 4)

  useEffect(() => {
    if (!pending || !portfolioResult || portfolioResult.type !== 'portfolio_result') return
    clearTimeout(timeoutRef.current)
    setResult(portfolioResult)
    setPending(false)
  }, [portfolioResult, pending])

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const toggleAsset = (sym) => {
    const next = new Set(chosen)
    if (next.has(sym)) next.delete(sym); else if (next.size < MAX_ASSETS) next.add(sym)
    setSelected([...next])
  }

  const runOptimize = () => {
    if (!sendSignalMessage || pending || chosen.length < 2) return
    const assets = chosen.map(sym => ({
      symbol: sym,
      candles_data: selectCandles(candles, exchange, sym).slice(-MAX_CANDLES_SENT),
    }))
    const msg = { type: 'optimize_portfolio', method, assets }
    if (withRebalance) {
      const cur = positionWeights(accounts, prices, exchange, chosen)
      if (cur) {
        msg.current_weights = cur.weights
        msg.portfolio_value = cur.equity
      }
    }
    setResult(null)
    setPending(true)
    timeoutRef.current = setTimeout(() => {
      setPending(prev => {
        if (prev) setResult({ error: 'timeout — no portfolio_result in 30s' })
        return false
      })
    }, RESPONSE_TIMEOUT_MS)
    sendSignalMessage(msg)
  }

  const weightEntries = result?.weights
    ? Object.entries(result.weights).sort((a, b) => b[1] - a[1])
    : null

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center gap-1.5">
        <PieChart size={14} className="text-accent-blue" />
        <span className="text-sm font-medium">Portfolio Optimization Lab</span>
      </div>

      {!connected && <NoDataFeed feed="signal server" />}

      <div className="flex gap-1">
        {METHODS.map(m => (
          <button
            key={m.id}
            onClick={() => setMethod(m.id)}
            className={`flex-1 py-0.5 text-[9px]  ${method === m.id ? 'bg-accent-blue/30 text-accent-blue' : 'bg-bg-700 text-gray-500 hover:text-gray-300'}`}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div>
        <div className="text-[8px] text-gray-600 uppercase mb-1">Assets ({chosen.length}/{MAX_ASSETS})</div>
        <div className="flex flex-wrap gap-1">
          {eligible.slice(0, 12).map(sym => (
            <button
              key={sym}
              onClick={() => toggleAsset(sym)}
              className={`px-1.5 py-0.5 text-[9px] font-mono  ${chosen.includes(sym) ? 'bg-accent-blue/30 text-accent-blue' : 'bg-bg-700 text-gray-500'}`}
            >
              {sym.split('/')[0]}
            </button>
          ))}
          {eligible.length === 0 && (
            <span className="text-[9px] text-gray-600 italic">waiting for candles…</span>
          )}
        </div>
      </div>

      <label className="flex items-center gap-1.5 cursor-pointer text-[9px] text-gray-400">
        <input type="checkbox" checked={withRebalance} onChange={e => setWithRebalance(e.target.checked)} className="w-3 h-3 accent-accent-blue" />
        Include rebalance plan from current positions
      </label>

      <button
        onClick={runOptimize}
        disabled={pending || !connected || chosen.length < 2}
        className="w-full flex items-center justify-center gap-1 py-1 text-[10px]  bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 disabled:opacity-50"
      >
        {pending ? <RefreshCw size={10} className="animate-spin" /> : <Scale size={10} />}
        {pending ? 'Optimizing…' : `Optimize (${chosen.length} assets)`}
      </button>

      {result?.error && (
        <div className="text-[9px] text-accent-red">Error: {result.error}</div>
      )}

      {weightEntries && (
        <div className="border-t border-bg-600 pt-2 space-y-1">
          <div className="text-[8px] text-gray-600 uppercase">Optimal Weights · {result.method}</div>
          {weightEntries.map(([sym, w]) => (
            <div key={sym} className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono w-12 text-gray-400">{sym.split('/')[0]}</span>
              <div className="flex-1 h-2.5 bg-bg-700 ">
                <div className="h-full bg-accent-blue/70" style={{ width: `${Math.min(w * 100, 100)}%` }} />
              </div>
              <span className="text-[9px] font-mono text-gray-300 w-12 text-right">{(w * 100).toFixed(1)}%</span>
            </div>
          ))}
          <div className="flex gap-3 text-[8px] text-gray-500 pt-1 font-mono">
            <span>E[r] {(result.expected_return * 100).toFixed(3)}%</span>
            <span>σ {(result.volatility * 100).toFixed(3)}%</span>
            <span>Sharpe {result.sharpe_ratio?.toFixed(2)}</span>
            <span>n={result.n_periods}</span>
          </div>
          {result.risk_contributions && (
            <div className="text-[8px] text-gray-500 font-mono">
              RC: {Object.entries(result.risk_contributions).map(([s, p]) => `${s.split('/')[0]} ${(p * 100).toFixed(0)}%`).join(' · ')}
            </div>
          )}
          {result.rebalance && (
            <div className="pt-1 border-t border-bg-600/50">
              <div className="text-[8px] text-gray-600 uppercase mb-0.5">
                Rebalance — turnover {(result.rebalance.turnover * 100).toFixed(1)}% · est. cost ${result.rebalance.estimated_cost}
              </div>
              {result.rebalance.orders.length === 0 ? (
                <div className="text-[8px] text-gray-600 italic">already at target weights</div>
              ) : result.rebalance.orders.map((o, i) => (
                <div key={i} className="text-[8px] font-mono text-gray-400">
                  {o.side} {o.symbol} ${o.trade_amount} ({(o.current_weight * 100).toFixed(1)}% → {(o.target_weight * 100).toFixed(1)}%)
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default PortfolioOptLab
