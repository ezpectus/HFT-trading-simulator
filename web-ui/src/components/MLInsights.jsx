import { memo, useMemo } from 'react'
import { Brain, TrendingUp, TrendingDown, Zap, Activity } from 'lucide-react'
import { EmptyState } from './LoadingSkeleton'
import { NoDataFeed } from '../utils/ui-helpers'
import { formatPrice } from '../utils/format'

const MLInsights = memo(function MLInsights({ signals }) {
  const signalSignals = signals?.signals || []
  const mlSignals = useMemo(() => {
    return signalSignals.filter(s => s.strategy && s.strategy.toLowerCase().includes('ml')).slice(0, 10)
  }, [signalSignals])

  const longCount = mlSignals.filter(s => s.direction === 'LONG').length
  const shortCount = mlSignals.filter(s => s.direction === 'SHORT').length

  const consensus = longCount > shortCount ? 'BULLISH'
    : shortCount > longCount ? 'BEARISH' : 'NEUTRAL'
  const consensusColor = consensus === 'BULLISH' ? 'text-accent-green'
    : consensus === 'BEARISH' ? 'text-accent-red' : 'text-gray-500'

  const avgConfidence = mlSignals.length
    ? mlSignals.reduce((s, x) => s + (x.confidence || 0), 0) / mlSignals.length
    : 0

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Brain size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">ML Insights</span>
        </div>
        <span className={`text-[10px] font-medium ${consensusColor}`}>
          {consensus}
        </span>
      </div>

      {/* Model registry — no backend feed exists */}
      <NoDataFeed feed="model registry" />
      <div className="text-[10px] text-gray-600">
        Model accuracy/status requires a model registry feed — not produced by the backend. Only real ML-tagged signals are shown below.
      </div>

      {/* Summary stats — from real signals only */}
      <div className="grid grid-cols-3 gap-1 p-2 bg-bg-700 border border-bg-600">
        <div className="flex flex-col items-center">
          <Activity size={11} className="text-gray-600 mb-0.5" />
          <span className="text-[9px] text-gray-600">ML Signals</span>
          <span className="text-[11px] text-accent-blue">{mlSignals.length}</span>
        </div>
        <div className="flex flex-col items-center">
          <TrendingUp size={11} className="text-gray-600 mb-0.5" />
          <span className="text-[9px] text-gray-600">Long</span>
          <span className="text-[11px] text-accent-green">{longCount}</span>
        </div>
        <div className="flex flex-col items-center">
          <TrendingDown size={11} className="text-gray-600 mb-0.5" />
          <span className="text-[9px] text-gray-600">Short</span>
          <span className="text-[11px] text-accent-red">{shortCount}</span>
        </div>
      </div>

      {/* ML signals from feed */}
      {mlSignals.length > 0 ? (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Zap size={11} className="text-accent-yellow" />
            <span className="text-[10px] text-gray-600 uppercase">Recent ML Signals</span>
          </div>
          <div className="space-y-0.5">
            {mlSignals.map((sig, i) => (
              <div key={i} className="flex items-center justify-between text-[10px] py-0.5 px-1 bg-bg-700">
                <span className="text-gray-400">{sig.symbol}</span>
                <span className={sig.direction === 'LONG' ? 'text-accent-green' : 'text-accent-red'}>
                  {sig.direction}
                </span>
                <span className="text-gray-500">{sig.confidence?.toFixed(0)}%</span>
                <span className="text-gray-600">${formatPrice(sig.price)}</span>
              </div>
            ))}
          </div>
          <div className="text-[9px] text-gray-600 mt-1">Avg confidence: {avgConfidence.toFixed(0)}%</div>
        </div>
      ) : (
        <EmptyState icon={Brain} title="No ML signals" subtitle="Signals tagged 'ml' will appear here when strategies emit them" />
      )}
    </div>
  )
})

export default memo(MLInsights)
