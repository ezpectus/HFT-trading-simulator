# Mathematical Models

Detailed breakdown of all quantitative models in the HFT Trading System with formulas and source file references.

---

## 1. Market Simulation

### Geometric Brownian Motion (GBM)
```
S(t+dt) = S(t) * exp((mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*Z)
```
- **Source:** `exchange-simulator/exchange_simulator/market_simulator.py`

### Student-t Returns (Fat Tails)
Replaces Gaussian with `t(df=4)` for realistic tail risk.
- **Source:** `exchange-simulator/exchange_simulator/market_microstructure.py`

### Merton Jump Diffusion
```
S(t+dt) = S(t) * exp((mu - 0.5*sigma^2 - lambda*E[J])*dt + sigma*sqrt(dt)*Z + sum(J_i))
```
Jumps `J_i ~ N(mu_J, sigma_J^2)` arrive with Poisson rate `lambda`.
- **Source:** `exchange-simulator/exchange_simulator/market_microstructure.py`

### Heston Stochastic Volatility
```
dv(t) = kappa*(theta - v(t))*dt + xi*sqrt(v(t))*dW_v
dW_v = rho*dW_s + sqrt(1-rho^2)*dW'    (rho = -0.7)
```
- **Source:** `exchange-simulator/exchange_simulator/market_microstructure.py`

### Markov Regime Switching
4-state chain (CALM, VOLATILE, CRASH, RECOVERY) with per-state vol/drift.
- **Source:** `exchange-simulator/exchange_simulator/market_microstructure.py`

### Inter-Symbol Correlation (Factor Model)
```
z_i = corr * z_shared + sqrt(1 - corr^2) * z_idiosyncratic
```
- **Source:** `exchange-simulator/exchange_simulator/market_simulator.py`

---

## 2. Technical Indicators (Python)

All indicators in `ai-signal-bot/src/technical_analysis/indicators.py`.

- **SMA:** `SMA(n) = (1/n) * sum(P[i-n+1..i])`
- **EMA:** `EMA(t) = alpha*P(t) + (1-alpha)*EMA(t-1)`, `alpha = 2/(period+1)`
- **RSI (Wilder):** `RSI = 100 - 100/(1 + AvgGain/AvgLoss)`
- **MACD:** `MACD = EMA(fast) - EMA(slow)`, `Signal = EMA(MACD)`
- **Bollinger Bands:** `Upper/Lower = SMA ± k*StdDev`
- **ATR (Wilder):** `ATR = WilderSmoothing(TR, period)`
- **VWAP:** `VWAP = cumsum(TP*Vol) / cumsum(Vol)`, `TP = (H+L+C)/3`
- **ADX (Wilder):** `ADX = WilderSmoothing(DX, period)`, `DX = 100*|+DI - -DI|/(+DI + -DI)`

### FFT Analysis (Cooley-Tukey)
Radix-2 DFT, Hann window, power spectrum, dominant cycle, spectral entropy.
- **Source:** `ai-signal-bot/src/technical_analysis/fft_analysis.py`

---

## 3. C++ Signal Engine V2

All O(1) per update, no heap allocations. Source: `hft-trade-bot/src/strategies/signal_engine_v2.h`

### InlineEMA, InlineRSI, InlineADX, InlineATR
Wilder's smoothing for RSI/ADX/ATR. Branchless gain/loss via `fmax`.

### InlineVWAP (Welford's Weighted Variance)
```
prev_mean = cum_pv_old / cum_v_old
M2 += vol * (tp - prev_mean) * (tp - new_mean)
std_dev = sqrt(M2 / cum_v)
z_score = (price - VWAP) / std_dev
```

### Composite Score Weights
| Indicator | Weight |
|-----------|--------|
| EMA Crossover (21/50) | 0.25 |
| RSI (14) | 0.15 |
| OBI Multi-level | 0.20 |
| VWAP Deviation | 0.10 |
| ADX (14) | 0.10 |
| Pressure Model | 0.20 |

**Dynamic leverage:** conf>=85 + ADX>30 → 5x, conf>=75 → 3x, else 1x

---

## 4. Pressure Model (L2 Microstructure)

Source: `hft-trade-bot/src/strategies/pressure_model.h`

- **OBI:** `(sum(bid_qty) - sum(ask_qty)) / (sum(bid_qty) + sum(ask_qty))` at 5/10/20 levels
- **Weighted OBI:** `sum(qty[i] / (1+i))` with linear decay
- **Trade Flow Imbalance:** `(buyer_vol - seller_vol) / (buyer_vol + seller_vol)`
- **Toxicity:** `count_ratio * volume_ratio ∈ [0,1]` via median threshold (`nth_element`)
- **Microprice:** `(bid_price*ask_qty + ask_price*bid_qty) / (bid_qty + ask_qty)`
- **Spread regime:** TIGHT <1bp, NORMAL 1-5bp, WIDE >5bp
- **Impact:** `OBI*2 + TFI*1.5 + microprice_dev*0.5` (bps)

---

## 5. Risk Management

### Kelly Criterion
```
f* = (p*b - q) / b    (Half-Kelly: f = f*/2)
```
- **Source:** `ai-signal-bot/src/risk/kelly.py`

### Pre-Trade Risk (C++ V2)
8 checks: blacklist, max leverage, position size, total exposure, daily loss, max drawdown, order rate throttle, margin.
- **Source:** `hft-trade-bot/src/risk/risk_manager.h`

### Position Risk Manager (Python)
Trailing stop, breakeven, partial TP, max hold time, ATR-based trailing.
- **Source:** `ai-signal-bot/src/risk/risk_manager.py`

---

## 6. Portfolio Optimization

Source: `ai-signal-bot/src/risk/portfolio_optimizer.py`

- **Markowitz:** `min w'Σw s.t. w'μ = target, w'1 = 1`
- **Black-Litterman:** `posterior = [(τΣ)^-1 + P'Ω^-1 P]^-1 [(τΣ)^-1 π + P'Ω^-1 Q]`
- **Risk Parity:** `w_i = (1/σ_i) / sum(1/σ_j)`
- **Rebalancing:** Threshold-based trigger on weight deviation

---

## 7. Advanced Quantitative Models (75+)

All implemented as React components in `web-ui/src/components/` with panel registry in `web-ui/src/panels/registry.js`.

### Volatility
| Model | Formula | Component |
|-------|---------|-----------|
| GARCH(1,1) | `σ²(t) = ω + α*ε²(t-1) + β*σ²(t-1)` | `GARCHVolatility.jsx` |
| Markov-Switching GARCH | Hamilton filter + Kim's smoothing | `MarkovSwitchingGARCH.jsx` |
| Rough Volatility (rBergomi) | fBm via Cholesky, `v(t) = ξ*exp(η*W^H - 0.5*η²*t^(2H))` | `RoughVolatility.jsx` |

### Regime Detection
| Model | Method | Component |
|-------|--------|-----------|
| HMM | Baum-Welch EM, Viterbi decoding | `HiddenMarkovModel.jsx` |
| Markov Chain | 6-state, stationary distribution | `MarkovRegimePredictor.jsx` |
| K-Means | K-Means++ + Lloyd's algorithm | `KMeansClustering.jsx` |
| GMM | EM with BIC/AIC | `GaussianMixtureModel.jsx` |
| Hopf Bifurcation | AR(2) eigenvalues on complex plane | `HopfBifurcation.jsx` |

### Filtering & State Estimation
| Model | Formula | Component |
|-------|---------|-----------|
| Kalman Filter | `K = P*H'*(H*P*H'+R)^-1`, `x̂ += K*(z-H*x̂)` | `KalmanFilterPrice.jsx` |
| Bayesian Predictor | Beta-Binomial, BOCPD, Bayesian Ridge | `BayesianPricePredictor.jsx` |
| Bayesian Structural TS | State-space + Kalman (trend+seasonal) | `BayesianStructuralTimeSeries.jsx` |

### Spectral Analysis
| Model | Method | Component |
|-------|--------|-----------|
| STFT | `STFT(t,f) = ∫ x(τ)*w(τ-t)*e^(-2πifτ) dτ` | `NonStationarySpectral.jsx` |
| CWT | Morlet wavelet `ψ(t) = e^(-t²/2)*cos(ω₀t)` | `NonStationarySpectral.jsx` |
| Wavelet (DWT) | Haar/Daubechies, MRA, soft-thresholding | `WaveletDecomposition.jsx` |
| Wavelet Packet | Daubechies-4, Coifman-Wickerhauser | `WaveletPacketDecomposition.jsx` |
| VMD | ADMM-based, FFT/IFFT | `VariationalModeDecomposition.jsx` |
| EMD + HHT | Sifting + cubic spline + Hilbert transform | `EmpiricalModeDecomposition.jsx` |

### Optimal Execution
| Model | Formula | Component |
|-------|---------|-----------|
| Almgren-Chriss | `min E[x] + λ*Var[x]`, efficient frontier | `AlmgrenChriss.jsx` |
| Pontryagin | `H = -c + p*f`, shooting method vs TWAP | `PontryaginMaximum.jsx` |
| Stochastic Control (HJB) | `0 = min_u{c + V_t + μ*V_x + 0.5*σ²*V_xx}` | `StochasticOptimalControl.jsx` |

### Risk Measures
| Model | Formula | Component |
|-------|---------|-----------|
| CVaR | `CVaR_α = min_z{z + (1/(1-α))*E[(L-z)+]}` | `ConditionalValueAtRisk.jsx` |
| Cramer-Rao Bound | `Var(θ̂) ≥ 1/I(θ)` | `CramerRaoBound.jsx` |
| Isolation Forest | `s(x,n) = 2^(-E(h(x))/c(n))` | `IsolationForest.jsx` |

### Causality & Information Theory
| Model | Formula | Component |
|-------|---------|-----------|
| Transfer Entropy | `TE(X→Y) = H(Y_t|Y_{t-1}) - H(Y_t|Y_{t-1},X_{t-1})` | `TransferEntropy.jsx` |
| Kolmogorov-Sinai | Symbolic dynamics, permutation entropy, Lyapunov | `KolmogorovSinaiEntropy.jsx` |
| Information Bottleneck | `min I(X;T) - β*I(T;Y)` via Blahut-Arimoto | `InformationBottleneck.jsx` |
| Renyi Entropy | `H_α = (1/(1-α))*log(sum p_i^α)` | `RenyiEntropy.jsx` |

### Machine Learning
| Model | Method | Component |
|-------|--------|-----------|
| LSTM | BPTT (5-step truncation), Xavier init | `LSTMNeuralNetwork.jsx` |
| SVM | Linear (SGD), RBF (SMO) | `SupportVectorMachine.jsx` |
| PCA | Jacobi eigenvalue, eigenportfolios | `PrincipalComponentAnalysis.jsx` |
| Autoencoder | `Loss = ‖x-x̂‖² + λ‖W‖²` | `Autoencoder.jsx` |
| VAE | ELBO + reparameterization, beta-VAE | `VariationalAutoencoder.jsx` |
| Compressed Sensing | OMP, ISTA | `CompressedSensing.jsx` |
| DTW | Sakoe-Chiba band, `D(i,j) = ‖x_i-y_j‖ + min(D)` | `DynamicTimeWarping.jsx` |
| HMC | Leapfrog + Metropolis, Bayesian GARCH | `HamiltonianMonteCarlo.jsx` |
| RKHS | RBF/Laplacian kernels, KPCA, MMD, KRR | `ReproducingKernelHilbertSpace.jsx` |

### Topological Data Analysis
| Model | Method | Component |
|-------|--------|-----------|
| Persistent Homology | Vietoris-Rips, Betti numbers, diagrams | `TopologicalDataAnalysis.jsx` |
| Homology Landscape | Landscape functions, L2 norm | `PersistentHomologyLandscape.jsx` |

### Optimal Transport
| Model | Method | Component |
|-------|--------|-----------|
| Wasserstein W1/W2 | Sinkhorn algorithm, KS statistic | `OptimalTransport.jsx` |
| Schrodinger Bridge | Entropy-regularized OT, barycentric mapping | `SchrodingerBridge.jsx` |
| Wasserstein Barycenters | OT Frechet mean, quantile averaging | `WassersteinBarycenters.jsx` |

### Stochastic Calculus
| Model | Formula | Component |
|-------|---------|-----------|
| SDE | Euler-Maruyama, Milstein (GBM/OU/CIR/Heston/Merton) | `StochasticDifferentialEquations.jsx` |
| Ito Generator | Infinitesimal generator, Dynkin's formula | `ItoCalculusGenerator.jsx` |
| Malliavin Calculus | IBP Greeks, unbiased pathwise sensitivities | `MalliavinCalculus.jsx` |
| Fokker-Planck | Finite difference PDE, density evolution → VaR | `FokkerPlanckEquation.jsx` |
| Girsanov Theorem | Measure change, Radon-Nikodym derivative | `GirsanovTheorem.jsx` |
| Cameron-Martin | Gaussian shift theorem, drift alignment | `CameronMartinFormula.jsx` |

### Network & Graph Theory
| Model | Method | Component |
|-------|--------|-----------|
| Graph Theory | Kruskal's MST, eigenvector/betweenness centrality | `GraphTheoryNetwork.jsx` |
| Tensor Decomposition | CP/ALS, multi-way factor analysis | `TensorDecomposition.jsx` |

### Functional Analysis
| Model | Method | Component |
|-------|--------|-----------|
| Sobolev Regularization | Tikhonov, Matern kernel, L-curve | `SobolevSpaceRegularization.jsx` |
| Banach Fixed-Point | Contraction mapping, Nash equilibrium | `BanachFixedPoint.jsx` |
| Riesz Representation | Representer theorem, feature importance | `RieszRepresentation.jsx` |
| Lax-Milgram | Variational PDE, FEM, coercivity | `LaxMilgramTheorem.jsx` |
| Arzela-Ascoli | Equicontinuity, overfitting detection | `ArzelaAscoli.jsx` |

### Measure Theory
| Model | Method | Component |
|-------|--------|-----------|
| Hahn Decomposition | Jordan decomposition, SNR | `HahnDecomposition.jsx` |
| Radon-Nikodym | Likelihood ratio, KL divergence, regime change | `RadonNikodymDerivative.jsx` |
| Prokhorov Metric | Weak convergence, distribution shift | `ProkhorovMetric.jsx` |
| Stone-Cech | Universal embedding, regime limit points | `StoneCechCompactification.jsx` |

### Physics-Inspired
| Model | Method | Component |
|-------|--------|-----------|
| Renormalization Group | Multi-scale coarse-graining, scaling exponents | `RenormalizationGroup.jsx` |
| Free Energy Principle | Variational free energy, active inference | `FreeEnergyPrinciple.jsx` |
| Lie Group Symmetries | Noether's theorem, Lie algebra generators | `LieGroupSymmetries.jsx` |
| Burgers Equation | Viscous Burgers PDE, Hopf-Cole transform | `BurgersEquation.jsx` |

### Signal Processing
| Model | Method | Component |
|-------|--------|-----------|
| Ehlers SuperSmoother | 2-pole super smoother, MAMA/FAMA, Hilbert | `EhlersSuperSmoother.jsx` |
| Cesaro/Fejer Kernel | Cesaro mean, no Gibbs phenomenon | `CesaroFejerKernel.jsx` |

### Bayesian
| Model | Method | Component |
|-------|--------|-----------|
| Black-Litterman | Equilibrium returns + investor views → posterior | `BlackLitterman.jsx` |
| Bayesian Ridge | Regularized linear regression with priors | `BayesianPricePredictor.jsx` |

### Other
| Model | Method | Component |
|-------|--------|-----------|
| Kelly Criterion | Multi-asset, Monte Carlo, growth curves | `KellyCriterionPortfolio.jsx` |
| Copula | Clayton, Gumbel, Gaussian, Student-t | `CopulaModel.jsx` |
| Optimal Stopping | Snell envelope, Longstaff-Schwartz MC | `OptimalStopping.jsx` |
| Affine Arithmetic | Chebyshev approximation, robust Black-Scholes | `AffineArithmetic.jsx` |
| Koopman Operator | EDMD, eigenvalues, k-step forecast | `KoopmanOperatorTheory.jsx` |
| Empirical Dynamic Modeling | Takens' embedding, simplex projection, CCM | `EmpiricalDynamicModeling.jsx` |
| Hawkes Process | Self-exciting intensity, MLE, Ogata's thinning | `HawkesProcess.jsx` |
| Random Matrix Theory | Marchenko-Pastur, eigenvalue cleaning, market mode | `RandomMatrixTheory.jsx` |
| Malliavin-Stein Sensitivity | IBP Greeks, variance reduction vs finite diff | `MalliavinSteinSensitivity.jsx` |

---

## 8. Funding Rate Model

8-hour intervals (00:00/08:00/16:00 UTC), perpetual-spot basis:

```
rate = clamp(premium * multiplier, -max_rate, max_rate)
premium = (perp_price - index_price) / index_price
payment = position_notional * rate
```

- **Source:** `exchange-simulator/exchange_simulator/funding_rate.py`

---

## 9. Liquidation Engine

```
liq_price_long = entry * (1 - 1/leverage + maintenance_margin)
liq_price_short = entry * (1 + 1/leverage - maintenance_margin)
```

Partial liquidation (50% at partial liq price), cascade liquidations, insurance fund, ADL.

- **Source:** `exchange-simulator/exchange_simulator/liquidation_engine_v2.py`

---

## 10. Latency Simulation

Per-exchange base latency (Binance 50ms, OKX 80ms, Bybit 120ms) with Gaussian jitter, Poisson spikes, exponential backoff reconnection.

- **Source:** `exchange-simulator/exchange_simulator/latency_simulation.py`
