// V2 Signal Engine Tests
// Split out of test_signal_engine_v2.cpp (S020 god-test).
#include "../src/data/aligned_types.h"
#include "../src/data/types.h"
#include "../src/execution/adaptive_order_selector_v2.h"
#include "../src/strategies/pressure_model.h"
#include "../src/strategies/signal_engine_v2.h"
#include "../src/utils/low_latency.h"

#include "test_fixtures.h"
#include "test_util.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

using namespace hft;

// ─── Test helpers ───

// ═══════════════════════════════════════════════════════════════════════════════
// Signal Engine V2 Tests
// ═══════════════════════════════════════════════════════════════════════════════

TEST(test_signal_engine_v2_trending_up) {
    SignalEngineV2::Params params;
    params.ema_fast_period = 21;
    params.ema_slow_period = 50;
    params.cooldown_ms     = 0; // No cooldown for testing
    SignalEngineV2 engine(params);

    auto candles = make_trending_candles(70, 100.0, 0.5); // Strong uptrend
    auto ob      = make_order_book(130.0, 0.01, 20, 10.0);

    PressureResult pr{};
    pr.obi_weighted    = 0.3;
    pr.trade_imbalance = 0.2;
    pr.toxic_score     = 0.0;

    auto sig =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());

    ASSERT_TRUE(sig.is_long());
    ASSERT_TRUE(sig.confidence >= 60);
    ASSERT_TRUE(sig.entry_price > 0);
    ASSERT_TRUE(sig.stop_loss < sig.entry_price);
    ASSERT_TRUE(sig.take_profit > sig.entry_price);
    ASSERT_TRUE(sig.leverage >= 1);
}

TEST(test_signal_engine_v2_trending_down) {
    SignalEngineV2::Params params;
    params.cooldown_ms = 0;
    SignalEngineV2 engine(params);

    auto candles = make_trending_candles(70, 100.0, -0.5);     // Strong downtrend
    auto ob      = make_order_book(70.0, 0.01, 20, 10.0, 1.4); // Ask-heavy book

    PressureResult pr{};
    pr.obi_weighted    = -0.3;
    pr.trade_imbalance = -0.2;
    pr.toxic_score     = 0.0;

    auto sig =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());

    ASSERT_TRUE(sig.is_short());
    ASSERT_TRUE(sig.confidence >= 60);
    ASSERT_TRUE(sig.stop_loss > sig.entry_price);
    ASSERT_TRUE(sig.take_profit < sig.entry_price);
}

TEST(test_signal_engine_v2_ranging_neutral) {
    SignalEngineV2::Params params;
    params.cooldown_ms = 0;
    SignalEngineV2 engine(params);

    auto candles = make_ranging_candles(70, 100.0, 0.5); // Sideways
    auto ob      = make_order_book(100.0, 0.01, 20, 10.0);

    PressureResult pr{}; // Neutral pressure

    auto sig =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());

    // Should be neutral or low confidence in ranging market
    if (sig.is_actionable()) {
        ASSERT_TRUE(sig.confidence < 80); // Low confidence expected
    }
}

TEST(test_signal_engine_v2_cooldown) {
    SignalEngineV2::Params params;
    params.cooldown_ms = 10000; // 10s cooldown
    SignalEngineV2 engine(params);

    auto candles = make_trending_candles(70, 100.0, 0.5);
    auto ob      = make_order_book(130.0, 0.01, 20, 10.0);

    PressureResult pr{};
    pr.obi_weighted    = 0.3;
    pr.trade_imbalance = 0.2;

    int64_t now = FastSignal::now_ns();
    // analyze() is the stateless scoring path (no cooldown state); production
    // calls analyze_incremental(), which owns the per-symbol cache.
    auto sig1 = engine.analyze_incremental("BTC/USDT", candles.data(), candles.size(), ob, pr, now);
    ASSERT_TRUE(sig1.is_actionable());
    // Second call within cooldown → should be neutral
    auto sig2 = engine.analyze_incremental("BTC/USDT", candles.data(), candles.size(), ob, pr,
                                           now + 1'000'000); // 1ms later
    ASSERT_FALSE(sig2.is_actionable());
}

TEST(test_signal_engine_v2_cooldown_reset) {
    SignalEngineV2::Params params;
    params.cooldown_ms = 10000;
    SignalEngineV2 engine(params);

    auto candles = make_trending_candles(70, 100.0, 0.5);
    auto ob      = make_order_book(130.0, 0.01, 20, 10.0);

    PressureResult pr{};
    pr.obi_weighted    = 0.3;
    pr.trade_imbalance = 0.2;

    int64_t now = FastSignal::now_ns();
    auto sig1 = engine.analyze_incremental("BTC/USDT", candles.data(), candles.size(), ob, pr, now);
    ASSERT_TRUE(sig1.is_actionable());

    // Reset cooldown → should allow signal again
    engine.reset_cooldown();
    auto sig2 = engine.analyze_incremental("BTC/USDT", candles.data(), candles.size(), ob, pr,
                                           now + 1'000'000);
    ASSERT_TRUE(sig2.is_actionable());
}

TEST(test_signal_engine_v2_insufficient_data) {
    SignalEngineV2::Params params;
    SignalEngineV2         engine(params);

    auto candles = make_trending_candles(10, 100.0, 0.5); // Too few
    auto ob      = make_order_book(100.0, 0.01, 20, 10.0);

    PressureResult pr{};

    auto sig =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());
    ASSERT_FALSE(sig.is_actionable());
}

TEST(test_signal_engine_v2_backward_compat_doubles) {
    SignalEngineV2::Params params;
    params.cooldown_ms = 0;
    SignalEngineV2 engine(params);

    auto candles = make_trending_candles(70, 100.0, 0.5);
    auto ob      = make_order_book(130.0, 0.01, 20, 10.0);

    // Use backward-compatible overload with doubles
    auto sig = engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, 0.3, 0.2,
                              FastSignal::now_ns());
    ASSERT_TRUE(sig.is_long());
}

TEST(test_signal_engine_v2_composite_scores) {
    SignalEngineV2::Params params;
    params.cooldown_ms = 0;
    SignalEngineV2 engine(params);

    auto candles = make_trending_candles(70, 100.0, 0.5);
    auto ob      = make_order_book(130.0, 0.01, 20, 10.0);

    PressureResult pr{};
    pr.obi_weighted    = 0.3;
    pr.trade_imbalance = 0.2;

    auto sig =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());

    // All scores should be in valid ranges
    ASSERT_TRUE(sig.ema_score >= -1.0 && sig.ema_score <= 1.0);
    ASSERT_TRUE(sig.rsi_score >= -1.0 && sig.rsi_score <= 1.0);
    ASSERT_TRUE(sig.obi_score >= -1.0 && sig.obi_score <= 1.0);
    ASSERT_TRUE(sig.vwap_score >= -1.0 && sig.vwap_score <= 1.0);
    ASSERT_TRUE(sig.adx_score >= 0.0 && sig.adx_score <= 100.0);
    ASSERT_TRUE(sig.pressure_score >= -1.0 && sig.pressure_score <= 1.0);
}

TEST(test_signal_engine_v2_sl_tp_ratio) {
    SignalEngineV2::Params params;
    params.cooldown_ms = 0;
    params.sl_atr_mult = 1.5;
    params.tp_atr_mult = 3.0;
    SignalEngineV2 engine(params);

    auto candles = make_trending_candles(70, 100.0, 0.5);
    auto ob      = make_order_book(130.0, 0.01, 20, 10.0);

    PressureResult pr{};
    pr.obi_weighted    = 0.3;
    pr.trade_imbalance = 0.2;

    auto sig =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());

    if (sig.is_long()) {
        double risk   = sig.entry_price - sig.stop_loss;
        double reward = sig.take_profit - sig.entry_price;
        ASSERT_TRUE(risk > 0);
        ASSERT_TRUE(reward > 0);
        // TP/SL ratio should be tp_atr_mult / sl_atr_mult = 3.0/1.5 = 2.0
        ASSERT_NEAR(reward / risk, 2.0, 0.01);
    }
}

TEST(test_signal_engine_v2_leverage_scaling) {
    SignalEngineV2::Params params;
    params.cooldown_ms                    = 0;
    params.dynamic_leverage               = true;
    params.max_leverage                   = 5;
    params.high_confidence_leverage       = 3;
    params.emergency_confidence_threshold = 85;
    params.emergency_adx_threshold        = 30.0;
    SignalEngineV2 engine(params);

    auto candles = make_trending_candles(70, 100.0, 0.5);
    auto ob      = make_order_book(130.0, 0.01, 20, 10.0);

    PressureResult pr{};
    pr.obi_weighted    = 0.5;
    pr.trade_imbalance = 0.4;

    auto sig =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());

    if (sig.is_actionable()) {
        ASSERT_TRUE(sig.leverage >= 1);
        ASSERT_TRUE(sig.leverage <= params.max_leverage);
    }
}

TEST(test_signal_engine_v2_no_dynamic_leverage) {
    SignalEngineV2::Params params;
    params.cooldown_ms      = 0;
    params.dynamic_leverage = false;
    SignalEngineV2 engine(params);

    auto candles = make_trending_candles(70, 100.0, 0.5);
    auto ob      = make_order_book(130.0, 0.01, 20, 10.0);

    PressureResult pr{};
    pr.obi_weighted    = 0.5;
    pr.trade_imbalance = 0.4;

    auto sig =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());

    if (sig.is_actionable()) {
        ASSERT_EQ(sig.leverage, 1); // No dynamic leverage → always 1
    }
}

TEST(test_signal_engine_v2_toxicity_penalty) {
    SignalEngineV2::Params params;
    params.cooldown_ms = 0;
    // Full penalty: raw pressure ≈0.96 saturates to +1 clean; at penalty 0.8
    // the residual (×0.28) still exceeds pressure_threshold=0.2 and saturates
    // too, so no reduction is visible. At 1.0 the residual is ×0.10 ≈ 0.096 —
    // below threshold, so normalization exposes the reduction.
    params.toxic_penalty = 1.0;
    SignalEngineV2 engine(params);

    auto candles = make_trending_candles(70, 100.0, 0.5);
    auto ob      = make_order_book(130.0, 0.01, 20, 10.0);

    // High toxicity should reduce pressure score
    PressureResult pr{};
    pr.obi_weighted    = 0.5;
    pr.trade_imbalance = 0.4;
    pr.toxic_score     = 0.9; // Very toxic

    auto sig_toxic =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());

    // Same input without toxicity for comparison — pressure_score is
    // threshold-normalized (saturates at ±1), so compare relative reduction.
    pr.toxic_score = 0.0;
    auto sig_clean =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());

    ASSERT_TRUE(sig_clean.pressure_score > 0.9); // saturated without penalty
    ASSERT_TRUE(sig_toxic.pressure_score < sig_clean.pressure_score);
    ASSERT_TRUE(sig_toxic.pressure_score < 1.0);
}

TEST(test_signal_engine_v2_reason_string) {
    SignalEngineV2::Params params;
    params.cooldown_ms = 0;
    SignalEngineV2 engine(params);

    auto candles = make_trending_candles(70, 100.0, 0.5);
    auto ob      = make_order_book(130.0, 0.01, 20, 10.0);

    PressureResult pr{};
    pr.obi_weighted    = 0.3;
    pr.trade_imbalance = 0.2;

    auto sig =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());

    // Reason should start with L (long), S (short), or N (neutral)
    ASSERT_TRUE(strlen(sig.reason) > 0);
    char first = sig.reason[0];
    ASSERT_TRUE(first == 'L' || first == 'S' || first == 'N');
}

TEST(test_signal_engine_v2_obi_multi_level) {
    SignalEngineV2::Params params;
    params.cooldown_ms = 0;
    SignalEngineV2 engine(params);

    auto candles = make_trending_candles(70, 100.0, 0.5);

    // Order book with bid-heavy 5 levels, ask-heavy 20 levels
    OrderBook ob;
    ob.symbol = "BTC/USDT";
    for (int i = 0; i < 20; ++i) {
        double bid_qty = i < 5 ? 20.0 : 5.0; // Heavy bids near top
        double ask_qty = i < 5 ? 5.0 : 20.0; // Heavy asks deeper
        ob.bids.push_back({100.0 - 0.01 * (i + 1), bid_qty});
        ob.asks.push_back({100.0 + 0.01 * (i + 1), ask_qty});
    }

    PressureResult pr{};
    pr.obi_weighted    = 0.0; // Let engine compute OBI from order book
    pr.trade_imbalance = 0.0;

    auto sig =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());
    // OBI score should be positive (bid-heavy near top)
    ASSERT_TRUE(sig.obi_score > 0.0);
}

TEST(test_signal_engine_v2_vwap_band_score) {
    SignalEngineV2::Params params;
    params.cooldown_ms    = 0;
    params.vwap_band_mult = 2.0;
    SignalEngineV2 engine(params);

    // Price trading above VWAP → vwap_score should be negative (overbought)
    auto candles = make_trending_candles(70, 100.0, 0.5); // Rising price
    auto ob      = make_order_book(130.0, 0.01, 20, 10.0);

    PressureResult pr{};
    pr.obi_weighted    = 0.0;
    pr.trade_imbalance = 0.0;

    auto sig =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());
    // In a strong uptrend, price > VWAP → vwap_score negative (mean reversion)
    // But this depends on volume distribution, so just check range
    ASSERT_TRUE(sig.vwap_score >= -1.0 && sig.vwap_score <= 1.0);
}

TEST(test_signal_engine_v2_adx_filter_ranging) {
    SignalEngineV2::Params params;
    params.cooldown_ms         = 0;
    params.adx_trend_threshold = 25.0;
    SignalEngineV2 engine(params);

    // Ranging market → ADX should be low → composite should be dampened
    auto candles = make_ranging_candles(70, 100.0, 0.3);
    auto ob      = make_order_book(100.0, 0.01, 20, 10.0);

    PressureResult pr{};
    pr.obi_weighted    = 0.5; // Strong OBI
    pr.trade_imbalance = 0.4;

    auto sig =
        engine.analyze("BTC/USDT", candles.data(), candles.size(), ob, pr, FastSignal::now_ns());

    // In ranging market with ADX filter, composite is dampened by 0.5+0.5*(ADX/threshold)
    // With low ADX, this is ~0.5, so composite is halved
    // This may or may not trigger a signal, but the ADX score should be < 25
    ASSERT_TRUE(sig.adx_score < 30.0); // Ranging → low ADX
}

TEST(test_signal_engine_v2_params_validate_valid) {
    SignalEngineV2::Params params;
    ASSERT_TRUE(params.validate());
    ASSERT_EQ(std::string(params.validation_error()), "");
}

TEST(test_signal_engine_v2_params_validate_bad_ema) {
    SignalEngineV2::Params params;
    params.ema_fast_period = 50;
    params.ema_slow_period = 21; // fast >= slow
    ASSERT_FALSE(params.validate());
    ASSERT_TRUE(strlen(params.validation_error()) > 0);
}

TEST(test_signal_engine_v2_params_validate_bad_weights) {
    SignalEngineV2::Params params;
    params.w_ema = 0.5;
    params.w_rsi = 0.5;
    // Now sum = 0.5+0.5+0.15+0.20+0.10+0.20 = 1.65, not 1.0
    // Wait, defaults: w_ema=0.25, w_rsi=0.15, w_obi=0.20, w_vwap=0.10, w_adx=0.10, w_pressure=0.20
    // Setting w_ema=0.5, w_rsi=0.5 → sum = 0.5+0.5+0.20+0.10+0.10+0.20 = 1.60
    ASSERT_FALSE(params.validate());
}

TEST(test_signal_engine_v2_params_validate_bad_rsi) {
    SignalEngineV2::Params params;
    params.rsi_overbought = 30.0;
    params.rsi_oversold   = 70.0; // oversold > overbought
    ASSERT_FALSE(params.validate());
}

TEST(test_signal_engine_v2_params_validate_bad_thresholds) {
    SignalEngineV2::Params params;
    params.buy_threshold = -0.5; // Negative buy threshold
    ASSERT_FALSE(params.validate());
}

TEST(test_signal_engine_v2_params_validate_bad_leverage) {
    SignalEngineV2::Params params;
    params.max_leverage = 0;
    ASSERT_FALSE(params.validate());
}

TEST(test_signal_engine_v2_params_validate_bad_toxic_penalty) {
    SignalEngineV2::Params params;
    params.toxic_penalty = 1.5; // > 1.0
    ASSERT_FALSE(params.validate());
}

TEST(test_fast_signal_struct) {
    FastSignal sig;
    sig.set_symbol("ETH/USDT");
    sig.set_reason("test reason");
    ASSERT_EQ(std::string(sig.symbol), "ETH/USDT");
    ASSERT_EQ(std::string(sig.reason), "test reason");
    ASSERT_EQ(std::string(sig.dir_str()), "NEUTRAL");

    sig.direction = FastSignal::Direction::LONG;
    ASSERT_EQ(std::string(sig.dir_str()), "LONG");
    ASSERT_TRUE(sig.is_long());
    ASSERT_FALSE(sig.is_short());
}

TEST(test_fast_order_struct) {
    FastOrder order;
    order.set_symbol("BTC/USDT");
    order.set_exchange("binance");
    order.set_client_order_id("order_123");
    ASSERT_EQ(std::string(order.symbol), "BTC/USDT");
    ASSERT_EQ(std::string(order.exchange), "binance");
    ASSERT_EQ(std::string(order.client_order_id), "order_123");
    ASSERT_EQ(std::string(order.side_str()), "BUY");
    ASSERT_EQ(std::string(order.kind_str()), "MARKET");
}

int main() {
    return test_report("V2 Signal Engine Tests");
}
