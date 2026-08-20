// ═══════════════════════════════════════════════════════════════════════════════
// SignalEngineV2 — Signal finalization helpers
//
// Extracted from signal_engine_v2.h for file-size compliance.
// Free functions in detail namespace — called by SignalEngineV2::finalize_signal.
// ═══════════════════════════════════════════════════════════════════════════════
#pragma once

#include "../data/aligned_types.h"
#include "signal_engine_v2_params.h"
#include <cmath>
#include <cstdint>
#include <cstdio>

namespace hft::detail {

inline void set_long_signal(FastSignal& sig, double price, double atr,
                            double sl_mult, double tp_mult, double adx_val,
                            const SignalEngineV2Params& p, int64_t now_ms) noexcept {
    sig.direction = FastSignal::Direction::LONG;
    double denom = 1.0 - p.buy_threshold;
    double t = denom > 1e-12 ? (sig.composite_score - p.buy_threshold) / denom : 1.0;
    t = std::fmax(0.0, std::fmin(1.0, t));
    sig.confidence = static_cast<uint8_t>(std::fmin(100.0, 60.0 + t * 40.0));
    sig.entry_price = price;
    sig.stop_loss = price - sl_mult * atr;
    sig.take_profit = price + tp_mult * atr;
    char buf[128];
    std::snprintf(buf, sizeof(buf), "L comp=%+.2f E=%+.2f R=%+.2f O=%+.2f V=%+.2f A=%.0f P=%+.2f",
        sig.composite_score, sig.ema_score, sig.rsi_score, sig.obi_score,
        sig.vwap_score, adx_val, sig.pressure_score);
    sig.set_reason(buf);
}

inline void set_short_signal(FastSignal& sig, double price, double atr,
                             double sl_mult, double tp_mult, double adx_val,
                             const SignalEngineV2Params& p) noexcept {
    sig.direction = FastSignal::Direction::SHORT;
    double denom = 1.0 + p.sell_threshold;
    double t = denom > 1e-12 ? (-sig.composite_score + p.sell_threshold) / denom : 1.0;
    t = std::fmax(0.0, std::fmin(1.0, t));
    sig.confidence = static_cast<uint8_t>(std::fmin(100.0, 60.0 + t * 40.0));
    sig.entry_price = price;
    sig.stop_loss = price + sl_mult * atr;
    sig.take_profit = price - tp_mult * atr;
    char buf[128];
    std::snprintf(buf, sizeof(buf), "S comp=%+.2f E=%+.2f R=%+.2f O=%+.2f V=%+.2f A=%.0f P=%+.2f",
        sig.composite_score, sig.ema_score, sig.rsi_score, sig.obi_score,
        sig.vwap_score, adx_val, sig.pressure_score);
    sig.set_reason(buf);
}

} // namespace hft::detail
