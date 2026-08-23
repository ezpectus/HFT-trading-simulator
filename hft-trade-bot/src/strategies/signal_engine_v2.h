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
#include "inline_indicators.h"
#include "obi_utils.h"
#include "signal_engine_v2_finalize.h"
#include "signal_engine_v2_params.h"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <string>
#include <string_view>
#include <unordered_map>

namespace hft {

class SignalEngineV2 {
  public:
    using Params = SignalEngineV2Params;

    explicit SignalEngineV2(const Params& params) : params_(params) {}

    const Params& params() const noexcept { return params_; }

    struct IndicatorCache {
        InlineEMA  ema_fast{21};
        InlineEMA  ema_slow{50};
        InlineEMA  ema_signal{9};
        InlineRSI  rsi{14};
        InlineADX  adx{14};
        InlineATR  atr{14};
        InlineVWAP vwap;
        double     prev_macd{0.0};
        bool       initialized{false};
        int64_t    last_candle_ts{0};
        int        candle_count{0};
        int64_t    last_signal_ms{0};
    };

    void prepopulate(const std::vector<std::string>& symbols) {
        for (const auto& sym : symbols) {
            auto [it, inserted] = cache_.try_emplace(sym, IndicatorCache{});
            if (inserted) {
                it->second.ema_fast   = InlineEMA(params_.ema_fast_period);
                it->second.ema_slow   = InlineEMA(params_.ema_slow_period);
                it->second.ema_signal = InlineEMA(params_.ema_signal_period);
                it->second.rsi        = InlineRSI(params_.rsi_period);
                it->second.adx        = InlineADX(params_.adx_period);
                it->second.atr        = InlineATR(params_.atr_period);
            }
        }
    }

    IndicatorCache& get_cache(const char* symbol) {
        auto it = cache_.find(std::string_view(symbol));
        if (it == cache_.end()) {
            it                    = cache_.emplace(std::string(symbol), IndicatorCache{}).first;
            it->second.ema_fast   = InlineEMA(params_.ema_fast_period);
            it->second.ema_slow   = InlineEMA(params_.ema_slow_period);
            it->second.ema_signal = InlineEMA(params_.ema_signal_period);
            it->second.rsi        = InlineRSI(params_.rsi_period);
            it->second.adx        = InlineADX(params_.adx_period);
            it->second.atr        = InlineATR(params_.atr_period);
        }
        return it->second;
    }

    void reset_cache(const char* symbol) {
        auto it = cache_.find(std::string_view(symbol));
        if (it != cache_.end()) {
            it->second            = IndicatorCache{};
            it->second.ema_fast   = InlineEMA(params_.ema_fast_period);
            it->second.ema_slow   = InlineEMA(params_.ema_slow_period);
            it->second.ema_signal = InlineEMA(params_.ema_signal_period);
            it->second.rsi        = InlineRSI(params_.rsi_period);
            it->second.adx        = InlineADX(params_.adx_period);
            it->second.atr        = InlineATR(params_.atr_period);
        }
    }

    FastSignal analyze(const char* symbol, const Candle* candles, size_t n, const OrderBook& ob,
                       const PressureResult& pressure, int64_t timestamp_ns) noexcept {
        constexpr size_t MAX_N = 256;
        double           closes[MAX_N], highs[MAX_N], lows[MAX_N], volumes[MAX_N];
        size_t           count = std::min(n, MAX_N);
        for (size_t i = 0; i < count; ++i) {
            closes[i]  = candles[i].close;
            highs[i]   = candles[i].high;
            lows[i]    = candles[i].low;
            volumes[i] = candles[i].volume;
        }
        return analyze_raw(symbol, closes, count, highs, lows, volumes, count, ob, pressure,
                           timestamp_ns);
    }

    FastSignal analyze(const char* symbol, const Candle* candles, size_t n, const OrderBook& ob,
                       double obi_weighted, double pressure_score, int64_t timestamp_ns) noexcept {
        PressureResult pr{};
        pr.obi_weighted    = obi_weighted;
        pr.trade_imbalance = pressure_score;
        pr.toxic_score     = 0.0;
        return analyze(symbol, candles, n, ob, pr, timestamp_ns);
    }

    FastSignal analyze_raw(const char* symbol, const double* closes, size_t n_closes,
                           const double* highs, const double* lows, const double* volumes,
                           size_t n_candles, const OrderBook& ob, const PressureResult& pressure,
                           int64_t timestamp_ns) noexcept {
        FastSignal sig;
        int64_t now_ms;
        if (!init_and_validate(sig, symbol, timestamp_ns, n_candles, n_closes, now_ms))
            return sig;
        double current_price = closes[n_closes - 1];
        double adx_val = 0.0;
        sig.ema_score      = compute_ema_score_raw(closes, n_closes);
        sig.rsi_score      = compute_rsi_score_raw(closes, n_closes);
        sig.obi_score      = compute_obi_score(ob);
        sig.vwap_score     = compute_vwap_score_raw(highs, lows, closes, volumes, n_candles, current_price);
        sig.adx_score      = compute_adx_raw(highs, lows, closes, n_candles, adx_val);
        sig.pressure_score = compute_pressure_raw(closes, volumes, n_candles, pressure);
        sig.composite_score = compute_composite(sig, adx_val);
        double atr = compute_atr_raw(highs, lows, closes, n_candles);
        if (atr < 1e-12) atr = current_price * 0.01;
        double sl_mult = params_.sl_atr_mult, tp_mult = params_.tp_atr_mult;
        apply_adaptive_sl_tp(atr, current_price, sl_mult, tp_mult);
        finalize_signal(sig, current_price, atr, sl_mult, tp_mult, adx_val, now_ms, nullptr);
        return sig;
    }

    FastSignal analyze_incremental(const char* symbol, const Candle* candles, size_t n,
                                   const OrderBook& ob, const PressureResult& pressure,
                                   int64_t timestamp_ns) noexcept {
        if (n == 0) {
            FastSignal sig;
            sig.set_symbol(symbol);
            sig.set_reason("No candles");
            return sig;
        }
        IndicatorCache& ic     = get_cache(symbol);
        const Candle&   latest = candles[n - 1];
        update_indicator_cache(ic, candles, n, latest);
        int64_t now_ms;
        if (!check_cooldown(ic, timestamp_ns, now_ms)) {
            FastSignal sig;
            sig.set_symbol(symbol);
            sig.timestamp = timestamp_ns;
            sig.set_reason("Cooldown active");
            return sig;
        }
        double current_price = latest.close;
        double adx_val = ic.adx.value();
        FastSignal sig;
        sig.set_symbol(symbol);
        sig.timestamp  = timestamp_ns;
        sig.direction  = FastSignal::Direction::NEUTRAL;
        sig.confidence = 0;
        sig.leverage   = 1;
        compute_cached_scores(sig, ic, ob, candles, n, pressure, current_price);
        sig.composite_score = compute_composite(sig, adx_val);
        double atr = ic.atr.value();
        if (atr < 1e-12) atr = current_price * 0.01;
        double sl_mult = params_.sl_atr_mult, tp_mult = params_.tp_atr_mult;
        apply_adaptive_sl_tp(atr, current_price, sl_mult, tp_mult);
        finalize_signal(sig, current_price, atr, sl_mult, tp_mult, adx_val, now_ms, &ic);
        return sig;
    }

    void reset_cooldown(const char* symbol = nullptr) noexcept {
        if (symbol) {
            auto it = cache_.find(std::string_view(symbol));
            if (it != cache_.end()) it->second.last_signal_ms = 0;
        }
    }

  private:
    inline bool init_and_validate(FastSignal& sig, const char* symbol, int64_t timestamp_ns,
                                  size_t n_candles, size_t n_closes, int64_t& now_ms) noexcept {
        sig.set_symbol(symbol);
        sig.timestamp  = timestamp_ns;
        sig.direction  = FastSignal::Direction::NEUTRAL;
        sig.confidence = 0;
        sig.leverage   = 1;
        size_t min_candles = static_cast<size_t>(std::max(params_.ema_slow_period + params_.ema_signal_period,
                         std::max(params_.adx_period, params_.atr_period)) + 2);
        if (n_candles < min_candles || n_closes < min_candles) {
            sig.set_reason("Insufficient data");
            return false;
        }
        now_ms = timestamp_ns / 1'000'000;
        return true;
    }

    inline bool check_cooldown(IndicatorCache& ic, int64_t timestamp_ns, int64_t& now_ms) const noexcept {
        now_ms = timestamp_ns / 1'000'000;
        return now_ms - ic.last_signal_ms >= params_.cooldown_ms;
    }

    inline void update_indicator_cache(IndicatorCache& ic, const Candle* candles, size_t n,
                                       const Candle& latest) noexcept {
        if (!ic.initialized ||
            ic.candle_count < params_.ema_slow_period + params_.ema_signal_period + 2) {
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
            ic.candle_count   = static_cast<int>(n);
            ic.last_candle_ts = latest.timestamp;
            ic.initialized    = true;
        } else if (latest.timestamp != ic.last_candle_ts) {
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
    }

    inline double compute_body_direction(const Candle* candles, size_t n) const noexcept {
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
        return total > 1e-12 ? (buy_p - sell_p) / total : 0.0;
    }

    inline void compute_cached_scores(FastSignal& sig, const IndicatorCache& ic,
                                      const OrderBook& ob, const Candle* candles, size_t n,
                                      const PressureResult& pressure, double current_price) noexcept {
        double macd = ic.ema_fast.value() - ic.ema_slow.value();
        double signal_line = ic.ema_signal.value();
        double macd_diff = macd - signal_line;
        double macd_scale = std::fabs(ic.ema_slow.value()) > 1e-12 ? std::fabs(ic.ema_slow.value()) : 1.0;
        sig.ema_score = std::fmax(-1.0, std::fmin(1.0, macd_diff / (macd_scale * 0.001)));
        double rsi_val = ic.rsi.value();
        double rsi_mid = (params_.rsi_overbought + params_.rsi_oversold) / 2.0;
        double rsi_range = (params_.rsi_overbought - params_.rsi_oversold) / 2.0;
        sig.rsi_score = std::fmax(-1.0, std::fmin(1.0, rsi_range > 1e-12 ? (rsi_mid - rsi_val) / rsi_range : 0.0));
        sig.obi_score = compute_obi_score(ob);
        double vwap = ic.vwap.value();
        double vwap_std = ic.vwap.std_dev();
        double band_width = params_.vwap_band_mult * vwap_std;
        if (band_width > 1e-12) {
            sig.vwap_score = std::fmax(-1.0, std::fmin(1.0, (vwap - current_price) / band_width));
        } else {
            double dev_bps = vwap > 0 ? (current_price - vwap) / vwap * 10000.0 : 0.0;
            sig.vwap_score = std::fmax(-1.0, std::fmin(1.0,
                params_.vwap_dev_threshold > 1e-12 ? -dev_bps / params_.vwap_dev_threshold : 0.0));
        }
        sig.adx_score = ic.adx.value();
        double body_dir = compute_body_direction(candles, n);
        double raw_pressure = pressure.obi_weighted * 0.3 + pressure.trade_imbalance * 0.3 + body_dir * 0.4;
        raw_pressure *= (1.0 - pressure.toxic_score * params_.toxic_penalty);
        sig.pressure_score = std::fmax(-1.0, std::fmin(1.0,
            std::fabs(raw_pressure) > params_.pressure_threshold
                ? (raw_pressure > 0 ? 1.0 : -1.0)
                : (params_.pressure_threshold > 1e-12 ? raw_pressure / params_.pressure_threshold : 0.0)));
    }

    inline double compute_ema_score_raw(const double* closes, size_t n) const noexcept {
        double kf = 2.0 / (params_.ema_fast_period + 1);
        double ks = 2.0 / (params_.ema_slow_period + 1);
        double ksig = 2.0 / (params_.ema_signal_period + 1);
        double kf_inv = 1.0 - kf, ks_inv = 1.0 - ks, ksig_inv = 1.0 - ksig;
        double ema_f = closes[0], ema_s = closes[0];
        double macd = 0.0, signal_line = 0.0;
        bool signal_init = false;
        for (size_t i = 1; i < n; ++i) {
            ema_f = closes[i] * kf + ema_f * kf_inv;
            ema_s = closes[i] * ks + ema_s * ks_inv;
            macd  = ema_f - ema_s;
            if (!signal_init) { signal_line = macd; signal_init = true; }
            else { signal_line = macd * ksig + signal_line * ksig_inv; }
        }
        double macd_diff = macd - signal_line;
        double macd_scale = std::fabs(ema_s) > 1e-12 ? std::fabs(ema_s) : 1.0;
        return std::fmax(-1.0, std::fmin(1.0, macd_diff / (macd_scale * 0.001)));
    }

    inline double compute_rsi_score_raw(const double* closes, size_t n) const noexcept {
        double avg_gain = 0.0, avg_loss = 0.0, prev_close = closes[0];
        int rsi_p = params_.rsi_period;
        double inv_rsi = 1.0 / rsi_p;
        for (int i = 1; i <= rsi_p; ++i) {
            double ch = closes[i] - prev_close;
            avg_gain += std::fmax(ch, 0.0);
            avg_loss += std::fmax(-ch, 0.0);
            prev_close = closes[i];
        }
        avg_gain *= inv_rsi; avg_loss *= inv_rsi;
        for (size_t i = static_cast<size_t>(rsi_p) + 1; i < n; ++i) {
            double ch = closes[i] - prev_close;
            avg_gain = (avg_gain * (rsi_p - 1) + std::fmax(ch, 0.0)) * inv_rsi;
            avg_loss = (avg_loss * (rsi_p - 1) + std::fmax(-ch, 0.0)) * inv_rsi;
            prev_close = closes[i];
        }
        double rs = avg_loss > 1e-12 ? avg_gain / avg_loss : 1e12;
        double rsi_val = 100.0 - 100.0 / (1.0 + rs);
        double rsi_mid = (params_.rsi_overbought + params_.rsi_oversold) / 2.0;
        double rsi_range = (params_.rsi_overbought - params_.rsi_oversold) / 2.0;
        double score = rsi_range > 1e-12 ? (rsi_mid - rsi_val) / rsi_range : 0.0;
        return std::fmax(-1.0, std::fmin(1.0, score));
    }

    inline double compute_obi_score(const OrderBook& ob) const noexcept {
        auto obi_res = compute_obi_all(ob, params_.obi_levels_5, params_.obi_levels_10, params_.obi_levels_20);
        double obi_combined = obi_res.obi_5 * 0.5 + obi_res.obi_10 * 0.3 + obi_res.obi_weighted * 0.2;
        return std::fmax(-1.0, std::fmin(1.0,
            std::fabs(obi_combined) > params_.obi_threshold
                ? (obi_combined > 0 ? 1.0 : -1.0)
                : (params_.obi_threshold > 1e-12 ? obi_combined / params_.obi_threshold : 0.0)));
    }

    inline double compute_vwap_score_raw(const double* highs, const double* lows,
                                         const double* closes, const double* volumes,
                                         size_t n, double current_price) const noexcept {
        alignas(32) double tp_cache[256];
        size_t n_vwap = std::min(n, static_cast<size_t>(256));
        double cum_pv = 0.0, cum_v = 0.0, cum_var = 0.0;
        for (size_t i = 0; i < n_vwap; ++i) {
            double tp = (highs[i] + lows[i] + closes[i]) * 0.3333333333333333;
            tp_cache[i] = tp;
            cum_pv += tp * volumes[i];
            cum_v += volumes[i];
        }
        double vwap = cum_v > 0 ? cum_pv / cum_v : current_price;
        for (size_t i = 0; i < n_vwap; ++i) {
            double diff = tp_cache[i] - vwap;
            cum_var += volumes[i] * diff * diff;
        }
        double vwap_std = cum_v > 0 ? std::sqrt(cum_var / cum_v) : 0.0;
        double band_width = params_.vwap_band_mult * vwap_std;
        double score;
        if (band_width > 1e-12) {
            score = (vwap - current_price) / band_width;
        } else {
            double dev_bps = vwap > 0 ? (current_price - vwap) / vwap * 10000.0 : 0.0;
            score = params_.vwap_dev_threshold > 1e-12 ? -dev_bps / params_.vwap_dev_threshold : 0.0;
        }
        return std::fmax(-1.0, std::fmin(1.0, score));
    }

    inline double compute_adx_raw(const double* highs, const double* lows,
                                  const double* closes, size_t n, double& adx_val) const noexcept {
        adx_val = 0.0;
        double tr_sum = 0.0, plus_dm_sum = 0.0, minus_dm_sum = 0.0;
        double prev_h = highs[0], prev_l = lows[0], prev_c = closes[0];
        int count = 0, adx_p = params_.adx_period;
        double inv_adx = 1.0 / adx_p;
        for (size_t i = 1; i < n; ++i) {
            double up = highs[i] - prev_h, down = prev_l - lows[i];
            double pdm = std::fmax(up, 0.0) * static_cast<double>(up > down);
            double mdm = std::fmax(down, 0.0) * static_cast<double>(down > up);
            double tr = std::fmax(highs[i] - lows[i],
                std::fmax(std::fabs(highs[i] - prev_c), std::fabs(lows[i] - prev_c)));
            if (count < adx_p) {
                tr_sum += tr; plus_dm_sum += pdm; minus_dm_sum += mdm; ++count;
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
        return adx_val;
    }

    inline double compute_pressure_raw(const double* closes, const double* volumes,
                                       size_t n, const PressureResult& pressure) const noexcept {
        double buy_p = 0.0, sell_p = 0.0;
        int lookback = std::min(params_.body_direction_lookback, static_cast<int>(n) - 1);
        for (int i = static_cast<int>(n) - lookback; i < static_cast<int>(n); ++i) {
            if (i < 0) continue;
            double body = (i > 0) ? closes[i] - closes[i - 1] : 0.0;
            buy_p += std::fmax(body, 0.0) * volumes[i];
            sell_p += std::fmax(-body, 0.0) * volumes[i];
        }
        double total = buy_p + sell_p;
        double body_dir = total > 1e-12 ? (buy_p - sell_p) / total : 0.0;
        double raw_pressure = pressure.obi_weighted * 0.3 + pressure.trade_imbalance * 0.3 + body_dir * 0.4;
        raw_pressure *= (1.0 - pressure.toxic_score * params_.toxic_penalty);
        return std::fmax(-1.0, std::fmin(1.0,
            std::fabs(raw_pressure) > params_.pressure_threshold
                ? (raw_pressure > 0 ? 1.0 : -1.0)
                : (params_.pressure_threshold > 1e-12 ? raw_pressure / params_.pressure_threshold : 0.0)));
    }

    inline double compute_composite(const FastSignal& sig, double adx_val) const noexcept {
        double adx_normalized = (params_.adx_trend_threshold > 0.0)
            ? std::fmin(1.0, adx_val / params_.adx_trend_threshold) : 1.0;
        double composite = sig.ema_score * params_.w_ema + sig.rsi_score * params_.w_rsi +
            sig.obi_score * params_.w_obi + sig.vwap_score * params_.w_vwap +
            sig.ema_score * adx_normalized * params_.w_adx + sig.pressure_score * params_.w_pressure;
        return composite * (0.5 + 0.5 * adx_normalized);
    }

    inline double compute_atr_raw(const double* highs, const double* lows,
                                  const double* closes, size_t n) const noexcept {
        double atr = 0.0;
        int atr_p = params_.atr_period, atr_count = 0;
        for (size_t i = 0; i < n; ++i) {
            double tr = (i > 0) ? std::fmax(highs[i] - lows[i],
                std::fmax(std::fabs(highs[i] - closes[i - 1]), std::fabs(lows[i] - closes[i - 1])))
                : highs[i] - lows[i];
            if (atr_count == 0) { atr = tr; }
            else if (atr_count < atr_p) { atr += tr; if (atr_count + 1 == atr_p) atr /= static_cast<double>(atr_p); }
            else { double inv_p = 1.0 / static_cast<double>(atr_p); atr = atr * (1.0 - inv_p) + tr * inv_p; }
            ++atr_count;
        }
        return atr;
    }

    inline void apply_adaptive_sl_tp(double atr, double price, double& sl_mult, double& tp_mult) const noexcept {
        if (!params_.adaptive_sl_tp || price <= 0.0) return;
        double atr_pct = atr / price;
        if (atr_pct < params_.low_vol_atr_pct) {
            sl_mult = params_.low_vol_sl_mult; tp_mult = params_.low_vol_tp_mult;
        } else if (atr_pct > params_.high_vol_atr_pct) {
            sl_mult = params_.high_vol_sl_mult; tp_mult = params_.high_vol_tp_mult;
        }
    }

    inline void finalize_signal(FastSignal& sig, double price, double atr,
                                double sl_mult, double tp_mult, double adx_val, int64_t now_ms,
                                IndicatorCache* ic = nullptr) noexcept {
        if (sig.composite_score > params_.buy_threshold) {
            detail::set_long_signal(sig, price, atr, sl_mult, tp_mult, adx_val, params_, now_ms);
            sig.leverage = compute_leverage(sig.confidence, adx_val);
            if (ic) ic->last_signal_ms = now_ms;
        } else if (sig.composite_score < params_.sell_threshold) {
            detail::set_short_signal(sig, price, atr, sl_mult, tp_mult, adx_val, params_);
            sig.leverage = compute_leverage(sig.confidence, adx_val);
            if (ic) ic->last_signal_ms = now_ms;
        } else {
            char buf[128];
            std::snprintf(buf, sizeof(buf), "N comp=%+.2f ADX=%.0f", sig.composite_score, adx_val);
            sig.set_reason(buf);
        }
    }

    inline uint8_t compute_leverage(uint8_t confidence, double adx) const noexcept {
        if (!params_.dynamic_leverage) return 1;
        uint8_t lev = 1;
        if (confidence >= params_.emergency_confidence_threshold &&
            adx > params_.emergency_adx_threshold) {
            lev = params_.max_leverage;
        } else if (confidence >=
                   (params_.min_confidence + params_.emergency_confidence_threshold) / 2) {
            lev = params_.high_confidence_leverage;
            if (adx > params_.adx_trend_threshold) {
                lev = std::min(params_.max_leverage,
                               static_cast<uint8_t>(params_.high_confidence_leverage + 1));
            }
        }
        return lev;
    }

    Params                                                                       params_;
    std::unordered_map<std::string, IndicatorCache, StringHash, std::equal_to<>> cache_;
};

} // namespace hft
