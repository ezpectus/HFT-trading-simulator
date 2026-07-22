// Trade tape processor — aggressor detection, volume imbalance, VWAP, large trade detection.
//
// Processes individual trades from WebSocket/SHM feeds. Maintains rolling
// statistics for trade flow analysis. No heap allocations in hot path.
#pragma once

#include "../data/aligned_types.h"
#include "../utils/low_latency.h"
#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// Trade event — raw trade from exchange
// ─────────────────────────────────────────────────────────────────────────────
struct TradeEvent {
    uint64_t timestamp_ns{0};
    double   price{0.0};
    double   quantity{0.0};
    bool     is_buyer_maker{false}; // true = sell aggressor, false = buy aggressor
    uint64_t trade_id{0};
};

// ─────────────────────────────────────────────────────────────────────────────
// Trade handler — rolling statistics + large trade detection
// ─────────────────────────────────────────────────────────────────────────────
class TradeHandler {
  public:
    explicit TradeHandler(size_t rolling_window = 1000)
        : window_size_(std::min(rolling_window, MAX_WINDOW)) {}

    // Process a new trade event
    void on_trade(const TradeEvent& trade) noexcept {
        // Aggressor side detection
        if (trade.is_buyer_maker) {
            // Seller is aggressor (market sell)
            sell_volume_ += trade.quantity;
            ++sell_trades_;
        } else {
            // Buyer is aggressor (market buy)
            buy_volume_ += trade.quantity;
            ++buy_trades_;
        }

        // Update rolling VWAP
        total_volume_ += trade.quantity;
        total_notional_ += trade.price * trade.quantity;
        ++total_trades_;

        // Rolling window — incrementally update running sums for O(1) queries
        size_t w_slot = write_idx_ % window_size_;
        if (write_idx_ >= window_size_) {
            // Subtract old trade before overwriting
            const auto& old = rolling_trades_[w_slot];
            rolling_vol_sum_ -= old.quantity;
            rolling_notional_sum_ -= old.price * old.quantity;
        }
        rolling_vol_sum_ += trade.quantity;
        rolling_notional_sum_ += trade.price * trade.quantity;
        rolling_trades_[w_slot] = trade;
        ++write_idx_;

        // Update rolling volume stats for large trade detection — O(1) incremental
        size_t v_slot = vol_idx_ % window_size_;
        if (vol_idx_ >= window_size_) {
            double old_vol = rolling_volumes_[v_slot];
            rolling_vol_sum_for_stats_ -= old_vol;
            rolling_vol_sq_sum_ -= old_vol * old_vol;
        }
        rolling_vol_sum_for_stats_ += trade.quantity;
        rolling_vol_sq_sum_ += trade.quantity * trade.quantity;
        rolling_volumes_[v_slot] = trade.quantity;
        ++vol_idx_;

        // Large trade detection (> 3σ)
        if (vol_idx_ >= min_samples_) {
            double mean = rolling_mean_volume();
            double sd   = rolling_std_volume(mean);
            if (sd > 0.0 && trade.quantity > mean + 3.0 * sd) {
                ++large_trade_count_;
                last_large_trade_ = trade;
            }
        }

        last_trade_     = trade;
        last_update_ns_ = now_ns();
    }

    // ── Accessors ──

    // Aggressor-side volume imbalance: (buy_vol - sell_vol) / (buy_vol + sell_vol)
    double volume_imbalance() const noexcept {
        double total = buy_volume_ + sell_volume_;
        if (total <= 0.0) return 0.0;
        return (buy_volume_ - sell_volume_) / total;
    }

    // Trade count imbalance: (buy_count - sell_count) / (buy_count + sell_count)
    double trade_count_imbalance() const noexcept {
        double total = static_cast<double>(buy_trades_ + sell_trades_);
        if (total <= 0.0) return 0.0;
        return (static_cast<double>(buy_trades_) - static_cast<double>(sell_trades_)) / total;
    }

    // Session VWAP (volume-weighted average price)
    double session_vwap() const noexcept {
        if (total_volume_ <= 0.0) return 0.0;
        return total_notional_ / total_volume_;
    }

    // Rolling VWAP (last N trades) — O(1) using incremental sums
    double rolling_vwap() const noexcept {
        if (rolling_vol_sum_ <= 0.0) return 0.0;
        return rolling_notional_sum_ / rolling_vol_sum_;
    }

    // Total volume (buy + sell)
    double   total_volume() const noexcept { return total_volume_; }
    double   buy_volume() const noexcept { return buy_volume_; }
    double   sell_volume() const noexcept { return sell_volume_; }
    uint64_t total_trades() const noexcept { return total_trades_; }
    uint64_t buy_trades() const noexcept { return buy_trades_; }
    uint64_t sell_trades() const noexcept { return sell_trades_; }

    // Large trade detection
    uint64_t          large_trade_count() const noexcept { return large_trade_count_; }
    const TradeEvent& last_large_trade() const noexcept { return last_large_trade_; }
    const TradeEvent& last_trade() const noexcept { return last_trade_; }

    // Rolling mean volume — O(1) using incremental sum
    double rolling_mean_volume() const noexcept {
        size_t n = std::min(static_cast<size_t>(vol_idx_), window_size_);
        if (n == 0) return 0.0;
        return rolling_vol_sum_for_stats_ / static_cast<double>(n);
    }

    // Rolling standard deviation of volume — O(1) using incremental sums
    // Uses: Var = (Σx² - n·μ²) / (n-1)
    double rolling_std_volume(double mean) const noexcept {
        size_t n = std::min(static_cast<size_t>(vol_idx_), window_size_);
        if (n < 2) return 0.0;
        double variance = (rolling_vol_sq_sum_ - static_cast<double>(n) * mean * mean) /
                          static_cast<double>(n - 1);
        if (variance <= 0.0) return 0.0;
        return std::sqrt(variance);
    }

    // Reset session stats
    void reset_session() noexcept {
        buy_volume_                = 0.0;
        sell_volume_               = 0.0;
        buy_trades_                = 0;
        sell_trades_               = 0;
        total_volume_              = 0.0;
        total_notional_            = 0.0;
        total_trades_              = 0;
        write_idx_                 = 0;
        vol_idx_                   = 0;
        large_trade_count_         = 0;
        rolling_vol_sum_           = 0.0;
        rolling_notional_sum_      = 0.0;
        rolling_vol_sum_for_stats_ = 0.0;
        rolling_vol_sq_sum_        = 0.0;
    }

    uint64_t last_update_ns() const noexcept { return last_update_ns_; }

  private:
    static uint64_t now_ns() noexcept {
        auto tp = std::chrono::steady_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(tp.time_since_epoch()).count();
    }

    size_t                  window_size_;
    static constexpr size_t MAX_WINDOW = 4096;

    // Session stats
    double   buy_volume_{0.0};
    double   sell_volume_{0.0};
    double   total_volume_{0.0};
    double   total_notional_{0.0};
    uint64_t buy_trades_{0};
    uint64_t sell_trades_{0};
    uint64_t total_trades_{0};

    // Rolling window
    std::array<TradeEvent, MAX_WINDOW> rolling_trades_{};
    std::array<double, MAX_WINDOW>     rolling_volumes_{};
    uint64_t                           write_idx_{0};
    uint64_t                           vol_idx_{0};

    // Incremental running sums for O(1) rolling stats
    double rolling_vol_sum_{0.0};
    double rolling_notional_sum_{0.0};
    double rolling_vol_sum_for_stats_{0.0};
    double rolling_vol_sq_sum_{0.0};

    // Large trade detection
    static constexpr size_t min_samples_ = 30;
    uint64_t                large_trade_count_{0};
    TradeEvent              last_large_trade_{};
    TradeEvent              last_trade_{};

    uint64_t last_update_ns_{0};
};

} // namespace hft
