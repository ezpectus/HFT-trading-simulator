import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Layers, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { StatCard } from '../utils/ui-helpers'
import { selectCandles } from '../utils/candles'

// Standard normal CDF (Abramowitz–Stegun 7.1.26)
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const p = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const cdf = 1 - Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) * p
  return x >= 0 ? cdf : 1 - cdf
}
const normPdf = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)

function bs(S, K, T, sigma, r = 0) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return null
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)
  const disc = Math.exp(-r * T)
  return {
    call: S * normCdf(d1) - K * disc * normCdf(d2),
    put: K * disc * normCdf(-d2) - S * normCdf(-d1),
    callDelta: normCdf(d1),
    putDelta: normCdf(d1) - 1,
    gamma: normPdf(d1) / (S * sigma * Math.sqrt(T)),
    callTheta: (-(S * normPdf(d1) * sigma) / (2 * Math.sqrt(T)) - r * K * disc * normCdf(d2)) / 365,
    putTheta: (-(S * normPdf(d1) * sigma) / (2 * Math.sqrt(T)) + r * K * disc * normCdf(-d2)) / 365,
  }
}

const STRIKE_STEPS = [-5, -3, -1.5, 0, 1.5, 3, 5] // % around spot
const T_DAYS = 30

function moneynessColor(strike, currentPrice, isCall) {
  const diff = isCall ? strike - currentPrice : currentPrice - strike
  if (diff < 0) return 'text-accent-green'
  if (diff === 0) return 'text-accent-yellow'
  return 'text-gray-400'
}

/**
 * Options Chain — server-side Black-Scholes chain with greeks from the
 * exchange simulator (`options_chain` WS request). Falls back to a
 * client-side BS estimate at realized vol when the endpoint is absent.
 * Volume/OI require an options feed and are intentionally not shown.
 */
const OptionsChain = memo(function OptionsChain({ currentPrice, candles, exchange, symbol, optionsChain, requestOptionsChain }) {
  const [selected, setSelected] = useState(null)
  const requestedSymbolRef = useRef(null)

  // Request the real chain from the simulator; refresh on a slow poll.
  useEffect(() => {
    if (!requestOptionsChain || !symbol) return
    const strikes = STRIKE_STEPS.map(k => currentPrice ? currentPrice * (1 + k / 100) : 0).filter(s => s > 0)
    if (!strikes.length) return
    requestOptionsChain(symbol, strikes, [T_DAYS / 365])
    requestedSymbolRef.current = symbol
    const t = setInterval(() => requestOptionsChain(symbol, strikes, [T_DAYS / 365]), 5000)
    return () => clearInterval(t)
  }, [requestOptionsChain, symbol, currentPrice])

  const serverData = useMemo(() => {
    if (!optionsChain || optionsChain.symbol !== symbol || !optionsChain.chain?.length) return null
    const expiry = T_DAYS / 365
    const rows = []
    for (const k of STRIKE_STEPS) {
      const strike = optionsChain.underlying_price * (1 + k / 100)
      const call = optionsChain.chain.find(q => q.type === 'call' && Math.abs(q.strike - strike) / strike < 0.001)
      const put = optionsChain.chain.find(q => q.type === 'put' && Math.abs(q.strike - strike) / strike < 0.001)
      if (call || put) {
        rows.push({
          strike,
          call: call?.price, put: put?.price,
          callDelta: call?.delta, putDelta: put?.delta,
          gamma: call?.gamma ?? put?.gamma,
          callTheta: call?.theta, putTheta: put?.theta,
        })
      }
    }
    if (!rows.length) return null
    const atm = rows[Math.floor(rows.length / 2)]
    return {
      spot: optionsChain.underlying_price,
      sigma: optionsChain.volatility,
      rows, atm,
      expectedMove: optionsChain.underlying_price * optionsChain.volatility * Math.sqrt(expiry),
      source: 'server',
    }
  }, [optionsChain, symbol])

  const data = useMemo(() => {
    const cs = selectCandles(candles, exchange, symbol)
    const spot = currentPrice ?? cs[cs.length - 1]?.close
    if (!spot || cs.length < 12) return null

    const rets = []
    for (let i = 1; i < cs.length; i++) rets.push(Math.log(cs[i].close / cs[i - 1].close))
    const mean = rets.reduce((s, r) => s + r, 0) / rets.length
    const sd = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length)
    const diffs = cs.slice(1).map((c, i) => c.timestamp - cs[i].timestamp).sort((a, b) => a - b)
    const interval = diffs[Math.floor(diffs.length / 2)] || 60
    const ppy = (365 * 24 * 3600) / interval
    const sigma = Math.min(2, Math.max(0.05, sd * Math.sqrt(ppy)))
    const T = T_DAYS / 365

    const rows = STRIKE_STEPS.map(k => {
      const strike = spot * (1 + k / 100)
      const g = bs(spot, strike, T, sigma)
      return { strike, ...g }
    }).filter(r => r.call != null)

    const atm = rows[Math.floor(rows.length / 2)]
    return { spot, sigma, rows, expectedMove: spot * sigma * Math.sqrt(T), atm, source: 'client' }
  }, [candles, currentPrice, exchange, symbol])

  const display = serverData ?? data

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Options Chain</span>
        </div>
        <span className="text-[10px] text-gray-600">{symbol ?? ''} @ ${formatPrice(display?.spot ?? 0, 0)}</span>
      </div>

      {!display ? (
        <div className="text-gray-500 text-[10px] p-2">Waiting for options chain from simulator (falls back to candle-based estimate)</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label={display.source === 'server' ? 'Sim σ' : 'Realized σ'} value={`${(display.sigma * 100).toFixed(0)}%`} color="text-accent-yellow" size="xs" compact />
            <StatCard label={`ATM Call ${T_DAYS}d`} value={`$${formatPrice(display.atm.call, 0)}`} color="text-accent-green" size="xs" compact />
            <StatCard label={`ATM Put ${T_DAYS}d`} value={`$${formatPrice(display.atm.put, 0)}`} color="text-accent-red" size="xs" compact />
            <StatCard label="Exp. Move" value={`±$${formatPrice(display.expectedMove, 0)}`} color="text-gray-300" size="xs" compact />
          </div>

          {/* Chain table */}
          <div className="bg-bg-900 border border-bg-600 rounded overflow-hidden">
            <div className="grid grid-cols-2 text-[9px] text-gray-600 uppercase py-1 px-2 border-b border-bg-600">
              <span className="flex items-center gap-1"><TrendingUp size={9} className="text-accent-green" />Calls (theo)</span>
              <span className="flex items-center gap-1 justify-end">Puts (theo)<TrendingDown size={9} className="text-accent-red" /></span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {display.rows.map((row) => {
                const isATM = Math.abs(row.strike - display.spot) / display.spot < 0.01
                return (
                  <div
                    key={row.strike}
                    onClick={() => setSelected(row.strike)}
                    className={`grid grid-cols-2 py-0.5 px-2 border-b border-bg-800 cursor-pointer hover:bg-bg-800 ${isATM ? 'bg-accent-yellow/5' : ''} ${selected === row.strike ? 'ring-1 ring-accent-blue' : ''}`}
                  >
                    {/* Call side */}
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-mono w-10 ${moneynessColor(row.strike, display.spot, true)}`}>
                        ${formatPrice(row.strike, 0)}
                      </span>
                      <span className="text-[9px] font-mono text-gray-400 w-8">{row.callDelta.toFixed(2)}Δ</span>
                      <span className="text-[9px] font-mono text-accent-green w-12">${formatPrice(row.call, 0)}</span>
                    </div>
                    {/* Put side */}
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-[9px] font-mono text-accent-red w-12 text-right">${formatPrice(row.put, 0)}</span>
                      <span className="text-[9px] font-mono text-gray-400 w-8 text-right">{row.putDelta.toFixed(2)}Δ</span>
                      <span className={`text-[9px] font-mono w-10 text-right ${moneynessColor(row.strike, display.spot, false)}`}>
                        ${formatPrice(row.strike, 0)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected option details */}
          {selected && (() => {
            const row = display.rows.find(r => r.strike === selected)
            return row ? (
              <div className="p-2 bg-bg-700 border border-bg-600 rounded">
                <div className="text-[10px] text-gray-600 uppercase mb-1">Strike ${formatPrice(selected, 0)} — BS greeks</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[9px] text-accent-green mb-0.5">Call</div>
                    <div className="text-[9px] text-gray-400">Delta: {row.callDelta.toFixed(3)}</div>
                    <div className="text-[9px] text-gray-400">Gamma: {row.gamma.toFixed(5)}</div>
                    <div className="text-[9px] text-gray-400">Theta/d: {row.callTheta.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-accent-red mb-0.5">Put</div>
                    <div className="text-[9px] text-gray-400">Delta: {row.putDelta.toFixed(3)}</div>
                    <div className="text-[9px] text-gray-400">Gamma: {row.gamma.toFixed(5)}</div>
                    <div className="text-[9px] text-gray-400">Theta/d: {row.putTheta.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ) : null
          })()}

          <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
            <span className="flex items-center gap-1">
              <DollarSign size={9} />
              BS @ server vol
            </span>
            <span>{display?.source === 'server' ? 'Server chain (sim vol)' : 'Client estimate (realized vol)'}</span>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(OptionsChain)
