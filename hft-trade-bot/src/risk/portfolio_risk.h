// Portfolio-level risk — VaR, CVaR, stress testing, drawdown tracking.
//
// Historical VaR: sorted returns, percentile lookup.
// Parametric VaR: mean - z * sigma * portfolio_value.
// CVaR (Expected Shortfall): average of tail beyond VaR.
// Stress test: apply scenario shocks to current portfolio.
// Drawdown tracker: peak-to-trough, underwater curve.
//
// No heap allocations in hot path for VaR/CVaR (fixed-size arrays).
#pragma once

#include "../utils/low_latency.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <string>
#include <vector>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// Drawdown tracker — peak-to-trough, underwater curve
// ─────────────────────────────────────────────────────────────────────────────
class DrawdownTracker {
  public:
    void update(double equity) noexcept {
        if (equity > peak_) {
            peak_ = equity;
        }
        current_dd_ = (peak_ > 0.0) ? (peak_ - equity) / peak_ : 0.0;
        if (current_dd_ > max_dd_) {
            max_dd_      = current_dd_;
            max_dd_time_ = std::chrono::steady_clock::now();
        }
    }

    double current_drawdown() const noexcept { return current_dd_; }
    double max_drawdown() const noexcept { return max_dd_; }
    double peak_equity() const noexcept { return peak_; }

    // Underwater duration (seconds since last peak)
    double underwater_duration_seconds() const noexcept {
        auto now = std::chrono::steady_clock::now();
        return std::chrono::duration<double>(now - max_dd_time_).count();
    }

    void reset() noexcept {
        peak_       = 0.0;
        current_dd_ = 0.0;
        max_dd_     = 0.0;
    }

  private:
    double                                peak_{0.0};
    double                                current_dd_{0.0};
    double                                max_dd_{0.0};
    std::chrono::steady_clock::time_point max_dd_time_{};
};

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio risk — VaR, CVaR, stress testing
// ─────────────────────────────────────────────────────────────────────────────
class PortfolioRisk {
  public:
    static constexpr size_t MAX_RETURNS = 1024;

    struct Position {
        std::string symbol;
        double      quantity; // signed: + long, - short
        double      current_price;
        double      weight; // portfolio weight (computed)
    };

    struct VaRResult {
        double var_95;  // 95% VaR
        double var_99;  // 99% VaR
        double cvar_95; // 95% CVaR (Expected Shortfall)
        double cvar_99; // 99% CVaR
    };

    struct StressScenario {
        std::string                                 name;
        std::vector<std::pair<std::string, double>> shocks; // symbol → pct shock
    };

    // Compute historical VaR from portfolio returns
    VaRResult compute_historical_var() const noexcept {
        size_t n = return_count_;
        if (n < 10) return {0.0, 0.0, 0.0, 0.0};

        // Sort returns (copy to avoid modifying original)
        // Ring buffer safe: iterate in insertion order
        std::array<double, MAX_RETURNS> sorted;
        size_t start = (return_count_ >= MAX_RETURNS) ? (return_count_ % MAX_RETURNS) : 0;
        for (size_t i = 0; i < n; ++i) {
            sorted[i] = returns_[(start + i) % MAX_RETURNS];
        }
        std::sort(sorted.begin(), sorted.begin() + n);

        // VaR: percentile of returns (loss = negative return)
        size_t idx_95 = static_cast<size_t>(n * 0.05);
        size_t idx_99 = static_cast<size_t>(n * 0.01);

        double var_95 = -sorted[idx_95];
        double var_99 = -sorted[idx_99];

        // CVaR: average of tail beyond VaR
        double cvar_95 = 0.0;
        for (size_t i = 0; i <= idx_95; ++i)
            cvar_95 += -sorted[i];
        cvar_95 /= static_cast<double>(idx_95 + 1);

        double cvar_99 = 0.0;
        for (size_t i = 0; i <= idx_99; ++i)
            cvar_99 += -sorted[i];
        cvar_99 /= static_cast<double>(idx_99 + 1);

        return {var_95, var_99, cvar_95, cvar_99};
    }

    // Compute parametric VaR (assumes normal distribution)
    VaRResult compute_parametric_var(double portfolio_value) const noexcept {
        size_t n = return_count_;
        if (n < 2) return {0.0, 0.0, 0.0, 0.0};

        // Ring buffer safe: iterate in insertion order
        size_t start = (return_count_ >= MAX_RETURNS) ? (return_count_ % MAX_RETURNS) : 0;

        // Mean and std
        double sum = 0.0;
        for (size_t i = 0; i < n; ++i)
            sum += returns_[(start + i) % MAX_RETURNS];
        double mean = sum / static_cast<double>(n);

        double sq_sum = 0.0;
        for (size_t i = 0; i < n; ++i) {
            double diff = returns_[(start + i) % MAX_RETURNS] - mean;
            sq_sum += diff * diff;
        }
        double sigma = std::sqrt(sq_sum / static_cast<double>(n - 1));

        // z-scores: 95% = 1.645, 99% = 2.326
        double var_95 = (1.645 * sigma - mean) * portfolio_value;
        double var_99 = (2.326 * sigma - mean) * portfolio_value;

        // CVaR (parametric): mean + z_cvar * sigma
        // For 95%: z_cvar = 2.063, for 99%: z_cvar = 2.665
        double cvar_95 = (2.063 * sigma - mean) * portfolio_value;
        double cvar_99 = (2.665 * sigma - mean) * portfolio_value;

        return {var_95, var_99, cvar_95, cvar_99};
    }

    // Add a portfolio return sample
    void add_return(double ret) noexcept {
        returns_[return_count_ % MAX_RETURNS] = ret;
        if (return_count_ < MAX_RETURNS) ++return_count_;
    }

    // Run stress test on current positions
    struct StressResult {
        double      total_loss;
        double      worst_position_loss;
        std::string worst_symbol;
    };

    StressResult run_stress_test(const std::vector<Position>& positions,
                                 const StressScenario&        scenario) const noexcept {
        double      total_loss = 0.0;
        double      worst_loss = 0.0;
        std::string worst_symbol;

        for (const auto& pos : positions) {
            double shock = 0.0;
            for (const auto& [sym, pct] : scenario.shocks) {
                if (sym == pos.symbol) {
                    shock = pct;
                    break;
                }
            }
            // Loss = position_value * shock
            double pos_value = pos.quantity * pos.current_price;
            double loss      = pos_value * shock;
            total_loss += loss;

            if (std::abs(loss) > std::abs(worst_loss)) {
                worst_loss   = loss;
                worst_symbol = pos.symbol;
            }
        }

        return {total_loss, worst_loss, worst_symbol};
    }

    // Correlation-adjusted exposure
    double correlation_adjusted_exposure(
        const std::vector<Position>&            positions,
        const std::vector<std::vector<double>>& corr_matrix) const noexcept {
        // Adjusted exposure = sqrt(w' * Σ * w) * portfolio_value
        // Simplified: sum of |position_value| adjusted by average correlation
        double total_exposure  = 0.0;
        double total_abs_value = 0.0;

        for (const auto& pos : positions) {
            double val = std::abs(pos.quantity * pos.current_price);
            total_abs_value += val;
        }

        // Average correlation adjustment
        if (positions.size() > 1u && !corr_matrix.empty()) {
            double avg_corr = 0.0;
            size_t count    = 0;
            for (size_t i = 0; i < positions.size() && i < corr_matrix.size(); ++i) {
                for (size_t j = i + 1; j < positions.size() && j < corr_matrix[i].size(); ++j) {
                    avg_corr += std::abs(corr_matrix[i][j]);
                    ++count;
                }
            }
            if (count > 0) avg_corr /= static_cast<double>(count);
            // Diversification benefit: adjusted = total * sqrt(1 + avg_corr * (n-1) / n)
            double n       = static_cast<double>(positions.size());
            total_exposure = total_abs_value * std::sqrt(1.0 + avg_corr * (n - 1.0) / n);
        } else {
            total_exposure = total_abs_value;
        }

        return total_exposure;
    }

    // Standard stress scenarios
    static StressScenario flash_crash() {
        return {"Flash Crash", {{"BTCUSDT", -0.10}, {"ETHUSDT", -0.12}, {"SOLUSDT", -0.15}}};
    }

    static StressScenario volatility_spike() {
        return {"Volatility Spike", {{"BTCUSDT", -0.05}, {"ETHUSDT", -0.07}, {"SOLUSDT", -0.10}}};
    }

    static StressScenario correlation_breakdown() {
        return {"Correlation Breakdown",
                {{"BTCUSDT", -0.08}, {"ETHUSDT", 0.05}, {"SOLUSDT", -0.03}}};
    }

    // Drawdown tracker
    DrawdownTracker&       drawdown() noexcept { return drawdown_; }
    const DrawdownTracker& drawdown() const noexcept { return drawdown_; }

    size_t return_count() const noexcept { return return_count_; }

  private:
    alignas(64) std::array<double, MAX_RETURNS> returns_{};
    size_t          return_count_{0};
    DrawdownTracker drawdown_;
};

} // namespace hft
