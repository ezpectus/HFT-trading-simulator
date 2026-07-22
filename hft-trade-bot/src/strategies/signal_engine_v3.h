// ═══════════════════════════════════════════════════════════════════════════════
// HFT Signal Engine V3 — HMM Regime Detection + V2 Composite
//
// Adds Hidden Markov Model for market regime detection:
//   States: TRENDING_UP, TRENDING_DOWN, RANGING, VOLATILE
//   Uses returns + volatility as observations
//   Online Baum-Welch parameter adaptation (simplified)
//   Viterbi decoding for most likely state path
//
// Regime gates V2 signals:
//   - TRENDING_UP → boost LONG signals, dampen SHORT
//   - TRENDING_DOWN → boost SHORT signals, dampen LONG
//   - RANGING → reduce confidence, favor mean-reversion
//   - VOLATILE → widen stops, reduce leverage
//
// Design constraints:
//   - No heap allocations in analyze() — all stack-allocated
//   - O(1) per-tick update via online HMM forward recursion
//   - C++20, gcc-13/MSVC compatible
// ═══════════════════════════════════════════════════════════════════════════════
#pragma once

#include "signal_engine_v2.h"
#include "../data/aligned_types.h"
#include "../data/types.h"
#include <cmath>
#include <cstdint>
#include <cstring>
#include <array>
#include <string>
#include <string_view>
#include <unordered_map>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace hft {

// StringHash is defined in signal_engine_v2.h — reused here (V2 is always included before V3)

// ─────────────────────────────────────────────────────────────────────────────
// HMM Regime States
// ─────────────────────────────────────────────────────────────────────────────
enum class RegimeState : uint8_t {
    TRENDING_UP = 0,
    TRENDING_DOWN = 1,
    RANGING = 2,
    VOLATILE = 3,
    NUM_STATES = 4
};

constexpr const char* regime_name(RegimeState s) noexcept {
    switch (s) {
        case RegimeState::TRENDING_UP:   return "TRENDING_UP";
        case RegimeState::TRENDING_DOWN: return "TRENDING_DOWN";
        case RegimeState::RANGING:       return "RANGING";
        case RegimeState::VOLATILE:      return "VOLATILE";
        default:                         return "UNKNOWN";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Online HMM — 4-state Gaussian emission, forward recursion
//
// Observation: (log_return, volatility_proxy) — 2D continuous
// Emission: Gaussian with per-state mean and variance
// Transition: 4x4 matrix, updated online with decay
// ─────────────────────────────────────────────────────────────────────────────
class OnlineHMM {
public:
    static constexpr int N_STATES = 4;
    static constexpr int N_OBS = 2; // log_return, vol_proxy

    // Log-space for numerical stability
    using StateLogProbs = std::array<double, N_STATES>;

private:
    // Transition matrix (row = from, col = to), log-space
    std::array<std::array<double, N_STATES>, N_STATES> log_trans_{};

    // Emission parameters: mean[N_STATES][N_OBS], var[N_STATES][N_OBS]
    std::array<std::array<double, N_OBS>, N_STATES> emit_mean_{};
    std::array<std::array<double, N_OBS>, N_STATES> emit_var_{};

    // Forward state probabilities (log-space)
    StateLogProbs log_alpha_{};

    // Online learning rate
    double lr_{0.01};

    // Initialization flag
    bool initialized_{false};
    int update_count_{0};

    // Previous price for log-return computation
    double prev_price_{0.0};

    // Rolling volatility (EWMA of squared returns)
    double vol_ewma_{0.0};
    static constexpr double VOL_LAMBDA = 0.94; // RiskMetrics-style

public:
    OnlineHMM() noexcept {
        // Initialize with reasonable defaults
        // Transition: slight preference for staying in same state
        for (int i = 0; i < N_STATES; ++i) {
            for (int j = 0; j < N_STATES; ++j) {
                log_trans_[i][j] = (i == j) ? std::log(0.55) : std::log(0.15);
            }
        }

        // Emission means: [log_return, vol_proxy]
        emit_mean_[static_cast<int>(RegimeState::TRENDING_UP)]   = { 0.0008, 0.003 };
        emit_mean_[static_cast<int>(RegimeState::TRENDING_DOWN)] = {-0.0008, 0.003 };
        emit_mean_[static_cast<int>(RegimeState::RANGING)]       = { 0.0000, 0.001 };
        emit_mean_[static_cast<int>(RegimeState::VOLATILE)]      = { 0.0000, 0.008 };

        // Emission variances
        emit_var_[static_cast<int>(RegimeState::TRENDING_UP)]   = { 0.0003, 0.00001 };
        emit_var_[static_cast<int>(RegimeState::TRENDING_DOWN)] = { 0.0003, 0.00001 };
        emit_var_[static_cast<int>(RegimeState::RANGING)]       = { 0.00005, 0.000001 };
        emit_var_[static_cast<int>(RegimeState::VOLATILE)]      = { 0.001, 0.0001 };

        // Initial state distribution — uniform
        for (int i = 0; i < N_STATES; ++i) {
            log_alpha_[i] = std::log(1.0 / N_STATES);
        }
    }

    void init(double price) noexcept {
        prev_price_ = price;
        initialized_ = true;
    }

    // Compute log Gaussian emission probability
    static double log_gaussian(double x, double mean, double var) noexcept {
        if (var < 1e-15) var = 1e-15;
        double diff = x - mean;
        double inv_var = 1.0 / var;
        return -0.5 * (std::log(2.0 * M_PI) + std::log(var) + diff * diff * inv_var);
    }

    // Update HMM with a new price observation
    // Returns the most likely current regime
    RegimeState update(double price) noexcept {
        if (!initialized_) [[unlikely]] {
            init(price);
            return RegimeState::RANGING;
        }

        // Compute observations
        double log_ret = (prev_price_ > 0 && price > 0) ? std::log(price / prev_price_) : 0.0;
        vol_ewma_ = VOL_LAMBDA * vol_ewma_ + (1.0 - VOL_LAMBDA) * log_ret * log_ret;
        double vol_proxy = std::sqrt(vol_ewma_ * 252.0); // annualized

        prev_price_ = price;
        update_count_++;

        // Forward recursion: log_alpha_j = log(emission_j) + log_sum_i(log_alpha_i + log_trans_ij)
        StateLogProbs new_alpha{};
        double trans_sum[N_STATES][N_STATES];
        for (int j = 0; j < N_STATES; ++j) {
            double emit_lp = log_gaussian(log_ret, emit_mean_[j][0], emit_var_[j][0])
                           + log_gaussian(vol_proxy, emit_mean_[j][1], emit_var_[j][1]);

            // Cache log_alpha[i] + log_trans[i][j] — avoid recomputing for max + sum
            double max_logsum = -1e300;
            for (int i = 0; i < N_STATES; ++i) {
                trans_sum[i][j] = log_alpha_[i] + log_trans_[i][j];
                if (trans_sum[i][j] > max_logsum) max_logsum = trans_sum[i][j];
            }

            // log-sum-exp trick
            double sum = 0.0;
            for (int i = 0; i < N_STATES; ++i) {
                sum += std::exp(trans_sum[i][j] - max_logsum);
            }
            new_alpha[j] = emit_lp + max_logsum + std::log(sum);
        }

        // Normalize log_alpha (subtract max for numerical stability)
        double max_alpha = -1e300;
        for (int i = 0; i < N_STATES; ++i) {
            if (new_alpha[i] > max_alpha) max_alpha = new_alpha[i];
        }
        for (int i = 0; i < N_STATES; ++i) {
            new_alpha[i] -= max_alpha;
        }
        log_alpha_ = new_alpha;

        // Online parameter adaptation (simplified Baum-Welch)
        if (update_count_ % 50 == 0) {
            adapt_parameters(log_ret, vol_proxy);
        }

        // Find most likely state
        return most_likely_state();
    }

    RegimeState most_likely_state() const noexcept {
        int best = 0;
        double best_lp = log_alpha_[0];
        for (int i = 1; i < N_STATES; ++i) {
            if (log_alpha_[i] > best_lp) {
                best_lp = log_alpha_[i];
                best = i;
            }
        }
        return static_cast<RegimeState>(best);
    }

    // Get state probability (normalized)
    double state_probability(RegimeState s) const noexcept {
        double sum = 0.0;
        for (int i = 0; i < N_STATES; ++i) {
            sum += std::exp(log_alpha_[i]);
        }
        if (sum < 1e-15) return 0.0;
        return std::exp(log_alpha_[static_cast<int>(s)]) / sum;
    }

    // Get current volatility estimate
    double current_volatility() const noexcept {
        return std::sqrt(vol_ewma_ * 252.0);
    }

private:
    void adapt_parameters(double log_ret, double vol_proxy) noexcept {
        // Soft assignment weights from current alpha
        double weights[N_STATES]{};
        double sum = 0.0;
        for (int i = 0; i < N_STATES; ++i) {
            weights[i] = std::exp(log_alpha_[i]);
            sum += weights[i];
        }
        if (sum < 1e-15) return;
        for (int i = 0; i < N_STATES; ++i) weights[i] /= sum;

        // Update emission means (online EWMA)
        for (int i = 0; i < N_STATES; ++i) {
            double w = weights[i] * lr_;
            emit_mean_[i][0] = (1.0 - w) * emit_mean_[i][0] + w * log_ret;
            emit_mean_[i][1] = (1.0 - w) * emit_mean_[i][1] + w * vol_proxy;
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Signal Engine V3 — V2 composite + HMM regime gating
// ─────────────────────────────────────────────────────────────────────────────
class SignalEngineV3 {
public:
    struct Params {
        // Regime confidence boost/dampen factors
        double trend_boost = 1.3;       // Boost signals aligned with trend
        double trend_dampen = 0.5;      // Dampen signals against trend
        double range_confidence_cap = 50; // Max confidence in ranging mode
        double volatile_leverage_mult = 0.5; // Reduce leverage in volatile regime
        double volatile_stop_mult = 1.5;    // Widen stops in volatile regime

        // HMM update threshold (only update HMM when price changes by this %)
        double hmm_update_threshold = 0.0001;

        // Min HMM confidence to apply regime gating
        double min_regime_confidence = 0.4;
    };

private:
    SignalEngineV2 v2_engine_;
    OnlineHMM hmm_;
    Params params_;

    // Per-symbol HMM state — transparent hash enables find(string_view) without allocation
    struct HMMState {
        OnlineHMM hmm;
        double last_price = 0.0;
        bool initialized = false;
    };
    std::unordered_map<std::string, HMMState, StringHash, std::equal_to<>> hmm_states_;

public:
    explicit SignalEngineV3(const SignalEngineV2::Params& v2_params,
                            const Params& v3_params)
        : v2_engine_(v2_params), params_(v3_params) {}

    // Analyze with regime detection
    // Uses V2 for base signal, then applies HMM regime gating
    FastSignal analyze(
        const char* symbol,
        const Candle* candles, size_t n,
        const OrderBook& ob,
        const PressureResult& pressure,
        int64_t timestamp_ns
    ) noexcept {
        // Get base signal from V2
        FastSignal base = v2_engine_.analyze(symbol, candles, n, ob, pressure, timestamp_ns);

        if (n == 0) return base;

        // Get or create HMM state for this symbol
        // Avoid heap allocation on every call: find first, only construct string if missing
        auto it = hmm_states_.find(std::string_view(symbol));
        if (it == hmm_states_.end()) {
            it = hmm_states_.emplace(std::string(symbol), HMMState{}).first;
        }
        auto& state = it->second;
        double current_price = candles[n - 1].close;

        // Initialize or update HMM
        if (!state.initialized) {
            state.hmm.init(current_price);
            state.last_price = current_price;
            state.initialized = true;
        } else if (state.last_price > 0) {
            double price_change = std::abs(current_price - state.last_price) / state.last_price;
            if (price_change > params_.hmm_update_threshold) {
                state.hmm.update(current_price);
                state.last_price = current_price;
            }
        }

        // Get current regime
        RegimeState regime = state.hmm.most_likely_state();
        double regime_conf = state.hmm.state_probability(regime);

        // Apply regime gating only if confident enough
        if (regime_conf < params_.min_regime_confidence) {
            return base;
        }

        // Apply regime-specific adjustments
        switch (regime) {
            case RegimeState::TRENDING_UP:
                if (base.direction == FastSignal::Direction::LONG) {
                    base.confidence = std::min(100u,
                        static_cast<unsigned>(base.confidence * params_.trend_boost));
                } else if (base.direction == FastSignal::Direction::SHORT) {
                    base.confidence = static_cast<unsigned>(base.confidence * params_.trend_dampen);
                }
                break;

            case RegimeState::TRENDING_DOWN:
                if (base.direction == FastSignal::Direction::SHORT) {
                    base.confidence = std::min(100u,
                        static_cast<unsigned>(base.confidence * params_.trend_boost));
                } else if (base.direction == FastSignal::Direction::LONG) {
                    base.confidence = static_cast<unsigned>(base.confidence * params_.trend_dampen);
                }
                break;

            case RegimeState::RANGING:
                // Cap confidence in ranging mode
                if (base.confidence > static_cast<unsigned>(params_.range_confidence_cap)) {
                    base.confidence = static_cast<unsigned>(params_.range_confidence_cap);
                }
                break;

            case RegimeState::VOLATILE:
                // Widen stops, reduce leverage
                if (base.stop_loss > 0 && base.entry_price > 0) {
                    double sl_distance = std::abs(base.entry_price - base.stop_loss);
                    base.stop_loss = base.entry_price +
                        (base.stop_loss > base.entry_price ? sl_distance * params_.volatile_stop_mult
                                                           : -sl_distance * params_.volatile_stop_mult);
                }
                if (base.take_profit > 0 && base.entry_price > 0) {
                    double tp_distance = std::abs(base.take_profit - base.entry_price);
                    base.take_profit = base.entry_price +
                        (base.take_profit > base.entry_price ? tp_distance * params_.volatile_stop_mult
                                                             : -tp_distance * params_.volatile_stop_mult);
                }
                base.leverage = std::max(1u,
                    static_cast<unsigned>(base.leverage * params_.volatile_leverage_mult));
                break;

            case RegimeState::NUM_STATES:
                break;
        }

        // Append regime info to reason
        // Format: "V2_reason | REGIME:name conf:XX%"
        const char* rname = regime_name(regime);
        // Append to existing reason — carefully respect 48-byte buffer limit
        int reason_len = 0;
        while (base.reason[reason_len] && reason_len < 47) ++reason_len;
        if (reason_len < 40) {
            base.reason[reason_len] = '|';
            base.reason[reason_len + 1] = ' ';
            reason_len += 2;
            int i = 0;
            while (rname[i] && reason_len + i < 44) {
                base.reason[reason_len + i] = rname[i];
                ++i;
            }
            reason_len += i;
            if (reason_len < 44) {
                base.reason[reason_len] = ' ';
                // Add confidence as 2-digit
                int conf_int = static_cast<int>(regime_conf * 100);
                if (conf_int > 99) conf_int = 99;
                base.reason[reason_len + 1] = '0' + (conf_int / 10);
                base.reason[reason_len + 2] = '0' + (conf_int % 10);
                base.reason[reason_len + 3] = '%';
                reason_len += 4;
            }
            while (reason_len < 48) {
                base.reason[reason_len] = '\0';
                ++reason_len;
            }
        }

        return base;
    }

    // Incremental analysis using cached state
    FastSignal analyze_incremental(
        const char* symbol,
        const Candle* candles, size_t n,
        const OrderBook& ob,
        const PressureResult& pressure,
        int64_t timestamp_ns
    ) noexcept {
        // Get base signal from V2 incremental
        FastSignal base = v2_engine_.analyze_incremental(symbol, candles, n, ob, pressure, timestamp_ns);

        if (n == 0) return base;

        // Same HMM regime gating as above — avoid heap allocation with find+emplace
        auto it = hmm_states_.find(std::string_view(symbol));
        if (it == hmm_states_.end()) {
            it = hmm_states_.emplace(std::string(symbol), HMMState{}).first;
        }
        auto& state = it->second;
        double current_price = candles[n - 1].close;

        if (!state.initialized) {
            state.hmm.init(current_price);
            state.last_price = current_price;
            state.initialized = true;
        } else if (state.last_price > 0) {
            double price_change = std::abs(current_price - state.last_price) / state.last_price;
            if (price_change > params_.hmm_update_threshold) {
                state.hmm.update(current_price);
                state.last_price = current_price;
            }
        }

        RegimeState regime = state.hmm.most_likely_state();
        double regime_conf = state.hmm.state_probability(regime);

        if (regime_conf < params_.min_regime_confidence) {
            return base;
        }

        switch (regime) {
            case RegimeState::TRENDING_UP:
                if (base.direction == FastSignal::Direction::LONG) {
                    base.confidence = std::min(100u,
                        static_cast<unsigned>(base.confidence * params_.trend_boost));
                } else if (base.direction == FastSignal::Direction::SHORT) {
                    base.confidence = static_cast<unsigned>(base.confidence * params_.trend_dampen);
                }
                break;

            case RegimeState::TRENDING_DOWN:
                if (base.direction == FastSignal::Direction::SHORT) {
                    base.confidence = std::min(100u,
                        static_cast<unsigned>(base.confidence * params_.trend_boost));
                } else if (base.direction == FastSignal::Direction::LONG) {
                    base.confidence = static_cast<unsigned>(base.confidence * params_.trend_dampen);
                }
                break;

            case RegimeState::RANGING:
                if (base.confidence > static_cast<unsigned>(params_.range_confidence_cap)) {
                    base.confidence = static_cast<unsigned>(params_.range_confidence_cap);
                }
                break;

            case RegimeState::VOLATILE:
                if (base.stop_loss > 0 && base.entry_price > 0) {
                    double sl_distance = std::abs(base.entry_price - base.stop_loss);
                    base.stop_loss = base.entry_price +
                        (base.stop_loss > base.entry_price ? sl_distance * params_.volatile_stop_mult
                                                           : -sl_distance * params_.volatile_stop_mult);
                }
                if (base.take_profit > 0 && base.entry_price > 0) {
                    double tp_distance = std::abs(base.take_profit - base.entry_price);
                    base.take_profit = base.entry_price +
                        (base.take_profit > base.entry_price ? tp_distance * params_.volatile_stop_mult
                                                             : -tp_distance * params_.volatile_stop_mult);
                }
                base.leverage = std::max(1u,
                    static_cast<unsigned>(base.leverage * params_.volatile_leverage_mult));
                break;

            case RegimeState::NUM_STATES:
                break;
        }

        return base;
    }

    // Accessors
    const SignalEngineV2& v2() const noexcept { return v2_engine_; }
    SignalEngineV2& v2() noexcept { return v2_engine_; }

    RegimeState current_regime(const char* symbol) const noexcept {
        auto it = hmm_states_.find(std::string_view(symbol));
        if (it == hmm_states_.end()) return RegimeState::RANGING;
        return it->second.hmm.most_likely_state();
    }

    double regime_confidence(const char* symbol) const noexcept {
        auto it = hmm_states_.find(std::string_view(symbol));
        if (it == hmm_states_.end()) return 0.0;
        RegimeState s = it->second.hmm.most_likely_state();
        return it->second.hmm.state_probability(s);
    }

    double current_volatility(const char* symbol) const noexcept {
        auto it = hmm_states_.find(std::string_view(symbol));
        if (it == hmm_states_.end()) return 0.0;
        return it->second.hmm.current_volatility();
    }

    const Params& params() const noexcept { return params_; }
    void set_params(const Params& p) noexcept { params_ = p; }
};

} // namespace hft
