// Momentum breakout v2 — multi-timeframe momentum with volume confirmation.
//
// EMA stack (9/21/50/200) with slope detection, volume confirmation
// (volume > 1.5× average), ATR-based breakout level, ADX-gated
// (only trade when ADX > 25).
//
// No heap allocations in hot path.
#pragma once

#include "../data/aligned_types.h"
#include "../strategies/signal_engine_v2.h"
#include "../utils/low_latency.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

namespace hft {

class MomentumBreakoutV2 {
  public:
    struct Config {
        int    ema_fast          = 9;
        int    ema_mid           = 21;
        int    ema_slow          = 50;
        int    ema_trend         = 200;
        double volume_multiplier = 1.5;
        int    volume_avg_period = 20;
        int    atr_period        = 14;
        double atr_multiplier    = 1.5;
        double adx_threshold     = 25.0;
        int    adx_period        = 14;
        double min_confidence    = 60.0;
    };

    struct Signal {
        enum class Action : uint8_t { NONE = 0, LONG = 1, SHORT = 2, EXIT = 3 };
        Action action{Action::NONE};
        double confidence{0.0};
        double entry_price{0.0};
        double stop_loss{0.0};
        double take_profit{0.0};
        double atr{0.0};
        double adx{0.0};
        double volume_ratio{0.0};
        bool   ema_aligned{false};
        bool   volume_confirmed{false};
        bool   adx_confirmed{false};
    };

    MomentumBreakoutV2() : MomentumBreakoutV2(Config{}) {}
    explicit MomentumBreakoutV2(const Config& cfg)
        : config_(cfg), ema_fast_(cfg.ema_fast), ema_mid_(cfg.ema_mid), ema_slow_(cfg.ema_slow),
          ema_trend_(cfg.ema_trend), adx_(cfg.adx_period) {
        if (config_.volume_avg_period > static_cast<int>(vol_buffer_.size())) {
            config_.volume_avg_period = static_cast<int>(vol_buffer_.size());
        }
        if (config_.volume_avg_period < 1) {
            config_.volume_avg_period = 1;
        }
        if (config_.atr_period < 1) {
            config_.atr_period = 1;
        }
    }

    Signal on_candle(double open, double high, double low, double close, double volume,
                     uint64_t timestamp_ns) noexcept {
        ema_fast_.update(close);
        ema_mid_.update(close);
        ema_slow_.update(close);
        ema_trend_.update(close);

        update_atr(high, low, close);
        update_volume_avg(volume);
        adx_.update(high, low, close);

        // Track EMA slope (current - previous)
        double fast_slope = ema_fast_.value() - prev_ema_fast_;
        prev_ema_fast_    = ema_fast_.value();

        ++candle_count_;

        if (candle_count_ < static_cast<uint64_t>(config_.ema_trend)) {
            return {};
        }

        Signal sig;
        sig.entry_price  = close;
        sig.atr          = current_atr_;
        sig.adx          = adx_.value();
        sig.volume_ratio = (avg_volume_ > 0.0) ? volume / avg_volume_ : 0.0;

        double ef = ema_fast_.value();
        double em = ema_mid_.value();
        double es = ema_slow_.value();
        double et = ema_trend_.value();

        bool bullish_align = ef > em && em > es && es > et;
        bool bearish_align = ef < em && em < es && es < et;
        sig.ema_aligned    = bullish_align || bearish_align;

        sig.volume_confirmed = sig.volume_ratio >= config_.volume_multiplier;
        sig.adx_confirmed    = adx_.value() >= config_.adx_threshold;

        double breakout_upper = prev_high_ + current_atr_ * config_.atr_multiplier;
        double breakout_lower = prev_low_ - current_atr_ * config_.atr_multiplier;

        if (sig.ema_aligned && sig.volume_confirmed && sig.adx_confirmed) {
            if (bullish_align && close > breakout_upper && fast_slope > 0.0) {
                sig.action      = Signal::Action::LONG;
                sig.stop_loss   = close - current_atr_ * 2.0;
                sig.take_profit = close + current_atr_ * 3.0;
                sig.confidence  = compute_confidence(sig);
            } else if (bearish_align && close < breakout_lower && fast_slope < 0.0) {
                sig.action      = Signal::Action::SHORT;
                sig.stop_loss   = close + current_atr_ * 2.0;
                sig.take_profit = close - current_atr_ * 3.0;
                sig.confidence  = compute_confidence(sig);
            }
        }

        if (sig.action == Signal::Action::NONE &&
            candle_count_ > static_cast<uint64_t>(config_.ema_mid)) {
            if (ema_fast_.value() < ema_mid_.value() && fast_slope < 0.0) {
                sig.action     = Signal::Action::EXIT;
                sig.confidence = 70.0;
            }
        }

        prev_high_ = high;
        prev_low_  = low;

        return sig;
    }

    double ema_fast() const noexcept { return ema_fast_.value(); }
    double ema_mid() const noexcept { return ema_mid_.value(); }
    double ema_slow() const noexcept { return ema_slow_.value(); }
    double ema_trend() const noexcept { return ema_trend_.value(); }
    double atr() const noexcept { return current_atr_; }
    double adx() const noexcept { return adx_.value(); }
    double avg_volume() const noexcept { return avg_volume_; }

  private:
    void update_atr(double high, double low, double close) noexcept {
        double tr = high - low;
        if (prev_close_ > 0.0) {
            tr = std::max(tr, std::abs(high - prev_close_));
            tr = std::max(tr, std::abs(low - prev_close_));
        }
        if (candle_count_ == 0) {
            current_atr_ = tr;
        } else {
            current_atr_ = (current_atr_ * (config_.atr_period - 1) + tr) / config_.atr_period;
        }
        prev_close_ = close;
    }

    void update_volume_avg(double volume) noexcept {
        if (candle_count_ < static_cast<uint64_t>(config_.volume_avg_period)) {
            vol_sum_ += volume;
            avg_volume_ =
                (candle_count_ > 0) ? vol_sum_ / static_cast<double>(candle_count_ + 1) : volume;
        } else {
            vol_sum_ += volume - vol_buffer_[vol_idx_ % config_.volume_avg_period];
            vol_buffer_[vol_idx_ % config_.volume_avg_period] = volume;
            ++vol_idx_;
            avg_volume_ = vol_sum_ / static_cast<double>(config_.volume_avg_period);
        }
    }

    double compute_confidence(const Signal& sig) const noexcept {
        double conf = 40.0;
        if (sig.ema_aligned) conf += 15.0;
        if (sig.volume_confirmed) conf += 15.0;
        if (sig.adx_confirmed) conf += 15.0;
        conf += std::min(15.0, (sig.adx - config_.adx_threshold) * 0.5);
        return std::min(100.0, conf);
    }

    Config    config_;
    InlineEMA ema_fast_;
    InlineEMA ema_mid_;
    InlineEMA ema_slow_;
    InlineEMA ema_trend_;
    InlineADX adx_;

    double current_atr_{0.0};
    double prev_close_{0.0};
    double prev_high_{0.0};
    double prev_low_{0.0};
    double prev_ema_fast_{0.0};

    double                  avg_volume_{0.0};
    double                  vol_sum_{0.0};
    std::array<double, 256> vol_buffer_{};
    uint64_t                vol_idx_{0};

    uint64_t candle_count_{0};
};

} // namespace hft
