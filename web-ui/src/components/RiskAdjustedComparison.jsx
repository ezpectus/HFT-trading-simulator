import { useMemo } from 'react'
import { Award, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { calcAggregateMetrics, buildEquityCurve, calcDrawdown, calcSharpeRatio, calcSortinoRatio } from '../utils/performance'

export default function RiskAdjustedComparison({ accounts, fills }) {
  const metrics = useMemo(() => {
    const agg = calcAggregateMetrics(accounts)
    const equityCurve = buildEquityCurve(fills, 10000)
    const drawdown = calcDrawdown(equityCurve)
    const sharpe = calcSharpeRatio(equityCurve)
    const sortino = calcSortinoRatio(equityCurve)

    // Calmar ratio = annualized return / max drawdown
    const maxDD = drawdown.length > 0 ? Math.max(...drawdown.map(d => d.drawdown)) : 0
    const totalReturn = equityCurve.length > 1
      ? ((equityCurve[equityCurve.length - 1].value - equityCurve[0].value) / equityCurve[0].value) * 100
      : 0
    const annualizedReturn = totalReturn * (252 / Math.max(1, equityCurve.length))
    const calmar = maxDD > 0 ? annualizedReturn / maxDD : 0

    // Profit factor
    let grossProfit = 0, grossLoss = 0
    for (const acc of Object.values(accounts || {})) {
      for (const t of (acc.trade_history || [])) {
        if (t.pnl > 0) grossProfit += t.pnl
        else grossLoss += Math.abs(t.pnl)
      }
    }
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

    // Expectancy
    const totalTrades = agg.totalTrades || 0
    const expectancy = totalTrades > 0 ? (grossProfit - grossLoss) / totalTrades : 0

    return {
      sharpe: isFinite(sharpe) ? sharpe : 0,
      sortino: isFinite(sortino) ? sortino : 0,
      calmar: isFinite(calmar) ? calmar : 0,
      maxDD,
      totalReturn,
      annualizedReturn,
      profitFactor: isFinite(profitFactor) ? profitFactor : 0,
      expectancy,
      grossProfit,
      grossLoss,
      totalTrades,
    }
  }, [accounts, fills])

  const ratios = [
    {
      name: 'Sharpe',
      value: metrics.sharpe,
      desc: 'Return / total volatility',
      good: metrics.sharpe >= 1,
      ok: metrics.sharpe >= 0,
      icon: Activity,
      color: 'text-accent-blue',
    },
    {
      name: 'Sortino',
      value: metrics.sortino,
      desc: 'Return / downside volatility',
      good: metrics.sortino >= 1,
      ok: metrics.sortino >= 0,
      icon: TrendingUp,
      color: 'text-accent-green',
    },
    {
      name: 'Calmar',
      value: metrics.calmar,
      desc: 'Annual return / max drawdown',
      good: metrics.calmar >= 1,
      ok: metrics.calmar >= 0,
      icon: Award,
      color: 'text-accent-purple',
    },
  ]

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Award size={12} className="text-accent-yellow" />
        Risk-Adjusted Returns
      </div>

      {/* Ratio cards */}
      <div className="space-y-1.5 mb-2">
        {ratios.map(r => (
          <div key={r.name} className="bg-bg-600/50 rounded px-2 py-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <r.icon size={11} className={r.color} />
                <span className="text-[10px] font-medium text-gray-300">{r.name}</span>
              </div>
              <span className={'text-sm font-mono font-bold ' +
                (r.good ? 'text-accent-green' : r.ok ? 'text-accent-yellow' : 'text-accent-red')}>
                {r.value.toFixed(3)}
              </span>
            </div>
            <div className="text-[8px] text-gray-600 mt-0.5">{r.desc}</div>
            {/* Quality bar */}
            <div className="h-1 bg-bg-600 rounded-full overflow-hidden mt-1">
              <div
                className={'h-full rounded-full ' + (r.good ? 'bg-accent-green' : r.ok ? 'bg-accent-yellow' : 'bg-accent-red')}
                style={{ width: `${Math.min(100, Math.abs(r.value) * 50)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Additional metrics */}
      <div className="grid grid-cols-2 gap-2 text-[9px]">
        <Cell label="Max DD" value={`${metrics.maxDD.toFixed(2)}%`} color="text-accent-red" />
        <Cell label="Ann. Return" value={`${metrics.annualizedReturn.toFixed(1)}%`} color={metrics.annualizedReturn >= 0 ? 'text-accent-green' : 'text-accent-red'} />
        <Cell label="Profit Factor" value={metrics.profitFactor.toFixed(2)} color={metrics.profitFactor >= 1.5 ? 'text-accent-green' : metrics.profitFactor >= 1 ? 'text-accent-yellow' : 'text-accent-red'} />
        <Cell label="Expectancy" value={`$${metrics.expectancy.toFixed(2)}`} color={metrics.expectancy >= 0 ? 'text-accent-green' : 'text-accent-red'} />
        <Cell label="Gross Profit" value={`$${metrics.grossProfit.toFixed(0)}`} color="text-accent-green" />
        <Cell label="Gross Loss" value={`$${metrics.grossLoss.toFixed(0)}`} color="text-accent-red" />
      </div>
    </div>
  )
}

function Cell({ label, value, color }) {
  return (
    <div className="bg-bg-600/50 rounded px-2 py-1">
      <div className="text-[8px] text-gray-600 uppercase">{label}</div>
      <div className={`text-[10px] font-mono ${color}`}>{value}</div>
    </div>
  )
}
