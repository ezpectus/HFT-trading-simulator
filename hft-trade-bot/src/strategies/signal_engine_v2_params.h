// ═══════════════════════════════════════════════════════════════════════════════
// SignalEngineV2 — Parameters struct
//
// Extracted from signal_engine_v2.h for file-size compliance.
// All configuration for the 6-indicator weighted composite signal engine.
// ═══════════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstdint>

namespace hft {

struct SignalEngineV2Params {
    // ── EMA crossover with signal line ──
    int ema_fast_period{21};
    int ema_slow_period{50};
    int ema_signal_period{9};

    // ── RSI ──
    int    rsi_period{14};
    double rsi_overbought{70.0};
    double rsi_oversold{30.0};

    // ── OBI multi-level ──
    int    obi_levels_5{5};
    int    obi_levels_10{10};
    int    obi_levels_20{20};
    double obi_threshold{0.15};

    // ── VWAP deviation ──
    double vwap_band_mult{2.0};
    double vwap_dev_threshold{5.0};

    // ── ADX trend filter ──
    int    adx_period{14};
    double adx_trend_threshold{25.0};
    double adx_strong_threshold{40.0};

    // ── Pressure model ──
    double pressure_threshold{0.2};
    double toxic_penalty{0.5};
    int    body_direction_lookback{5};

    // ── Composite weights (must sum to 1.0) ──
    double w_ema{0.25};
    double w_rsi{0.15};
    double w_obi{0.20};
    double w_vwap{0.10};
    double w_adx{0.10};
    double w_pressure{0.20};

    // ── Signal thresholds ──
    double  buy_threshold{0.3};
    double  sell_threshold{-0.3};
    uint8_t min_confidence{60};

    // ── Cooldown ──
    int64_t cooldown_ms{5000};

    // ── SL/TP (× ATR) ──
    double sl_atr_mult{1.5};
    double tp_atr_mult{3.0};
    int    atr_period{14};

    // ── Adaptive SL/TP (volatility regime) ──
    bool   adaptive_sl_tp{true};
    double low_vol_atr_pct{0.005};
    double high_vol_atr_pct{0.02};
    double low_vol_sl_mult{1.0};
    double low_vol_tp_mult{2.0};
    double high_vol_sl_mult{2.5};
    double high_vol_tp_mult{5.0};

    // ── Leverage ──
    bool    dynamic_leverage{true};
    uint8_t max_leverage{5};
    uint8_t high_confidence_leverage{3};
    uint8_t emergency_confidence_threshold{85};
    double  emergency_adx_threshold{30.0};

    // ── Validation ──
    bool        validate() const;
    const char* validation_error() const { return validation_error_; }

  private:
    mutable char validation_error_[128]{};
};

} // namespace hft
