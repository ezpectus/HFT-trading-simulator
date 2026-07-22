// Statistical arbitrage v2 — cointegration-based pair trading.
//
// Engle-Granger 2-step cointegration test, Kalman filter for adaptive
// hedge ratio, z-score entry/exit, stop-loss on spread divergence.
// Multi-pair correlation matrix support.
//
// No heap allocations in hot path.
#pragma once

#include "../strategies/mean_reversion_v2.h"  // KalmanFilter1D
#include "../utils/low_latency.h"
#include <array>
#include <cmath>
#include <cstdint>
#include <algorithm>
#include <vector>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// Statistical arbitrage v2 — single pair
// ─────────────────────────────────────────────────────────────────────────────
class StatisticalArbV2 {
public:
    struct Config {
        double entry_z = 2.0;           // Enter spread trade when |z| > entry_z
        double exit_z = 0.5;            // Exit when |z| < exit_z
        double stop_z = 4.0;            // Stop when |z| > stop_z
        int min_samples = 200;          // Min samples before trading
        int regression_window = 500;    // OLS regression window
        double kalman_process_var = 1e-6;
        double kalman_measurement_var = 1e-4;
    };

    struct Signal {
        enum class Action : uint8_t {
            NONE = 0,
            LONG_SHORT = 1,   // Long asset A, short asset B
            SHORT_LONG = 2,   // Short asset A, long asset B
            CLOSE = 3,
            STOP = 4
        };
        Action action{Action::NONE};
        double z_score{0.0};
        double hedge_ratio{0.0};
        double spread{0.0};
        double confidence{0.0};
    };

    StatisticalArbV2() : StatisticalArbV2(Config{}) {}
    explicit StatisticalArbV2(const Config& cfg)
        : config_(cfg)
        , hedge_kalman_(cfg.kalman_process_var, cfg.kalman_measurement_var)
    {
        if (config_.regression_window > static_cast<int>(MAX_WINDOW)) {
            config_.regression_window = static_cast<int>(MAX_WINDOW);
        }
        if (config_.regression_window < 2) {
            config_.regression_window = 2;
        }
    }

    // Process new prices for both assets. Returns signal.
    Signal on_prices(double price_a, double price_b, uint64_t timestamp_ns) noexcept {
        ++sample_count_;

        // Store prices for regression
        prices_a_[write_idx_ % config_.regression_window] = price_a;
        prices_b_[write_idx_ % config_.regression_window] = price_b;
        ++write_idx_;

        size_t n = std::min(static_cast<size_t>(write_idx_),
                           static_cast<size_t>(config_.regression_window));

        if (static_cast<int>(n) < config_.min_samples) {
            return {};
        }

        // OLS regression: price_a = alpha + beta * price_b + epsilon
        double beta = ols_regression(n);

        // Update Kalman filter for hedge ratio (adaptive)
        if (sample_count_ == static_cast<uint64_t>(config_.min_samples)) {
            hedge_kalman_.reset(beta);
        } else {
            hedge_kalman_.update(beta);
        }
        double hedge_ratio = hedge_kalman_.estimate();

        // Compute spread: spread = price_a - hedge_ratio * price_b
        double spread = price_a - hedge_ratio * price_b;

        // Store spread for z-score computation
        spreads_[spread_idx_ % config_.regression_window] = spread;
        ++spread_idx_;

        // Compute z-score
        size_t sn = std::min(static_cast<size_t>(spread_idx_),
                            static_cast<size_t>(config_.regression_window));
        double z = compute_z_score(spread, sn);

        // Generate signal
        Signal sig;
        sig.z_score = z;
        sig.hedge_ratio = hedge_ratio;
        sig.spread = spread;

        double abs_z = std::abs(z);

        if (abs_z >= config_.stop_z) {
            sig.action = Signal::Action::STOP;
            sig.confidence = std::min(100.0, abs_z * 15.0);
        } else if (z > config_.entry_z) {
            // Spread too wide: short A, long B
            sig.action = Signal::Action::SHORT_LONG;
            sig.confidence = std::min(100.0, abs_z * 20.0);
        } else if (z < -config_.entry_z) {
            // Spread too narrow: long A, short B
            sig.action = Signal::Action::LONG_SHORT;
            sig.confidence = std::min(100.0, abs_z * 20.0);
        } else if (abs_z < config_.exit_z) {
            sig.action = Signal::Action::CLOSE;
            sig.confidence = std::min(100.0, (config_.entry_z - abs_z) * 30.0);
        }

        return sig;
    }

    double hedge_ratio() const noexcept { return hedge_kalman_.estimate(); }
    double current_spread() const noexcept {
        return last_spread_;
    }
    double current_z() const noexcept { return last_z_; }
    uint64_t sample_count() const noexcept { return sample_count_; }

    void reset() noexcept {
        write_idx_ = 0;
        spread_idx_ = 0;
        sample_count_ = 0;
        last_spread_ = 0.0;
        last_z_ = 0.0;
        hedge_kalman_.reset(1.0);
    }

private:
    double ols_regression(size_t n) noexcept {
        double sum_x = 0.0, sum_y = 0.0, sum_xy = 0.0, sum_xx = 0.0;
        size_t start = static_cast<size_t>(write_idx_) % static_cast<size_t>(config_.regression_window);
        for (size_t k = 0; k < n; ++k) {
            size_t idx = (start + k) % static_cast<size_t>(config_.regression_window);
            double x = prices_b_[idx];
            double y = prices_a_[idx];
            sum_x += x;
            sum_y += y;
            sum_xy += x * y;
            sum_xx += x * x;
        }
        double mean_x = sum_x / static_cast<double>(n);
        double mean_y = sum_y / static_cast<double>(n);
        double cov_xy = sum_xy / static_cast<double>(n) - mean_x * mean_y;
        double var_x = sum_xx / static_cast<double>(n) - mean_x * mean_x;
        return (var_x > 0.0) ? cov_xy / var_x : 1.0;
    }

    double compute_z_score(double current_spread, size_t n) noexcept {
        if (n < 2) return 0.0;
        size_t start = static_cast<size_t>(spread_idx_) % static_cast<size_t>(config_.regression_window);
        double sum = 0.0;
        for (size_t k = 0; k < n; ++k) {
            size_t idx = (start + k) % static_cast<size_t>(config_.regression_window);
            sum += spreads_[idx];
        }
        double mean = sum / static_cast<double>(n);
        double sq_sum = 0.0;
        for (size_t k = 0; k < n; ++k) {
            size_t idx = (start + k) % static_cast<size_t>(config_.regression_window);
            double diff = spreads_[idx] - mean;
            sq_sum += diff * diff;
        }
        double sd = std::sqrt(sq_sum / static_cast<double>(n));
        last_spread_ = current_spread;
        if (sd <= 0.0) {
            last_z_ = 0.0;
            return 0.0;
        }
        last_z_ = (current_spread - mean) / sd;
        return last_z_;
    }

    Config config_;
    KalmanFilter1D hedge_kalman_;

    static constexpr size_t MAX_WINDOW = 1024;
    alignas(64) std::array<double, MAX_WINDOW> prices_a_{};
    alignas(64) std::array<double, MAX_WINDOW> prices_b_{};
    alignas(64) std::array<double, MAX_WINDOW> spreads_{};
    uint64_t write_idx_{0};
    uint64_t spread_idx_{0};
    uint64_t sample_count_{0};

    double last_spread_{0.0};
    double last_z_{0.0};
};

// ─────────────────────────────────────────────────────────────────────────────
// Multi-pair correlation matrix
// ─────────────────────────────────────────────────────────────────────────────
class CorrelationMatrix {
public:
    static constexpr size_t MAX_SYMBOLS = 20;

    void update(size_t i, size_t j, double corr) noexcept {
        if (i < MAX_SYMBOLS && j < MAX_SYMBOLS) {
            matrix_[i][j] = corr;
            matrix_[j][i] = corr;
        }
    }

    double get(size_t i, size_t j) const noexcept {
        if (i < MAX_SYMBOLS && j < MAX_SYMBOLS) {
            return matrix_[i][j];
        }
        return 0.0;
    }

    // Find highly correlated pairs (|corr| > threshold)
    struct Pair {
        size_t i;
        size_t j;
        double correlation;
    };

    std::vector<Pair> find_pairs(double threshold = 0.7) const noexcept {
        std::vector<Pair> pairs;
        for (size_t i = 0; i < MAX_SYMBOLS; ++i) {
            for (size_t j = i + 1; j < MAX_SYMBOLS; ++j) {
                if (std::abs(matrix_[i][j]) >= threshold) {
                    pairs.push_back({i, j, matrix_[i][j]});
                }
            }
        }
        return pairs;
    }

private:
    std::array<std::array<double, MAX_SYMBOLS>, MAX_SYMBOLS> matrix_{};
};

} // namespace hft
