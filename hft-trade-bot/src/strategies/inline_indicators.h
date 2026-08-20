// ═══════════════════════════════════════════════════════════════════════════════
// Inline technical indicators — O(1) per-update, no heap allocations
//
// Classes: InlineEMA, InlineRSI, InlineADX, InlineVWAP, InlineATR
// All use Wilder's smoothing / branchless arithmetic where possible.
// ═══════════════════════════════════════════════════════════════════════════════
#pragma once

#include <cmath>
#include <cstdint>
#include <string>
#include <string_view>
#include <unordered_map>

namespace hft {

// Transparent string hash — enables find(const char*) / find(string_view) without allocating
struct StringHash {
    using is_transparent = void;
    size_t operator()(std::string_view sv) const noexcept {
        return std::hash<std::string_view>{}(sv);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline EMA — O(1) per update, no vector allocation
// ─────────────────────────────────────────────────────────────────────────────
class InlineEMA {
  public:
    static constexpr double compute_k(int period) noexcept {
        return 2.0 / (static_cast<double>(period) + 1.0);
    }

    explicit InlineEMA(int period) : k_(compute_k(period)) {}

    void init(double seed) noexcept {
        ema_         = seed;
        initialized_ = true;
    }

    inline double update(double value) noexcept {
        if (!initialized_) [[unlikely]] {
            ema_         = value;
            initialized_ = true;
        } else {
            ema_ = value * k_ + ema_ * (1.0 - k_);
        }
        return ema_;
    }

    constexpr double value() const noexcept { return ema_; }
    constexpr bool   ready() const noexcept { return initialized_; }
    constexpr double k() const noexcept { return k_; }

  private:
    double k_;
    double ema_{0.0};
    bool   initialized_{false};
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline RSI — O(1) per update via Wilder's smoothing
// ─────────────────────────────────────────────────────────────────────────────
class InlineRSI {
  public:
    static constexpr double compute_inv_period(int period) noexcept {
        return 1.0 / static_cast<double>(period);
    }

    explicit InlineRSI(int period)
        : period_(period), inv_period_(compute_inv_period(period)),
          inv_period_complement_(1.0 - compute_inv_period(period)) {}

    void init(double first_close) noexcept {
        prev_close_ = first_close;
        count_      = 1;
    }

    inline double update(double close) noexcept {
        if (count_ == 0) [[unlikely]] {
            prev_close_ = close;
            count_      = 1;
            return 50.0;
        }

        double change = close - prev_close_;
        double gain = std::fmax(change, 0.0);
        double loss = std::fmax(-change, 0.0);

        if (count_ < period_) [[unlikely]] {
            avg_gain_ += gain;
            avg_loss_ += loss;
            ++count_;
            if (count_ == period_) {
                avg_gain_ *= inv_period_;
                avg_loss_ *= inv_period_;
            }
        } else {
            avg_gain_ = avg_gain_ * inv_period_complement_ + gain * inv_period_;
            avg_loss_ = avg_loss_ * inv_period_complement_ + loss * inv_period_;
        }

        prev_close_ = close;

        if (count_ < period_) return 50.0;
        double rs  = avg_loss_ > 1e-12 ? avg_gain_ / avg_loss_ : 1e12;
        double rsi = 100.0 - 100.0 / (1.0 + rs);
        rsi_       = rsi;
        return rsi;
    }

    constexpr double value() const noexcept { return rsi_; }
    constexpr bool   ready() const noexcept { return count_ >= period_; }

  private:
    int    period_;
    double inv_period_;
    double inv_period_complement_;
    double avg_gain_{0.0};
    double avg_loss_{0.0};
    double prev_close_{0.0};
    double rsi_{50.0};
    int    count_{0};
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline ADX — trend strength, 0-100, Wilder's smoothing
// ─────────────────────────────────────────────────────────────────────────────
class InlineADX {
  public:
    static constexpr double compute_inv_period(int period) noexcept {
        return 1.0 / static_cast<double>(period);
    }

    explicit InlineADX(int period)
        : period_(period), inv_period_(compute_inv_period(period)),
          inv_period_complement_(1.0 - compute_inv_period(period)) {}

    inline double update(double high, double low, double close) noexcept {
        if (count_ == 0) [[unlikely]] {
            prev_high_  = high;
            prev_low_   = low;
            prev_close_ = close;
            count_      = 1;
            return 0.0;
        }

        double up_move   = high - prev_high_;
        double down_move = prev_low_ - low;

        double plus_dm  = std::fmax(up_move, 0.0) * static_cast<double>(up_move > down_move);
        double minus_dm = std::fmax(down_move, 0.0) * static_cast<double>(down_move > up_move);

        double tr = std::fmax(
            high - low, std::fmax(std::fabs(high - prev_close_), std::fabs(low - prev_close_)));

        if (count_ < period_) [[unlikely]] {
            tr_sum_ += tr;
            plus_dm_sum_ += plus_dm;
            minus_dm_sum_ += minus_dm;
            ++count_;
            if (count_ == period_) {
                double inv_tr   = 1.0 / (tr_sum_ + 1e-12);
                double plus_di  = plus_dm_sum_ * inv_tr * 100.0;
                double minus_di = minus_dm_sum_ * inv_tr * 100.0;
                double dx = std::fabs(plus_di - minus_di) / (plus_di + minus_di + 1e-10) * 100.0;
                adx_      = dx;
            }
        } else {
            tr_sum_       = tr_sum_ * inv_period_complement_ + tr;
            plus_dm_sum_  = plus_dm_sum_ * inv_period_complement_ + plus_dm;
            minus_dm_sum_ = minus_dm_sum_ * inv_period_complement_ + minus_dm;

            double inv_tr   = 1.0 / (tr_sum_ + 1e-12);
            double plus_di  = plus_dm_sum_ * inv_tr * 100.0;
            double minus_di = minus_dm_sum_ * inv_tr * 100.0;
            double dx       = std::fabs(plus_di - minus_di) / (plus_di + minus_di + 1e-10) * 100.0;
            adx_            = (adx_ * (period_ - 1) + dx) * inv_period_;
        }

        prev_high_  = high;
        prev_low_   = low;
        prev_close_ = close;
        return adx_;
    }

    constexpr double value() const noexcept { return adx_; }
    constexpr bool   ready() const noexcept { return count_ >= period_; }

  private:
    int    period_;
    double inv_period_;
    double inv_period_complement_;
    double tr_sum_{0.0};
    double plus_dm_sum_{0.0};
    double minus_dm_sum_{0.0};
    double adx_{0.0};
    double prev_high_{0.0};
    double prev_low_{0.0};
    double prev_close_{0.0};
    int    count_{0};
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline VWAP — running cumulative VWAP with variance tracking
// ─────────────────────────────────────────────────────────────────────────────
class InlineVWAP {
  public:
    inline void update(double high, double low, double close, double volume) noexcept {
        double tp = (high + low + close) / 3.0;
        double prev_mean = cum_v_ > 0 ? cum_pv_ / cum_v_ : tp;
        cum_pv_ += tp * volume;
        cum_v_ += volume;
        double new_mean = cum_pv_ / cum_v_;
        cum_var_ += volume * (tp - prev_mean) * (tp - new_mean);
    }

    constexpr inline double value() const noexcept { return cum_v_ > 0 ? cum_pv_ / cum_v_ : 0.0; }

    inline double std_dev() const noexcept {
        return cum_v_ > 0 ? std::sqrt(cum_var_ / cum_v_) : 0.0;
    }

    constexpr inline double deviation_bps(double price) const noexcept {
        double v = value();
        return v > 0 ? (price - v) / v * 10000.0 : 0.0;
    }

    inline double z_score(double price) const noexcept {
        double sd = std_dev();
        return sd > 1e-12 ? (price - value()) / sd : 0.0;
    }

    void reset() noexcept {
        cum_pv_  = 0.0;
        cum_v_   = 0.0;
        cum_var_ = 0.0;
    }

  private:
    double cum_pv_{0.0};
    double cum_v_{0.0};
    double cum_var_{0.0};
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline ATR — Average True Range, Wilder's smoothing
// ─────────────────────────────────────────────────────────────────────────────
class InlineATR {
  public:
    static constexpr double compute_inv_period(int period) noexcept {
        return 1.0 / static_cast<double>(period);
    }

    explicit InlineATR(int period)
        : period_(period), inv_period_(compute_inv_period(period)),
          inv_period_complement_(1.0 - compute_inv_period(period)) {}

    inline double update(double high, double low, double close) noexcept {
        if (count_ == 0) [[unlikely]] {
            prev_close_ = close;
            atr_        = high - low;
            ++count_;
            return atr_;
        }

        double tr = std::fmax(
            high - low, std::fmax(std::fabs(high - prev_close_), std::fabs(low - prev_close_)));

        if (count_ < period_) [[unlikely]] {
            atr_ += tr;
            ++count_;
            if (count_ == period_) atr_ *= inv_period_;
        } else {
            atr_ = atr_ * inv_period_complement_ + tr * inv_period_;
        }

        prev_close_ = close;
        return atr_;
    }

    constexpr double value() const noexcept { return atr_; }
    constexpr bool   ready() const noexcept { return count_ >= period_; }

  private:
    int    period_;
    double inv_period_;
    double inv_period_complement_;
    double atr_{0.0};
    double prev_close_{0.0};
    int    count_{0};
};

} // namespace hft
