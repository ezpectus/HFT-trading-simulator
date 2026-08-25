import { memo, useMemo, useState, useCallback } from 'react'
import { Brain, Upload, Download, Trash2, RefreshCw, CheckCircle, XCircle, Cpu, Clock } from 'lucide-react'
import { EmptyState } from './LoadingSkeleton'
import { formatPct } from '../utils/format'

const MOCK_MODELS = [
  { id: 'lstm-btc', name: 'LSTM BTC/USDT', type: 'LSTM', status: 'deployed', accuracy: 0.682, size: '12.4 MB', version: 'v1.3', trainedAt: '2024-01-15', predictions: 15420 },
  { id: 'transformer-eth', name: 'Transformer ETH/USDT', type: 'Transformer', status: 'deployed', accuracy: 0.715, size: '28.2 MB', version: 'v2.1', trainedAt: '2024-01-20', predictions: 8930 },
  { id: 'lightgbm-ensemble', name: 'LightGBM Ensemble', type: 'LightGBM', status: 'deployed', accuracy: 0.748, size: '3.1 MB', version: 'v1.0', trainedAt: '2024-02-01', predictions: 22150 },
  { id: 'rl-agent', name: 'RL Trading Agent', type: 'PPO', status: 'training', accuracy: 0.591, size: '45.6 MB', version: 'v0.8', trainedAt: '2024-02-10', predictions: 3210 },
  { id: 'automl-sol', name: 'AutoML SOL/USDT', type: 'AutoML', status: 'idle', accuracy: 0.624, size: '5.8 MB', version: 'v0.5', trainedAt: '2024-01-28', predictions: 5420 },
  { id: 'xgb-bnb', name: 'XGBoost BNB/USDT', type: 'XGBoost', status: 'failed', accuracy: 0.0, size: '0 MB', version: 'v0.1', trainedAt: '2024-02-12', predictions: 0 },
]

const STATUS_CONFIG = {
  deployed: { icon: CheckCircle, color: 'text-accent-green', label: 'Deployed' },
  training: { icon: RefreshCw, color: 'text-accent-yellow', label: 'Training' },
  idle: { icon: Clock, color: 'text-gray-500', label: 'Idle' },
  failed: { icon: XCircle, color: 'text-accent-red', label: 'Failed' },
}

const ModelDashboard = memo(function ModelDashboard({ addToast }) {
  const [selectedModel, setSelectedModel] = useState(null)

  const stats = useMemo(() => {
    const deployed = MOCK_MODELS.filter(m => m.status === 'deployed').length
    const training = MOCK_MODELS.filter(m => m.status === 'training').length
    const avgAcc = MOCK_MODELS.filter(m => m.accuracy > 0).reduce((s, m) => s + m.accuracy, 0) / MOCK_MODELS.filter(m => m.accuracy > 0).length
    const totalPreds = MOCK_MODELS.reduce((s, m) => s + m.predictions, 0)
    return { deployed, training, avgAcc, totalPreds }
  }, [])

  const handleAction = useCallback((model, action) => {
    const messages = {
      deploy: `Deploying ${model.name}...`,
      retrain: `Retraining ${model.name}...`,
      delete: `Deleted ${model.name}`,
      export: `Exporting ${model.name}...`,
    }
    addToast?.(action === 'delete' ? 'warning' : 'info', messages[action] || `Action: ${action}`)
  }, [addToast])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Brain size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Model Dashboard</span>
        </div>
        <span className="text-[10px] text-gray-600">{MOCK_MODELS.length} models</span>
      </div>

      <div className="grid grid-cols-4 gap-1 p-2 bg-bg-700 border border-bg-600">
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-gray-600">Deployed</span>
          <span className="text-[11px] text-accent-green">{stats.deployed}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-gray-600">Training</span>
          <span className="text-[11px] text-accent-yellow">{stats.training}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-gray-600">Avg Acc</span>
          <span className="text-[11px] text-accent-blue">{formatPct(stats.avgAcc * 100, 1)}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-gray-600">Preds</span>
          <span className="text-[11px] text-gray-300">{stats.totalPreds.toLocaleString()}</span>
        </div>
      </div>

      <div className="space-y-1 max-h-[280px] overflow-y-auto scrollbar-thin">
        {MOCK_MODELS.map(model => {
          const config = STATUS_CONFIG[model.status] || STATUS_CONFIG.idle
          const Icon = config.icon
          const isExpanded = selectedModel === model.id
          return (
            <div key={model.id} className="bg-bg-700 border border-bg-600">
              <button
                onClick={() => setSelectedModel(isExpanded ? null : model.id)}
                className="w-full flex items-center justify-between p-2 hover:bg-bg-600 transition-colors"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Cpu size={11} className="text-accent-purple" />
                  <span className="text-[11px] text-gray-300 truncate">{model.name}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] text-gray-600">{model.type}</span>
                  <Icon size={11} className={config.color} />
                </div>
              </button>

              {isExpanded && (
                <div className="px-2 pb-2 space-y-1">
                  <div className="grid grid-cols-3 gap-1 text-[9px]">
                    <div className="flex flex-col">
                      <span className="text-gray-600">Accuracy</span>
                      <span className={model.accuracy > 0.7 ? 'text-accent-green' : model.accuracy > 0.6 ? 'text-accent-yellow' : 'text-accent-red'}>
                        {formatPct(model.accuracy * 100, 1)}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-600">Size</span>
                      <span className="text-gray-400">{model.size}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-600">Version</span>
                      <span className="text-gray-400">{model.version}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-600">Trained</span>
                      <span className="text-gray-400">{model.trainedAt}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-600">Predictions</span>
                      <span className="text-gray-400">{model.predictions.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-600">Status</span>
                      <span className={config.color}>{config.label}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 pt-1">
                    <button onClick={() => handleAction(model, 'retrain')} className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] bg-bg-600 text-gray-400 hover:text-gray-200 transition-colors">
                      <RefreshCw size={9} /> Retrain
                    </button>
                    <button onClick={() => handleAction(model, 'export')} className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] bg-bg-600 text-gray-400 hover:text-gray-200 transition-colors">
                      <Download size={9} /> Export
                    </button>
                    <button onClick={() => handleAction(model, 'delete')} className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] bg-bg-600 text-accent-red hover:bg-accent-red/10 transition-colors ml-auto">
                      <Trash2 size={9} /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        onClick={() => addToast?.('info', 'Upload model dialog opened')}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-accent-purple/20 text-accent-purple hover:bg-accent-purple/30 transition-colors"
      >
        <Upload size={12} />
        Upload Model
      </button>

      {MOCK_MODELS.length === 0 && (
        <EmptyState icon={Brain} title="No models" subtitle="Upload or train a model to get started" />
      )}
    </div>
  )
})

export default ModelDashboard
