# Machine Learning

Guide to ML models in the HFT Trading System: LSTM, Transformer, RL agents, AutoML, feature store, and model registry.

---

## Overview

The ML module provides price prediction, signal generation, and automated strategy optimization. Models are implemented as simplified Python versions (LSTM, Transformer) and full PyTorch versions (price predictor, RL trader).

**Important:** ML models are code-complete but not trained — no model weights are included. Training requires historical data and GPU compute.

**Source directory:** `ai-signal-bot/src/ml/`

---

## LSTM Price Prediction

**Source:** `ai-signal-bot/src/ml/lstm_model.py`

Simplified LSTM implementation for short-term price prediction:

- **Architecture:** 2 LSTM layers, 64 hidden units, dropout 0.2
- **Input:** Last 60 candles (sequence length configurable)
- **Output:** Predicted price or return
- **Training:** BPTT with 5-step truncation, Xavier initialization

```python
from src.ml.lstm_model import LSTMModel, LSTMConfig

model = LSTMModel(LSTMConfig(
    hidden_size=64, num_layers=2, dropout=0.2, sequence_length=60,
))
model.train(X_train, y_train, epochs=50, learning_rate=0.001)
prediction = model.predict(X_test)
```

### PyTorch Price Predictor

**Source:** `ai-signal-bot/src/ml/price_predictor.py`

Full PyTorch implementation with LSTM + optional multi-head attention:

- **Input:** Last N OHLCV candles + technical indicators
- **LSTM:** 128 hidden units, 2 layers
- **Attention:** Multi-head self-attention (optional)
- **Output:** Predicted return (regression) or direction probability (classification: buy/sell/hold)
- **Export:** ONNX for C++ inference

---

## Transformer Signal Model

**Source:** `ai-signal-bot/src/ml/transformer_model.py`

Transformer-based signal generation:

- **Architecture:** 2 encoder layers, 4 attention heads, d_model=64, d_ff=256
- **Input:** 10 features, max sequence length 100
- **Output:** 3 classes (LONG, SHORT, HOLD)
- **Features:** Multi-head self-attention, positional encoding, signal generation head

```python
from src.ml.transformer_model import TransformerModel, TransformerConfig

model = TransformerModel(TransformerConfig(
    d_model=64, n_heads=4, n_layers=2, d_ff=256,
))
model.train(X_train, y_train, epochs=50)
signals = model.predict(X_test)
```

---

## Reinforcement Learning

### DQN Agent

**Source:** `ai-signal-bot/src/ml/rl_agent.py`

Deep Q-Network for trading:

- **State:** 63 dimensions (60 prices + 3 portfolio metrics)
- **Actions:** 3 (HOLD, BUY, SELL)
- **Experience replay:** 10,000 memory buffer, batch size 32
- **Exploration:** Epsilon-greedy (1.0 → 0.01, decay 0.995)
- **Learning:** Adam optimizer, lr=0.001, gamma=0.99

### PPO Trader

**Source:** `ai-signal-bot/src/ml/rl_trader.py`

Proximal Policy Optimization trader (requires PyTorch):

- **Actor:** MLP → action probabilities (softmax)
- **Critic:** MLP → state value estimate
- **Objective:** PPO clip with GAE (Generalized Advantage Estimation)
- **Actions:** hold, buy, sell, close
- **Export:** Actor network to ONNX for C++ inference

### Trading Environment

**Source:** `ai-signal-bot/src/ml/environment.py`

OpenAI Gym-compatible trading environment:

- **State:** prices, portfolio value, position, cash, features
- **Action:** HOLD (0), BUY (1), SELL (2)
- **Reward:** Portfolio P&L per step
- **Episode:** Configurable max steps, done on bankruptcy or max steps

```python
from src.ml.environment import TradingEnv
from src.ml.rl_agent import DQNAgent

env = TradingEnv(candles, initial_balance=10000)
agent = DQNAgent(state_size=63, action_size=3)

state = env.reset()
for step in range(1000):
    action = agent.act(state)
    next_state, reward, done = env.step(action)
    agent.remember(state, action, reward, next_state, done)
    agent.replay()
    state = next_state
```

---

## AutoML

**Source:** `ai-signal-bot/src/ml/automl.py`

Automated hyperparameter optimization using Optuna:

- **Search space:** Indicator periods, signal thresholds, risk parameters, model hyperparameters
- **Pruning:** Median pruner for early stopping of bad trials
- **Objective:** Maximizing Sharpe ratio (configurable)
- **Trials:** Configurable (default 100)

```python
from src.ml.automl import AutoMLOptimizer

optimizer = AutoMLOptimizer(n_trials=100, strategy="trend_following")
best_params = optimizer.optimize(train_data, val_data)
```

**Note:** Requires `optuna` package (optional dependency).

---

## Feature Store

**Source:** `ai-signal-bot/src/ml/feature_store.py`

Centralized feature computation and serving via Redis:

| Feature Category | Examples |
|-----------------|----------|
| Technical indicators | RSI, EMA, ATR, MACD, Bollinger Bands |
| Market microstructure | OBI, spread, depth ratio |
| Price-derived | Returns, volatility, momentum |
| Cross-asset | Correlation, beta, spread |

```python
from src.ml.feature_store import FeatureStore

fs = FeatureStore(redis_host="localhost")
fs.update_features("BTC/USDT", {"rsi_14": 65.3, "ema_fast": 65100.5})
features = fs.get_features("BTC/USDT", ["rsi_14", "ema_fast"])
```

**Note:** Requires Redis for online serving. Falls back to in-memory cache.

---

## Model Registry

**Source:** `ai-signal-bot/src/ml/model_registry.py`

Model versioning and lifecycle management:

- **Versioning:** Semantic versioning (major.minor.patch)
- **Metrics:** Track accuracy, Sharpe, max drawdown per version
- **A/B testing:** Traffic split between control and treatment models
- **Rollback:** Automatic on performance degradation
- **Metadata:** Training data, hyperparameters, metrics per model

```python
from src.ml.model_registry import ModelRegistry

registry = ModelRegistry(storage_dir="models/registry")
registry.register(
    name="lstm_btc_1m", version="1.2.0",
    path="models/lstm_btc_v1.2.0.onnx",
    metrics={"accuracy": 0.62, "sharpe": 1.8, "max_drawdown": -0.12},
)
model = registry.get_production_model("lstm_btc_1m")
registry.set_ab_test("lstm_btc_1m", control="1.1.0", treatment="1.2.0", traffic_split=0.3)
```

---

## ML Ensemble Strategy

**Source:** `ai-signal-bot/src/strategies/ml_ensemble.py`

Integrates ML models into the trading pipeline:

- **LightGBM/XGBoost** for classification (optional dependencies)
- **HMM regime detection** for market state awareness
- **IsolationForest** for anomaly detection
- **Ensemble voting** across ML models

Disabled by default in config. Enable in `settings.yaml`:

```yaml
strategies:
  ml_ensemble:
    enabled: true
    models: [lstm, transformer]
    voting: weighted
```

---

## Configuration

ML parameters in `ai-signal-bot/config/settings.yaml`:

```yaml
ml:
  lstm:
    hidden_size: 64
    num_layers: 2
    sequence_length: 60
    dropout: 0.2
  transformer:
    d_model: 64
    n_heads: 4
    n_layers: 2
  rl:
    algo: ppo  # or dqn
    episodes: 10000
    learning_rate: 0.001
```

---

## Web UI

ML visualization panels:
- **LSTM Neural Network** — architecture diagram and training metrics
- **Transformer Model** — attention weight visualization
- **Reinforcement Learning** — reward curves and Q-value heatmaps
- **Feature Importance** — SHAP-style feature attribution

These are educational visualizations (UI-only), not connected to the Python ML pipeline.

---

## Testing

| Test File | Coverage |
|-----------|----------|
| `ai-signal-bot/tests/unit/test_ml_modules.py` | LSTM train/predict, Transformer train/predict, DQN agent |
| `ai-signal-bot/tests/unit/test_ml_modules.py` | TradingEnv step/reset, AutoML (mocked), feature store |
| `ai-signal-bot/tests/unit/test_ml_modules.py` | Model registry versioning, A/B testing, rollback |

Edge cases: empty arrays, NaN inputs, single-element sequences, mismatched dimensions.

---

## Limitations

1. **No trained weights** — models are architecturally complete but untrained
2. **Simplified implementations** — LSTM and Transformer use numpy, not PyTorch (except price_predictor.py and rl_trader.py)
3. **ONNX export** — referenced in code but onnx_engine.h was removed (Sprint 43)
4. **Optional dependencies** — LightGBM, XGBoost, Optuna, Redis are optional

---

## See Also

- [Math Models](MATH_MODELS.md) — LSTM, Transformer, HMM formulas
- [Trading Strategies](TRADING_STRATEGIES.md) — ML ensemble strategy integration
- [Architecture](ARCHITECTURE.md) — ML module in system architecture
