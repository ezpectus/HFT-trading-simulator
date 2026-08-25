export const MOCK_PIPELINES = [
  { id: 1, name: 'TrendFollowing Model', status: 'idle', lastRun: '2h ago', nextRun: 'in 4h', accuracy: 0.82, drift: 0.05, version: 'v2.3.1' },
  { id: 2, name: 'MeanReversion Model', status: 'running', lastRun: 'running now', nextRun: '—', accuracy: 0.75, drift: 0.12, version: 'v2.1.0' },
  { id: 3, name: 'Sentiment Classifier', status: 'completed', lastRun: '15m ago', nextRun: 'in 5h', accuracy: 0.78, drift: 0.03, version: 'v1.8.2' },
  { id: 4, name: 'Regime Detector', status: 'failed', lastRun: '1h ago', nextRun: 'retry pending', accuracy: 0.68, drift: 0.18, version: 'v1.5.0' },
  { id: 5, name: 'Volatility Forecaster', status: 'idle', lastRun: '30m ago', nextRun: 'in 3h', accuracy: 0.71, drift: 0.08, version: 'v2.0.1' },
]

export const MOCK_STEPS = [
  { name: 'Data Collection', status: 'completed', duration: '45s' },
  { name: 'Feature Engineering', status: 'completed', duration: '2m 15s' },
  { name: 'Train/Test Split', status: 'completed', duration: '5s' },
  { name: 'Model Training', status: 'running', duration: '3m 28s' },
  { name: 'Validation', status: 'pending', duration: '—' },
  { name: 'Deploy', status: 'pending', duration: '—' },
]
