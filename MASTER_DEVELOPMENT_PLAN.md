# MASTER DEVELOPMENT PLAN — HFT Trading System

**Дата:** 15 августа 2026
**Цель:** Довести каждую часть проекта до 100% готовности.
**Статус:** 62% READY (глубокий аудит v4.3 — проверен каждый claim в README.md/ARCHITECTURE.md/MATH_MODELS.md против кода)
**Версия:** 4.3 — ГЛУБОКИЙ АУДИТ v3 (пересчитаны тесты и панели, исправлены ошибки v4.1)

---

## ОГЛАВЛЕНИЕ

```
0.   ТЕКУЩЕЕ СОСТОЯНИЕ (ГЛУБОКИЙ АУДИТ v4.3)
1.   UI-ONLY МОДЕЛИ → ПОРТИРОВАТЬ В TRADING LOGIC (40+ моделей!)
2.   DEAD CODE: CUDA И ONNX — ВКЛЮЧИТЬ ИЛИ УДАЛИТЬ
3.   НЕДОСТАЮЩИЕ МАТЕМАТИЧЕСКИЕ МОДЕЛИ (нет даже в UI)
4.   QUANTUM MODELS — ПЛАН ДО 100%
5.   BROKER INTEGRATION — ПЛАН ДО 100%
6.   REAL HFT FEATURES — ПЛАН ДО 100%
7.   EXCHANGE SIMULATOR — ПЛАН ДО 100%
8.   AI SIGNAL BOT — ПЛАН ДО 100%
9.   HFT TRADE BOT (C++) — ПЛАН ДО 100%
10.  WEB UI — ПЛАН ДО 100%
11.  MONITORING — ПЛАН ДО 100%
12.  ТЕСТИРОВАНИЕ — ПЛАН ДО 100%
13.  ИНФРАСТРУКТУРА — ПЛАН ДО 100%
14.  БЕЗОПАСНОСТЬ — ПЛАН ДО 100%
15.  ДОКУМЕНТАЦИЯ — ПЛАН ДО 100% (README ВРЁТ)
16.  TIMELINE
17.  ИТОГОВАЯ ТАБЛИЦА ГОТОВНОСТИ
```

---

## 0. ТЕКУЩЕЕ СОСТОЯНИЕ (ГЛУБОКИЙ АУДИТ v4.3)

### 0.1. Честная таблица готовности

| Компонент | README badge (было) | Реально (v4.3) | Статус |
|-----------|-------------------|---------|--------|
| Exchange Simulator | 90% | 90% | Production-Ready ✅ |
| AI Signal Bot | 85% | 62% | Beta ❌ (40+ models UI-only, ML not trained, SVI/SABR найдены) |
| HFT Trade Bot | 80% | 70% | Beta (CUDA/ONNX dead code) |
| Web UI | 85% | 85% | Production-Ready ✅ (197 panels, 227 components) |
| hft-executor (Rust) | - | 65% | Beta (WebSocket stub, 0 tests) |
| Monitoring | 90% | 90% | Production-Ready ✅ |
| Testing | 85% | 70% | 172 test files (82 Py + 46 C++ + 44 JS) |
| Infrastructure | 75% | 65% | Beta |
| Security | 90% | 70% | Needs penetration testing |
| Documentation | 95% | 55% | ⚠️ README исправлен в v4.3 |
| **Общая готовность** | **85%** | **62%** | |

### 0.2. README badges vs reality

| Badge | Claims (было) | Reality (v4.3) | Исправлено? |
|-------|-------------|---------|------------|
| strategies | 34+ | 19 (10 Python + 6 C++ + 3 доп) | ✅ Да |
| math models | 75+ | 44 trading + 40 UI-only | ✅ Да |
| panels | 197 | 197 | ✅ Да |
| tests | 484+ passing | 172+ test files (82 Py + 46 C++ + 44 JS) | ✅ Да |
| components | 223 | 227 | ✅ Да |
| readiness | 85% | 62% | ✅ Добавлен badge |
| CUDA | "acceleration" | Dead code (#ifdef) | ✅ Добавлен badge |
| ONNX | "ML inference" | Dead code (#ifdef) | ✅ Добавлен badge |
| SVI/SABR | claimed | ✅ EXISTS in `volatility_surface.py` | ✅ Подтверждено |

### 0.3. Ключевые находки аудита v4.3

1. **40+ математических моделей существуют ТОЛЬКО как UI компоненты** (React .jsx), не интегрированы в trading pipeline
2. **CUDA kernels** — полный код есть (`gpu_accelerator.cu`), но за `#ifdef USE_CUDA`, никогда не компилируется
3. **ONNX Runtime** — полный код есть (`onnx_engine.h`), но за `#ifdef USE_ONNXRUNTIME`, никогда не компилируется
4. **SVI/SABR volatility surface** — ✅ ЕСТЬ в коде (`ai-signal-bot/src/pricing/volatility_surface.py`, 209 строк). Исправление v4.0: предыдущий аудит ошибочно утверждал отсутствие.
5. **ML модели не обучены** — код есть, весов нет
6. **Quantum models** — 0%
7. **Broker integration** — 5% (FIX framework есть, не подключён)
8. **Real HFT features** — 10% (нет co-location, DMA, PTP, GPS, tick data)
9. **HMM в Python** — простой custom, не настоящий HMM
10. **LightGBM/XGBoost** — optional import, не установлены

---

## 1. UI-ONLY МОДЕЛИ → ПОРТИРОВАТЬ В TRADING LOGIC

**Проблема:** 40+ моделей существуют как React UI компоненты, но НЕ интегрированы в Python/C++ trading pipeline.

**Решение:** Портировать ключевые модели из UI в Python trading logic.

### 1.1. Высокий приоритет (влияют на trading)

| Модель | UI файл | Python файл (создать) | Время |
|--------|---------|----------------------|-------|
| GARCH(1,1) | `GARCHVolatility.jsx` | `src/technical_analysis/garch.py` | 1 неделя |
| Markov-Switching GARCH | `MarkovSwitchingGARCH.jsx` | `src/technical_analysis/ms_garch.py` | 2 недели |
| Kalman Filter | `KalmanFilterPrice.jsx` | `src/technical_analysis/kalman.py` | 3 дня |
| Copula | `CopulaModel.jsx` | `src/technical_analysis/copula.py` | 2 недели |
| Wavelet | `WaveletDecomposition.jsx` | `src/technical_analysis/wavelet.py` | 1 неделя |
| Monte Carlo | `MonteCarlo.jsx` | `src/technical_analysis/monte_carlo.py` | 1 неделя |
| Hawkes Process | `HawkesProcess.jsx` | `src/technical_analysis/hawkes.py` | 2 недели |
| Almgren-Chriss | `AlmgrenChriss.jsx` | `src/research/almgren_chriss.py` | 1 неделя |
| Optimal Stopping | `OptimalStopping.jsx` | `src/technical_analysis/optimal_stopping.py` | 1 неделя |
| K-Means Clustering | `KMeansClustering.jsx` | `src/technical_analysis/kmeans.py` | 3 дня |
| Gaussian Mixture | `GaussianMixtureModel.jsx` | `src/technical_analysis/gmm.py` | 3 дня |
| PCA | `PrincipalComponentAnalysis.jsx` | `src/technical_analysis/pca.py` | 2 дня |
| SVM | `SupportVectorMachine.jsx` | `src/ml/svm_signal.py` | 3 дня |
| Autoencoder | `Autoencoder.jsx` | `src/ml/autoencoder.py` | 1 неделя |
| VAE | `VariationalAutoencoder.jsx` | `src/ml/vae.py` | 2 недели |
| Isolation Forest | `IsolationForest.jsx` | уже есть в `ml_ensemble.py` ✅ | - |

### 1.2. Средний приоритет (research / risk)

| Модель | UI файл | Python файл (создать) | Время |
|--------|---------|----------------------|-------|
| Bayesian Price Predictor | `BayesianPricePredictor.jsx` | `src/technical_analysis/bayesian_price.py` | 1 неделя |
| Bayesian Structural TS | `BayesianStructuralTimeSeries.jsx` | `src/technical_analysis/bayesian_sts.py` | 2 недели |
| HMC | `HamiltonianMonteCarlo.jsx` | `src/technical_analysis/hmc.py` | 2 недели |
| BOCPD | нет | `src/technical_analysis/bocpd.py` | 1 неделя |
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

### 1.3. Низкий приоритет (теоретические, сложные)

| Модель | UI файл | Время |
|--------|---------|-------|
| Persistent Homology | `PersistentHomologyLandscape.jsx` | 3 недели |
| Wasserstein/Sinkhorn | `OptimalTransport.jsx` | 2 недели |
| Schrodinger Bridge | `SchrodingerBridge.jsx` | 3 недели |
| Malliavin Calculus | `MalliavinCalculus.jsx` | 3 недели |
| Fokker-Planck | `FokkerPlanckEquation.jsx` | 2 недели |
| Ito Generator | `ItoCalculusGenerator.jsx` | 1 неделя |
| SDE (Euler/Milstein) | `StochasticDifferentialEquations.jsx` | 1 неделя |
| Girsanov Theorem | `GirsanovTheorem.jsx` | 2 недели |
| Renyi Entropy | `RenyiEntropyDynamics.jsx` | 1 неделя |
| Kolmogorov-Sinai | `KolmogorovSinaiEntropy.jsx` | 1 неделя |
| Information Bottleneck | `InformationBottleneck.jsx` | 2 недели |
| Renormalization Group | `RenormalizationGroup.jsx` | 3 недели |
| Free Energy Principle | `FreeEnergyPrinciple.jsx` | 3 недели |
| Lie Group Symmetries | `LieGroupSymmetries.jsx` | 3 недели |
| Burgers Equation | `BurgersEquation.jsx` | 2 недели |
| Sobolev Regularization | `SobolevSpaceRegularization.jsx` | 2 недели |
| Lax-Milgram | `LaxMilgram.jsx` | 2 недели |
| Riesz Representation | `RieszRepresentation.jsx` | 1 неделя |
| Banach Fixed-Point | `BanachFixedPoint.jsx` | 1 неделя |
| Hahn Decomposition | `HahnDecomposition.jsx` | 1 неделя |
| Cameron-Martin | `CameronMartinFormula.jsx` | 1 неделя |
| Radon-Nikodym | `RadonNikodymDerivative.jsx` | 1 неделя |
| Prokhorov Metric | `ProkhorovMetric.jsx` | 1 неделя |
| Stone-Cech | `StoneCechCompactification.jsx` | 2 недели |
| Arzela-Ascoli | `ArzelaAscoli.jsx` | 1 неделя |
| Hopf Bifurcation | `HopfBifurcation.jsx` | 2 недели |
| Ehlers SuperSmoother | `EhlersSuperSmoother.jsx` | 3 дня |
| Cesaro/Fejer | `CesaroFejerKernel.jsx` | 3 дня |

### Чеклист портирования UI-only моделей

```
HIGH PRIORITY (8 недель):
[ ] GARCH(1,1) → Python
[ ] Markov-Switching GARCH → Python
[ ] Kalman Filter → Python
[ ] Copula → Python
[ ] Wavelet → Python
[ ] Monte Carlo → Python
[ ] Hawkes Process → Python
[ ] Almgren-Chriss → Python
[ ] K-Means → Python
[ ] Gaussian Mixture → Python
[ ] PCA → Python
[ ] SVM → Python
[ ] Autoencoder → Python
[ ] VAE → Python
[ ] Optimal Stopping → Python
[ ] Интегрировать все в pipeline
[ ] Тесты для каждой модели

MEDIUM PRIORITY (12 недель):
[ ] Bayesian Price Predictor → Python
[ ] Bayesian Structural TS → Python
[ ] HMC → Python
[ ] BOCPD → Python
[ ] Transfer Entropy → Python
[ ] CCM → Python
[ ] Cramer-Rao → Python
[ ] Rough Volatility → Python
[ ] VMD → Python
[ ] EMD/HHT → Python
[ ] DTW → Python
[ ] Compressed Sensing → Python
[ ] RKHS → Python
[ ] Koopman → Python
[ ] RMT → Python
[ ] Graph MST → Python
[ ] Tensor Decomposition → Python
[ ] Affine Arithmetic → Python
[ ] Stochastic Optimal Control → Python
[ ] Pontryagin → Python

LOW PRIORITY (30+ недель — теоретические):
[ ] Persistent Homology → Python
[ ] Wasserstein/Sinkhorn → Python
[ ] Schrodinger Bridge → Python
[ ] Malliavin Calculus → Python
[ ] Fokker-Planck → Python
[ ] Ito Generator → Python
[ ] SDE → Python
[ ] Girsanov → Python
[ ] Renyi Entropy → Python
[ ] Kolmogorov-Sinai → Python
[ ] Information Bottleneck → Python
[ ] Renormalization Group → Python
[ ] Free Energy → Python
[ ] Lie Group → Python
[ ] Burgers → Python
[ ] Sobolev → Python
[ ] Lax-Milgram → Python
[ ] Riesz → Python
[ ] Banach → Python
[ ] Hahn → Python
[ ] Cameron-Martin → Python
[ ] Radon-Nikodym → Python
[ ] Prokhorov → Python
[ ] Stone-Cech → Python
[ ] Arzela-Ascoli → Python
[ ] Hopf → Python
[ ] Ehlers SuperSmoother → Python
[ ] Cesaro/Fejer → Python
```

**Итог: UI-only модели 0% → 100% (50+ недель для всех, 8 недель для high priority)**

---

## 2. DEAD CODE: CUDA И ONNX — ВКЛЮЧИТЬ ИЛИ УДАЛИТЬ

### 2.1. CUDA (`gpu_accelerator.cu`)

**Статус:** Полный код есть (RSI, EMA, Monte Carlo VaR, matrix mul kernels), но за `#ifdef USE_CUDA`, никогда не компилируется в CI.

**Решение:** Включить в CI build с CUDA toolkit.

```
[ ] Добавить CUDA в CMakeLists.txt (option USE_CUDA)
[ ] Добавить CUDA toolkit в GitHub Actions
[ ] Тестировать на CUDA-enabled runner
[ ] Или: добавить fallback CPU implementation без #ifdef
```

### 2.2. ONNX Runtime (`onnx_engine.h`)

**Статус:** Полный код есть (session management, inference, multi-model), но за `#ifdef USE_ONNXRUNTIME`, никогда не компилируется.

**Решение:** Включить в CI build с ONNX Runtime.

```
[ ] Добавить ONNX Runtime в CMakeLists.txt (option USE_ONNXRUNTIME)
[ ] Добавить onnxruntime в vcpkg
[ ] Тестировать с простым ONNX model
[ ] Или: добавить fallback без #ifdef
```

---

## 3. НЕДОСТАЮЩИЕ МАТЕМАТИЧЕСКИЕ МОДЕЛИ (нет даже в UI)

### 3.1. Модели, которых нет ВООБЩЕ

- ❌ **Hurst exponent** — нет нигде
- ❌ **VPIN** — нет нигде
- ❌ **Kyle's Lambda** — нет нигде
- ❌ **ZScore detector** — нет нигде (как отдельной модели)
- ❌ **Ornstein-Uhlenbeck** — нет нигде
- ❌ **SVI/SABR volatility surface** — нет нигде (README claims!)
- ❌ **MAMA/FAMA** — нет нигде
- ❌ **Hilbert Transform** — нет нигде
- ❌ **Blahut-Arimoto** — нет нигде
- ❌ **Bayesian Ridge** — нет нигде
- ❌ **Welch PSD** — нет нигде
- ❌ **CWT** — нет нигде
- ❌ **EWMA volatility** — нет как отдельной модели
- ❌ **Parkinson volatility** — нет нигде

### 3.2. HMM в Python — заменить на настоящий

**Текущее:** Простой custom `HMMRegimeDetector` в `ml_ensemble.py` (Gaussian mixture + transition matrix)
**Нужно:** Настоящий HMM с Baum-Welch, Viterbi через `hmmlearn`

---

## 4-6. QUANTUM / BROKER / REAL HFT

(Без изменений из v3.0 — см. предыдущие секции)

### Сводка:

| Категория | Сейчас | План | Время |
|-----------|--------|------|-------|
| Quantum Models | 0% | 100% | 12 недель |
| Broker Integration | 5% | 100% | 8 недель |
| Real HFT Features | 10% | 100% | 10 недель |

---

## 7-15. КОМПОНЕНТЫ — ПЛАН ДО 100%

### Сводка по компонентам

| Компонент | Сейчас | План | Время |
|-----------|--------|------|-------|
| Exchange Simulator | 90% | 100% | 4 недели |
| AI Signal Bot | 60% | 100% | 20 недель (вкл портирование UI-only) |
| HFT Trade Bot | 70% | 100% | 10 недель (вкл CUDA/ONNX) |
| Web UI | 85% | 100% | 6 недель |
| Monitoring | 90% | 100% | 3 недели |
| Testing | 70% | 100% | 6 недель |
| Infrastructure | 65% | 100% | 8 недель |
| Security | 70% | 100% | 4 недели |
| Documentation | 50% | 100% | 3 недели (исправить README) |
| UI-only → Trading | 0% | 100% | 50+ недель (все) / 8 недель (high) |
| Quantum Models | 0% | 100% | 12 недель |
| Broker Integration | 5% | 100% | 8 недель |
| Real HFT Features | 10% | 100% | 10 недель |
| CUDA/ONNX | Dead code | Active | 2 недели |
| ML Training | 0% | 100% | 2 недели |

---

## 16. TIMELINE

### Phase 1: Critical Fixes (10 недель)
- Исправить README.md (1 неделя)
- Портировать high priority UI-only модели (8 недель)
- Включить CUDA/ONNX в CI (2 недели)
- ML обучение (2 недели, параллельно)

### Phase 2: Core Features (20 недель)
- Broker integration (8 недель)
- AI Signal Bot до 100% (20 недель, вкл medium priority модели)
- HFT Trade Bot до 100% (10 недель)

### Phase 3: Advanced (12 недель)
- Quantum models (12 недель)
- Real HFT features (10 недель)
- Web UI до 100% (6 недель)

### Phase 4: Polish (10 недель)
- Testing до 100% (6 недель)
- Infrastructure до 100% (8 недель)
- Security до 100% (4 недели)
- Low priority UI-only модели (30+ недель, фоново)

**Total: 52 недели (~12 месяцев) для ВСЕГО. 10 недель для critical.**

---

## 17. ИТОГОВАЯ ТАБЛИЦА ГОТОВНОСТИ

| Компонент | Сейчас | План | Priority |
|-----------|--------|------|----------|
| Exchange Simulator | 90% | 100% | Medium |
| AI Signal Bot | 60% | 100% | **HIGH** |
| HFT Trade Bot | 70% | 100% | **HIGH** |
| Web UI | 85% | 100% | Medium |
| Monitoring | 90% | 100% | Low |
| Testing | 70% | 100% | **HIGH** |
| Infrastructure | 65% | 100% | Medium |
| Security | 70% | 100% | Medium |
| Documentation | 50% | 100% | **HIGH** (README врет) |
| UI-only → Trading | 0% | 100% | **HIGH** (40+ моделей) |
| Quantum Models | 0% | 100% | Medium |
| Broker Integration | 5% | 100% | **HIGH** |
| Real HFT Features | 10% | 100% | Medium |
| CUDA/ONNX | Dead | Active | **HIGH** |
| ML Training | 0% | 100% | **HIGH** |
| **Общая готовность** | **60%** | **100%** | |

---

**Конец документа**
