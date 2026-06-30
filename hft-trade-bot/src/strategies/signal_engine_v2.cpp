// SignalEngineV2 — Params validation implementation
#include "signal_engine_v2.h"
#include <cstdio>

namespace hft {

bool SignalEngineV2::Params::validate() const {
    // EMA periods
    if (ema_fast_period <= 0 || ema_slow_period <= 0 || ema_signal_period <= 0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "EMA periods must be positive (got %d/%d/%d)",
            ema_fast_period, ema_slow_period, ema_signal_period);
        return false;
    }
    if (ema_fast_period >= ema_slow_period) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "ema_fast (%d) must be < ema_slow (%d)",
            ema_fast_period, ema_slow_period);
        return false;
    }

    // RSI
    if (rsi_period <= 0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "rsi_period must be positive (got %d)", rsi_period);
        return false;
    }
    if (rsi_oversold >= rsi_overbought) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "rsi_oversold (%.1f) must be < rsi_overbought (%.1f)",
            rsi_oversold, rsi_overbought);
        return false;
    }

    // OBI
    if (obi_levels_5 <= 0 || obi_levels_10 <= 0 || obi_levels_20 <= 0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "OBI levels must be positive");
        return false;
    }
    if (obi_threshold <= 0.0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "obi_threshold must be positive (%.4f)", obi_threshold);
        return false;
    }

    // VWAP
    if (vwap_band_mult <= 0.0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "vwap_band_mult must be positive (%.2f)", vwap_band_mult);
        return false;
    }

    // ADX
    if (adx_period <= 0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "adx_period must be positive (%d)", adx_period);
        return false;
    }
    if (adx_trend_threshold <= 0.0 || adx_trend_threshold > 100.0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "adx_trend_threshold out of range (0,100] (%.1f)", adx_trend_threshold);
        return false;
    }

    // Weights — must sum to ~1.0
    double weight_sum = w_ema + w_rsi + w_obi + w_vwap + w_adx + w_pressure;
    if (std::fabs(weight_sum - 1.0) > 0.01) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "Weights must sum to 1.0 (got %.4f)", weight_sum);
        return false;
    }

    // Thresholds
    if (buy_threshold <= 0.0 || buy_threshold > 1.0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "buy_threshold out of range (0,1] (%.2f)", buy_threshold);
        return false;
    }
    if (sell_threshold >= 0.0 || sell_threshold < -1.0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "sell_threshold out of range [-1,0) (%.2f)", sell_threshold);
        return false;
    }

    // Cooldown
    if (cooldown_ms < 0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "cooldown_ms must be non-negative (%lld)", (long long)cooldown_ms);
        return false;
    }

    // ATR / SL / TP
    if (atr_period <= 0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "atr_period must be positive (%d)", atr_period);
        return false;
    }
    if (sl_atr_mult <= 0.0 || tp_atr_mult <= 0.0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "sl_atr_mult and tp_atr_mult must be positive");
        return false;
    }

    // Leverage
    if (max_leverage < 1) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "max_leverage must be >= 1 (%d)", max_leverage);
        return false;
    }
    if (high_confidence_leverage < 1 || high_confidence_leverage > max_leverage) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "high_confidence_leverage out of range [1, max] (%d)",
            high_confidence_leverage);
        return false;
    }

    // Pressure
    if (pressure_threshold <= 0.0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "pressure_threshold must be positive (%.4f)", pressure_threshold);
        return false;
    }
    if (toxic_penalty < 0.0 || toxic_penalty > 1.0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "toxic_penalty out of range [0,1] (%.2f)", toxic_penalty);
        return false;
    }
    if (body_direction_lookback <= 0) {
        std::snprintf(validation_error_, sizeof(validation_error_),
            "body_direction_lookback must be positive (%d)",
            body_direction_lookback);
        return false;
    }

    validation_error_[0] = '\0';
    return true;
}

} // namespace hft
