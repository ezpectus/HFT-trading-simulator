// Mean reversion v2 — Ornstein-Uhlenbeck based with Kalman filter fair price.
//
// Estimates OU parameters (κ, θ, σ) from price history, computes z-score
// from OU residual, uses volatility-scaled entry/exit thresholds,
// and half-life based position holding.
//
// No heap allocations in hot path. All state in fixed-size arrays.
#pragma once

#include "../data/aligned_types.h"
#include "../utils/low_latency.h"
#include <array>
#include <cmath>
#include <cstdint>
#include <algorithm>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// Simple 1D Kalman filter for fair price estimation
// ─────────────────────────────────────────────────────────────────────────────
class KalmanFilter1D {
public:
    KalmanFilter1D(double process_var = 1e-5, double measurement_var = 1e-3)
        : Q_(process_var), R_(measurement_var) {}

    void reset(double initial_estimate) noexcept {
        x_ = initial_estimate;
        P_ = 1.0;
    }

    double update(double measurement) noexcept {
        // Predict
        P_ = P_ + Q_;

        // Update
        double K = P_ / (P_ + R_);
        x_ = x_ + K * (measurement - x_);
        P_ = (1.0 - K) * P_;

        return x_;
    }

    double estimate() const noexcept { return x_; }
    double variance() const noexcept { return P_; }

    void set_process_noise(double q) noexcept { Q_ = q; }
    void set_measurement_noise(double r) noexcept { R_ = r; }

private:
    double x_{0.0};  // State estimate
    double P_{1.0};  // Estimation uncertainty
    double Q_;       // Process noise
    double R_;       // Measurement noise
};

// ─────────────────────────────────────────────────────────────────────────────
// Mean reversion v2 — OU-based with Kalman filter
// ─────────────────────────────────────────────────────────────────────────────
class MeanReversionV2 {
public:
    struct Config {
        double kalman_process_var = 1e-5;
        double kalman_measurement_var = 1e-3;
        double entry_z_threshold = 2.0;    // Enter when |z| > threshold
        double exit_z_threshold = 0.5;     // Exit when |z| < threshold
        double stop_z_threshold = 4.0;     // Stop when |z| > threshold (divergence)
        int min_samples = 100;             // Min samples before generating signals
        int ou_window = 500;               // Window for OU parameter estimation
        double max_half_life_seconds = 3600.0; // Max holding time
    };

    struct Signal {
        enum class Action : uint8_t { NONE = 0, ENTER_LONG = 1, ENTER_SHORT = 2,
                                       EXIT_LONG = 3, EXIT_SHORT = 4, STOP = 5 };
        Action action{Action::NONE};
        double z_score{0.0};
        double fair_price{0.0};
        double half_life_seconds{0.0};
        double confidence{0.0};  // 0-100
    };

    MeanReversionV2() : MeanReversionV2(Config{}) {}
    explicit MeanReversionV2(const Config& cfg)
        : config_(cfg)
        , kalman_(cfg.kalman_process_var, cfg.kalman_measurement_var)
    {
        if (config_.ou_window > static_cast<int>(MAX_WINDOW)) {
            config_.ou_window = static_cast<int>(MAX_WINDOW);
        }
        if (config_.ou_window < 2) {
            config_.ou_window = 2;
        }
    }

    // Process a new price tick. Returns signal action.
    Signal on_price(uint64_t timestamp_ns, double price) noexcept {
        // Update Kalman filter
        if (price_count_ == 0) {
            kalman_.reset(price);
        }
        double fair_price = kalman_.update(price);
        ++price_count_;

        // Store residual for OU estimation
        double residual = price - fair_price;
        residuals_[write_idx_ % config_.ou_window] = residual;
        timestamps_[write_idx_ % config_.ou_window] = timestamp_ns;
        ++write_idx_;

        // Need enough samples
        size_t n = std::min(static_cast<size_t>(write_idx_),
                           static_cast<size_t>(config_.ou_window));
        if (static_cast<int>(n) < config_.min_samples) {
            return {Signal::Action::NONE, 0.0, fair_price, 0.0, 0.0};
        }

        // Estimate OU parameters
        double kappa, theta, sigma;
        estimate_ou_params(kappa, theta, sigma);

        // Compute z-score: z = (price - theta) / sigma
        // For OU process: residual = price - fair_price
        // z-score of residual relative to OU equilibrium
        double z = 0.0;
        if (sigma > 0.0) {
            z = (price - theta) / sigma;
        }

        // Half-life: ln(2) / kappa
        double half_life = (kappa > 0.0) ? 0.6931471805599453 / kappa : config_.max_half_life_seconds;

        // Generate signal
        Signal sig;
        sig.z_score = z;
        sig.fair_price = fair_price;
        sig.half_life_seconds = half_life;

        double abs_z = std::abs(z);
        last_z_ = z;

        if (abs_z >= config_.stop_z_threshold) {
            // Spread diverged too far — stop
            sig.action = Signal::Action::STOP;
            sig.confidence = std::min(100.0, abs_z * 15.0);
        } else if (z > config_.entry_z_threshold) {
            // Price above fair value → short
            sig.action = Signal::Action::ENTER_SHORT;
            sig.confidence = std::min(100.0, abs_z * 20.0);
        } else if (z < -config_.entry_z_threshold) {
            // Price below fair value → long
            sig.action = Signal::Action::ENTER_LONG;
            sig.confidence = std::min(100.0, abs_z * 20.0);
        } else if (abs_z < config_.exit_z_threshold) {
            // Reverted to mean → exit
            if (z > 0) {
                sig.action = Signal::Action::EXIT_SHORT;
            } else if (z < 0) {
                sig.action = Signal::Action::EXIT_LONG;
            }
            sig.confidence = std::min(100.0, (config_.entry_z_threshold - abs_z) * 30.0);
        }

        return sig;
    }

    // Get current OU parameters
    void get_ou_params(double& kappa, double& theta, double& sigma) const noexcept {
        kappa = last_kappa_;
        theta = last_theta_;
        sigma = last_sigma_;
    }

    double fair_price() const noexcept { return kalman_.estimate(); }
    double current_z_score() const noexcept { return last_z_; }
    uint64_t price_count() const noexcept { return price_count_; }

    void reset() noexcept {
        kalman_.reset(0.0);
        write_idx_ = 0;
        price_count_ = 0;
        last_kappa_ = 0.0;
        last_theta_ = 0.0;
        last_sigma_ = 0.0;
        last_z_ = 0.0;
    }

private:
    // Estimate OU parameters via OLS regression on discrete AR(1):
    //   Δx_t = -κ * x_{t-1} * Δt + ε
    //   κ = -slope / Δt, θ = mean, σ = std(ε) / sqrt(Δt)
    void estimate_ou_params(double& kappa, double& theta, double& sigma) noexcept {
        size_t n = std::min(static_cast<size_t>(write_idx_),
                           static_cast<size_t>(config_.ou_window));
        if (n < 2) {
            kappa = 0.0;
            theta = 0.0;
            sigma = 0.0;
            return;
        }

        // Compute mean (theta) — ring buffer safe: iterate in insertion order
        size_t start = static_cast<size_t>(write_idx_) % static_cast<size_t>(config_.ou_window);
        double sum = 0.0;
        for (size_t k = 0; k < n; ++k) {
            size_t idx = (start + k) % static_cast<size_t>(config_.ou_window);
            sum += residuals_[idx];
        }
        theta = sum / static_cast<double>(n);

        // Compute AR(1) regression: x_t = a * x_{t-1} + b
        // kappa = (1 - a) / dt, where dt is average time step
        double sum_xy = 0.0, sum_xx = 0.0, sum_x = 0.0, sum_y = 0.0;
        size_t count = 0;
        for (size_t k = 1; k < n; ++k) {
            size_t idx_prev = (start + k - 1) % static_cast<size_t>(config_.ou_window);
            size_t idx_cur  = (start + k) % static_cast<size_t>(config_.ou_window);
            double x = residuals_[idx_prev];
            double y = residuals_[idx_cur];
            sum_xy += x * y;
            sum_xx += x * x;
            sum_x += x;
            sum_y += y;
            ++count;
        }

        if (count < 2 || sum_xx == 0.0) {
            kappa = 0.0;
            theta = 0.0;
            sigma = 0.0;
            return;
        }

        double mean_x = sum_x / static_cast<double>(count);
        double mean_y = sum_y / static_cast<double>(count);
        double cov_xy = sum_xy / static_cast<double>(count) - mean_x * mean_y;
        double var_x = sum_xx / static_cast<double>(count) - mean_x * mean_x;

        double ar1_coef = (var_x > 0.0) ? cov_xy / var_x : 0.0;

        // Compute average time step in seconds — ring buffer safe
        double avg_dt = 1.0; // Default to 1 second
        if (n >= 2) {
            double total_dt = 0.0;
            size_t dt_count = 0;
            for (size_t k = 1; k < n; ++k) {
                size_t idx_prev = (start + k - 1) % static_cast<size_t>(config_.ou_window);
                size_t idx_cur  = (start + k) % static_cast<size_t>(config_.ou_window);
                double dt = static_cast<double>(
                    timestamps_[idx_cur] - timestamps_[idx_prev]) / 1e9;
                if (dt > 0.0) {
                    total_dt += dt;
                    ++dt_count;
                }
            }
            if (dt_count > 0) {
                avg_dt = total_dt / static_cast<double>(dt_count);
            }
        }

        // kappa = (1 - ar1_coef) / dt
        kappa = (1.0 - ar1_coef) / avg_dt;
        if (kappa < 0.0) kappa = 0.0;

        // Compute residual standard deviation (reuses theta from first pass)
        double sq_sum = 0.0;
        for (size_t k = 0; k < n; ++k) {
            size_t idx = (start + k) % static_cast<size_t>(config_.ou_window);
            double diff = residuals_[idx] - theta;
            sq_sum += diff * diff;
        }
        sigma = std::sqrt(sq_sum / static_cast<double>(n));

        last_kappa_ = kappa;
        last_theta_ = theta;
        last_sigma_ = sigma;
    }

    Config config_;
    KalmanFilter1D kalman_;

    static constexpr size_t MAX_WINDOW = 2048;
    alignas(64) std::array<double, MAX_WINDOW> residuals_{};
    alignas(64) std::array<uint64_t, MAX_WINDOW> timestamps_{};
    uint64_t write_idx_{0};
    uint64_t price_count_{0};

    double last_kappa_{0.0};
    double last_theta_{0.0};
    double last_sigma_{0.0};
    double last_z_{0.0};
};

} // namespace hft
