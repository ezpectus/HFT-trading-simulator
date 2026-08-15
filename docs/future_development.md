# Future Development — Ideas for Expansion

**Дата:** 15 августа 2026
**Назначение:** Этот документ содержит идеи для расширения и улучшения HFT Trading System.
**Статус:** ACTIVE — идеи постоянно добавляются ИИ и пользователем
**Версия:** 4.1 — ГЛУБОКИЙ АУДИТ v2 (проверен каждый claim в README.md/ARCHITECTURE.md/MATH_MODELS.md против кода, исправлены ошибки v4.0)

---

## ОГЛАВЛЕНИЕ

```
0.   UI-ONLY МОДЕЛИ → ПОРТИРОВАТЬ В TRADING LOGIC (40+ моделей!)
0b.  DEAD CODE: CUDA И ONNX
0c.  МОДЕЛИ КОТОРЫХ НЕТ ВООБЩЕ (ни в UI, ни в коде)
1.   НЕДОСТАЮЩИЕ МАТЕМАТИЧЕСКИЕ МОДЕЛИ (критично!)
2.   QUANTUM MODELS (0% сейчас)
3.   BROKER INTEGRATION (5% сейчас)
4.   REAL HFT FEATURES (10% сейчас)
5.   EXCHANGE SIMULATOR — Идеи расширения
6.   AI SIGNAL BOT — Идеи расширения
7.   HFT TRADE BOT — Идеи расширения
8.   WEB UI — Идеи расширения
9.   MONITORING — Идеи расширения
10.  ИНФРАСТРУКТУРА — Идеи расширения
11.  БЕЗОПАСНОСТЬ — Идеи расширения
12.  МАШИННОЕ ОБУЧЕНИЕ — Идеи расширения
13.  ТЕСТИРОВАНИЕ — Идеи расширения
14.  ИДЕИ ОТ ИИ (добавляются по мере анализа кода)
```

---

## 0. UI-ONLY МОДЕЛИ → ПОРТИРОВАТЬ В TRADING LOGIC (40+ моделей!)

**Проблема:** 40+ математических моделей существуют ТОЛЬКО как React UI компоненты (.jsx), но НЕ интегрированы в Python/C++ trading pipeline. Это образовательные визуализации, не trading logic.

**Решение:** Портировать ключевые модели из UI в Python trading logic.

### 0.1. Высокий приоритет (влияют на trading)

| Модель | UI файл | Python файл (создать) | Приоритет | Время |
|--------|---------|----------------------|-----------|-------|
| GARCH(1,1) | `GARCHVolatility.jsx` | `src/technical_analysis/garch.py` | ВЫСОКИЙ | 1 неделя |
| Markov-Switching GARCH | `MarkovSwitchingGARCH.jsx` | `src/technical_analysis/ms_garch.py` | ВЫСОКИЙ | 2 недели |
| Kalman Filter | `KalmanFilterPrice.jsx` | `src/technical_analysis/kalman.py` | ВЫСОКИЙ | 3 дня |
| Copula | `CopulaModel.jsx` | `src/technical_analysis/copula.py` | ВЫСОКИЙ | 2 недели |
| Wavelet | `WaveletDecomposition.jsx` | `src/technical_analysis/wavelet.py` | ВЫСОКИЙ | 1 неделя |
| Monte Carlo | `MonteCarlo.jsx` | `src/technical_analysis/monte_carlo.py` | ВЫСОКИЙ | 1 неделя |
| Hawkes Process | `HawkesProcess.jsx` | `src/technical_analysis/hawkes.py` | СРЕДНИЙ | 2 недели |
| Almgren-Chriss | `AlmgrenChriss.jsx` | `src/research/almgren_chriss.py` | СРЕДНИЙ | 1 неделя |
| Optimal Stopping | `OptimalStopping.jsx` | `src/technical_analysis/optimal_stopping.py` | СРЕДНИЙ | 1 неделя |
| K-Means Clustering | `KMeansClustering.jsx` | `src/technical_analysis/kmeans.py` | СРЕДНИЙ | 3 дня |
| Gaussian Mixture | `GaussianMixtureModel.jsx` | `src/technical_analysis/gmm.py` | СРЕДНИЙ | 3 дня |
| PCA | `PrincipalComponentAnalysis.jsx` | `src/technical_analysis/pca.py` | СРЕДНИЙ | 2 дня |
| SVM | `SupportVectorMachine.jsx` | `src/ml/svm_signal.py` | СРЕДНИЙ | 3 дня |
| Autoencoder | `Autoencoder.jsx` | `src/ml/autoencoder.py` | СРЕДНИЙ | 1 неделя |
| VAE | `VariationalAutoencoder.jsx` | `src/ml/vae.py` | НИЗКИЙ | 2 недели |

### 0.2. Средний приоритет (research / risk)

| Модель | UI файл | Python файл (создать) | Время |
|--------|---------|----------------------|-------|
| Bayesian Price Predictor | `BayesianPricePredictor.jsx` | `src/technical_analysis/bayesian_price.py` | 1 неделя |
| Bayesian Structural TS | `BayesianStructuralTimeSeries.jsx` | `src/technical_analysis/bayesian_sts.py` | 2 недели |
| HMC | `HamiltonianMonteCarlo.jsx` | `src/technical_analysis/hmc.py` | 2 недели |
| Transfer Entropy | `TransferEntropy.jsx` | `src/research/transfer_entropy.py` | 1 неделя |
| CCM (EDM) | `EmpiricalDynamicModeling.jsx` | `src/research/ccm.py` | 1 неделя |
| Cramer-Rao Bound | `CramerRaoBound.jsx` | `src/research/cramer_rao.py` | 3 дня |
| Rough Volatility (rBergomi) | `RoughVolatility.jsx` | `src/technical_analysis/rbergomi.py` | 2 недели |
| VMD | `VariationalModeDecomposition.jsx` | `src/technical_analysis/vmd.py` | 1 неделя |
| EMD/HHT | `EmpiricalModeDecomposition.jsx` | `src/technical_analysis/emd.py` | 1 неделя |
| DTW | `DynamicTimeWarping.jsx` | `src/technical_analysis/dtw.py` | 3 дня |
| Compressed Sensing | `CompressedSensing.jsx` | `src/technical_analysis/compressed_sensing.py` | 1 неделя |
| RKHS | `ReproducingKernelHilbertSpace.jsx` | `src/ml/rkhs.py` | 2 недели |
| Koopman Operator | `KoopmanOperatorTheory.jsx` | `src/research/koopman.py` | 2 недели |
| Random Matrix Theory | `RandomMatrixTheory.jsx` | `src/research/rmt.py` | 1 неделя |
| Graph Theory MST | `GraphTheoryNetwork.jsx` | `src/research/graph_mst.py` | 1 неделя |
| Tensor Decomposition | `TensorDecomposition.jsx` | `src/research/tensor_decomp.py` | 2 недели |
| Affine Arithmetic | `AffineArithmetic.jsx` | `src/research/affine_arithmetic.py` | 1 неделя |
| Stochastic Optimal Control | `StochasticOptimalControl.jsx` | `src/research/stochastic_control.py` | 2 недели |
| Pontryagin Maximum | `PontryaginMaximumPrinciple.jsx` | `src/research/pontryagin.py` | 2 недели |
| Girsanov Theorem | `GirsanovTheorem.jsx` | `src/research/girsanov.py` | 2 недели |
| SDE (Euler/Milstein) | `StochasticDifferentialEquations.jsx` | `src/technical_analysis/sde.py` | 1 неделя |
| Fokker-Planck | `FokkerPlanckEquation.jsx` | `src/research/fokker_planck.py` | 2 недели |
| Ito Generator | `ItoCalculusGenerator.jsx` | `src/research/ito_generator.py` | 1 неделя |
| Malliavin Calculus | `MalliavinCalculus.jsx` | `src/research/malliavin.py` | 3 недели |
| Renyi Entropy | `RenyiEntropyDynamics.jsx` | `src/research/renyi_entropy.py` | 1 неделя |
| Kolmogorov-Sinai | `KolmogorovSinaiEntropy.jsx` | `src/research/kolmogorov_sinai.py` | 1 неделя |
| Information Bottleneck | `InformationBottleneck.jsx` | `src/research/info_bottleneck.py` | 2 недели |
| Renormalization Group | `RenormalizationGroup.jsx` | `src/research/renormalization.py` | 3 недели |
| Free Energy Principle | `FreeEnergyPrinciple.jsx` | `src/research/free_energy.py` | 3 недели |
| Lie Group Symmetries | `LieGroupSymmetries.jsx` | `src/research/lie_group.py` | 3 недели |
| Burgers Equation | `BurgersEquation.jsx` | `src/research/burgers.py` | 2 недели |
| Sobolev Regularization | `SobolevSpaceRegularization.jsx` | `src/research/sobolev.py` | 2 недели |
| Lax-Milgram | `LaxMilgram.jsx` | `src/research/lax_milgram.py` | 2 недели |
| Riesz Representation | `RieszRepresentation.jsx` | `src/research/riesz.py` | 1 неделя |
| Banach Fixed-Point | `BanachFixedPoint.jsx` | `src/research/banach.py` | 1 неделя |
| Hahn Decomposition | `HahnDecomposition.jsx` | `src/research/hahn.py` | 1 неделя |
| Cameron-Martin | `CameronMartinFormula.jsx` | `src/research/cameron_martin.py` | 1 неделя |
| Radon-Nikodym | `RadonNikodymDerivative.jsx` | `src/research/radon_nikodym.py` | 1 неделя |
| Prokhorov Metric | `ProkhorovMetric.jsx` | `src/research/prokhorov.py` | 1 неделя |
| Stone-Cech | `StoneCechCompactification.jsx` | `src/research/stone_cech.py` | 2 недели |
| Arzela-Ascoli | `ArzelaAscoli.jsx` | `src/research/arzela_ascoli.py` | 1 неделя |
| Hopf Bifurcation | `HopfBifurcation.jsx` | `src/research/hopf.py` | 2 недели |
| Ehlers SuperSmoother | `EhlersSuperSmoother.jsx` | `src/technical_analysis/ehlers_smoother.py` | 3 дня |
| Cesaro/Fejer | `CesaroFejerKernel.jsx` | `src/technical_analysis/cesaro_fejer.py` | 3 дня |
| Persistent Homology | `PersistentHomologyLandscape.jsx` | `src/research/persistent_homology.py` | 3 недели |
| TDA | `TopologicalDataAnalysis.jsx` | `src/research/tda.py` | 3 недели |
| Wasserstein/Sinkhorn | `OptimalTransport.jsx` | `src/research/optimal_transport.py` | 2 недели |
| Wasserstein Barycenters | `WassersteinBarycenters.jsx` | `src/research/wasserstein_barycenters.py` | 2 недели |
| Schrodinger Bridge | `SchrodingerBridge.jsx` | `src/research/schrodinger_bridge.py` | 3 недели |
| Malliavin-Stein Sensitivity | `MalliavinSteinSensitivity.jsx` | `src/research/malliavin_stein.py` | 2 недели |

---

## 0b. DEAD CODE: CUDA И ONNX

### 0b.1. CUDA (`gpu_accelerator.cu`) — ВЫСОКИЙ

- **Описание:** Полный CUDA код есть (RSI, EMA, Monte Carlo VaR, matrix mul kernels), но за `#ifdef USE_CUDA`, никогда не компилируется в CI
- **Решение:** Включить в CI build с CUDA toolkit, или добавить fallback CPU implementation
- **Время:** 2 недели
- **Файл:** `hft-trade-bot/src/ml/gpu_accelerator.cu`

### 0b.2. ONNX Runtime (`onnx_engine.h`) — ВЫСОКИЙ

- **Описание:** Полный ONNX код есть (session management, inference, multi-model), но за `#ifdef USE_ONNXRUNTIME`, никогда не компилируется
- **Решение:** Включить в CI build с ONNX Runtime, или добавить fallback
- **Время:** 2 недели
- **Файл:** `hft-trade-bot/src/ml/onnx_engine.h`

---

## 0c. МОДЕЛИ КОТОРЫХ НЕТ ВООБЩЕ (ни в UI, ни в коде)

- ❌ **Hurst exponent** — нет нигде
- ❌ **VPIN** — нет нигде
- ❌ **Kyle's Lambda** — нет нигде
- ❌ **ZScore detector** — нет как отдельной модели
- ❌ **Ornstein-Uhlenbeck** — нет нигде
- ✅ **SVI/SABR volatility surface** — ЕСТЬ в коде! `ai-signal-bot/src/pricing/volatility_surface.py` (209 строк). Исправление v4.1: предыдущий аудит v4.0 ошибочно утверждал отсутствие.
- ❌ **MAMA/FAMA** — нет нигде
- ❌ **Hilbert Transform** — нет нигде
- ❌ **Blahut-Arimoto** — нет нигде
- ❌ **Bayesian Ridge** — нет нигде
- ❌ **Welch PSD** — нет нигде
- ❌ **CWT (Continuous Wavelet Transform)** — нет нигде
- ❌ **EWMA volatility** — нет как отдельной модели
- ❌ **Parkinson volatility** — нет нигде
- ❌ **BOCPD (Bayesian Online Change Point Detection)** — нет нигде

---

**Проблема:** Документы заявляли 75+ моделей, реально 38 в trading logic + 40 UI-only. UI-only модели нужно портировать в trading logic.

### 1.1. HMM (Hidden Markov Model) для Python — ВЫСОКИЙ

- **Описание:** HMM для определения рыночного режима (BULL/BEAR/SIDEWAYS/VOLATILE)
- **Причина:** Уже есть в C++ signal_engine_v3, но НЕТ в Python pipeline
- **Приоритет:** ВЫСОКИЙ
- **Сложность:** Средняя
- **Время:** 1 неделя
- **Зависимости:** hmmlearn
- **Файл:** `ai-signal-bot/src/technical_analysis/hmm_regime.py`
- **Интеграция:** Добавить в AnalysisStage pipeline
- **Примечания:** 4 состояния: BULL, BEAR, SIDEWAYS, VOLATILE. Использовать GaussianHMM

### 1.2. GARCH Volatility для Python — ВЫСОКИЙ

- **Описание:** GARCH(1,1) для прогнозирования волатильности
- **Причина:** Есть только UI компонент (React), НЕТ в trading logic
- **Приоритет:** ВЫСОКИЙ
- **Сложность:** Средняя
- **Время:** 1 неделя
- **Зависимости:** arch
- **Файл:** `ai-signal-bot/src/technical_analysis/garch.py`
- **Интеграция:** Добавить в AnalysisStage, использовать для risk management
- **Примечания:** GARCH(1,1) — стандарт для волатильности. Можно расширить до EGARCH, GJR-GARCH

### 1.3. Kalman Filter для Python — ВЫСОКИЙ

- **Описание:** Kalman filter для сглаживания цен и оценки тренда
- **Причина:** Есть в C++ strategies и UI, НЕТ в Python
- **Приоритет:** ВЫСОКИЙ
- **Сложность:** Средняя
- **Время:** 3 дня
- **Зависимости:** pykalman или filterpy
- **Файл:** `ai-signal-bot/src/technical_analysis/kalman.py`
- **Интеграция:** Добавить в AnalysisStage, использовать для signal generation
- **Примечания:** Также можно использовать Unscented Kalman Filter для нелинейных моделей

### 1.4. Copula Models — СРЕДНИЙ

- **Описание:** Copula для моделирования зависимости между активами
- **Причина:** Нигде нет, но критически важно для portfolio risk
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Высокая
- **Время:** 2 недели
- **Зависимости:** copulae
- **Файл:** `ai-signal-bot/src/technical_analysis/copula.py`
- **Интеграция:** Добавить в risk management, portfolio optimization
- **Примечания:** Normal, Student-t, Clayton, Gumbel copulas. Tail dependence для risk

### 1.5. Wavelet Transform — СРЕДНИЙ

- **Описание:** Wavelet для многоуровневого анализа цен
- **Причина:** Нигде нет, полезно для denoising и cycle detection
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Средняя
- **Время:** 1 неделя
- **Зависимости:** PyWavelets
- **Файл:** `ai-signal-bot/src/technical_analysis/wavelet.py`
- **Интеграция:** Добавить в AnalysisStage
- **Примечания:** Daubechies 4, 5 уровней декомпозиции. Denoising + cycle detection

### 1.6. Monte Carlo Simulation — СРЕДНИЙ

- **Описание:** Monte Carlo для price paths, option pricing, risk
- **Причина:** Нигде нет, критически важно для risk management
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Средняя
- **Время:** 1 неделя
- **Зависимости:** numpy
- **Файл:** `ai-signal-bot/src/technical_analysis/monte_carlo.py`
- **Интеграция:** Добавить в risk management, options pricing
- **Примечания:** GBM simulation, option pricing, VaR calculation. Можно GPU ускорить

### 1.7. Hurst Exponent — СРЕДНИЙ

- **Описание:** Hurst exponent для определения тренд vs range
- **Причина:** Нигде нет, полезно для strategy selection
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Низкая
- **Время:** 2 дня
- **Зависимости:** numpy
- **Файл:** `ai-signal-bot/src/technical_analysis/hurst.py`
- **Интеграция:** Добавить в AnalysisStage, использовать для strategy selection
- **Примечания:** H < 0.5 = mean-reverting, H = 0.5 = random walk, H > 0.5 = trending

### 1.8. ZScore Detector — СРЕДНИЙ

- **Описание:** ZScore для обнаружения аномалий в цене
- **Причина:** Нигде нет, полезно для mean reversion стратегий
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Низкая
- **Время:** 1 день
- **Зависимости:** numpy
- **Файл:** `ai-signal-bot/src/technical_analysis/zscore.py`
- **Интеграция:** Добавить в AnalysisStage
- **Примечания:** Rolling z-score, threshold > 2σ

### 1.9. VPIN (Volume-Synchronized Probability of Informed Trading) — СРЕДНИЙ

- **Описание:** VPIN для обнаружения токсичности order flow
- **Причина:** Нигде нет, критически важно для HFT
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Средняя
- **Время:** 1 неделя
- **Зависимости:** numpy
- **Файл:** `ai-signal-bot/src/technical_analysis/vpin.py`
- **Интеграция:** Добавить в microstructure analysis
- **Примечания:** Bulk volume classification, 50 buckets

### 1.10. Kyle's Lambda — НИЗКИЙ

- **Описание:** Kyle's Lambda для оценки ликвидности и informed trading
- **Причина:** Нигде нет, полезно для market impact
- **Приоритет:** НИЗКИЙ
- **Сложность:** Средняя
- **Время:** 3 дня
- **Зависимости:** numpy
- **Файл:** `ai-signal-bot/src/technical_analysis/kyle_lambda.py`
- **Интеграция:** Добавить в risk management, order sizing
- **Примечания:** lambda = Cov(returns, order_flow) / Var(order_flow)

### 1.11. Hawkes Process — НИЗКИЙ

- **Описание:** Hawkes process для моделирования интенсивности сделок
- **Причина:** Нигде нет, полезно для trade timing
- **Приоритет:** НИЗКИЙ
- **Сложность:** Высокая
- **Время:** 2 недели
- **Зависимости:** ticklib или custom
- **Файл:** `ai-signal-bot/src/technical_analysis/hawkes.py`
- **Интеграция:** Добавить в microstructure analysis
- **Примечания:** Self-exciting process, exponential kernel

### 1.12. Bayesian Weights для Ensemble — СРЕДНИЙ

- **Описание:** Bayesian weights для взвешивания стратегий в ensemble
- **Причина:** Нигде нет, сейчас используется static weights
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Средняя
- **Время:** 2 дня
- **Зависимости:** numpy, scipy
- **Файл:** `ai-signal-bot/src/strategies/bayesian_ensemble.py`
- **Интеграция:** Заменить static weights в EnsembleVoter
- **Примечания:** Beta distribution for win/loss, update online

### 1.13. Ornstein-Uhlenbeck Process — НИЗКИЙ

- **Описание:** OU process для mean reversion modeling
- **Причина:** Нигде нет, полезно для stat arb
- **Приоритет:** НИЗКИЙ
- **Сложность:** Средняя
- **Время:** 3 дня
- **Зависимости:** numpy
- **Файл:** `ai-signal-bot/src/technical_analysis/ornstein_uhlenbeck.py`
- **Интеграция:** Добавить в statistical arbitrage
- **Примечания:** dX = θ(μ - X)dt + σdW

### 1.14. Stochastic Volatility Models — НИЗКИЙ

- **Описание:** Heston model, SABR model для stochastic volatility
- **Причина:** Нигде нет, полезно для options pricing
- **Приоритет:** НИЗКИЙ
- **Сложность:** Высокая
- **Время:** 2 недели
- **Зависимости:** numpy, scipy
- **Файл:** `ai-signal-bot/src/technical_analysis/stochastic_vol.py`
- **Интеграция:** Добавить в options pricing
- **Примечания:** Heston: dV = κ(θ-V)dt + ξ√V dW. SABR для implied vol surface

---

## 2. QUANTUM MODELS (0% сейчас)

### 2.1. QAOA Portfolio Optimization — СРЕДНИЙ

- **Описание:** Quantum Approximate Optimization Algorithm для portfolio optimization
- **Причина:** Quantum computers могут решать QUBO задачи экспоненциально быстрее
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Высокая
- **Время:** 3 недели
- **Зависимости:** qiskit
- **Файл:** `ai-signal-bot/src/quantum/portfolio_qaoa.py`
- **Примечания:** Map Markowitz to QUBO, then to Ising Hamiltonian

### 2.2. VQE Risk Assessment — НИЗКИЙ

- **Описание:** Variational Quantum Eigensolver для risk assessment
- **Причина:** Quantum eigenvalue problems для risk matrices
- **Приоритет:** НИЗКИЙ
- **Сложность:** Высокая
- **Время:** 3 недели
- **Зависимости:** qiskit
- **Файл:** `ai-signal-bot/src/quantum/risk_vqe.py`

### 2.3. Quantum Kernel Signal Classifier — НИЗКИЙ

- **Описание:** Quantum kernel method для signal classification
- **Причина:** Quantum kernels могут захватывать нелинейные паттерны
- **Приоритет:** НИЗКИЙ
- **Сложность:** Высокая
- **Время:** 4 недели
- **Зависимости:** qiskit-machine-learning
- **Файл:** `ai-signal-bot/src/quantum/qml.py`

### 2.4. Quantum Monte Carlo Pricing — НИЗКИЙ

- **Описание:** Quantum amplitude estimation для option pricing (quadratic speedup)
- **Причина:** Quantum MC даёт квадратичное ускорение над classical MC
- **Приоритет:** НИЗКИЙ
- **Сложность:** Высокая
- **Время:** 3 недели
- **Зависимости:** qiskit
- **Файл:** `ai-signal-bot/src/quantum/qmc_pricing.py`

### 2.5. Quantum Annealing for Arbitrage — НИЗКИЙ

- **Описание:** Quantum annealing для поиска арбитражных возможностей
- **Причина:** D-Wave quantum annealer может решать optimization задачи быстрее
- **Приоритет:** НИЗКИЙ
- **Сложность:** Высокая
- **Время:** 3 недели
- **Зависимости:** dwave-system
- **Файл:** `ai-signal-bot/src/quantum/annealing_arb.py`

### 2.6. Quantum Neural Networks — НИЗКИЙ

- **Описание:** Quantum neural networks для price prediction
- **Причина:** QNN могут моделировать квантовые суперпозиции состояний рынка
- **Приоритет:** НИЗКИЙ
- **Сложность:** Высокая
- **Время:** 4 недели
- **Зависимости:** pennylane
- **Файл:** `ai-signal-bot/src/quantum/qnn.py`

---

## 3. BROKER INTEGRATION (5% сейчас)

### 3.1. Broker Interface Abstraction — ВЫСОКИЙ

- **Описание:** Абстрактный интерфейс для подключения к реальным брокерам
- **Причина:** Сейчас только симулятор, нет реального broker API
- **Приоритет:** ВЫСОКИЙ
- **Сложность:** Средняя
- **Время:** 1 неделя
- **Файл:** `ai-signal-bot/src/broker/broker_interface.py`
- **Примечания:** ABC с методами: place_order, cancel_order, get_position, get_balance, get_account

### 3.2. Binance Broker Implementation — ВЫСОКИЙ

- **Описание:** Реализация Binance broker API
- **Причина:** Binance — крупнейшая криптобиржа
- **Приоритет:** ВЫСОКИЙ
- **Сложность:** Средняя
- **Время:** 2 недели
- **Файл:** `ai-signal-bot/src/broker/binance_broker.py`
- **Примечания:** REST + WebSocket, API key authentication

### 3.3. Interactive Brokers Integration — СРЕДНИЙ

- **Описание:** Interactive Brokers API для traditional markets
- **Причина:** IB — один из крупнейших traditional брокеров
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Высокая
- **Время:** 3 недели
- **Файл:** `ai-signal-bot/src/broker/interactive_brokers.py`
- **Зависимости:** ibapi
- **Примечания:** TWS connection, FIX-like protocol

### 3.4. FIX 4.4 Real Broker Connection — ВЫСОКИЙ

- **Описание:** Подключить существующий FIX framework к реальному брокеру
- **Причина:** FIX framework есть в C++, но не подключён
- **Приоритет:** ВЫСОКИЙ
- **Сложность:** Высокая
- **Время:** 4 недели
- **Файл:** `hft-trade-bot/src/fix/fix_session.h`
- **Примечания:** Authentication, heartbeat, order submission, execution reports

### 3.5. Smart Order Router с реальными брокерами — СРЕДНИЙ

- **Описание:** Smart order routing между несколькими брокерами
- **Причина:** Лучшее исполнение, минимальные costs
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Высокая
- **Время:** 2 недели
- **Примечания:** Best price, lowest cost, fastest execution

### 3.6. Prime Broker Integration — НИЗКИЙ

- **Описание:** Prime broker для institutional trading
- **Причина:** Institutional grade trading
- **Приоритет:** НИЗКИЙ
- **Сложность:** Высокая
- **Время:** 4 недели
- **Примечания:** Margin, clearing, settlement

---

## 4. REAL HFT FEATURES (10% сейчас)

### 4.1. Hardware Timestamping — СРЕДНИЙ

- **Описание:** Hardware timestamping через SO_TIMESTAMPING, PTP hardware clock
- **Причина:** Точные timestamps критичны для HFT
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Высокая
- **Время:** 2 недели
- **Файл:** `hft-trade-bot/src/utils/hardware_timestamp.h`
- **Примечания:** Linux SO_TIMESTAMPING, NIC timestamping

### 4.2. PTP (Precision Time Protocol) — НИЗКИЙ

- **Описание:** PTP для суб-микросекундной синхронизации времени
- **Причина:** Все компоненты должны иметь одинаковое время
- **Приоритет:** НИЗКИЙ
- **Сложность:** Высокая
- **Время:** 3 недели
- **Зависимости:** linuxptp
- **Примечания:** IEEE 1588 PTP, hardware clock

### 4.3. GPS Timing — НИЗКИЙ

- **Описание:** GPS для абсолютной time synchronization
- **Причина:** GPS даёт наносекундную точность
- **Приоритет:** НИЗКИЙ
- **Сложность:** Высокая
- **Время:** 2 недели
- **Зависимости:** GPS hardware
- **Примечания:** GPS receiver, PPS signal

### 4.4. Tick-by-Tick Data Processing — СРЕДНИЙ

- **Описание:** Обработка tick-by-tick данных (миллионы ticks/sec)
- **Причина:** HFT работает с tick data, не candle data
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Средняя
- **Время:** 2 недели
- **Файл:** `ai-signal-bot/src/data_collection/tick_processor.py`
- **Примечания:** Ring buffer, lock-free, numpy structured arrays

### 4.5. Order Book Reconstruction — СРЕДНИЙ

- **Описание:** Реконструкция order book из L2 data
- **Причина:** Полный order book нужен для microstructure analysis
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Средняя
- **Время:** 2 недели
- **Файл:** `ai-signal-bot/src/data_collection/order_book_reconstructor.py`
- **Примечания:** Incremental updates, snapshot + diff

### 4.6. Market Data Normalization — СРЕДНИЙ

- **Описание:** Нормализация данных с разных бирж к единому формату
- **Причина:** Каждая биржа имеет свой формат
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Средняя
- **Время:** 1 неделя
- **Файл:** `ai-signal-bot/src/data_collection/normalizer.py`
- **Примечания:** Binance, OKX, Bybit, Coinbase — разные форматы

### 4.7. Sub-microsecond Latency Measurement — СРЕДНИЙ

- **Описание:** Измерение задержки с наносекундной точностью
- **Причина:** HFT требует точного измерения задержки
- **Приоритет:** СРЕДНИЙ
- **Сложность:** Средняя
- **Время:** 1 неделя
- **Файл:** `hft-trade-bot/src/utils/latency_profiler.h`
- **Примечания:** TSC, rdtsc, clock_gettime(CLOCK_MONOTONIC_RAW)

### 4.8. Co-location Guide — НИЗКИЙ

- **Описание:** Документация по co-location
- **Причина:** HFT требует размещения серверов рядом с биржей
- **Приоритет:** НИЗКИЙ
- **Сложность:** Низкая
- **Время:** 2 дня
- **Файл:** `docs/COLOCATION.md`
- **Примечания:** AWS Direct Connect, Equinix, NY4/LD4 datacenters

### 4.9. DMA (Direct Market Access) Framework — НИЗКИЙ

- **Описание:** Framework для direct market access
- **Причина:** DMA устраняет задержку брокера
- **Приоритет:** НИЗКИЙ
- **Сложность:** Высокая
- **Время:** 4 недели
- **Примечания:** FIX DMA, sponsored access

---

## 5. EXCHANGE SIMULATOR — Идеи расширения

### 5.1. OKX Real API Integration — СРЕДНИЙ
- **Описание:** OKX API для реальных цен
- **Время:** 1 неделя
- **Файл:** `exchange_simulator/okx_feed.py`

### 5.2. Kraken Real API Integration — СРЕДНИЙ
- **Описание:** Kraken API для реальных цен
- **Время:** 1 неделя
- **Файл:** `exchange_simulator/kraken_feed.py`

### 5.3. Market Impact Model (Almgren-Chriss) — СРЕДНИЙ
- **Описание:** Модель влияния крупных ордеров на цену
- **Время:** 1 неделя
- **Файл:** `exchange_simulator/market_impact.py`

### 5.4. Monte Carlo Option Pricing — НИЗКИЙ
- **Описание:** Monte Carlo для exotic options
- **Время:** 1 неделя
- **Файл:** `exchange_simulator/options_monte_carlo.py`

### 5.5. TWAP/VWAP Algorithmic Orders — НИЗКИЙ
- **Описание:** TWAP и VWAP алгоритмические ордера
- **Время:** 2 недели

### 5.6. Implied Volatility Surface — НИЗКИЙ
- **Описание:** IV surface для разных страйков и экспираций
- **Время:** 1 неделя
- **Примечания:** SABR model

### 5.7. News Impact Simulation — НИЗКИЙ
- **Описание:** Симуляция влияния новостей на цены
- **Время:** 2 недели

### 5.8. Social Trading Simulation — НИЗКИЙ
- **Описание:** Симуляция социального трейдинга
- **Время:** 2 недели

---

## 6. AI SIGNAL BOT — Идеи расширения

### 6.1. XGBoost Signal Classifier — СРЕДНИЙ
- **Время:** 1 неделя
- **Файл:** `ai-signal-bot/src/ml/xgboost_signal.py`

### 6.2. LightGBM Signal Classifier — СРЕДНИЙ
- **Время:** 1 неделя
- **Файл:** `ai-signal-bot/src/ml/lightgbm_signal.py`

### 6.3. SHAP Explainability — СРЕДНИЙ
- **Время:** 3 дня
- **Файл:** `ai-signal-bot/src/ml/explainability.py`

### 6.4. LIME Explainability — СРЕДНИЙ
- **Время:** 3 дня

### 6.5. A/B Testing Framework — СРЕДНИЙ
- **Время:** 1 неделя
- **Файл:** `ai-signal-bot/src/ml/ab_testing.py`

### 6.6. ONNX Model Export — СРЕДНИЙ
- **Время:** 3 дня

### 6.7. Model Caching — СРЕДНИЙ
- **Время:** 2 дня
- **Файл:** `ai-signal-bot/src/ml/model_cache.py`

### 6.8. Hierarchical Risk Parity — СРЕДНИЙ
- **Время:** 1 неделя
- **Файл:** `ai-signal-bot/src/portfolio/hierarchical_risk_parity.py`

### 6.9. Walk-Forward Analysis — СРЕДНИЙ
- **Время:** 1 неделя

### 6.10. Additional Strategies (Pairs Trading, Triangular Arb) — СРЕДНИЙ
- **Время:** 2 недели

### 6.11. ML Model Hyperparameter Tuning (Optuna) — ВЫСОКИЙ
- **Время:** 2 недели
- **Файл:** `ai-signal-bot/scripts/tune_lstm.py`

### 6.12. ML Model Training (обучить модели!) — ВЫСОКИЙ
- **Описание:** Модели существуют, но не обучены. Нужны обученные веса.
- **Время:** 1 неделя (после установки PyTorch)
- **Примечания:** pip install torch, запустить scripts/train_ml_models.py

---

## 7. HFT TRADE BOT — Идеи расширения

### 7.1. CUDA Kernels for Indicators — ВЫСОКИЙ
- **Время:** 3 недели
- **Файл:** `hft-trade-bot/src/gpu/cuda_indicators.cu`

### 7.2. CUDA Kernels for Monte Carlo VaR — ВЫСОКИЙ
- **Время:** 2 недели
- **Файл:** `hft-trade-bot/src/gpu/cuda_var.cu`

### 7.3. AVX-512 SIMD — СРЕДНИЙ
- **Время:** 1 неделя

### 7.4. FPGA Integration — НИЗКИЙ
- **Время:** 4 недели

### 7.5. DPDK Network Stack — НИЗКИЙ
- **Время:** 2 недели

### 7.6. Additional Strategies (Stat Arb V3, Mean Rev V3) — СРЕДНИЙ
- **Время:** 2 недели

### 7.7. hft-executor WebSocket Connection — ВЫСОКИЙ
- **Описание:** Rust executor имеет заглушку вместо WebSocket
- **Время:** 1 неделя
- **Файл:** `hft-executor/src/lib.rs`

---

## 8. WEB UI — Идеи расширения

### 8.1. Mobile Responsiveness — ВЫСОКИЙ
- **Время:** 2 недели

### 8.2. Strategy Backtesting UI — СРЕДНИЙ
- **Время:** 1 неделя

### 8.3. Risk Dashboard — СРЕДНИЙ
- **Время:** 1 неделя

### 8.4. Custom Indicators Overlay — СРЕДНИЙ
- **Время:** 1 неделя

### 8.5. Drawing Tools — СРЕДНИЙ
- **Время:** 1 неделя

### 8.6. Kraken Theme — НИЗКИЙ
- **Время:** 3 дня

### 8.7. Quantum Models Dashboard — НИЗКИЙ
- **Описание:** UI для quantum models (QAOA, VQE)
- **Время:** 1 неделя

### 8.8. Broker Connection Dashboard — СРЕДНИЙ
- **Описание:** UI для управления broker connections
- **Время:** 1 неделя

---

## 9. MONITORING — Идеи расширения

### 9.1. Additional Alert Rules — СРЕДНИЙ
- **Время:** 3 дня

### 9.2. ML-based Anomaly Detection — СРЕДНИЙ
- **Время:** 1 неделя
- **Файл:** `ai-signal-bot/src/monitoring/anomaly_detection.py`

### 9.3. Security Monitoring — СРЕДНИЙ
- **Время:** 1 неделя
- **Файл:** `ai-signal-bot/src/monitoring/security_metrics.py`

### 9.4. Trace Correlation (Python ↔ C++) — СРЕДНИЙ
- **Описание:** Correlation ID между Python и C++ логами
- **Время:** 1 неделя

---

## 10. ИНФРАСТРУКТУРА — Идеи расширения

### 10.1. Production Kubernetes — ВЫСОКИЙ
- **Время:** 2 недели

### 10.2. Ingress + SSL/TLS — ВЫСОКИЙ
- **Время:** 1 неделя

### 10.3. Vault Secret Management — СРЕДНИЙ
- **Время:** 1 неделя

### 10.4. Backup and Restore — СРЕДНИЙ
- **Время:** 1 неделя

### 10.5. Disaster Recovery Plan — СРЕДНИЙ
- **Время:** 3 дня

### 10.6. Service Mesh (Istio) — НИЗКИЙ
- **Время:** 2 недели

### 10.7. Multi-Region Deployment — НИЗКИЙ
- **Время:** 4 недели

---

## 11. БЕЗОПАСНОСТЬ — Идеи расширения

### 11.1. Penetration Testing — СРЕДНИЙ
- **Время:** 1 неделя

### 11.2. Security Monitoring — СРЕДНИЙ
- **Время:** 1 неделя

### 11.3. Incident Response Plan — СРЕДНИЙ
- **Время:** 3 дня

### 11.4. Compliance (SOC2, ISO27001) — НИЗКИЙ
- **Время:** 4 недели

### 11.5. DB Leak Prevention — ВЫСОКИЙ
- **Описание:** Защита от утечек БД — encryption at rest, connection encryption, access control
- **Время:** 1 неделя
- **Примечания:** SQLite WAL encryption, PostgreSQL SSL, connection pooling security

### 11.6. API Key Vault — ВЫСОКИЙ
- **Описание:** Безопасное хранение API ключей
- **Время:** 3 дня
- **Примечания:** Environment variables, Vault, never in code

---

## 12. МАШИННОЕ ОБУЧЕНИЕ — Идеи расширения

### 12.1. Обучить существующие модели — ВЫСОКИЙ
- **Описание:** LSTM, Transformer, RL — код есть, модели не обучены
- **Время:** 1 неделя
- **Зависимости:** pip install torch

### 12.2. Transformer V2 (multi-head attention) — СРЕДНИЙ
- **Время:** 2 недели

### 12.3. BERT for Trading (NLP) — НИЗКИЙ
- **Время:** 3 недели

### 12.4. Graph Neural Networks — НИЗКИЙ
- **Время:** 3 недели

### 12.5. AutoML (AutoGluon, H2O) — НИЗКИЙ
- **Время:** 1 неделя

### 12.6. Model Serving (Triton, MLflow) — НИЗКИЙ
- **Время:** 1 неделя

### 12.7. Hyperparameter Tuning (Optuna) — СРЕДНИЙ
- **Время:** 2 недели

---

## 13. ТЕСТИРОВАНИЕ — Идеи расширения

### 13.1. Increase Coverage to 90%+ — ВЫСОКИЙ
- **Время:** 2 недели

### 13.2. End-to-End Tests — СРЕДНИЙ
- **Время:** 1 неделя

### 13.3. Property-Based Tests (Hypothesis) — СРЕДНИЙ
- **Время:** 3 дня

### 13.4. Security Tests — ВЫСОКИЙ
- **Время:** 1 неделя

### 13.5. Visual Regression Tests — НИЗКИЙ
- **Время:** 3 дня

### 13.6. Mutation Testing — НИЗКИЙ
- **Время:** 1 неделя

---

## 14. ИДЕИ ОТ ИИ (добавляются по мере анализа кода)

*Этот раздел заполняется ИИ во время работы по workflow (ai-monster-workflow.md).*

*Каждая идея должна содержать:*
- *Описание*
- *Причина*
- *Приоритет*
- *Сложность*
- *Оценка времени*
- *Файлы*
- *Примечания*

---

## ПРИОРИТЕТЫ

### ВЫСОКИЙ (критично, делать в первую очередь)
1. Честная документация (обновить все docs)
2. Недостающие математические модели (HMM, GARCH, Kalman в Python)
3. ML обучение (обучить существующие модели)
4. Broker integration (interface + Binance)
5. DB leak prevention
6. Auto-commit в workflow
7. Increase test coverage to 90%+
8. hft-executor WebSocket connection

### СРЕДНИЙ (важно, делать во вторую очередь)
1. Copula, Wavelet, Monte Carlo, Hurst, VPIN
2. Quantum models (QAOA)
3. Real HFT features (hardware timestamping, tick data)
4. Additional ML models (XGBoost, LightGBM)
5. Model explainability (SHAP, LIME)
6. Mobile responsiveness
7. Production Kubernetes
8. Penetration testing

### НИЗКИЙ (nice to have)
1. FPGA, DPDK, PTP, GPS
2. Quantum VQE, QML, QNN
3. Additional exchange themes
4. Service mesh
5. Compliance certifications
6. Video tutorials

---

**Конец документа**
