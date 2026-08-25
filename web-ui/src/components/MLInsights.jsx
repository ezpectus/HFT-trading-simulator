import { memo, useMemo, useState } from 'react'
import { Brain, TrendingUp, TrendingDown, Minus, Cpu, Target, Zap, Activity } from 'lucide-react'
import { EmptyState } from './LoadingSkeleton'
import { formatPct, formatPrice } from '../utils/format'

const MOCK_MODELS = [
  {
    id: 'lstm-price',
    name: 'LSTM Price Predictor',
    type: 'LSTM',
    status: 'active',
    accuracy: 0.682,
    lastPrediction: { direction: 'LONG', confidence: 0.72, symbol: 'BTC/USDT', price: 43250 },
    features: ['close', 'volume', 'rsi', 'macd', 'ema_20'],
    trainingMSE: 0.0024,
    epochs: 150,
    updatedAt: Date.now() / 1000 - 3600,
  },
  {
    id: 'transformer',
    name: 'Transformer Forecast',
    type: 'Transformer',
    status: 'active',
    accuracy: 0.715,
    lastPrediction: { direction: 'SHORT', confidence: 0.65, symbol: 'ETH/USDT', price: 2580 },
    features: ['close', 'volume', 'atr', 'bb_width', 'vwap'],
    trainingMSE: 0.0018,
    epochs: 200,
    updatedAt: Date.now() / 1000 - 7200,
  },
  {
    id: 'rl-agent',
    name: 'RL Trading Agent',
    type: 'PPO',
    status: 'idle',
    accuracy: 0.591,
    lastPrediction: { direction: 'NEUTRAL', confidence: 0.45, symbol: 'BTC/USDT', price: 43250 },
    features: ['price_diff', 'volume_ratio', 'order_imbalance'],
    trainingMSE: null,
    epochs: 500,
    updatedAt: Date.now() / 1000 - 86400,
  },
  {
    id: 'automl',
    name: 'AutoML Ensemble',
    type: 'LightGBM',
    status: 'active',
    accuracy: 0.748,
    lastPrediction: { direction: 'LONG', confidence: 0.81, symbol: 'SOL/USDT', price: 98.5 },
    features: ['rsi', 'macd', 'atr', 'volume', 'bb_width', 'adx', 'cci'],
    trainingMSE: 0.0012,
    epochs: null,
    updatedAt: Date.now() / 1000 - 1800,
  },
]

function ModelCard({ model, expanded, onToggle }) {
  const dirIcon = model.lastPrediction.direction === 'LONG' ? TrendingUp
    : model.lastPrediction.direction === 'SHORT' ? TrendingDown : Minus
  const DirIcon = dirIcon
  const dirColor = model.lastPrediction.direction === 'LONG' ? 'text-accent-green'
    : model.lastPrediction.direction === 'SHORT' ? 'text-accent-red' : 'text-gray-500'

  const statusColor = model.status === 'active' ? 'text-accent-green' : 'text-gray-500'
  const accColor = model.accuracy > 0.7 ? 'text-accent-green'
    : model.accuracy > 0.6 ? 'text-accent-yellow' : 'text-accent-red'

  return (
    <div className="bg-bg-700 border border-bg-600 p-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Cpu size={11} className="text-accent-purple" />
          <span className="text-[11px] font-medium text-gray-300">{model.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] ${statusColor}`}>{model.status}</span>
          <span className="text-[9px] text-gray-600 bg-bg-600 px-1 rounded">{model.type}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 text-[10px] mb-1">
        <div className="flex flex-col">
          <span className="text-gray-600">Accuracy</span>
          <span className={accColor}>{formatPct(model.accuracy * 100, 1)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-600">Confidence</span>
          <span className="text-gray-400">{formatPct(model.lastPrediction.confidence * 100, 0)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-600">Pred</span>
          <span className={`flex items-center gap-0.5 ${dirColor}`}>
            <DirIcon size={9} />
            {model.lastPrediction.direction}
          </span>
        </div>
      </div>

      <button
        onClick={onToggle}
        className="text-[9px] text-gray-600 hover:text-gray-400 transition-colors w-full text-left"
      >
        {expanded ? '▼ Hide' : '▶ Details'}
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-gray-600">Symbol</span>
            <span className="text-gray-400">{model.lastPrediction.symbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Target Price</span>
            <span className="text-gray-400">${formatPrice(model.lastPrediction.price)}</span>
          </div>
          {model.trainingMSE != null && (
            <div className="flex justify-between">
              <span className="text-gray-600">Train MSE</span>
              <span className="text-gray-400">{model.trainingMSE.toFixed(4)}</span>
            </div>
          )}
          {model.epochs != null && (
            <div className="flex justify-between">
              <span className="text-gray-600">Epochs</span>
              <span className="text-gray-400">{model.epochs}</span>
            </div>
          )}
          <div>
            <span className="text-gray-600 block mb-0.5">Features ({model.features.length})</span>
            <div className="flex flex-wrap gap-0.5">
              {model.features.map(f => (
                <span key={f} className="text-[9px] bg-bg-600 text-gray-500 px-1 rounded">{f}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const MLInsights = memo(function MLInsights({ signals, candles, symbol }) {
  const [expandedId, setExpandedId] = useState(null)

  const models = useMemo(() => {
    return MOCK_MODELS.map(m => {
      if (m.lastPrediction.symbol === symbol) {
        return {
          ...m,
          lastPrediction: {
            ...m.lastPrediction,
            price: candles?.[0]?.close || m.lastPrediction.price,
          },
        }
      }
      return m
    })
  }, [candles, symbol])

  const avgAccuracy = useMemo(() => {
    if (!models.length) return 0
    return models.reduce((sum, m) => sum + m.accuracy, 0) / models.length
  }, [models])

  const activeCount = models.filter(m => m.status === 'active').length
  const longCount = models.filter(m => m.lastPrediction.direction === 'LONG').length
  const shortCount = models.filter(m => m.lastPrediction.direction === 'SHORT').length

  const consensus = longCount > shortCount ? 'BULLISH'
    : shortCount > longCount ? 'BEARISH' : 'NEUTRAL'
  const consensusColor = consensus === 'BULLISH' ? 'text-accent-green'
    : consensus === 'BEARISH' ? 'text-accent-red' : 'text-gray-500'

  const signalSignals = signals?.signals || []
  const mlSignals = useMemo(() => {
    return signalSignals.filter(s => s.strategy && s.strategy.toLowerCase().includes('ml')).slice(0, 5)
  }, [signalSignals])

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

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-1 p-2 bg-bg-700 border border-bg-600">
        <div className="flex flex-col items-center">
          <Target size={11} className="text-gray-600 mb-0.5" />
          <span className="text-[9px] text-gray-600">Avg Acc</span>
          <span className="text-[11px] text-accent-blue">{formatPct(avgAccuracy * 100, 1)}</span>
        </div>
        <div className="flex flex-col items-center">
          <Activity size={11} className="text-gray-600 mb-0.5" />
          <span className="text-[9px] text-gray-600">Active</span>
          <span className="text-[11px] text-accent-green">{activeCount}/{models.length}</span>
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

      {/* Model cards */}
      <div className="space-y-1.5">
        {models.map(model => (
          <ModelCard
            key={model.id}
            model={model}
            expanded={expandedId === model.id}
            onToggle={() => setExpandedId(expandedId === model.id ? null : model.id)}
          />
        ))}
      </div>

      {/* ML signals from feed */}
      {mlSignals.length > 0 && (
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
              </div>
            ))}
          </div>
        </div>
      )}

      {models.length === 0 && (
        <EmptyState icon={Brain} title="No ML models" subtitle="Model data will appear when available" />
      )}
    </div>
  )
})

export default memo(MLInsights)
