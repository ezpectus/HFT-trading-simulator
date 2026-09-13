// V2 Pressure Model + Adaptive Selector Tests
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
// Pressure Model Tests
// ═══════════════════════════════════════════════════════════════════════════════

TEST(test_pressure_model_obi) {
    PressureModel model;
    auto          ob = make_order_book(100.0, 0.01, 20, 10.0);

    // Bids have more volume than asks (10 vs 7 at each level)
    auto result = model.analyze(ob);

    ASSERT_TRUE(result.obi_5 > 0); // More bid volume → positive OBI
    ASSERT_TRUE(result.obi_10 > 0);
    ASSERT_TRUE(result.obi_20 > 0);
    ASSERT_TRUE(result.obi_weighted > 0);
}

TEST(test_pressure_model_spread_regime) {
    PressureModel model;

    // Tight spread
    auto ob_tight = make_order_book(100.0, 0.001, 20, 10.0); // 0.1bp spread
    auto r1       = model.analyze(ob_tight);
    ASSERT_EQ(r1.spread_regime, PressureResult::SpreadRegime::TIGHT);

    // Normal spread
    auto ob_normal = make_order_book(100.0, 0.02, 20, 10.0); // 2bp spread
    auto r2        = model.analyze(ob_normal);
    ASSERT_EQ(r2.spread_regime, PressureResult::SpreadRegime::NORMAL);

    // Wide spread
    auto ob_wide = make_order_book(100.0, 0.1, 20, 10.0); // 10bp spread
    auto r3      = model.analyze(ob_wide);
    ASSERT_EQ(r3.spread_regime, PressureResult::SpreadRegime::WIDE);
}

TEST(test_pressure_model_microprice) {
    PressureModel model;
    OrderBook     ob;
    ob.symbol = "BTC/USDT";
    ob.bids   = {{99.0, 100.0}}; // Large bid
    ob.asks   = {{101.0, 50.0}}; // Small ask

    auto result = model.analyze(ob);
    // Microprice should be closer to bid (more bid volume)
    // microprice = (99 * 50 + 101 * 100) / 150 = (4950 + 10100) / 150 = 100.33
    // mid = 100.0
    // dev = (100.33 - 100) / 100 * 10000 = 33.3 bps
    ASSERT_TRUE(result.microprice_dev > 0); // Positive → price pressure upward
}

TEST(test_pressure_model_trade_imbalance) {
    PressureModel model;
    auto          ob = make_order_book(100.0, 0.01, 20, 10.0);

    PressureModel::TradeTick trades[] = {
        {true, 5.0}, // Buyer initiated
        {true, 3.0},
        {false, 2.0}, // Seller initiated
        {true, 4.0},
    };

    auto result = model.analyze(ob, trades, 4);
    // Buy vol = 12, sell vol = 2, total = 14
    // imbalance = (12 - 2) / 14 = 0.714
    ASSERT_NEAR(result.trade_imbalance, 0.714, 0.01);
}

TEST(test_pressure_model_toxicity) {
    PressureModel::Params params;
    params.toxic_size_threshold = 3.0; // 3x median = toxic
    PressureModel model(params);

    auto ob = make_order_book(100.0, 0.01, 20, 10.0);

    PressureModel::TradeTick trades[] = {
        {true, 1.0},                             // Normal
        {true, 1.0},  {true, 1.0}, {true, 50.0}, // Toxic (50x median)
        {false, 1.0},
    };

    auto result = model.analyze(ob, trades, 5);
    ASSERT_TRUE(result.toxic_score > 0.3); // Should detect toxicity
}

TEST(test_pressure_model_predicted_impact) {
    PressureModel model;
    auto          ob = make_order_book(100.0, 0.01, 20, 10.0);

    PressureModel::TradeTick trades[] = {
        {true, 10.0},
        {true, 8.0},
        {false, 2.0},
    };

    auto result = model.analyze(ob, trades, 3);
    // predicted_impact = obi*2 + trade_imbalance*1.5 + microprice_dev*0.5
    ASSERT_TRUE(result.predicted_impact > 0); // Net buy pressure → positive impact
}

// ═══════════════════════════════════════════════════════════════════════════════
// Adaptive Order Selector V2 Tests
// ═══════════════════════════════════════════════════════════════════════════════

TEST(test_adaptive_selector_emergency_fok) {
    AdaptiveOrderSelectorV2 selector;
    auto                    result = selector.select(95, true, 100.0, 2.0, 0.0, 0.0, 1.0, 100.0);
    ASSERT_EQ(result.kind, FastOrder::OrderKind::LIMIT_FOK);
}

TEST(test_adaptive_selector_toxic_ioc) {
    AdaptiveOrderSelectorV2 selector;
    auto                    result = selector.select(70, true, 100.0, 2.0, 0.0, 0.6, 1.0, 100.0);
    ASSERT_EQ(result.kind, FastOrder::OrderKind::LIMIT_IOC);
}

TEST(test_adaptive_selector_high_conf_tight_ioc) {
    AdaptiveOrderSelectorV2 selector;
    auto                    result = selector.select(85, true, 100.0, 0.5, 0.0, 0.0, 1.0, 100.0);
    ASSERT_EQ(result.kind, FastOrder::OrderKind::LIMIT_IOC);
}

TEST(test_adaptive_selector_low_conf_wide_postonly) {
    AdaptiveOrderSelectorV2 selector;
    auto                    result = selector.select(55, true, 100.0, 10.0, 0.0, 0.0, 1.0, 100.0);
    ASSERT_EQ(result.kind, FastOrder::OrderKind::POST_ONLY);
}

TEST(test_adaptive_selector_large_order_gtd) {
    AdaptiveOrderSelectorV2::Params params;
    params.large_order_depth_ratio = 0.2;
    AdaptiveOrderSelectorV2 selector(params);
    // Order qty = 50, depth = 100 → 50% > 20% → GTD
    auto result = selector.select(70, true, 100.0, 2.0, 0.0, 0.0, 50.0, 100.0, 1000000);
    ASSERT_EQ(result.kind, FastOrder::OrderKind::LIMIT_GTD);
    ASSERT_TRUE(result.expire_ns > 1000000);
}

int main() {
    return test_report("V2 Pressure Model + Adaptive Selector Tests");
}
