// Trade tape processor — aggressor detection, volume imbalance, VWAP, large trade detection.
//
// Processes individual trades from WebSocket/SHM feeds. Maintains rolling
// statistics for trade flow analysis. No heap allocations in hot path.
#pragma once

#include "../data/aligned_types.h"
#include "../utils/low_latency.h"
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <chrono>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// Trade event — raw trade from exchange
// ─────────────────────────────────────────────────────────────────────────────
struct TradeEvent {
    uint64_t timestamp_ns{0};
    double price{0.0};
    double quantity{0.0};
    bool is_buyer_maker{false};  // true = sell aggressor, false = buy aggressor
    uint64_t trade_id{0};
};

// ─────────────────────────────────────────────────────────────────────────────
// Trade handler — rolling statistics + large trade detection
// ─────────────────────────────────────────────────────────────────────────────
class TradeHandler {
public:
    explicit TradeHandler(size_t rolling_window = 1000)
        : window_size_(rolling_window) {}

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

        // Rolling window
        rolling_trades_[write_idx_ % window_size_] = trade;
        ++write_idx_;

        // Update rolling volume stats for large trade detection
        rolling_volumes_[vol_idx_ % window_size_] = trade.quantity;
        ++vol_idx_;

        // Large trade detection (> 3σ)
        if (vol_idx_ >= min_samples_) {
            double mean = rolling_mean_volume();
            double sd = rolling_std_volume(mean);
            if (sd > 0.0 && trade.quantity > mean + 3.0 * sd) {
                ++large_trade_count_;
                last_large_trade_ = trade;
            }
        }

        last_trade_ = trade;
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

    // Rolling VWAP (last N trades)
    double rolling_vwap() const noexcept {
        double vol = 0.0;
        double notional = 0.0;
        size_t n = std::min(static_cast<size_t>(write_idx_), window_size_);
        for (size_t i = 0; i < n; ++i) {
            const auto& t = rolling_trades_[(write_idx_ - n + i) % window_size_];
            vol += t.quantity;
            notional += t.price * t.quantity;
        }
        if (vol <= 0.0) return 0.0;
        return notional / vol;
    }

    // Total volume (buy + sell)
    double total_volume() const noexcept { return total_volume_; }
    double buy_volume() const noexcept { return buy_volume_; }
    double sell_volume() const noexcept { return sell_volume_; }
    uint64_t total_trades() const noexcept { return total_trades_; }
    uint64_t buy_trades() const noexcept { return buy_trades_; }
    uint64_t sell_trades() const noexcept { return sell_trades_; }

    // Large trade detection
    uint64_t large_trade_count() const noexcept { return large_trade_count_; }
    const TradeEvent& last_large_trade() const noexcept { return last_large_trade_; }
    const TradeEvent& last_trade() const noexcept { return last_trade_; }

    // Rolling mean volume
    double rolling_mean_volume() const noexcept {
        size_t n = std::min(static_cast<size_t>(vol_idx_), window_size_);
        if (n == 0) return 0.0;
        double sum = 0.0;
        for (size_t i = 0; i < n; ++i) {
            sum += rolling_volumes_[(vol_idx_ - n + i) % window_size_];
        }
        return sum / static_cast<double>(n);
    }

    // Rolling standard deviation of volume
    double rolling_std_volume(double mean) const noexcept {
        size_t n = std::min(static_cast<size_t>(vol_idx_), window_size_);
        if (n < 2) return 0.0;
        double sq_sum = 0.0;
        for (size_t i = 0; i < n; ++i) {
            double diff = rolling_volumes_[(vol_idx_ - n + i) % window_size_] - mean;
            sq_sum += diff * diff;
        }
        return std::sqrt(sq_sum / static_cast<double>(n - 1));
    }

    // Reset session stats
    void reset_session() noexcept {
        buy_volume_ = 0.0;
        sell_volume_ = 0.0;
        buy_trades_ = 0;
        sell_trades_ = 0;
        total_volume_ = 0.0;
        total_notional_ = 0.0;
        total_trades_ = 0;
        write_idx_ = 0;
        vol_idx_ = 0;
        large_trade_count_ = 0;
    }

    uint64_t last_update_ns() const noexcept { return last_update_ns_; }

private:
    static uint64_t now_ns() noexcept {
        auto tp = std::chrono::steady_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(
            tp.time_since_epoch()).count();
    }

    size_t window_size_;
    static constexpr size_t MAX_WINDOW = 4096;

    // Session stats
    double buy_volume_{0.0};
    double sell_volume_{0.0};
    double total_volume_{0.0};
    double total_notional_{0.0};
    uint64_t buy_trades_{0};
    uint64_t sell_trades_{0};
    uint64_t total_trades_{0};

    // Rolling window
    std::array<TradeEvent, MAX_WINDOW> rolling_trades_{};
    std::array<double, MAX_WINDOW> rolling_volumes_{};
    uint64_t write_idx_{0};
    uint64_t vol_idx_{0};

    // Large trade detection
    static constexpr size_t min_samples_ = 30;
    uint64_t large_trade_count_{0};
    TradeEvent last_large_trade_{};
    TradeEvent last_trade_{};

    uint64_t last_update_ns_{0};
};

} // namespace hft
