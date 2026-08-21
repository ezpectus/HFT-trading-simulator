# Mathematical Models

Detailed breakdown of all quantitative models in the HFT Trading System with formulas and source file references.

**Honest categorization (v6.1 audit):** Models are classified as:
- **Trading logic** — implemented in Python or C++ and integrated into the trading pipeline
- **UI-only** — implemented as React visualization components, NOT integrated into trading logic
- ~~**Missing**~~ — no missing models remain (resolved in earlier sprints)
- ~~**Dead code**~~ — CUDA/ONNX dead code removed in Sprint 43

---

## 1. Market Simulation

### Geometric Brownian Motion (GBM) — Trading logic
```
S(t+dt) = S(t) * exp((mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*Z)
```
- **Source:** `exchange_simulator/market_simulator.py`

### Inter-Symbol Correlation (Factor Model) — Trading logic
```
z_i = corr * z_shared + sqrt(1 - corr^2) * z_idiosyncratic
```
- **Source:** `exchange_simulator/market_simulator.py`

### News Event Simulation — Trading logic
Random volatility spikes (3x-8x) with directional bias, volume surge, 5-15 candle duration.
- **Source:** `exchange_simulator/market_simulator.py:173-184`

### Market Impact Model — Trading logic
```
impact = mid_price * impact_coeff * (qty / typical_volume)
fill_price += impact (buy) or fill_price -= impact (sell)
```
- **Source:** `exchange_simulator/exchange.py:414-423`

### Slippage Simulation — Trading logic
Per-exchange slippage in basis points applied to all orders.
- **Source:** `exchange_simulator/exchange.py:407-412`

### Partial Fill Simulation — Trading logic
Large orders split across price levels with weighted average fill price.
- **Source:** `exchange_simulator/exchange.py:549-558`

### Student-t Returns (Fat Tails) — Trading logic
Replaces Gaussian with `t(df=4)` for realistic tail risk.
```
t = Z * sqrt(df / V),  Z ~ N(0,1),  V ~ ChiSquare(df)
```
- **Source:** `exchange_simulator/exchange_simulator/market_microstructure.py:112-116`
- **Function:** `_sample_student_t(df)` — scaled to unit variance

### Merton Jump Diffusion — Trading logic
```
S(t+dt) = S(t) * exp((mu - 0.5*sigma^2 - lambda*E[J])*dt + sigma*sqrt(dt)*Z + sum(J_i))
```
Jumps `J_i ~ N(mu_J, sigma_J^2)` arrive with Poisson rate `lambda`.
- **Source:** `exchange_simulator/exchange_simulator/market_microstructure.py:118-123`
- **Function:** `_sample_jump(regime_params)` — Poisson trigger + Gaussian jump size
- **Per-regime jump params:** CALM (0.1%, 1%), VOLATILE (0.5%, 3%), CRASH (2%, 8%), RECOVERY (0.2%, 2%)

### Heston Stochastic Volatility — Trading logic
```
dv(t) = kappa*(theta - v(t))*dt + xi*sqrt(v(t))*dW_v
dW_v = rho*dW_s + sqrt(1-rho^2)*dW'    (rho = -0.7)
```
Euler discretization with variance floor at 0.001.
- **Source:** `exchange_simulator/exchange_simulator/market_microstructure.py:102-110`
- **Function:** `_update_heston_variance(dt)` — kappa=2.0, theta=0.04, sigma=0.3, rho=-0.7

### Markov Regime Switching — Trading logic
4-state chain (CALM, VOLATILE, CRASH, RECOVERY) with per-state vol/drift/jump params.
```
Transition matrix:
           CALM   VOL    CRASH  RECOV
CALM      0.985  0.014  0.001  0.000
VOLATILE  0.020  0.970  0.008  0.002
CRASH     0.000  0.010  0.950  0.040
RECOVERY  0.030  0.000  0.000  0.970
```
- **Source:** `exchange_simulator/exchange_simulator/market_microstructure.py:25-47,82-92`
- **Function:** `_maybe_switch_regime()` — per-step Markov transition
- **Per-regime params:** drift, vol_scale (1.0x-5.0x), jump_prob, jump_size

### U-Shaped Intraday Volatility — Trading logic
```
vol_mult(h) = 0.7 + 0.8 * ((h/12 - 1)^2)
```
High at open/close, low midday. Also affects volume generation.
- **Source:** `exchange_simulator/exchange_simulator/market_microstructure.py:94-100`

---

## 2. Technical Indicators (Python) — Trading logic

All indicators in `ai-signal-bot/src/technical_analysis/indicators.py`.

- **SMA:** `SMA(n) = (1/n) * sum(P[i-n+1..i])`
- **EMA:** `EMA(t) = alpha*P(t) + (1-alpha)*EMA(t-1)`, `alpha = 2/(period+1)`
- **RSI (Wilder):** `RSI = 100 - 100/(1 + AvgGain/AvgLoss)`
- **MACD:** `MACD = EMA(fast) - EMA(slow)`, `Signal = EMA(MACD)`
- **Bollinger Bands:** `Upper/Lower = SMA ± k*StdDev`
- **ATR (Wilder):** `ATR = WilderSmoothing(TR, period)`
- **VWAP:** `VWAP = cumsum(TP*Vol) / cumsum(Vol)`, `TP = (H+L+C)/3`
- **ADX (Wilder):** `ADX = WilderSmoothing(DX, period)`, `DX = 100*|+DI - -DI|/(+DI + -DI)`

### FFT Analysis (Cooley-Tukey) — Trading logic
Radix-2 DFT, Hann window, power spectrum, dominant cycle, spectral entropy.
- **Source:** `ai-signal-bot/src/technical_analysis/fft_analysis.py`

### Kalman Filter (1D and 2D) — Trading logic
1D: state = price, observation = price + noise.
```
Predict:  x_hat = x_hat, P = P + Q
Update:   K = P / (P + R), x_hat += K * (z - x_hat), P = (1 - K) * P
```
2D: state = [position, velocity], constant velocity model.
```
F = [[1, dt], [0, 1]], H = [[1, 0]]
Predict:  x = F*x, P = F*P*F^T + Q
Update:   S = H*P*H^T + R, K = P*H^T*S^-1, x += K*(z - H*x), P = (I - K*H)*P
```
- **Source:** `ai-signal-bot/src/technical_analysis/kalman.py` (Sprint 55, ported from UI-only KalmanFilterPrice.jsx)

### Principal Component Analysis (PCA) — Trading logic
Covariance-based PCA with SVD eigendecomposition for multi-asset return decomposition.
```
Center: X_c = X - mean(X)
SVD: X_c = U * S * V^T
Eigenvalues: λ_i = S_i^2 / (n-1)
Explained variance ratio: λ_i / Σλ_j
Scores: X_c * V (projection onto principal components)
```
Applications: factor extraction (PC1=market factor), risk decomposition, eigenportfolio construction.
- **Source:** `ai-signal-bot/src/technical_analysis/pca.py` (Sprint 56, ported from UI-only PrincipalComponentAnalysis.jsx)

### K-Means Clustering — Trading logic
Lloyd's algorithm with K-Means++ initialization for market regime detection.
```
Init: K-Means++ smart centroid seeding
Assign: label_i = argmin_c ||x_i - μ_c||²
Update: μ_c = mean of points assigned to cluster c
WCSS: Σ_i ||x_i - μ_{label_i}||²
```
Features: mean return, volatility, skewness, kurtosis, MAR, autocorrelation, trend strength (R²).
- **Source:** `ai-signal-bot/src/technical_analysis/kmeans.py` (Sprint 57, ported from UI-only KMeansClustering.jsx)

### Gaussian Mixture Model (GMM) — Trading logic
EM algorithm for 1D Gaussian Mixture Model fitting.
```
p(x) = Σ_k π_k · N(x | μ_k, σ_k²)
E-step: γ(z_nk) = π_k·N(x_n|μ_k,σ_k²) / Σ_j π_j·N(x_n|μ_j,σ_j²)
M-step: μ_k = Σ_n γ_nk·x_n / N_k, σ_k² = Σ_n γ_nk·(x_n-μ_k)² / N_k, π_k = N_k / N
BIC = -2L + k_params·log(N), AIC = -2L + 2·k_params
```
- **Source:** `ai-signal-bot/src/technical_analysis/gmm.py` (Sprint 57, ported from UI-only GaussianMixtureModel.jsx)

### Dynamic Time Warping (DTW) — Trading logic
Measures similarity between temporal sequences that may vary in speed.
```
D[i,j] = d(x_i, y_j) + min(D[i-1,j], D[i,j-1], D[i-1,j-1])
where d(a,b) = (a-b)²
Sakoe-Chiba band: |i - j| ≤ w (window constraint)
Distance = sqrt(D[n,m])
```
Applications: pattern matching, signal classification, regime detection.
- **Source:** `ai-signal-bot/src/technical_analysis/dtw.py` (Sprint 58, ported from UI-only DynamicTimeWarping.jsx)

### Support Vector Machine (SVM) — Trading logic
Linear SVM via SGD with hinge loss for binary price direction classification.
```
Objective: minimize ½||w||² + C·Σ max(0, 1 - y_i·(w·x_i + b))
Hinge loss: L(y, f(x)) = max(0, 1 - y·f(x))
Sub-gradient: ∂L/∂w = -y·x if margin < 1, else 0
Decision: f(x) = sign(w·x + b)
```
Features: mean, vol, skew, kurt, last return, momentum, RSI, autocorrelation.
- **Source:** `ai-signal-bot/src/ml/svm_signal.py` (Sprint 58, ported from UI-only SupportVectorMachine.jsx)

### GARCH(1,1) Volatility — Trading logic
Conditional variance forecasting for volatility clustering and risk management.
```
sigma^2_t = omega + alpha * eps^2_{t-1} + beta * sigma^2_{t-1}
```
Parameters estimated by MLE via gradient ascent on the Gaussian log-likelihood:
```
L = -0.5 * sum_t [ ln(sigma^2_t) + eps^2_t / sigma^2_t ]
dL/d(sigma^2_t) = 0.5 * (eps^2_t - sigma^2_t) / sigma^4_t
```
Derived quantities:
```
Persistence:        alpha + beta  (stationarity requires < 1)
Half-life:          ln(0.5) / ln(alpha + beta)
Unconditional var:  omega / (1 - alpha - beta)
Multi-step forecast: h=1: omega + alpha*eps^2_t + beta*sigma^2_t
                     h>1: omega + (alpha+beta)*sigma^2_{t+h-1}
Annualized vol:     sqrt(var) * sqrt(252) * 100 (%)
```
Also provides EWMA (RiskMetrics, `lambda=0.94`) and Parkinson high-low estimators:
```
EWMA:      sigma^2_t = lambda*sigma^2_{t-1} + (1-lambda)*eps^2_t
Parkinson: sigma^2 = sum(ln^2(H/L)) / (4*n*ln2)
```
Applications: volatility forecasting, position sizing, stop-loss placement, regime detection.
- **Source:** `ai-signal-bot/src/technical_analysis/garch.py` (Sprint 60, ported from UI-only GARCHVolatility.jsx)

### Markov-Switching GARCH (MS-GARCH) — Trading logic
Regime-switching volatility: a hidden Markov chain selects which GARCH dynamics drive returns.
```
Regime s_t in {0, ..., K-1}:  P(s_t = j | s_{t-1} = i) = p_ij
In regime k:  r_t = mu_k + eps_t,  eps_t ~ N(0, h_t)
              h_t = omega_k + alpha_k * eps^2_{t-1} + beta_k * h_{t-1}
```
Kim's filtering (Hamilton filter + backward smoothing):
```
Predicted:  P(s_t=j|F_{t-1}) = sum_i p_ij * P(s_{t-1}=i|F_{t-1})
Update:     P(s_t=k|F_t) = pred_k * f(r_t|s_t=k) / sum_j pred_j * f(r_t|s_t=j)
Smooth:     P(s_t=k|F_T) = P(s_t=k|F_t) * sum_j [p_kj * P(s_{t+1}=j|F_T) / P(s_{t+1}=j|F_t)]
Log-lik:    sum_t log [ sum_k P(s_t=k|F_{t-1}) * f(r_t|s_t=k, F_{t-1}) ]
```
Combined volatility = regime-probability-weighted sqrt of regime variances.
Expected regime duration = 1 / (1 - p_ii). Parameters via grid search over 2-regime sets (Calm/Volatile/Crisis).
- **Source:** `ai-signal-bot/src/technical_analysis/ms_garch.py` (Sprint 61, ported from UI-only MarkovSwitchingGARCH.jsx)

### Copula Dependency Model — Trading logic
Models non-linear dependence between assets via copulas (Sklar: F(x,y) = C(F_X(x), F_Y(y))).
```
Clayton: C(u,v) = (u^-θ + v^-θ - 1)^(-1/θ),  τ = θ/(θ+2),  λ_L = 2^(-1/θ)
Gumbel:  C(u,v) = exp(-[(-ln u)^θ + (-ln v)^θ]^(1/θ)),  τ = (θ-1)/θ,  λ_U = 2 - 2^(1/θ)
Gaussian: C(u,v) = Φ_ρ(Φ⁻¹(u), Φ⁻¹(v)),  τ = (2/π)·arcsin(ρ)
Student-t: symmetric tail dependence, df=5 default
```
Parameters via method of moments from Kendall's τ (Clayton θ=2τ/(1-τ), Gumbel θ=1/(1-τ), Gaussian ρ=sin(πτ/2)).
Tail dependence: λ_L = lim P(U<u|V<u) as u→0, λ_U = lim P(U>u|V>u) as u→1.
Dependence measures: Kendall's τ, Spearman's ρ, Pearson r. Bivariate normal CDF via Drezner-Priestley quadrature.
Signal: RISK if P(joint crash) > 15%, HEDGE if < 3%, else NEUTRAL.
- **Source:** `ai-signal-bot/src/technical_analysis/copula.py` (Sprint 62, ported from UI-only CopulaModel.jsx)

### Wavelet Decomposition (MRA) — Trading logic
Multi-Resolution Analysis of price series via discrete wavelet transforms (Haar D2, Daubechies D4).
```
Haar:      h = [1/√2, 1/√2],  g = [1/√2, -1/√2]
Daubechies D4: h = [(1+√3)/4√2, (3+√3)/4√2, (3-√3)/4√2, (1-√3)/4√2]
DWT:       c[j] = Σ_k h[k]·s[2j+k],  d[j] = Σ_k g[k]·s[2j+k]   (periodic)
IDWT:      s[2j+k] += h[k]·c[j] + g[k]·d[j]
MRA:       price = trend(J) + details(1..J)
```
Denoising: soft thresholding of detail coefficients (|v| < t → 0, else v·(1 - t/|v|)).
SNR = 10·log10(trend_energy / detail_energy). Signal: BUY/SELL if trend clear (SNR > 3 dB), HOLD if noisy (SNR < 1 dB).
- **Source:** `ai-signal-bot/src/technical_analysis/wavelet.py` (Sprint 63, ported from UI-only WaveletDecomposition.jsx)

### Monte Carlo Simulation — Trading logic
Trade-sequence robustness analysis: shuffles realized PnLs to estimate the distribution of outcomes.
```
For each run r in 1..R:
    shuffled = shuffle(pnls)                    # Fisher-Yates, seeded RNG
    equity_t = initial_balance + sum(shuffled[:t])
    results[r] = equity_T - initial_balance
    maxDD[r]  = max_t (peak_t - equity_t)
```
Outputs: percentiles p5/p25/p50/p75/p95 of final PnL, profit probability P(PnL > 0),
median and worst max drawdown, best/worst return, mean/std of returns.
Requires ≥ 5 trades. Answers: "how robust is the strategy to trade-order luck?"
- **Source:** `ai-signal-bot/src/technical_analysis/monte_carlo.py` (Sprint 64, ported from UI-only MonteCarlo.jsx)

### Hawkes Process (Self-Exciting Point Process) — Trading logic
Models trade clustering in order flow: intensity increases after each event.
```
lambda(t) = mu + sum_{t_i < t} alpha * exp(-beta * (t - t_i))
Branching ratio: n = alpha / beta  (n < 1 for stationarity)
Log-likelihood:  L = sum log(mu + alpha*R_i) - mu*T - (alpha/beta)*sum(1 - exp(-beta*(T - t_i)))
Recursion:       R_i = exp(-beta*(t_i - t_{i-1})) * (1 + R_{i-1})
```
MLE via grid search + fine-tuning. Simulation via Ogata's thinning algorithm.
Events = candle indices with |return| > 0.3%. Signal: TREND (n > 0.7), MOMENTUM (n > 0.4), MEAN_REVERT.
- **Source:** `ai-signal-bot/src/technical_analysis/hawkes.py` (Sprint 65, ported from UI-only HawkesProcess.jsx)

### Almgren-Chriss Optimal Execution — Trading logic
Optimal order execution minimizing the trade-off between market impact and timing risk.
```
Objective: minimize E[cost] + λ·Var[cost]
Optimal trajectory: x(t) = X·sinh(κ(T-t)) / sinh(κT),  κ = sqrt(λ·σ²/η)
Expected cost: E[cost] = ½γX² + ½η·Σ(v_k²)·dt   (permanent + temporary impact)
Variance:      Var[cost] = σ²·Σ(x_k²)·dt         (timing risk)
```
- σ: daily volatility, η: temporary impact, γ: permanent impact, λ: risk aversion, T: horizon.
TWAP benchmark comparison + efficient frontier over λ ∈ 10⁻³..10³.
- **Source:** `ai-signal-bot/src/research/almgren_chriss.py` (Sprint 66, ported from UI-only AlmgrenChriss.jsx)

### Optimal Stopping (Snell Envelope) — Trading logic
Optimal exercise of American options via the Snell envelope backward recursion.
```
V(T) = g(T, S_T)
V(t) = max(g(t, S_t), E[V(t+1) | F_t])
tau* = inf{t : g(t, S_t) >= E[V(t+1) | F_t]}
```
Binomial tree (Cox-Ross-Rubinstein): u = e^(σ√dt), d = 1/u, p = (e^(r·dt) - d)/(u - d).
Longstaff-Schwartz Monte Carlo: OLS regression of continuation value on [1, S, S²],
exercise when intrinsic ≥ fitted continuation. Early exercise premium = American − European.
- **Source:** `ai-signal-bot/src/technical_analysis/optimal_stopping.py` (Sprint 67, ported from UI-only OptimalStopping.jsx)

### Autoencoder (Anomaly Detection) — Trading logic
Shallow autoencoder for unsupervised feature learning and anomaly detection.
```
Encoder: h = sigmoid(W_e·x + b_e)
Decoder: x̂ = sigmoid(W_d·h + b_d)
Loss:    L = Σ(x_i - x̂_i)² + λ·||W||²   (MSE + L2, Xavier init)
Backprop: dL/dW_d = (x - x̂)·σ'(x̂)·hᵀ
         dL/dW_e = [(x - x̂)·σ'(x̂)·W_d]·σ'(h)·xᵀ
```
12 features per 20-candle window (return, vol, range, skew, kurt, RSI, volume z-score,
momentum, price deviation, autocorrelation, last-price z-score), standardized.
Anomaly score = reconstruction error; threshold = mean + k·std.
Signal: NORMAL / WARNING (z ≤ 3) / ANOMALY (z > 3).
- **Source:** `ai-signal-bot/src/ml/autoencoder.py` (Sprint 68, ported from UI-only Autoencoder.jsx)

### Variational Autoencoder (VAE) — Trading logic
Generative model of return-window distributions with latent representation and anomaly detection.
```
Encoder: q_φ(z|x) ≈ N(μ_φ(x), σ²_φ(x))
Decoder: p_θ(x|z) ≈ N(μ_θ(z), σ²_θ(x))
Prior:   p(z) = N(0, I)
ELBO:    L = E_q[log p(x|z)] - β·KL[q(z|x) || p(z)]
Reparameterization: z = μ + σ·ε,  ε ~ N(0, I)
KL:      -½·Σ(1 + logvar - μ² - exp(logvar))
```
2-layer encoder/decoder (sigmoid hidden, linear output), full backpropagation
through both networks (the UI's simplified backprop was corrected in the port).
Anomaly: reconstruction error > mean + 2σ. Signal: NORMAL / ANOMALY.
- **Source:** `ai-signal-bot/src/ml/vae.py` (Sprint 69, ported from UI-only VariationalAutoencoder.jsx)

### Bayesian Price Predictor — Trading logic
Bayesian inference with conjugate priors for price direction and magnitude.
```
Beta-Binomial:  P(up) ~ Beta(α₀ + ups, β₀ + downs),  α₀ = β₀ = prior_strength/2
Normal-Inverse-Gamma: posterior mean μ_N = (κ₀μ₀ + n·x̄)/(κ₀ + n)
BOCPD:          Bayesian Online Changepoint Detection with hazard h = 1/H
Bayesian Ridge: w ~ N(0, α⁻¹I), noise ~ N(0, β⁻¹); EM updates α = d/||w||², β = n/RSS
```
Features for ridge: [1, lag1, lag2, RSI-proxy, volatility]. 95% credible interval
via Beta inverse CDF (bisection + Riemann sum). Signal: BUY if P(up) > 60% and
predicted return > 0, SELL if P(down) > 60% and predicted return < 0.
- **Source:** `ai-signal-bot/src/technical_analysis/bayesian_price.py` (Sprint 70, ported from UI-only BayesianPricePredictor.jsx)

### Bayesian Structural Time Series (BSTS) — Trading logic
State-space model with Kalman filter decomposing a series into trend, seasonality, irregular.
```
State:        x_t = [level, slope, seasonal_1..seasonal_{period-1}]
Transition:   level_t = level_{t-1} + slope_{t-1} + η^level
              slope_t = slope_{t-1} + η^slope
              seasonal: dummy-seasonal with sum-to-zero constraint
Observation:  y_t = level_t + seasonal_t + ε_t
Kalman:       P_{t|t-1} = T·P·Tᵀ + Q,  K = P·Zᵀ/(Z·P·Zᵀ + H)
              x_{t|t} = x_{t|t-1} + K·(y_t - Z·x_{t|t-1})
              P_{t|t} = (I - K·Z)·P_{t|t-1}
```
Variance params via grid-search MLE of the log-likelihood. 10-step forecast.
Signal: BUY if forecast return > 0.5%, SELL if < -0.5%.
Note: the UI's covariance prediction/update were simplified; this port implements
the correct Kalman equations (T·P·Tᵀ + Q and (I - K·Z)·P).
- **Source:** `ai-signal-bot/src/technical_analysis/bayesian_sts.py` (Sprint 71, ported from UI-only BayesianStructuralTimeSeries.jsx)

### Hamiltonian Monte Carlo (HMC) — Trading logic
Momentum-based MCMC sampler for Bayesian GARCH(1,1) parameter estimation.
```
Hamiltonian: H(q, p) = U(q) + K(p)
U(q) = -log p(q|D)          (potential energy)
K(p) = ½·pᵀ·M⁻¹·p           (kinetic energy)
Leapfrog: p_{1/2} = p - (ε/2)·∇U(q)
          q' = q + ε·M⁻¹·p_{1/2}
          p' = p_{1/2} - (ε/2)·∇U(q')
Acceptance: α = min(1, exp(H(q,p) - H(q',p')))
```
Posterior of GARCH params [ω, α, β] with log-prior −10ω −5α −5β and stationarity
constraint α + β < 1. Outputs: posterior stats (mean/std/95% CI), acceptance rate,
persistence α+β, long-run variance ω/(1−α−β). Signal: HIGH/LOW persistence.
- **Source:** `ai-signal-bot/src/technical_analysis/hmc.py` (Sprint 72, ported from UI-only HamiltonianMonteCarlo.jsx)

### Transfer Entropy — Trading logic
Information-theoretic directed causality between time series (non-linear, unlike Granger).
```
TE_{X→Y} = Σ p(y_{t+1}, y_t^k, x_t^l) · log₂[ p(y_{t+1}|y_t^k, x_t^l) / p(y_{t+1}|y_t^k) ]
         = Σ p_all · log₂[ p_all · p_yonly / (p_y · p_yx) ]
```
Values quantized into n bins; histories y_t^k (k lags), x_t^l (l lags).
Effective TE = TE − TE_surrogate (shuffled X destroys causality).
Net TE = TE_{X→Y} − TE_{Y→X}. Signal: INFLUENCER (net > 0.01), INFLUENCED (net < −0.01).
- **Source:** `ai-signal-bot/src/research/transfer_entropy.py` (Sprint 73, ported from UI-only TransferEntropy.jsx)

### Empirical Dynamic Modeling (EDM) / CCM — Trading logic
Takens' embedding and Convergent Cross Mapping for model-free causality detection.
```
Takens: x(t) -> [x(t), x(t-τ), ..., x(t-(E-1)·τ)]
τ via first minimum of mutual information; E via false nearest neighbors (< 5%)
Simplex projection: w_i = exp(-d_i/d_min), forecast = Σ w_i·x(neighbor future)
CCM: embed Y -> shadow manifold; neighbor indices estimate X;
     ρ(estimated, actual X) increases with library size if X → Y
```
Signal from simplex forecast: BUY (> 0.2%), SELL (< −0.2%), NEUTRAL.
- **Source:** `ai-signal-bot/src/research/ccm.py` (Sprint 74, ported from UI-only EmpiricalDynamicModeling.jsx)

### Cramer-Rao Lower Bound — Trading logic
Theoretical minimum variance of any unbiased estimator via Fisher information.
```
CRLB: Var(θ̂) ≥ 1/I(θ)
Fisher: I(θ) = -E[∂²/∂θ² log L(x|θ)]
Gaussian: I(μ) = n/σ²,  CRLB(μ) = σ²/n
          I(σ²) = n/(2σ⁴),  CRLB(σ²) = 2σ⁴/n
GARCH(1,1): Fisher matrix via numerical Hessian of negative log-likelihood;
            CRLB = I(θ)⁻¹ (3×3 inverse)
Efficiency: eff(θ̂) = CRLB/Var(θ̂) — sample mean is 100% efficient for Gaussian
```
Signal: LOW_INFORMATION (I(μ) < 100), HIGH_INFORMATION (I(μ) > 1000).
- **Source:** `ai-signal-bot/src/research/cramer_rao.py` (Sprint 75, ported from UI-only CramerRaoBound.jsx)

### Rough Volatility (rBergomi) — Trading logic
Volatility driven by fractional Brownian motion with Hurst H < ½ (roughness).
```
v(t) = ξ₀(t) · exp(η·W^H(t) - ½η²·t^(2H))
fGn (Cholesky): C(i,j) = ½·(|i-j+1|^(2H) + |i-j-1|^(2H) - 2·|i-j|^(2H))
Price: dS = S·√v·dW,  dW correlated with vol via ρ
Variance swap: E[∫₀ᵀ v(t)dt] = ∫₀ᵀ ξ₀(t)dt
Skew: ψ(τ) ~ τ^(H - ½)  (steep short-dated skew for rough vol)
```
Hurst estimated from realized-volatility scaling (log RV vs log scale regression).
Signal: BUY/SELL from expected simulated return; vol regime HIGH/LOW/NORMAL.
- **Source:** `ai-signal-bot/src/technical_analysis/rbergomi.py` (Sprint 76, ported from UI-only RoughVolatility.jsx)

### Variational Mode Decomposition (VMD) — Trading logic
Non-recursive signal decomposition into K modes with compact spectral support (ADMM).
```
min Σ_k ||∂_t[(δ(t) + j/(πt)) * u_k(t)] · e^(-jω_k t)||²   s.t. Σ_k u_k = f(t)
ADMM:
  û_k(ω) = (f̂(ω) - Σ_{i≠k} û_i + λ̂/2) / (1 + 2α(ω - ω_k)²)
  ω_k = ∫ ω|û_k(ω)|² dω / ∫ |û_k(ω)|² dω
  λ̂ += τ·(f̂ - Σ_k û_k)
```
Cooley-Tukey radix-2 FFT, mirroring extension, mode energy distribution.
Signal: BUY/SELL from trend-mode slope + dominant-mode sign.
- **Source:** `ai-signal-bot/src/technical_analysis/vmd.py` (Sprint 77, ported from UI-only VariationalModeDecomposition.jsx)

### Empirical Mode Decomposition (EMD) + HHT — Trading logic
Adaptive decomposition into Intrinsic Mode Functions via sifting; Hilbert-Huang for instantaneous frequency.
```
Sifting: 1. local maxima -> upper envelope (cubic spline)
         2. local minima -> lower envelope (cubic spline)
         3. mean = (upper + lower)/2;  h = signal - mean
         4. repeat until SD < threshold;  residue = signal - IMF
Hilbert:  H(f) = -j·sign(f) (FFT-based analytic signal)
          z(t) = x(t) + j·H[x(t)] = a(t)·e^(jφ(t))
          ω(t) = dφ/dt (instantaneous frequency, phase-unwrapped)
```
Natural cubic spline (tridiagonal system). Signal: BUY/SELL from residue (trend)
slope + dominant IMF slope.
- **Source:** `ai-signal-bot/src/technical_analysis/emd.py` (Sprint 78, ported from UI-only EmpiricalModeDecomposition.jsx)

### Compressed Sensing (Sparse Recovery) — Trading logic
Recovers sparse signals from undersampled observations (m < n).
```
y = Φ·s  (Φ: m×n Gaussian measurement matrix)
Recovery: min ||s||₁ s.t. Φ·s = y;  guarantee m ≥ C·k·log(n/k) (RIP)
OMP: 1. most-correlated column → support  2. LS on support  3. residual update
ISTA: x ← soft_thresh(x - step·Φᵀ(Φx - y), λ·step)
Sparsifying transform: DFT basis (cosine), s = Ψᵀ·signal
```
Anomaly detection: |coefficient| > 0.3 → anomalous frequency component.
Signal: ANOMALY_DETECTED / SPARSE_RECOVERED (SNR > 15 dB) / MODERATE / POOR.
- **Source:** `ai-signal-bot/src/technical_analysis/compressed_sensing.py` (Sprint 79, ported from UI-only CompressedSensing.jsx)

### RKHS (Kernel Methods) — Trading logic
Kernel mapping into a high-dimensional feature space for non-linear analysis.
```
RBF:       k(x,y) = exp(-||x-y||²/(2σ²))
Laplacian: k(x,y) = exp(-||x-y||/σ)
Kernel PCA: eigendecomposition of centered K_c = H·K·H (Jacobi method)
Projection: PC_i(x) = Σ_j α_ij·k(x_j, x) / √λ_i
MMD:       ||μ_P - μ_Q||_H = √(Σk(x,x)/n² + Σk(y,y)/m² - 2Σk(x,y)/(nm))
KRR:       f(x) = Σ α_i·k(x_i, x),  α = (K + λI)⁻¹·y
```
3D return embedding [r_t, r_{t-1}, r_{t-2}]. Signal: BUY/SELL from KRR prediction,
REGIME_SHIFT if MMD > 0.3 (distribution shift).
- **Source:** `ai-signal-bot/src/ml/rkhs.py` (Sprint 80, ported from UI-only ReproducingKernelHilbertSpace.jsx)

### Koopman Operator (EDMD) — Trading logic
Lifts nonlinear dynamics into a linear space for spectral analysis and forecasting.
```
Dictionary: Ψ(x) = [1, x, x², ..., sin(2πfx), cos(2πfx), ...]
EDMD: G = Σ Ψ(x_t)·Ψ(x_t)ᵀ,  A = Σ Ψ(x_{t+1})·Ψ(x_t)ᵀ,  K ≈ A·G⁻¹ (λ-regularized)
Eigen: K·φ_i = λ_i·φ_i via power iteration + deflation
Forecast: Ψ(x_{t+k}) ≈ Kᵏ·Ψ(x_t); observable x = ψ₁
```
Signal: |λ₁| > 0.95 → PERSISTENT_DYNAMICS, < 0.5 → FAST_DECAY;
forecast direction adds BULLISH/BEARISH.
- **Source:** `ai-signal-bot/src/research/koopman.py` (Sprint 81, ported from UI-only KoopmanOperatorTheory.jsx)

### Random Matrix Theory (RMT) — Trading logic
Marchenko-Pastur law for noise filtering of empirical correlation matrices.
```
MP density: ρ(λ) = (Q/2π)·√((λ₊-λ)(λ-λ₋))/λ,  Q = T/N
Bounds: λ± = (1/√Q ± 1)²
Noise eigenvalues: λ ∈ [λ₋, λ₊]; signal: λ > λ₊
Cleaning: replace noise eigenvalues with MP average,
          reconstruct C_clean = V·diag(cleaned)·Vᵀ, renormalize to unit diagonal
Market mode: largest eigenvector = common factor
```
Signal: STRONG_SIGNAL (max λ > 2λ₊), WEAK_SIGNAL, PURE_NOISE.
- **Source:** `ai-signal-bot/src/research/rmt.py` (Sprint 82, ported from UI-only RandomMatrixTheory.jsx)

### Graph Theory: Correlation Networks & MST — Trading logic
Financial network construction from return correlations (Mantegna).
```
Distance: d_ij = √(2(1 - ρ_ij))
MST: Kruskal's algorithm (minimum total weight spanning tree)
Degree centrality: C_D(i) = deg(i)/(n-1)
Betweenness: C_B(i) = Σ_{s≠i≠t} σ_st(i)/σ_st (BFS path counting)
Eigenvector centrality: A·x = λ·x (power iteration)
Clustering coefficient: C_i = 2e_i/(k_i(k_i-1))
```
Hub detection: node with max degree (> 2) drives the network. Signal: HUB / NEUTRAL.
- **Source:** `ai-signal-bot/src/research/graph_mst.py` (Sprint 83, ported from UI-only GraphTheoryNetwork.jsx)

### Tensor Decomposition (CP/ALS) — Trading logic
Multi-way data decomposition for latent factor extraction (assets × time × features).
```
Tensor: T ∈ R^{I×J×K}
CP (rank-R): T ≈ Σ_{r=1}^{R} a_r ∘ b_r ∘ c_r
ALS: fix all but one factor, solve least squares, iterate
A[i][r] = Σ_jk T[i][j][k]·B[j][r]·C[k][r] / Σ_jk B[j][r]²·C[k][r]²
```
Features per window: return, volatility, range, momentum, log-volume;
timeframes [1, 5, 15]. Signal: BUY/SELL from dominant factor's
return + momentum loadings.
- **Source:** `ai-signal-bot/src/research/tensor_decomp.py` (Sprint 84, ported from UI-only TensorDecomposition.jsx)

### Affine Arithmetic — Trading logic
Interval uncertainty propagation tracking correlations between quantities.
```
Affine form: â = a₀ + Σ aᵢ·εᵢ,  εᵢ ∈ [-1, 1]
â + b̂ = (a₀+b₀) + Σ(aᵢ+bᵢ)·εᵢ
â·b̂ = a₀b₀ + Σ(a₀bᵢ + b₀aᵢ)·εᵢ + Σᵢⱼ aᵢbⱼ·εᵢεⱼ (new noise symbol)
exp(â): Chebyshev min-max linear approximation + error symbol
Interval: [a₀ - Σ|aᵢ|, a₀ + Σ|aᵢ|]
```
Robust Black-Scholes with uncertain σ; robust portfolio value.
Signal: HIGH/MODERATE/LOW_UNCERTAINTY from option price spread.
- **Source:** `ai-signal-bot/src/research/affine_arithmetic.py` (Sprint 85, ported from UI-only AffineArithmetic.jsx)

### Stochastic Optimal Control (HJB) — Trading logic
Hamilton-Jacobi-Bellman equation for optimal trading under stochastic dynamics.
```
State: dX = u·(μ·dt + σ·dW),  X = wealth, u = position size
HJB: -V_t + ρV = max_u [L + μ·V_x + ½σ²·V_xx]
L = u·μ·x - (γ/2)·u²·σ²·x²  (return − risk penalty)
Policy: u* = μ·x·(1+V_x) / (σ²x²·(γ−V_xx)), clamped to [-2, 2]
Terminal utility: G(x) = log(x); backward Euler finite differences
```
Signal: LONG (u* > 0.3), SHORT (u* < −0.3), NEUTRAL.
- **Source:** `ai-signal-bot/src/research/stochastic_control.py` (Sprint 86, ported from UI-only StochasticOptimalControl.jsx)

### Pontryagin Maximum Principle — Trading logic
Optimal execution trajectory minimizing cost + market impact (Almgren-Chriss).
```
State: x'(t) = u(t);  min J = ∫₀ᵀ [½κu² + λu²x + ηx²] dt
Hamiltonian: H = ½κu² + λu²x + ηx² + p·u
Costate: p'(t) = -λu² - 2ηx
Optimality: u* = -p / (κ + 2λx)
BC: x(0) = X₀, x(T) = 0, p(T) = 0 (shooting method, bisection on p(0))
```
η calibrated to volatility (∝ σ²·252). Signal: SIGNIFICANT_SAVINGS
(> 10% vs TWAP), OPTIMAL_EXECUTION, TWAP_PREFERRED.
- **Source:** `ai-signal-bot/src/research/pontryagin.py` (Sprint 87, ported from UI-only PontryaginMaximumPrinciple.jsx)

### Girsanov Theorem — Trading logic
Measure change for drift estimation and regime detection.
```
Under P: dX_t = μ_t dt + σ dW_t
Under Q: dX_t = ν_t dt + σ dW^Q_t,  W^Q_t = W_t - ∫₀ᵗ (μ_s-ν_s)/σ ds
Radon-Nikodym: dQ/dP = exp(-∫ θ_s dW_s - ½∫ θ_s² ds),  θ_t = (μ_t-ν_t)/σ
LLR test (consecutive windows): LLR = ½θ²·window ~ χ²(1) under H0
p-value: p = exp(-LLR/2)
```
Sliding-window drift estimation; cumulative LLR (measure change trajectory).
Signal: DRIFT_CHANGE_STRONG (p < 0.01), DRIFT_CHANGE (p < 0.05), STABLE_DRIFT.
- **Source:** `ai-signal-bot/src/research/girsanov.py` (Sprint 88, ported from UI-only GirsanovTheorem.jsx)

### SDE (Euler/Milstein) — Trading logic
Simulation of financial SDEs with Euler-Maruyama and Milstein schemes.
```
Euler-Maruyama: X_{n+1} = X_n + μ·Δt + σ·√Δt·Z
Milstein: X_{n+1} = X_n + μ·Δt + σ·√Δt·Z + ½σ·σ'·(Z²-1)·Δt
GBM:  dS = μS dt + σS dW
OU:   dX = θ(μ-X) dt + σ dW
CIR:  dX = κ(θ-X) dt + σ√X dW (Milstein correction)
Heston: dS = μS dt + √v S dW₁,  dv = κ(θ-v) dt + ξ√v dW₂
Merton: dS = μS dt + σS dW + S·J·dN (Poisson jumps)
```
Auto-estimation of μ, σ, OU params from returns. Signal: BUY/SELL from
expected simulated return; 90% CI width from p5/p95.
- **Source:** `ai-signal-bot/src/technical_analysis/sde.py` (Sprint 89, ported from UI-only StochasticDifferentialEquations.jsx)

### Fokker-Planck Equation — Trading logic
Probability density evolution under drift and diffusion (forward Kolmogorov).
```
∂p/∂t = -∂/∂x[μ(x,t)·p] + ½·∂²/∂x²[σ²(x,t)·p]
Flux: F = μ·p - ½·∂/∂x[σ²·p]
Explicit finite differences: p^{n+1} = p^n + Δt·[-(F_{i+½}) + (F_{i-½})]/Δx
Stationary (OU): p_∞(x) ∝ exp(-(x-θ)²/(2σ²/(2κ)))
```
Models: OU (κ from ACF(1)), GBM, constant drift-diffusion.
Signal: BULLISH/BEARISH_DENSITY from forecast median shift; VaR 5%, KL divergence.
- **Source:** `ai-signal-bot/src/research/fokker_planck.py` (Sprint 90, ported from UI-only FokkerPlanckEquation.jsx)

### Itô Calculus Generator — Trading logic
Infinitesimal generator of Itô diffusions — expected rate of change of functions of the process.
```
Itô diffusion: dX_t = μ(X_t)dt + σ(X_t)dW_t
Generator:      A·f(x) = μ(x)·f'(x) + (1/2)·σ²(x)·f''(x)

Dynkin's formula: E[f(X_τ)] = f(x) + E[∫₀ᵀ A·f(X_s) ds]
Feynman-Kac:      ∂u/∂t = A·u - r·u,  u(x,T) = g(x)
Hitting time:     solve A·T = -1 with T(target) = 0 (explicit iteration)
Stationary (OU):  π(x) ∝ exp(-(x-θ)²/(2σ²/(2κ))),  A·π = 0
```
Models: OU (κ from ACF(1)), GBM, constant drift-diffusion. Test functions:
f(x) = x, x², eˣ, ln|x|, cosh(x) with analytic derivatives; numerical
central-difference derivatives (f', f'') as fallback. Dynkin predictions
E[f(X_t)] ≈ f(x) + A·f(x)·t, expected hitting time to mean, stationary
distribution. Signal: GENERATOR_POSITIVE / GENERATOR_NEGATIVE / NEUTRAL
from A·f at the current return.
- **Source:** `ai-signal-bot/src/research/ito_generator.py` (Sprint 91, ported from UI-only ItoCalculusGenerator.jsx)

---

## 3. C++ Signal Engine V2 — Trading logic

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

## 4. Pressure Model (L2 Microstructure) — Trading logic

Source: `hft-trade-bot/src/strategies/pressure_model.h`

- **OBI:** `(sum(bid_qty) - sum(ask_qty)) / (sum(bid_qty) + sum(ask_qty))` at 5/10/20 levels
- **Weighted OBI:** `sum(qty[i] / (1+i))` with linear decay
- **Trade Flow Imbalance:** `(buyer_vol - seller_vol) / (buyer_vol + seller_vol)`
- **Toxicity:** `count_ratio * volume_ratio ∈ [0,1]` via median threshold (`nth_element`)
- **Microprice:** `(bid_price*ask_qty + ask_price*bid_qty) / (bid_qty + ask_qty)`
- **Spread regime:** TIGHT <1bp, NORMAL 1-5bp, WIDE >5bp
- **Impact:** `OBI*2 + TFI*1.5 + microprice_dev*0.5` (bps)

---

## 5. Risk Management — Trading logic

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

## 6. Portfolio Optimization — Trading logic

Source: `ai-signal-bot/src/portfolio/portfolio_optimizer.py`

- **Markowitz:** `min w'Σw s.t. w'μ = target, w'1 = 1`
- **Black-Litterman:** `posterior = [(τΣ)^-1 + P'Ω^-1 P]^-1 [(τΣ)^-1 π + P'Ω^-1 Q]`
- **Risk Parity:** `w_i = (1/σ_i) / sum(1/σ_j)`
- **Rebalancing:** Threshold-based trigger on weight deviation

---

## 6.5. SVI/SABR Volatility Surface — Trading logic

**Source:** `ai-signal-bot/src/pricing/volatility_surface.py` (209 lines)

### SVI (Stochastic Volatility Inspired)
```
w(k) = a + b * (rho*(k-m) + sqrt((k-m)^2 + sigma^2))
```
where `k = log(K/F)` is log-moneyness, `a` is overall level, `b` is slope, `rho` is skew, `m` is shift, `sigma` is smoothness.
- **Functions:** `calibrate_svi()`, `svi_variance()`, `implied_vol_svi()`

### SABR (Stochastic Alpha Beta Rho)
Hagan's asymptotic implied volatility formula:
```
sigma_impl(K,F) = alpha/(F^(1-beta)) * [1 + ...]
```
- **Functions:** `calibrate_sabr()`, `sabr_implied_vol()`

### Surface Generation
`generate_surface()` — generates full volatility surface across strikes and maturities.

**Note:** This was incorrectly listed as MISSING in the v4.0 audit. The code exists and is functional (depends on scipy with fallback).

---

## 6.6. Options Pricing — Trading logic

### Black-Scholes
- **Source:** `exchange_simulator/options_pricing.py`
- Greeks: delta, gamma, theta, vega, rho

### Binomial Tree
- **Source:** `exchange_simulator/options_pricing.py`

### Options Simulator (Black-Scholes + Implied Vol)
- **Source:** `exchange_simulator/exchange_simulator/options_simulator.py` (232 lines)
- European-style options with Newton-Raphson implied vol calculation
- Option chain generation for multiple strikes/expiries
- Put-call parity verification

### Options Strategies — Trading logic
- **Source:** `exchange_simulator/options_strategies.py` (310 lines)
- **Straddle** — long/short call+put at same strike
- **Strangle** — call+put at different strikes (cheaper than straddle)
- **Iron Condor** — 4-leg spread (bull put + bear call)
- **Butterfly** — 3-strike spread with max payoff at middle strike
- Calculates: max profit, max loss, break-even points, payoff at expiry

---

## 7. UI-Only Models (40 models — NOT in trading logic)

All implemented as React components in `web-ui/src/components/` with panel registry in `web-ui/src/panels/registry.js`. These are educational visualizations — they are NOT integrated into the Python or C++ trading pipeline.

### Volatility — UI-only
| Model | Formula | Component |
|-------|---------|-----------|
| GARCH(1,1) | `σ²(t) = ω + α*ε²(t-1) + β*σ²(t-1)` | `GARCHVolatility.jsx` |
| Markov-Switching GARCH | Hamilton filter + Kim's smoothing | `MarkovSwitchingGARCH.jsx` |
| Rough Volatility (rBergomi) | fBm via Cholesky, `v(t) = ξ*exp(η*W^H - 0.5*η²*t^(2H))` | `RoughVolatility.jsx` |

### Regime Detection — UI-only
| Model | Method | Component |
|-------|--------|-----------|
| HMM | Baum-Welch EM, Viterbi decoding | `HiddenMarkovModel.jsx` |
| Markov Chain | 6-state, stationary distribution | `MarkovRegimePredictor.jsx` |
| K-Means | K-Means++ + Lloyd's algorithm | `KMeansClustering.jsx` |
| GMM | EM with BIC/AIC | `GaussianMixtureModel.jsx` |
| Hopf Bifurcation | AR(2) eigenvalues on complex plane | `HopfBifurcation.jsx` |

### Filtering & State Estimation — UI-only
| Model | Formula | Component |
|-------|---------|-----------|
| Kalman Filter | `K = P*H'*(H*P*H'+R)^-1`, `x̂ += K*(z-H*x̂)` | `KalmanFilterPrice.jsx` |
| Bayesian Predictor | Beta-Binomial, BOCPD, Bayesian Ridge | `BayesianPricePredictor.jsx` |
| Bayesian Structural TS | State-space + Kalman (trend+seasonal) | `BayesianStructuralTimeSeries.jsx` |

### Spectral Analysis — UI-only
| Model | Method | Component |
|-------|--------|-----------|
| STFT | `STFT(t,f) = ∫ x(τ)*w(τ-t)*e^(-2πifτ) dτ` | `NonStationarySpectral.jsx` |
| CWT | Morlet wavelet `ψ(t) = e^(-t²/2)*cos(ω₀t)` | `NonStationarySpectral.jsx` |
| Wavelet (DWT) | Haar/Daubechies, MRA, soft-thresholding | `WaveletDecomposition.jsx` |
| Wavelet Packet | Daubechies-4, Coifman-Wickerhauser | `WaveletPacketDecomposition.jsx` |
| VMD | ADMM-based, FFT/IFFT | `VariationalModeDecomposition.jsx` |
| EMD + HHT | Sifting + cubic spline + Hilbert transform | `EmpiricalModeDecomposition.jsx` |

### Optimal Execution — UI-only
| Model | Formula | Component |
|-------|---------|-----------|
| Almgren-Chriss | `min E[x] + λ*Var[x]`, efficient frontier | `AlmgrenChriss.jsx` |
| Pontryagin | `H = -c + p*f`, shooting method vs TWAP | `PontryaginMaximum.jsx` |
| Stochastic Control (HJB) | `0 = min_u{c + V_t + μ*V_x + 0.5*σ²*V_xx}` | `StochasticOptimalControl.jsx` |

### Risk Measures — UI-only
| Model | Formula | Component |
|-------|---------|-----------|
| CVaR | `CVaR_α = min_z{z + (1/(1-α))*E[(L-z)+]}` | `ConditionalValueAtRisk.jsx` |
| Cramer-Rao Bound | `Var(θ̂) ≥ 1/I(θ)` | `CramerRaoBound.jsx` |
| Isolation Forest | `s(x,n) = 2^(-E(h(x))/c(n))` | `IsolationForest.jsx` |

### Causality & Information Theory — UI-only
| Model | Formula | Component |
|-------|---------|-----------|
| Transfer Entropy | `TE(X→Y) = H(Y_t|Y_{t-1}) - H(Y_t|Y_{t-1},X_{t-1})` | `TransferEntropy.jsx` |
| Kolmogorov-Sinai | Symbolic dynamics, permutation entropy, Lyapunov | `KolmogorovSinaiEntropy.jsx` |
| Information Bottleneck | `min I(X;T) - β*I(T;Y)` via Blahut-Arimoto | `InformationBottleneck.jsx` |
| Renyi Entropy | `H_α = (1/(1-α))*log(sum p_i^α)` | `RenyiEntropy.jsx` |

### Machine Learning — UI-only
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

### Topological Data Analysis — UI-only
| Model | Method | Component |
|-------|--------|-----------|
| Persistent Homology | Vietoris-Rips, Betti numbers, diagrams | `TopologicalDataAnalysis.jsx` |
| Homology Landscape | Landscape functions, L2 norm | `PersistentHomologyLandscape.jsx` |

### Optimal Transport — UI-only
| Model | Method | Component |
|-------|--------|-----------|
| Wasserstein W1/W2 | Sinkhorn algorithm, KS statistic | `OptimalTransport.jsx` |
| Schrodinger Bridge | Entropy-regularized OT, barycentric mapping | `SchrodingerBridge.jsx` |
| Wasserstein Barycenters | OT Frechet mean, quantile averaging | `WassersteinBarycenters.jsx` |

### Stochastic Calculus — UI-only
| Model | Formula | Component |
|-------|---------|-----------|
| SDE | Euler-Maruyama, Milstein (GBM/OU/CIR/Heston/Merton) | `StochasticDifferentialEquations.jsx` |
| Ito Generator | Infinitesimal generator, Dynkin's formula | `ItoCalculusGenerator.jsx` |
| Malliavin Calculus | IBP Greeks, unbiased pathwise sensitivities | `MalliavinCalculus.jsx` |
| Fokker-Planck | Finite difference PDE, density evolution → VaR | `FokkerPlanckEquation.jsx` |
| Girsanov Theorem | Measure change, Radon-Nikodym derivative | `GirsanovTheorem.jsx` |
| Cameron-Martin | Gaussian shift theorem, drift alignment | `CameronMartinFormula.jsx` |

### Network & Graph Theory — UI-only
| Model | Method | Component |
|-------|--------|-----------|
| Graph Theory | Kruskal's MST, eigenvector/betweenness centrality | `GraphTheoryNetwork.jsx` |
| Tensor Decomposition | CP/ALS, multi-way factor analysis | `TensorDecomposition.jsx` |

### Functional Analysis — UI-only
| Model | Method | Component |
|-------|--------|-----------|
| Sobolev Regularization | Tikhonov, Matern kernel, L-curve | `SobolevSpaceRegularization.jsx` |
| Banach Fixed-Point | Contraction mapping, Nash equilibrium | `BanachFixedPoint.jsx` |
| Riesz Representation | Representer theorem, feature importance | `RieszRepresentation.jsx` |
| Lax-Milgram | Variational PDE, FEM, coercivity | `LaxMilgramTheorem.jsx` |
| Arzela-Ascoli | Equicontinuity, overfitting detection | `ArzelaAscoli.jsx` |

### Measure Theory — UI-only
| Model | Method | Component |
|-------|--------|-----------|
| Hahn Decomposition | Jordan decomposition, SNR | `HahnDecomposition.jsx` |
| Radon-Nikodym | Likelihood ratio, KL divergence, regime change | `RadonNikodymDerivative.jsx` |
| Prokhorov Metric | Weak convergence, distribution shift | `ProkhorovMetric.jsx` |
| Stone-Cech | Universal embedding, regime limit points | `StoneCechCompactification.jsx` |

### Physics-Inspired — UI-only
| Model | Method | Component |
|-------|--------|-----------|
| Renormalization Group | Multi-scale coarse-graining, scaling exponents | `RenormalizationGroup.jsx` |
| Free Energy Principle | Variational free energy, active inference | `FreeEnergyPrinciple.jsx` |
| Lie Group Symmetries | Noether's theorem, Lie algebra generators | `LieGroupSymmetries.jsx` |
| Burgers Equation | Viscous Burgers PDE, Hopf-Cole transform | `BurgersEquation.jsx` |

### Signal Processing — UI-only
| Model | Method | Component |
|-------|--------|-----------|
| Ehlers SuperSmoother | 2-pole super smoother, MAMA/FAMA, Hilbert | `EhlersSuperSmoother.jsx` |
| Cesaro/Fejer Kernel | Cesaro mean, no Gibbs phenomenon | `CesaroFejerKernel.jsx` |

### Bayesian — UI-only
| Model | Method | Component |
|-------|--------|-----------|
| Black-Litterman | Equilibrium returns + investor views → posterior | `BlackLitterman.jsx` |
| Bayesian Ridge | Regularized linear regression with priors | `BayesianPricePredictor.jsx` |

### Other — UI-only
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

## 8. ~~Dead Code — CUDA and ONNX~~ — REMOVED (Sprint 43)

CUDA (`gpu_accelerator.cu`) and ONNX (`onnx_engine.h`) files were removed in Sprint 43.
They were behind `#ifdef` guards, never compiled, never referenced in CMakeLists.txt.
If CUDA/ONNX support is needed in the future, it must be implemented from scratch.

---

## 9. Funding Rate Model — Trading logic

8-hour intervals (00:00/08:00/16:00 UTC), perpetual-spot basis:

```
rate = clamp(premium * multiplier, -max_rate, max_rate)
premium = (perp_price - index_price) / index_price
payment = position_notional * rate
```

- **Source:** `exchange-simulator/exchange_simulator/funding_rate.py`

---

## 10. Liquidation Engine — Trading logic

```
liq_price_long = entry * (1 - 1/leverage + maintenance_margin)
liq_price_short = entry * (1 + 1/leverage - maintenance_margin)
```

Partial liquidation (50% at partial liq price), cascade liquidations, insurance fund, ADL.

- **Source:** `exchange-simulator/exchange_simulator/liquidation_engine_v2.py`

---

## 11. Latency Simulation — Trading logic

Per-exchange base latency (Binance 50ms, OKX 80ms, Bybit 120ms) with Gaussian jitter, Poisson spikes, exponential backoff reconnection.

- **Source:** `exchange-simulator/exchange_simulator/latency_simulation.py`
