// Candle aggregator — tick-to-candle aggregation (time, volume, tick based).
//
// Aggregates raw trades into OHLCV candles at configurable granularity.
// Supports time-based (1s/5s/1m/5m/15m/1h), volume-based, and tick-based bars.
// Real-time output via callback. No heap allocations in hot path.
#pragma once

#include "../data/types.h"
#include "../utils/low_latency.h"
#include <array>
#include <functional>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstring>

namespace hft {

enum class CandleMode : uint8_t {
    TIME = 0,     // Fixed time interval
    VOLUME = 1,   // Fixed volume per bar
    TICK = 2,     // Fixed number of trades per bar
};

// ─────────────────────────────────────────────────────────────────────────────
// Candle aggregator — builds OHLCV candles from tick data
// ─────────────────────────────────────────────────────────────────────────────
class CandleAggregator {
public:
    using CandleCallback = std::function<void(const Candle&)>;

    // Time-based constructor: interval in seconds
    CandleAggregator(const std::string& symbol, const std::string& exchange,
                     int64_t interval_seconds, CandleCallback callback = CandleCallback{})
        : symbol_(symbol)
        , exchange_(exchange)
        , mode_(CandleMode::TIME)
        , interval_ns_(interval_seconds * 1'000'000'000LL)
        , threshold_(static_cast<double>(interval_seconds))
        , callback_(std::move(callback))
    {}

    // Volume-based constructor: fixed volume per bar
    CandleAggregator(const std::string& symbol, const std::string& exchange,
                     double volume_per_bar, CandleCallback callback = {},
                     CandleMode mode = CandleMode::VOLUME)
        : symbol_(symbol)
        , exchange_(exchange)
        , mode_(mode)
        , interval_ns_(0)
        , threshold_(volume_per_bar)
        , callback_(std::move(callback))
    {}

    // Tick-based constructor: fixed tick count per bar
    CandleAggregator(const std::string& symbol, const std::string& exchange,
                     uint64_t ticks_per_bar, CandleCallback callback = {},
                     bool tick_mode = true)
        : symbol_(symbol)
        , exchange_(exchange)
        , mode_(CandleMode::TICK)
        , interval_ns_(0)
        , threshold_(static_cast<double>(ticks_per_bar))
        , callback_(std::move(callback))
    {}

    // Process a new trade tick
    void on_trade(uint64_t timestamp_ns, double price, double quantity) noexcept {
        if (!bar_active_) {
            // First tick — initialize candle
            current_.open = price;
            current_.high = price;
            current_.low = price;
            current_.close = price;
            current_.volume = quantity;
            current_.timestamp = static_cast<int64_t>(timestamp_ns / 1'000'000'000); // seconds
            current_.symbol = symbol_;
            current_.exchange = exchange_;
            bar_start_ns_ = timestamp_ns;
            bar_volume_ = quantity;
            bar_ticks_ = 1;
            bar_active_ = true;
        } else {
            // Update candle
            current_.close = price;
            if (price > current_.high) current_.high = price;
            if (price < current_.low) current_.low = price;
            current_.volume += quantity;
            bar_volume_ += quantity;
            ++bar_ticks_;
        }

        // Check if bar should close
        bool should_close = false;
        switch (mode_) {
            case CandleMode::TIME:
                should_close = (timestamp_ns - bar_start_ns_) >= interval_ns_;
                break;
            case CandleMode::VOLUME:
                should_close = bar_volume_ >= threshold_;
                break;
            case CandleMode::TICK:
                should_close = static_cast<double>(bar_ticks_) >= threshold_;
                break;
        }

        if (should_close) {
            emit_candle();
            // Reset for next bar
            current_ = Candle{};
            current_.symbol = symbol_;
            current_.exchange = exchange_;
            bar_active_ = false;
        }
    }

    // Force-close current candle (e.g., on shutdown)
    void flush() noexcept {
        if (bar_active_) {
            emit_candle();
            current_ = Candle{};
            current_.symbol = symbol_;
            current_.exchange = exchange_;
            bar_active_ = false;
        }
    }

    // Get current incomplete candle
    const Candle& current_candle() const noexcept { return current_; }

    CandleMode mode() const noexcept { return mode_; }
    int64_t interval_ns() const noexcept { return interval_ns_; }
    double threshold() const noexcept { return threshold_; }

    // Total candles emitted
    uint64_t candle_count() const noexcept { return candle_count_; }

private:
    void emit_candle() noexcept {
        ++candle_count_;
        if (callback_) {
            callback_(current_);
        }
    }

    std::string symbol_;
    std::string exchange_;
    CandleMode mode_;
    int64_t interval_ns_;
    double threshold_;
    CandleCallback callback_;

    Candle current_{};
    bool bar_active_{false};
    uint64_t bar_start_ns_{0};
    double bar_volume_{0.0};
    uint64_t bar_ticks_{0};
    uint64_t candle_count_{0};
};

} // namespace hft
