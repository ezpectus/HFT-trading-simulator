// ═══════════════════════════════════════════════════════════════════════════════
// HFT Signal Engine V2 — 6-indicator weighted composite, sub-100μs, no heap alloc
//
// Indicators:
//   1. EMA(21/50) crossover with 9-period signal line (MACD-style)
//   2. RSI(14) with overbought(70)/oversold(30) zones
//   3. Order Book Imbalance — multi-level (5/10/20), proximity-weighted
//   4. VWAP deviation — standard deviation bands (±2σ)
//   5. ADX(14) — trend strength filter (gates directional confidence)
//   6. Pressure Model — body direction + trade flow imbalance + toxicity penalty
//
// Composite score → BUY/SELL/HOLD + confidence(0-100) + dynamic SL/TP(ATR) + leverage
//
// Design constraints:
//   - No heap allocations in analyze() — all stack-allocated (max 256 candles)
//   - Branchless where possible (ternary, fmax/fmin instead of if/else)
//   - Cache-line aligned output (FastSignal is alignas(64))
//   - Cooldown between signals (configurable, default 5000ms)
//   - C++20, gcc-13/MSVC compatible
// ═══════════════════════════════════════════════════════════════════════════════
#pragma once

#include "../data/aligned_types.h"
#include "../data/types.h"
#include <cmath>
#include <cstdint>
#include <cstring>
#include <chrono>
#include <unordered_map>
#include <string>
#include <string_view>

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
    // constexpr-friendly: k_ computed at construction time
    static constexpr double compute_k(int period) noexcept {
        return 2.0 / (static_cast<double>(period) + 1.0);
    }

    explicit InlineEMA(int period) : period_(period), k_(compute_k(period)) {}

    void init(double seed) noexcept { ema_ = seed; initialized_ = true; }

    inline double update(double value) noexcept {
        if (!initialized_) [[unlikely]] {
            ema_ = value;
            initialized_ = true;
        } else {
            ema_ = value * k_ + ema_ * (1.0 - k_);
        }
        return ema_;
    }

    constexpr double value() const noexcept { return ema_; }
    constexpr bool ready() const noexcept { return initialized_; }
    constexpr double k() const noexcept { return k_; }

private:
    int period_;
    double k_;
    double ema_{0.0};
    bool initialized_{false};
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline RSI — O(1) per update via Wilder's smoothing
// ─────────────────────────────────────────────────────────────────────────────
class InlineRSI {
public:
    static constexpr double compute_inv_period(int period) noexcept {
        return 1.0 / static_cast<double>(period);
    }

    explicit InlineRSI(int period) : period_(period), inv_period_(compute_inv_period(period)),
        inv_period_complement_(1.0 - compute_inv_period(period)) {}

    void init(double first_close) noexcept { prev_close_ = first_close; count_ = 1; }

    inline double update(double close) noexcept {
        if (count_ == 0) [[unlikely]] {
            prev_close_ = close;
            count_ = 1;
            return 50.0;
        }

        double change = close - prev_close_;
        // Branchless: gain = max(change, 0), loss = max(-change, 0)
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
            // Wilder's smoothing: avg = avg * (1 - inv) + gain * inv
            avg_gain_ = avg_gain_ * inv_period_complement_ + gain * inv_period_;
            avg_loss_ = avg_loss_ * inv_period_complement_ + loss * inv_period_;
        }

        prev_close_ = close;

        if (count_ < period_) return 50.0;
        // Branchless RSI: if avg_loss == 0 → 100
        double rs = avg_loss_ > 1e-12 ? avg_gain_ / avg_loss_ : 1e12;
        double rsi = 100.0 - 100.0 / (1.0 + rs);
        rsi_ = rsi;
        return rsi;
    }

    constexpr double value() const noexcept { return rsi_; }
    constexpr bool ready() const noexcept { return count_ >= period_; }

private:
    int period_;
    double inv_period_;
    double inv_period_complement_;  // 1.0 - inv_period_, precomputed
    double avg_gain_{0.0};
    double avg_loss_{0.0};
    double prev_close_{0.0};
    double rsi_{50.0};
    int count_{0};
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline ADX — trend strength, 0-100, Wilder's smoothing
// ─────────────────────────────────────────────────────────────────────────────
class InlineADX {
public:
    static constexpr double compute_inv_period(int period) noexcept {
        return 1.0 / static_cast<double>(period);
    }

    explicit InlineADX(int period) : period_(period), inv_period_(compute_inv_period(period)),
        inv_period_complement_(1.0 - compute_inv_period(period)) {}

    inline double update(double high, double low, double close) noexcept {
        if (count_ == 0) [[unlikely]] {
            prev_high_ = high;
            prev_low_ = low;
            prev_close_ = close;
            count_ = 1;
            return 0.0;
        }

        double up_move = high - prev_high_;
        double down_move = prev_low_ - low;

        // Branchless DM: +DM = up_move if (up_move > down_move && up_move > 0) else 0
        double plus_dm = std::fmax(up_move, 0.0) * static_cast<double>(up_move > down_move);
        double minus_dm = std::fmax(down_move, 0.0) * static_cast<double>(down_move > up_move);

        double tr = std::fmax(high - low,
            std::fmax(std::fabs(high - prev_close_), std::fabs(low - prev_close_)));

        if (count_ < period_) [[unlikely]] {
            tr_sum_ += tr;
            plus_dm_sum_ += plus_dm;
            minus_dm_sum_ += minus_dm;
            ++count_;
            if (count_ == period_) {
                double inv_tr = 1.0 / (tr_sum_ + 1e-12);
                double plus_di = plus_dm_sum_ * inv_tr * 100.0;
                double minus_di = minus_dm_sum_ * inv_tr * 100.0;
                double dx = std::fabs(plus_di - minus_di) / (plus_di + minus_di + 1e-10) * 100.0;
                adx_ = dx;
            }
        } else {
            // Wilder's smoothing — use precomputed complement: tr_sum * (1-inv) + tr
            tr_sum_ = tr_sum_ * inv_period_complement_ + tr;
            plus_dm_sum_ = plus_dm_sum_ * inv_period_complement_ + plus_dm;
            minus_dm_sum_ = minus_dm_sum_ * inv_period_complement_ + minus_dm;

            double inv_tr = 1.0 / (tr_sum_ + 1e-12);
            double plus_di = plus_dm_sum_ * inv_tr * 100.0;
            double minus_di = minus_dm_sum_ * inv_tr * 100.0;
            double dx = std::fabs(plus_di - minus_di) / (plus_di + minus_di + 1e-10) * 100.0;
            adx_ = (adx_ * (period_ - 1) + dx) * inv_period_;
        }

        prev_high_ = high;
        prev_low_ = low;
        prev_close_ = close;
        return adx_;
    }

    constexpr double value() const noexcept { return adx_; }
    constexpr bool ready() const noexcept { return count_ >= period_; }

private:
    int period_;
    double inv_period_;
    double inv_period_complement_;  // 1.0 - inv_period_, precomputed
    double tr_sum_{0.0};
    double plus_dm_sum_{0.0};
    double minus_dm_sum_{0.0};
    double adx_{0.0};
    double prev_high_{0.0};
    double prev_low_{0.0};
    double prev_close_{0.0};
    int count_{0};
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline VWAP — running cumulative VWAP with variance tracking
// ─────────────────────────────────────────────────────────────────────────────
class InlineVWAP {
public:
    inline void update(double high, double low, double close, double volume) noexcept {
        double tp = (high + low + close) / 3.0;
        // Welford's weighted: use previous mean for variance, then update
        double prev_mean = cum_v_ > 0 ? cum_pv_ / cum_v_ : tp;
        cum_pv_ += tp * volume;
        cum_v_ += volume;
        double new_mean = cum_pv_ / cum_v_;
        // M2 += vol * (tp - prev_mean) * (tp - new_mean)  (Welford's weighted)
        cum_var_ += volume * (tp - prev_mean) * (tp - new_mean);
    }

    constexpr inline double value() const noexcept {
        return cum_v_ > 0 ? cum_pv_ / cum_v_ : 0.0;
    }

    inline double std_dev() const noexcept {
        return cum_v_ > 0 ? std::sqrt(cum_var_ / cum_v_) : 0.0;
    }

    // Deviation from VWAP in bps — constexpr-compatible arithmetic
    constexpr inline double deviation_bps(double price) const noexcept {
        double v = value();
        return v > 0 ? (price - v) / v * 10000.0 : 0.0;
    }

    // Z-score: (price - VWAP) / std_dev
    inline double z_score(double price) const noexcept {
        double sd = std_dev();
        return sd > 1e-12 ? (price - value()) / sd : 0.0;
    }

    void reset() noexcept { cum_pv_ = 0.0; cum_v_ = 0.0; cum_var_ = 0.0; }

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

    explicit InlineATR(int period) : period_(period), inv_period_(compute_inv_period(period)),
        inv_period_complement_(1.0 - compute_inv_period(period)) {}

    inline double update(double high, double low, double close) noexcept {
        if (count_ == 0) [[unlikely]] {
            prev_close_ = close;
            atr_ = high - low;
            ++count_;
            return atr_;
        }

        double tr = std::fmax(high - low,
            std::fmax(std::fabs(high - prev_close_), std::fabs(low - prev_close_)));

        if (count_ < period_) [[unlikely]] {
            atr_ += tr;
            ++count_;
            if (count_ == period_) atr_ *= inv_period_;
        } else {
            // Wilder's smoothing: ATR = ATR * (1 - inv) + TR * inv
            atr_ = atr_ * inv_period_complement_ + tr * inv_period_;
        }

        prev_close_ = close;
        return atr_;
    }

    constexpr double value() const noexcept { return atr_; }
    constexpr bool ready() const noexcept { return count_ >= period_; }

private:
    int period_;
    double inv_period_;
    double inv_period_complement_;  // 1.0 - inv_period_, precomputed
    double atr_{0.0};
    double prev_close_{0.0};
    int count_{0};
};

// ═══════════════════════════════════════════════════════════════════════════════
// SignalEngineV2 — 6-indicator weighted composite, cooldown, no heap alloc
//
// Output: FastSignal {direction, confidence, entry, sl, tp, leverage, timestamp,
//                       ema_score, rsi_score, obi_score, vwap_score, adx_score,
//                       pressure_score, composite_score}
// ═══════════════════════════════════════════════════════════════════════════════
class SignalEngineV2 {
public:
    struct Params {
        // ── EMA crossover with signal line ──
        int ema_fast_period{21};
        int ema_slow_period{50};
        int ema_signal_period{9};      // EMA of MACD line (signal line)

        // ── RSI ──
        int rsi_period{14};
        double rsi_overbought{70.0};   // RSI > this → bearish (overbought)
        double rsi_oversold{30.0};     // RSI < this → bullish (oversold)

        // ── OBI multi-level ──
        int obi_levels_5{5};
        int obi_levels_10{10};
        int obi_levels_20{20};
        double obi_threshold{0.15};    // |OBI| > this → saturated ±1

        // ── VWAP deviation ──
        double vwap_band_mult{2.0};    // ±N standard deviations
        double vwap_dev_threshold{5.0}; // bps threshold for scoring

        // ── ADX trend filter ──
        int adx_period{14};
        double adx_trend_threshold{25.0};  // ADX > this → trending market
        double adx_strong_threshold{40.0}; // ADX > this → very strong trend

        // ── Pressure model ──
        double pressure_threshold{0.2};
        double toxic_penalty{0.5};     // How much toxicity reduces pressure score
        int body_direction_lookback{5}; // Candles to look back for body direction

        // ── Composite weights (must sum to 1.0) ──
        double w_ema{0.25};
        double w_rsi{0.15};
        double w_obi{0.20};
        double w_vwap{0.10};
        double w_adx{0.10};
        double w_pressure{0.20};

        // ── Signal thresholds ──
        double buy_threshold{0.3};     // composite > 0.3 → LONG
        double sell_threshold{-0.3};   // composite < -0.3 → SHORT
        uint8_t min_confidence{60};

        // ── Cooldown ──
        int64_t cooldown_ms{5000};

        // ── SL/TP (× ATR) ──
        double sl_atr_mult{1.5};
        double tp_atr_mult{3.0};
        int atr_period{14};

        // ── Adaptive SL/TP (volatility regime) ──
        bool adaptive_sl_tp{true};
        double low_vol_atr_pct{0.005};     // ATR < 0.5% of price → low vol regime
        double high_vol_atr_pct{0.02};     // ATR > 2% of price → high vol regime
        double low_vol_sl_mult{1.0};       // tighter SL in low vol
        double low_vol_tp_mult{2.0};       // tighter TP in low vol
        double high_vol_sl_mult{2.5};      // wider SL in high vol
        double high_vol_tp_mult{5.0};      // wider TP in high vol

        // ── Leverage ──
        bool dynamic_leverage{true};
        uint8_t max_leverage{5};
        uint8_t high_confidence_leverage{3};
        uint8_t emergency_confidence_threshold{85};
        double emergency_adx_threshold{30.0};

        // ── Validation ──
        bool validate() const;
        const char* validation_error() const { return validation_error_; }
    private:
        mutable char validation_error_[128]{};
    };

    explicit SignalEngineV2(const Params& params) : params_(params) {}

    const Params& params() const noexcept { return params_; }

    // ── Per-symbol cached indicator state (HFT-O21: incremental update) ──
    struct IndicatorCache {
        InlineEMA ema_fast{21};
        InlineEMA ema_slow{50};
        InlineEMA ema_signal{9};
        InlineRSI rsi{14};
        InlineADX adx{14};
        InlineATR atr{14};
        InlineVWAP vwap;
        double prev_macd{0.0};
        bool initialized{false};
        int64_t last_candle_ts{0};
        int candle_count{0};
    };

    // Get or create cache for a symbol — zero-alloc lookup via transparent hash
    IndicatorCache& get_cache(const char* symbol) {
        auto it = cache_.find(std::string_view(symbol));
        if (it == cache_.end()) {
            it = cache_.emplace(std::string(symbol), IndicatorCache{}).first;
            it->second.ema_fast = InlineEMA(params_.ema_fast_period);
            it->second.ema_slow = InlineEMA(params_.ema_slow_period);
            it->second.ema_signal = InlineEMA(params_.ema_signal_period);
            it->second.rsi = InlineRSI(params_.rsi_period);
            it->second.adx = InlineADX(params_.adx_period);
            it->second.atr = InlineATR(params_.atr_period);
        }
        return it->second;
    }

    // Reset cache for a symbol (e.g. on reconnection)
    void reset_cache(const char* symbol) {
        auto it = cache_.find(std::string_view(symbol));
        if (it != cache_.end()) {
            it->second = IndicatorCache{};
            it->second.ema_fast = InlineEMA(params_.ema_fast_period);
            it->second.ema_slow = InlineEMA(params_.ema_slow_period);
            it->second.ema_signal = InlineEMA(params_.ema_signal_period);
            it->second.rsi = InlineRSI(params_.rsi_period);
            it->second.adx = InlineADX(params_.adx_period);
            it->second.atr = InlineATR(params_.atr_period);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Main analysis — takes full PressureResult. No heap allocations.
    // candles: at least max(ema_slow+signal, adx, atr) + 2 entries
    // ob: order book with at least obi_levels_20 depth
    // pressure: pre-computed PressureResult from PressureModel
    // ═══════════════════════════════════════════════════════════════════════════
    FastSignal analyze(
        const char* symbol,
        const Candle* candles, size_t n,
        const OrderBook& ob,
        const PressureResult& pressure,
        int64_t timestamp_ns
    ) noexcept {
        constexpr size_t MAX_N = 256;
        double closes[MAX_N], highs[MAX_N], lows[MAX_N], volumes[MAX_N];
        size_t count = std::min(n, MAX_N);
        for (size_t i = 0; i < count; ++i) {
            closes[i] = candles[i].close;
            highs[i] = candles[i].high;
            lows[i] = candles[i].low;
            volumes[i] = candles[i].volume;
        }
        return analyze_raw(symbol, closes, count, highs, lows, volumes, count,
                           ob, pressure, timestamp_ns);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Backward-compatible overload — constructs PressureResult from doubles
    // ═══════════════════════════════════════════════════════════════════════════
    FastSignal analyze(
        const char* symbol,
        const Candle* candles, size_t n,
        const OrderBook& ob,
        double obi_weighted,
        double pressure_score,
        int64_t timestamp_ns
    ) noexcept {
        PressureResult pr{};
        pr.obi_weighted = obi_weighted;
        pr.trade_imbalance = pressure_score;
        pr.toxic_score = 0.0;
        return analyze(symbol, candles, n, ob, pr, timestamp_ns);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Raw arrays overload — lowest level, for testing and hot-path callers
    // ═══════════════════════════════════════════════════════════════════════════
    FastSignal analyze_raw(
        const char* symbol,
        const double* closes, size_t n_closes,
        const double* highs, const double* lows, const double* volumes,
        size_t n_candles,
        const OrderBook& ob,
        const PressureResult& pressure,
        int64_t timestamp_ns
    ) noexcept {
        FastSignal sig;
        sig.set_symbol(symbol);
        sig.timestamp = timestamp_ns;
        sig.direction = FastSignal::Direction::NEUTRAL;
        sig.confidence = 0;
        sig.leverage = 1;

        // ── Data sufficiency check ──
        size_t min_candles = static_cast<size_t>(
            std::max(params_.ema_slow_period + params_.ema_signal_period,
                std::max(params_.adx_period, params_.atr_period)) + 2);
        if (n_candles < min_candles || n_closes < min_candles) [[unlikely]] {
            sig.set_reason("Insufficient data");
            return sig;
        }

        // ── Cooldown check ──
        int64_t now_ms = timestamp_ns / 1'000'000;
        if (now_ms - last_signal_ms_ < params_.cooldown_ms) [[unlikely]] {
            sig.set_reason("Cooldown active");
            return sig;
        }

        double current_price = closes[n_closes - 1];

        // ════ 1. EMA Crossover with Signal Line (MACD-style) ════
        // MACD = EMA(fast) - EMA(slow)
        // Signal = EMA(signal_period) of MACD
        // Score: +1 if MACD > Signal (bullish), -1 if MACD < Signal (bearish)
        // Precompute smoothing constants + their complements to avoid subtractions in loop
        double kf = 2.0 / (params_.ema_fast_period + 1);
        double ks = 2.0 / (params_.ema_slow_period + 1);
        double ksig = 2.0 / (params_.ema_signal_period + 1);
        double kf_inv = 1.0 - kf;
        double ks_inv = 1.0 - ks;
        double ksig_inv = 1.0 - ksig;

        double ema_f = closes[0], ema_s = closes[0];
        double macd = 0.0, signal_line = 0.0;
        bool signal_init = false;

        for (size_t i = 1; i < n_closes; ++i) {
            ema_f = closes[i] * kf + ema_f * kf_inv;
            ema_s = closes[i] * ks + ema_s * ks_inv;
            macd = ema_f - ema_s;

            // EMA of MACD line (signal line)
            if (!signal_init) {
                signal_line = macd;
                signal_init = true;
            } else {
                signal_line = macd * ksig + signal_line * ksig_inv;
            }
        }

        // EMA score: based on MACD vs Signal line crossover
        double macd_diff = macd - signal_line;
        double macd_scale = std::fabs(ema_s) > 1e-12 ? std::fabs(ema_s) : 1.0;
        double ema_norm = macd_diff / (macd_scale * 0.001);  // Normalize to ~[-1,1]
        sig.ema_score = std::fmax(-1.0, std::fmin(1.0, ema_norm));

        // ════ 2. RSI with Overbought/Oversold Zones ════
        // RSI > 70 → overbought (bearish, score → -1)
        // RSI < 30 → oversold (bullish, score → +1)
        // 30-70 → neutral, scaled by distance from 50
        double rsi_val = 50.0;
        {
            double avg_gain = 0.0, avg_loss = 0.0;
            double prev_close = closes[0];
            int rsi_p = params_.rsi_period;
            double inv_rsi = 1.0 / rsi_p;

            // Initial accumulation
            for (int i = 1; i <= rsi_p; ++i) {
                double ch = closes[i] - prev_close;
                avg_gain += std::fmax(ch, 0.0);
                avg_loss += std::fmax(-ch, 0.0);
                prev_close = closes[i];
            }
            avg_gain *= inv_rsi;
            avg_loss *= inv_rsi;

            // Wilder's smoothing
            for (size_t i = static_cast<size_t>(rsi_p) + 1; i < n_closes; ++i) {
                double ch = closes[i] - prev_close;
                double g = std::fmax(ch, 0.0);
                double l = std::fmax(-ch, 0.0);
                avg_gain = (avg_gain * (rsi_p - 1) + g) * inv_rsi;
                avg_loss = (avg_loss * (rsi_p - 1) + l) * inv_rsi;
                prev_close = closes[i];
            }

            // Branchless RSI calculation
            double rs = avg_loss > 1e-12 ? avg_gain / avg_loss : 1e12;
            rsi_val = 100.0 - 100.0 / (1.0 + rs);
        }

        // RSI score: oversold → +1, overbought → -1
        // In the neutral zone (30-70): linear scale from 50
        double rsi_mid = (params_.rsi_overbought + params_.rsi_oversold) / 2.0;
        double rsi_range = (params_.rsi_overbought - params_.rsi_oversold) / 2.0;
        sig.rsi_score = (rsi_mid - rsi_val) / rsi_range;  // +1 oversold, -1 overbought
        sig.rsi_score = std::fmax(-1.0, std::fmin(1.0, sig.rsi_score));

        // ════ 3. Multi-Level OBI (5/10/20) with Proximity Weighting ════
        // OBI = (bid_vol - ask_vol) / (bid_vol + ask_vol)
        // Weighted by proximity: w_i = 1/(1+i)
        // Single-pass: compute all 3 OBI levels + weighted in one loop
        auto obi_res = compute_obi_all(ob, params_.obi_levels_5, params_.obi_levels_10, params_.obi_levels_20);
        double obi_5 = obi_res.obi_5;
        double obi_10 = obi_res.obi_10;
        double obi_20 = obi_res.obi_weighted;

        // Blend: more weight to near levels
        double obi_combined = obi_5 * 0.5 + obi_10 * 0.3 + obi_20 * 0.2;
        sig.obi_score = std::fmax(-1.0, std::fmin(1.0,
            std::fabs(obi_combined) > params_.obi_threshold
                ? (obi_combined > 0 ? 1.0 : -1.0)
                : obi_combined / params_.obi_threshold
        ));

        // ════ 4. VWAP Deviation with Standard Deviation Bands ════
        // VWAP = Σ(tp × vol) / Σ(vol), tp = (H+L+C)/3
        // σ = sqrt(Σ((tp - VWAP)² × vol) / Σ(vol))
        // Score: price > VWAP + N×σ → overbought (-1), price < VWAP - N×σ → oversold (+1)
        // Two-pass: first computes VWAP, second computes variance (needs VWAP from first pass).
        // Cache tp values in first pass to avoid recomputing in second pass.
        alignas(32) double tp_cache[100];
        double vwap = 0.0, cum_pv = 0.0, cum_v = 0.0, cum_var = 0.0;
        for (size_t i = 0; i < n_candles; ++i) {
            double tp = (highs[i] + lows[i] + closes[i]) * 0.3333333333333333;
            tp_cache[i] = tp;
            cum_pv += tp * volumes[i];
            cum_v += volumes[i];
        }
        vwap = cum_v > 0 ? cum_pv / cum_v : current_price;

        // Variance — reuse cached tp values from first pass
        for (size_t i = 0; i < n_candles; ++i) {
            double diff = tp_cache[i] - vwap;
            cum_var += volumes[i] * diff * diff;
        }
        double vwap_std = cum_v > 0 ? std::sqrt(cum_var / cum_v) : 0.0;
        double upper_band = vwap + params_.vwap_band_mult * vwap_std;
        double lower_band = vwap - params_.vwap_band_mult * vwap_std;

        // VWAP score: above upper band → overbought (-1), below lower → oversold (+1)
        double band_width = params_.vwap_band_mult * vwap_std;
        if (band_width > 1e-12) {
            sig.vwap_score = (vwap - current_price) / band_width;
        } else {
            // Fallback: use bps deviation
            double dev_bps = vwap > 0 ? (current_price - vwap) / vwap * 10000.0 : 0.0;
            sig.vwap_score = -dev_bps / params_.vwap_dev_threshold;
        }
        sig.vwap_score = std::fmax(-1.0, std::fmin(1.0, sig.vwap_score));

        // ════ 5. ADX — Trend Strength Filter ════
        // ADX < 25 → ranging (reduce confidence)
        // ADX ≥ 25 → trending (full confidence)
        // ADX ≥ 40 → strong trend (boost)
        double adx_val = 0.0;
        {
            double tr_sum = 0.0, plus_dm_sum = 0.0, minus_dm_sum = 0.0;
            double prev_h = highs[0], prev_l = lows[0], prev_c = closes[0];
            int count = 0;
            int adx_p = params_.adx_period;
            double inv_adx = 1.0 / adx_p;

            for (size_t i = 1; i < n_candles; ++i) {
                double up = highs[i] - prev_h;
                double down = prev_l - lows[i];
                // Branchless DM
                double pdm = std::fmax(up, 0.0) * static_cast<double>(up > down);
                double mdm = std::fmax(down, 0.0) * static_cast<double>(down > up);
                double tr = std::fmax(highs[i] - lows[i],
                    std::fmax(std::fabs(highs[i] - prev_c), std::fabs(lows[i] - prev_c)));

                if (count < adx_p) {
                    tr_sum += tr; plus_dm_sum += pdm; minus_dm_sum += mdm;
                    ++count;
                    if (count == adx_p) {
                        double pdi = (plus_dm_sum / (tr_sum + 1e-12)) * 100.0;
                        double mdi = (minus_dm_sum / (tr_sum + 1e-12)) * 100.0;
                        adx_val = std::fabs(pdi - mdi) / (pdi + mdi + 1e-10) * 100.0;
                    }
                } else {
                    tr_sum = tr_sum - tr_sum * inv_adx + tr;
                    plus_dm_sum = plus_dm_sum - plus_dm_sum * inv_adx + pdm;
                    minus_dm_sum = minus_dm_sum - minus_dm_sum * inv_adx + mdm;
                    double pdi = (plus_dm_sum / (tr_sum + 1e-12)) * 100.0;
                    double mdi = (minus_dm_sum / (tr_sum + 1e-12)) * 100.0;
                    double dx = std::fabs(pdi - mdi) / (pdi + mdi + 1e-10) * 100.0;
                    adx_val = (adx_val * (adx_p - 1) + dx) * inv_adx;
                }
                prev_h = highs[i]; prev_l = lows[i]; prev_c = closes[i];
            }
        }
        sig.adx_score = adx_val;  // Raw 0-100

        // ADX filter factor: 0 when ADX=0, 1 when ADX=threshold, >1 when strong
        double adx_filter = adx_val / params_.adx_trend_threshold;
        adx_filter = std::fmax(0.0, std::fmin(1.5, adx_filter));

        // ════ 6. Pressure Model — Body Direction + Trade Flow + Toxicity ════
        // body_direction = Σ(body × vol) / Σ(|body| × vol), body = close - open
        // Combined with OBI and trade imbalance, penalized by toxicity
        double body_dir = 0.0;
        {
            double buy_p = 0.0, sell_p = 0.0;
            int lookback = std::min(params_.body_direction_lookback,
                                    static_cast<int>(n_candles) - 1);
            for (int i = static_cast<int>(n_candles) - lookback;
                 i < static_cast<int>(n_candles); ++i) {
                if (i < 0) continue;
                // Need open price — approximate from close[i-1] (no open in raw arrays)
                // Use candle body: close - close[i-1] as proxy
                double body = (i > 0) ? closes[i] - closes[i - 1] : 0.0;
                double vol = volumes[i];
                double pos = std::fmax(body, 0.0) * vol;
                double neg = std::fmax(-body, 0.0) * vol;
                buy_p += pos;
                sell_p += neg;
            }
            double total = buy_p + sell_p;
            body_dir = total > 1e-12 ? (buy_p - sell_p) / total : 0.0;
        }

        // Pressure score: weighted blend of OBI, trade flow, body direction
        double raw_pressure =
            pressure.obi_weighted * 0.3 +
            pressure.trade_imbalance * 0.3 +
            body_dir * 0.4;

        // Toxicity penalty: high toxicity reduces pressure signal confidence
        raw_pressure *= (1.0 - pressure.toxic_score * params_.toxic_penalty);

        sig.pressure_score = std::fmax(-1.0, std::fmin(1.0,
            std::fabs(raw_pressure) > params_.pressure_threshold
                ? (raw_pressure > 0 ? 1.0 : -1.0)
                : raw_pressure / params_.pressure_threshold
        ));

        // ════ Composite Weighted Score ════
        // ADX gates directional confidence: in ranging markets, reduce signal strength
        double adx_normalized = (params_.adx_trend_threshold > 0.0)
            ? std::fmin(1.0, adx_val / params_.adx_trend_threshold)
            : 1.0;
        double trend_direction = sig.ema_score;  // EMA as primary direction

        sig.composite_score =
            sig.ema_score * params_.w_ema +
            sig.rsi_score * params_.w_rsi +
            sig.obi_score * params_.w_obi +
            sig.vwap_score * params_.w_vwap +
            trend_direction * adx_normalized * params_.w_adx +
            sig.pressure_score * params_.w_pressure;

        // Apply ADX filter: in ranging market (ADX < threshold), reduce composite
        sig.composite_score *= (0.5 + 0.5 * adx_normalized);

        // ════ ATR for Dynamic SL/TP ════
        double atr = 0.0;
        {
            double tr_sum = 0.0;
            int atr_count = 0;
            size_t start = n_candles - static_cast<size_t>(params_.atr_period);
            for (size_t i = start; i < n_candles; ++i) {
                if (i == 0) continue;
                double tr = std::fmax(highs[i] - lows[i],
                    std::fmax(std::fabs(highs[i] - closes[i - 1]),
                              std::fabs(lows[i] - closes[i - 1])));
                tr_sum += tr;
                ++atr_count;
            }
            // Multiply by inverse instead of dividing — saves one division
            atr = atr_count > 0 ? tr_sum * (1.0 / atr_count) : current_price * 0.01;
        }
        if (atr < 1e-12) atr = current_price * 0.01;

        // ── Adaptive SL/TP: adjust multipliers based on volatility regime ──
        double effective_sl_mult = params_.sl_atr_mult;
        double effective_tp_mult = params_.tp_atr_mult;
        if (params_.adaptive_sl_tp && current_price > 0.0) {
            double atr_pct = atr / current_price;
            if (atr_pct < params_.low_vol_atr_pct) {
                effective_sl_mult = params_.low_vol_sl_mult;
                effective_tp_mult = params_.low_vol_tp_mult;
            } else if (atr_pct > params_.high_vol_atr_pct) {
                effective_sl_mult = params_.high_vol_sl_mult;
                effective_tp_mult = params_.high_vol_tp_mult;
            }
        }

        // ════ Direction + Confidence + Leverage ════
        if (sig.composite_score > params_.buy_threshold) {
            sig.direction = FastSignal::Direction::LONG;
            double t = (sig.composite_score - params_.buy_threshold) /
                       (1.0 - params_.buy_threshold);
            t = std::fmax(0.0, std::fmin(1.0, t));
            sig.confidence = static_cast<uint8_t>(std::fmin(100.0, 60.0 + t * 40.0));
            sig.entry_price = current_price;
            sig.stop_loss = current_price - effective_sl_mult * atr;
            sig.take_profit = current_price + effective_tp_mult * atr;

            // Dynamic leverage
            sig.leverage = compute_leverage(sig.confidence, adx_val);

            // Format reason with actual values (no heap alloc — snprintf to fixed buffer)
            char buf[48];
            std::snprintf(buf, sizeof(buf),
                "L comp=%+.2f E=%+.2f R=%+.2f O=%+.2f V=%+.2f A=%.0f P=%+.2f",
                sig.composite_score, sig.ema_score, sig.rsi_score,
                sig.obi_score, sig.vwap_score, adx_val, sig.pressure_score);
            sig.set_reason(buf);

            last_signal_ms_ = now_ms;
        } else if (sig.composite_score < params_.sell_threshold) {
            sig.direction = FastSignal::Direction::SHORT;
            double t = (-sig.composite_score + params_.sell_threshold) /
                       (1.0 + params_.sell_threshold);
            t = std::fmax(0.0, std::fmin(1.0, t));
            sig.confidence = static_cast<uint8_t>(std::fmin(100.0, 60.0 + t * 40.0));
            sig.entry_price = current_price;
            sig.stop_loss = current_price + effective_sl_mult * atr;
            sig.take_profit = current_price - effective_tp_mult * atr;

            sig.leverage = compute_leverage(sig.confidence, adx_val);

            char buf[48];
            std::snprintf(buf, sizeof(buf),
                "S comp=%+.2f E=%+.2f R=%+.2f O=%+.2f V=%+.2f A=%.0f P=%+.2f",
                sig.composite_score, sig.ema_score, sig.rsi_score,
                sig.obi_score, sig.vwap_score, adx_val, sig.pressure_score);
            sig.set_reason(buf);

            last_signal_ms_ = now_ms;
        } else {
            char buf[48];
            std::snprintf(buf, sizeof(buf),
                "N comp=%+.2f ADX=%.0f", sig.composite_score, adx_val);
            sig.set_reason(buf);
        }

        return sig;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Incremental analysis — uses cached indicator state for O(1) per-tick updates.
    // Falls back to full analyze_raw when cache is cold or stale.
    // Only the last candle is processed; prior candles assumed already ingested.
    // ═══════════════════════════════════════════════════════════════════════════
    FastSignal analyze_incremental(
        const char* symbol,
        const Candle* candles, size_t n,
        const OrderBook& ob,
        const PressureResult& pressure,
        int64_t timestamp_ns
    ) noexcept {
        if (n == 0) {
            FastSignal sig;
            sig.set_symbol(symbol);
            sig.set_reason("No candles");
            return sig;
        }

        IndicatorCache& ic = get_cache(symbol);
        const Candle& latest = candles[n - 1];

        // Cold start or stale cache → seed from full history, then use last candle
        if (!ic.initialized || ic.candle_count < params_.ema_slow_period + params_.ema_signal_period + 2) {
            // Seed indicators from full candle history
            for (size_t i = 0; i < n; ++i) {
                ic.ema_fast.update(candles[i].close);
                ic.ema_slow.update(candles[i].close);
                double macd = ic.ema_fast.value() - ic.ema_slow.value();
                ic.ema_signal.update(macd);
                ic.rsi.update(candles[i].close);
                ic.adx.update(candles[i].high, candles[i].low, candles[i].close);
                ic.atr.update(candles[i].high, candles[i].low, candles[i].close);
                ic.vwap.update(candles[i].high, candles[i].low, candles[i].close, candles[i].volume);
            }
            ic.candle_count = static_cast<int>(n);
            ic.last_candle_ts = latest.timestamp;
            ic.initialized = true;
        } else {
            // Incremental: only update with the latest candle
            // Check if this is a new candle (timestamp changed) or same candle update
            if (latest.timestamp != ic.last_candle_ts) {
                ic.ema_fast.update(latest.close);
                ic.ema_slow.update(latest.close);
                double macd = ic.ema_fast.value() - ic.ema_slow.value();
                ic.ema_signal.update(macd);
                ic.rsi.update(latest.close);
                ic.adx.update(latest.high, latest.low, latest.close);
                ic.atr.update(latest.high, latest.low, latest.close);
                ic.vwap.update(latest.high, latest.low, latest.close, latest.volume);
                ic.candle_count++;
                ic.last_candle_ts = latest.timestamp;
            }
            // If same timestamp, indicators are already current — skip update
        }

        // Cooldown check
        int64_t now_ms = timestamp_ns / 1'000'000;
        if (now_ms - last_signal_ms_ < params_.cooldown_ms) [[unlikely]] {
            FastSignal sig;
            sig.set_symbol(symbol);
            sig.timestamp = timestamp_ns;
            sig.set_reason("Cooldown active");
            return sig;
        }

        double current_price = latest.close;

        // ── 1. EMA / MACD from cache ──
        double macd = ic.ema_fast.value() - ic.ema_slow.value();
        double signal_line = ic.ema_signal.value();
        double macd_diff = macd - signal_line;
        double macd_scale = std::fabs(ic.ema_slow.value()) > 1e-12 ? std::fabs(ic.ema_slow.value()) : 1.0;
        double ema_norm = macd_diff / (macd_scale * 0.001);

        // ── 2. RSI from cache ──
        double rsi_val = ic.rsi.value();

        // ── 3. OBI (always computed fresh from order book) ──
        auto obi_res = compute_obi_all(ob, params_.obi_levels_5, params_.obi_levels_10, params_.obi_levels_20);
        double obi_5 = obi_res.obi_5;
        double obi_10 = obi_res.obi_10;
        double obi_20 = obi_res.obi_weighted;
        double obi_combined = obi_5 * 0.5 + obi_10 * 0.3 + obi_20 * 0.2;

        // ── 4. VWAP from cache ──
        double vwap = ic.vwap.value();
        double vwap_std = ic.vwap.std_dev();

        // ── 5. ADX from cache ──
        double adx_val = ic.adx.value();

        // ── 6. Pressure model (always fresh) ──
        double body_dir = 0.0;
        {
            double buy_p = 0.0, sell_p = 0.0;
            int lookback = std::min(params_.body_direction_lookback, static_cast<int>(n) - 1);
            for (int i = static_cast<int>(n) - lookback; i < static_cast<int>(n); ++i) {
                if (i < 1) continue;
                double body = candles[i].close - candles[i - 1].close;
                double vol = candles[i].volume;
                buy_p += std::fmax(body, 0.0) * vol;
                sell_p += std::fmax(-body, 0.0) * vol;
            }
            double total = buy_p + sell_p;
            body_dir = total > 1e-12 ? (buy_p - sell_p) / total : 0.0;
        }
        double raw_pressure =
            pressure.obi_weighted * 0.3 +
            pressure.trade_imbalance * 0.3 +
            body_dir * 0.4;
        raw_pressure *= (1.0 - pressure.toxic_score * params_.toxic_penalty);

        // ── Build FastSignal from cached values ──
        FastSignal sig;
        sig.set_symbol(symbol);
        sig.timestamp = timestamp_ns;
        sig.direction = FastSignal::Direction::NEUTRAL;
        sig.confidence = 0;
        sig.leverage = 1;

        sig.ema_score = std::fmax(-1.0, std::fmin(1.0, ema_norm));

        double rsi_mid = (params_.rsi_overbought + params_.rsi_oversold) / 2.0;
        double rsi_range = (params_.rsi_overbought - params_.rsi_oversold) / 2.0;
        sig.rsi_score = std::fmax(-1.0, std::fmin(1.0, (rsi_mid - rsi_val) / rsi_range));

        sig.obi_score = std::fmax(-1.0, std::fmin(1.0,
            std::fabs(obi_combined) > params_.obi_threshold
                ? (obi_combined > 0 ? 1.0 : -1.0)
                : obi_combined / params_.obi_threshold
        ));

        double band_width = params_.vwap_band_mult * vwap_std;
        if (band_width > 1e-12) {
            sig.vwap_score = std::fmax(-1.0, std::fmin(1.0, (vwap - current_price) / band_width));
        } else {
            double dev_bps = vwap > 0 ? (current_price - vwap) / vwap * 10000.0 : 0.0;
            sig.vwap_score = std::fmax(-1.0, std::fmin(1.0, -dev_bps / params_.vwap_dev_threshold));
        }

        sig.adx_score = adx_val;

        sig.pressure_score = std::fmax(-1.0, std::fmin(1.0,
            std::fabs(raw_pressure) > params_.pressure_threshold
                ? (raw_pressure > 0 ? 1.0 : -1.0)
                : raw_pressure / params_.pressure_threshold
        ));

        // Composite
        double adx_normalized = std::fmin(1.0, adx_val / params_.adx_trend_threshold);
        double directional_scale = params_.adx_trend_threshold > 0
            ? std::fmin(1.0, adx_val / params_.adx_trend_threshold) : 1.0;

        sig.composite_score =
            sig.ema_score * params_.w_ema +
            sig.rsi_score * params_.w_rsi +
            sig.obi_score * params_.w_obi +
            sig.vwap_score * params_.w_vwap +
            sig.ema_score * adx_normalized * params_.w_adx +
            sig.pressure_score * params_.w_pressure;
        sig.composite_score *= (0.5 + 0.5 * directional_scale);

        // ATR from cache
        double atr = ic.atr.value();
        if (atr < 1e-12) atr = current_price * 0.01;

        // Adaptive SL/TP
        double effective_sl_mult = params_.sl_atr_mult;
        double effective_tp_mult = params_.tp_atr_mult;
        if (params_.adaptive_sl_tp && current_price > 0.0) {
            double atr_pct = atr / current_price;
            if (atr_pct < params_.low_vol_atr_pct) {
                effective_sl_mult = params_.low_vol_sl_mult;
                effective_tp_mult = params_.low_vol_tp_mult;
            } else if (atr_pct > params_.high_vol_atr_pct) {
                effective_sl_mult = params_.high_vol_sl_mult;
                effective_tp_mult = params_.high_vol_tp_mult;
            }
        }

        // Direction + confidence
        if (sig.composite_score > params_.buy_threshold) {
            sig.direction = FastSignal::Direction::LONG;
            double t = (sig.composite_score - params_.buy_threshold) / (1.0 - params_.buy_threshold);
            t = std::fmax(0.0, std::fmin(1.0, t));
            sig.confidence = static_cast<uint8_t>(std::fmin(100.0, 60.0 + t * 40.0));
            sig.entry_price = current_price;
            sig.stop_loss = current_price - effective_sl_mult * atr;
            sig.take_profit = current_price + effective_tp_mult * atr;
            sig.leverage = compute_leverage(sig.confidence, adx_val);
            char buf[48];
            std::snprintf(buf, sizeof(buf),
                "L comp=%+.2f E=%+.2f R=%+.2f O=%+.2f V=%+.2f A=%.0f P=%+.2f",
                sig.composite_score, sig.ema_score, sig.rsi_score,
                sig.obi_score, sig.vwap_score, adx_val, sig.pressure_score);
            sig.set_reason(buf);
            last_signal_ms_ = now_ms;
        } else if (sig.composite_score < params_.sell_threshold) {
            sig.direction = FastSignal::Direction::SHORT;
            double t = (-sig.composite_score + params_.sell_threshold) / (1.0 + params_.sell_threshold);
            t = std::fmax(0.0, std::fmin(1.0, t));
            sig.confidence = static_cast<uint8_t>(std::fmin(100.0, 60.0 + t * 40.0));
            sig.entry_price = current_price;
            sig.stop_loss = current_price + effective_sl_mult * atr;
            sig.take_profit = current_price - effective_tp_mult * atr;
            sig.leverage = compute_leverage(sig.confidence, adx_val);
            char buf[48];
            std::snprintf(buf, sizeof(buf),
                "S comp=%+.2f E=%+.2f R=%+.2f O=%+.2f V=%+.2f A=%.0f P=%+.2f",
                sig.composite_score, sig.ema_score, sig.rsi_score,
                sig.obi_score, sig.vwap_score, adx_val, sig.pressure_score);
            sig.set_reason(buf);
            last_signal_ms_ = now_ms;
        } else {
            char buf[48];
            std::snprintf(buf, sizeof(buf), "N comp=%+.2f ADX=%.0f", sig.composite_score, adx_val);
            sig.set_reason(buf);
        }

        return sig;
    }

    // Reset cooldown (for testing)
    void reset_cooldown() noexcept { last_signal_ms_ = 0; }

private:
    // ── OBI at exactly N levels ──
    static inline double compute_obi_levels(const OrderBook& ob, int levels) noexcept {
        double bid_vol = 0.0, ask_vol = 0.0;
        int n = std::min(levels, static_cast<int>(std::min(ob.bids.size(), ob.asks.size())));
        for (int i = 0; i < n; ++i) {
            bid_vol += ob.bids[i].quantity;
            ask_vol += ob.asks[i].quantity;
        }
        double total = bid_vol + ask_vol;
        return total > 1e-12 ? (bid_vol - ask_vol) / total : 0.0;
    }

    // ── Distance-weighted OBI — closer levels have more weight ──
    static inline double compute_weighted_obi(const OrderBook& ob, int levels) noexcept {
        double bid_w = 0.0, ask_w = 0.0;
        int n = std::min(levels, static_cast<int>(std::min(ob.bids.size(), ob.asks.size())));
        for (int i = 0; i < n; ++i) {
            double w = 1.0 / (1.0 + i);  // Linear decay
            bid_w += ob.bids[i].quantity * w;
            ask_w += ob.asks[i].quantity * w;
        }
        double total = bid_w + ask_w;
        return total > 1e-12 ? (bid_w - ask_w) / total : 0.0;
    }

    // ── Combined OBI: compute obi_5, obi_10, and weighted_obi in a single pass ──
    // Replaces 3 separate calls (35 iterations) with 1 loop (20 iterations)
    struct OBIResult { double obi_5, obi_10, obi_weighted; };
    static inline OBIResult compute_obi_all(const OrderBook& ob, int l5, int l10, int l20) noexcept {
        int n = std::min(l20, static_cast<int>(std::min(ob.bids.size(), ob.asks.size())));
        double bid_vol = 0.0, ask_vol = 0.0;
        double bid_w = 0.0, ask_w = 0.0;
        double obi_5 = 0.0, obi_10 = 0.0, obi_w = 0.0;
        for (int i = 0; i < n; ++i) {
            double bq = ob.bids[i].quantity;
            double aq = ob.asks[i].quantity;
            bid_vol += bq;
            ask_vol += aq;
            double w = 1.0 / (1.0 + i);
            bid_w += bq * w;
            ask_w += aq * w;
            if (i == l5 - 1) {
                double t = bid_vol + ask_vol;
                obi_5 = t > 1e-12 ? (bid_vol - ask_vol) / t : 0.0;
            }
            if (i == l10 - 1) {
                double t = bid_vol + ask_vol;
                obi_10 = t > 1e-12 ? (bid_vol - ask_vol) / t : 0.0;
            }
        }
        double tw = bid_w + ask_w;
        obi_w = tw > 1e-12 ? (bid_w - ask_w) / tw : 0.0;
        // Handle fewer levels than requested
        if (n < l5) {
            double t = bid_vol + ask_vol;
            double v = t > 1e-12 ? (bid_vol - ask_vol) / t : 0.0;
            obi_5 = obi_10 = v;
        } else if (n < l10) {
            double t = bid_vol + ask_vol;
            obi_10 = t > 1e-12 ? (bid_vol - ask_vol) / t : 0.0;
        }
        return {obi_5, obi_10, obi_w};
    }

    // ── Dynamic leverage based on confidence + ADX ──
    inline uint8_t compute_leverage(uint8_t confidence, double adx) const noexcept {
        if (!params_.dynamic_leverage) return 1;
        // Branchless leverage selection
        uint8_t lev = 1;
        if (confidence >= params_.emergency_confidence_threshold &&
            adx > params_.emergency_adx_threshold) {
            lev = params_.max_leverage;
        } else if (confidence >= params_.high_confidence_leverage) {
            // Scale: 75→3, 85→5 (if ADX strong)
            lev = params_.high_confidence_leverage;
            if (adx > params_.adx_trend_threshold) {
                lev = std::min(params_.max_leverage,
                    static_cast<uint8_t>(params_.high_confidence_leverage + 1));
            }
        }
        return lev;
    }

    Params params_;
    int64_t last_signal_ms_{0};
    std::unordered_map<std::string, IndicatorCache, StringHash, std::equal_to<>> cache_;
};

} // namespace hft
