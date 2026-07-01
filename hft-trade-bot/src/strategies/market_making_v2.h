// Market making v2 — Avellaneda-Stoikov passive market making.
//
// Inventory-skewed quotes with reservation price:
//   r = s - q * gamma * sigma^2 * (T - t)
// Spread = gamma * sigma^2 * T + inventory penalty
// Dynamic quote width based on volatility + inventory.
// Adverse selection protection (cancel on toxicity spike).
//
// No heap allocations in hot path.
#pragma once

#include "../data/aligned_types.h"
#include "../utils/low_latency.h"
#include "../strategies/pressure_model.h"
#include <cmath>
#include <cstdint>
#include <algorithm>

namespace hft {

class MarketMakingV2 {
public:
    struct Config {
        double gamma = 0.1;            // Risk aversion parameter
        double T_seconds = 60.0;       // Time horizon for reservation price
        double sigma = 0.01;           // Volatility (initial estimate)
        int sigma_window = 100;        // Window for volatility estimation
        double k = 1.5;                // Order arrival intensity parameter
        double spread_cap = 0.005;     // Maximum spread (0.5%)
        double spread_floor = 0.0001;  // Minimum spread (0.01%)
        double max_inventory = 10.0;   // Max absolute inventory
        double inventory_penalty = 0.0001; // Per-unit inventory penalty
        double toxicity_threshold = 0.7; // Cancel when toxicity > threshold
        int vol_ewma_period = 50;      // EWMA period for volatility
    };

    struct Quote {
        double bid_price{0.0};
        double ask_price{0.0};
        double bid_size{0.0};
        double ask_size{0.0};
        double reservation_price{0.0};
        double spread{0.0};
        bool should_cancel{false};     // Adverse selection trigger
        double confidence{0.0};
    };

    explicit MarketMakingV2(const Config& cfg = Config{})
        : config_(cfg) {}

    // Process market data and generate quotes.
    // q = current inventory (positive = long, negative = short)
    // mid = current mid price
    // toxicity = pressure model toxicity score (0-1)
    Quote generate_quotes(double mid, double q, double toxicity,
                          uint64_t timestamp_ns) noexcept {
        Quote quote;

        // Update volatility estimate
        update_volatility(mid);

        double sigma = current_sigma_;
        double T = config_.T_seconds;

        // Time remaining (simplified: always use full T)
        double t_remaining = T;

        // Reservation price: r = s - q * gamma * sigma^2 * (T - t)
        double reservation = mid - q * config_.gamma * sigma * sigma * t_remaining;

        // Optimal spread: delta = gamma * sigma^2 * T + (2/gamma) * ln(1 + gamma/k)
        double optimal_spread = config_.gamma * sigma * sigma * T
                              + (2.0 / config_.gamma) * std::log(1.0 + config_.gamma / config_.k);

        // Add inventory penalty
        double inventory_skew = config_.inventory_penalty * q;

        // Clamp spread
        optimal_spread = std::max(config_.spread_floor, std::min(config_.spread_cap, optimal_spread));

        // Compute bid/ask around reservation price
        double half_spread = optimal_spread / 2.0;
        quote.bid_price = reservation - half_spread - inventory_skew;
        quote.ask_price = reservation + half_spread - inventory_skew;
        quote.reservation_price = reservation;
        quote.spread = optimal_spread;
        last_reservation_ = reservation;

        // Size: skew based on inventory
        double inventory_ratio = (config_.max_inventory > 0.0)
            ? std::abs(q) / config_.max_inventory : 0.0;
        inventory_ratio = std::min(1.0, inventory_ratio);

        // Reduce size on the side that would increase inventory
        if (q > 0) {
            // Long inventory: reduce bid size, increase ask size
            quote.bid_size = 1.0 - inventory_ratio * 0.7;
            quote.ask_size = 1.0 + inventory_ratio * 0.3;
        } else if (q < 0) {
            // Short inventory: reduce ask size, increase bid size
            quote.bid_size = 1.0 + inventory_ratio * 0.3;
            quote.ask_size = 1.0 - inventory_ratio * 0.7;
        } else {
            quote.bid_size = 1.0;
            quote.ask_size = 1.0;
        }

        // Adverse selection protection
        if (toxicity >= config_.toxicity_threshold) {
            quote.should_cancel = true;
            quote.confidence = 0.0;
        } else {
            // Confidence inversely proportional to toxicity
            quote.confidence = (1.0 - toxicity) * 100.0;
        }

        // Don't quote if inventory at max
        if (std::abs(q) >= config_.max_inventory) {
            if (q > 0) {
                quote.bid_price = 0.0;  // Don't bid (would increase long inventory)
                quote.bid_size = 0.0;
            } else {
                quote.ask_price = 0.0;  // Don't ask (would increase short inventory)
                quote.ask_size = 0.0;
            }
        }

        return quote;
    }

    double current_sigma() const noexcept { return current_sigma_; }
    double reservation_price() const noexcept { return last_reservation_; }

    void reset() noexcept {
        current_sigma_ = config_.sigma;
        vol_ewma_ = config_.sigma * config_.sigma;
        last_mid_ = 0.0;
        last_reservation_ = 0.0;
        vol_count_ = 0;
    }

private:
    void update_volatility(double mid) noexcept {
        if (last_mid_ > 0.0 && mid > 0.0) {
            double ret = (mid - last_mid_) / last_mid_;
            double sq_ret = ret * ret;

            // EWMA volatility
            if (vol_count_ == 0) {
                vol_ewma_ = sq_ret;
            } else {
                double alpha = 2.0 / static_cast<double>(config_.vol_ewma_period + 1);
                vol_ewma_ = alpha * sq_ret + (1.0 - alpha) * vol_ewma_;
            }

            current_sigma_ = std::sqrt(vol_ewma_);
            ++vol_count_;
        }
        last_mid_ = mid;
    }

    Config config_;
    double current_sigma_{0.01};
    double vol_ewma_{0.0001};
    double last_mid_{0.0};
    uint64_t vol_count_{0};
    double last_reservation_{0.0};
};

} // namespace hft
