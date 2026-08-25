export const MOCK_TEAM = [
  { id: 1, name: 'Alice', role: 'Admin', status: 'online', action: 'Reviewing BTC/USDT signals' },
  { id: 2, name: 'Bob', role: 'Trader', status: 'online', action: 'Managing SOL/USDT position' },
  { id: 3, name: 'Carol', role: 'Analyst', status: 'away', action: 'Running backtest comparison' },
  { id: 4, name: 'Dave', role: 'Trader', status: 'offline', action: 'Last active 2h ago' },
  { id: 5, name: 'Eve', role: 'Viewer', status: 'online', action: 'Watching dashboard' },
]

export const MOCK_MESSAGES = [
  { id: 1, user: 'Alice', ts: '12:42', msg: 'BTC signal looking strong, confidence at 82%' },
  { id: 2, user: 'Bob', ts: '12:43', msg: 'Agreed, already entered 0.5 BTC long position' },
  { id: 3, user: 'Carol', ts: '12:44', msg: 'Backtest shows 64% win rate for this pattern' },
  { id: 4, user: 'Alice', ts: '12:45', msg: 'Good enough. Increasing position size to 0.8' },
  { id: 5, user: 'Eve', ts: '12:46', msg: 'Watching from the side, looks good' },
]

export const MOCK_SHARED = [
  { id: 1, type: 'layout', name: 'Scalping Dashboard', sharedBy: 'Alice', ts: '2h ago' },
  { id: 2, type: 'strategy', name: 'Trend + MeanRev Ensemble', sharedBy: 'Bob', ts: '5h ago' },
  { id: 3, type: 'alert', name: 'BTC > $45k Alert', sharedBy: 'Carol', ts: '1d ago' },
]
