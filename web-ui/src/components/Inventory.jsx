import { memo, useMemo } from 'react'
import { TrendingUp, TrendingDown, AlertTriangle, Boxes } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'
import { pnlColor, sideColor } from '../utils/ui-helpers'

const MOCK_INVENTORY = [
  { symbol: 'BTC/USDT', side: 'LONG', qty: 0.5, avgPrice: 43250, currentPrice: 44100, pnl: 425, pnlPct: 1.96, weight: 35.2 },
  { symbol: 'ETH/USDT', side: 'LONG', qty: 12.0, avgPrice: 2280, currentPrice: 2315, pnl: 420, pnlPct: 1.54, weight: 28.1 },
  { symbol: 'SOL/USDT', side: 'SHORT', qty: 50, avgPrice: 98.5, currentPrice: 96.2, pnl: 115, pnlPct: 2.33, weight: 12.5 },
  { symbol: 'AVAX/USDT', side: 'LONG', qty: 80, avgPrice: 35.2, currentPrice: 34.1, pnl: -88, pnlPct: -3.12, weight: 8.3 },
  { symbol: 'LINK/USDT', side: 'LONG', qty: 150, avgPrice: 14.8, currentPrice: 15.1, pnl: 45, pnlPct: 2.03, weight: 6.7 },
  { symbol: 'DOT/USDT', side: 'SHORT', qty: 200, avgPrice: 7.2, currentPrice: 7.05, pnl: 30, pnlPct: 2.08, weight: 4.2 },
  { symbol: 'MATIC/USDT', side: 'LONG', qty: 5000, avgPrice: 0.82, currentPrice: 0.79, pnl: -150, pnlPct: -3.66, weight: 3.5 },
  { symbol: 'ATOM/USDT', side: 'LONG', qty: 120, avgPrice: 9.1, currentPrice: 9.3, pnl: 24, pnlPct: 2.20, weight: 1.5 },
]

const Inventory = memo(function Inventory() {
  const portfolio = useMemo(() => {
    const totalPnl = MOCK_INVENTORY.reduce((s, p) => s + p.pnl, 0)
    const totalValue = MOCK_INVENTORY.reduce((s, p) => s + p.qty * p.currentPrice, 0)
    const longs = MOCK_INVENTORY.filter(p => p.side === 'LONG')
    const shorts = MOCK_INVENTORY.filter(p => p.side === 'SHORT')
    const longExposure = longs.reduce((s, p) => s + p.qty * p.currentPrice, 0)
    const shortExposure = shorts.reduce((s, p) => s + p.qty * p.currentPrice, 0)
    const grossExposure = longExposure + shortExposure
    const netExposure = longExposure - shortExposure
    const losers = MOCK_INVENTORY.filter(p => p.pnl < 0).length
    const winners = MOCK_INVENTORY.filter(p => p.pnl >= 0).length
    return {
      totalPnl, totalValue, longExposure, shortExposure, grossExposure, netExposure,
      losers, winners, longCount: longs.length, shortCount: shorts.length,
    }
  }, [])

  const concentrated = MOCK_INVENTORY.filter(p => p.weight > 25).length > 0

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Boxes size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Inventory Manager</span>
        </div>
        <span className="text-[10px] text-gray-600">{MOCK_INVENTORY.length} positions</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-1">
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Total PnL</div>
          <span className={`text-[11px] font-mono font-bold ${pnlColor(portfolio.totalPnl)}`}>
            ${portfolio.totalPnl >= 0 ? '+' : ''}{portfolio.totalPnl.toFixed(0)}
          </span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Gross Exp</div>
          <span className="text-[11px] font-mono text-gray-300">
            ${formatVolume(portfolio.grossExposure)}
          </span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Net Exp</div>
          <span className={`text-[11px] font-mono ${pnlColor(portfolio.netExposure)}`}>
            ${formatVolume(portfolio.netExposure)}
          </span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Win/Loss</div>
          <span className="text-[11px] font-mono">
            <span className="text-accent-green">{portfolio.winners}</span>
            <span className="text-gray-600">/</span>
            <span className="text-accent-red">{portfolio.losers}</span>
          </span>
        </div>
      </div>

      {/* Long/Short bar */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex justify-between text-[9px] text-gray-600 mb-1">
          <span>Long ({portfolio.longCount})</span>
          <span>Short ({portfolio.shortCount})</span>
        </div>
        <div className="flex h-3 rounded overflow-hidden">
          <div className="bg-accent-green flex items-center justify-center" style={{ width: `${(portfolio.longExposure / portfolio.grossExposure) * 100}%` }}>
            <span className="text-[8px] text-white">{((portfolio.longExposure / portfolio.grossExposure) * 100).toFixed(0)}%</span>
          </div>
          <div className="bg-accent-red flex items-center justify-center" style={{ width: `${(portfolio.shortExposure / portfolio.grossExposure) * 100}%` }}>
            <span className="text-[8px] text-white">{((portfolio.shortExposure / portfolio.grossExposure) * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Position table */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Positions</div>
        <div className="space-y-0.5">
          {MOCK_INVENTORY.map(pos => (
            <div key={pos.symbol} className="flex items-center gap-1.5 py-1 px-1.5 bg-bg-700">
              <div className="flex items-center gap-1 w-20 shrink-0">
                {pos.side === 'LONG' ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
                <span className="text-[10px] text-gray-300 truncate">{pos.symbol.replace('/USDT', '')}</span>
              </div>
              <span className={`text-[9px] w-8 ${sideColor(pos.side)}`}>{pos.side}</span>
              <span className="text-[10px] font-mono text-gray-400 w-14 text-right">{pos.qty}</span>
              <span className="text-[10px] font-mono text-gray-500 w-16 text-right">${formatPrice(pos.currentPrice)}</span>
              <span className={`text-[10px] font-mono w-14 text-right ${pnlColor(pos.pnl)}`}>
                {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(0)}
              </span>
              <div className="w-12 flex items-center justify-end">
                <div className="w-8 h-1.5 bg-bg-600 rounded overflow-hidden">
                  <div
                    className={`h-full ${pos.weight > 25 ? 'bg-accent-red' : pos.weight > 15 ? 'bg-accent-yellow' : 'bg-accent-blue'}`}
                    style={{ width: `${Math.min(pos.weight * 2, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Concentration warning */}
      {concentrated && (
        <div className="flex items-center gap-1.5 p-1.5 bg-accent-yellow/10 border border-accent-yellow/30">
          <AlertTriangle size={11} className="text-accent-yellow" />
          <span className="text-[10px] text-accent-yellow">
            High concentration: position {'>'} 25% of portfolio
          </span>
        </div>
      )}

      {/* Footer stats */}
      <div className="flex justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span>Portfolio Value: ${formatVolume(portfolio.totalValue)}</span>
        <span>Avg Win: ${(portfolio.totalPnl / portfolio.winners).toFixed(0)}</span>
      </div>
    </div>
  )
})

export default Inventory
