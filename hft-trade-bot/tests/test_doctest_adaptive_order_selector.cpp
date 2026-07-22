// Unit tests for AdaptiveOrderSelectorV2 — order type selection logic and exchange mappings
// Tests: emergency FOK, toxic IOC, high-confidence+tight IOC, OBI urgency IOC,
//        large-order GTD, low-confidence PostOnly, default IOC, exchange mappings
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/data/aligned_types.h"
#include "../src/execution/adaptive_order_selector_v2.h"

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// Helper — default selector with standard params
// ═══════════════════════════════════════════════════════════════════════════
static AdaptiveOrderSelectorV2 make_selector() {
    return AdaptiveOrderSelectorV2({});
}

// ═══════════════════════════════════════════════════════════════════════════
// Emergency confidence → FOK
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: emergency confidence selects FOK") {
    auto sel    = make_selector();
    auto result = sel.select(95, true, 50000.0, 0.5, 0.0, 0.0, 1.0, 100.0, 1000000000LL);
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_FOK);
    CHECK(result.limit_price > 50000.0); // Buy: slightly above mid
}

TEST_CASE("AdaptiveOrderSelectorV2: emergency confidence sell side") {
    auto sel    = make_selector();
    auto result = sel.select(99, false, 50000.0, 0.5, 0.0, 0.0, 1.0, 100.0, 1000000000LL);
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_FOK);
    CHECK(result.limit_price < 50000.0); // Sell: slightly below mid
}

// ═══════════════════════════════════════════════════════════════════════════
// Toxic → IOC
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: toxic score selects IOC") {
    auto sel    = make_selector();
    auto result = sel.select(70, true, 50000.0, 2.0, 0.0, 0.6, 1.0, 100.0, 0);
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_IOC);
}

TEST_CASE("AdaptiveOrderSelectorV2: non-toxic does not trigger toxic path") {
    auto sel = make_selector();
    // High confidence + tight spread should trigger IOC via confidence path, not toxic
    auto result = sel.select(85, true, 50000.0, 0.5, 0.0, 0.3, 1.0, 100.0, 0);
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_IOC);
}

// ═══════════════════════════════════════════════════════════════════════════
// High confidence + tight spread → IOC
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: high confidence + tight spread selects IOC") {
    auto sel    = make_selector();
    auto result = sel.select(85, true, 50000.0, 0.5, 0.0, 0.0, 1.0, 100.0, 0);
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_IOC);
    CHECK(result.limit_price > 50000.0); // Buy: slightly above mid
}

// ═══════════════════════════════════════════════════════════════════════════
// High confidence + strong OBI → IOC
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: high confidence + OBI urgency selects IOC") {
    auto sel = make_selector();
    // Wide spread (so not tight-spread path), but strong OBI
    auto result = sel.select(85, true, 50000.0, 3.0, 0.5, 0.0, 1.0, 100.0, 0);
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_IOC);
}

TEST_CASE("AdaptiveOrderSelectorV2: high confidence + weak OBI does not trigger OBI path") {
    auto sel = make_selector();
    // Wide spread, weak OBI, small order → should fall through to low confidence or default
    auto result = sel.select(85, true, 50000.0, 3.0, 0.1, 0.0, 1.0, 100.0, 0);
    // confidence 85 >= low_confidence 60, spread 3 < wide_spread 5 → default IOC
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_IOC);
}

// ═══════════════════════════════════════════════════════════════════════════
// Large order vs thin depth → GTD
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: large order vs thin depth selects GTD") {
    auto sel = make_selector();
    // Medium confidence, wide spread (not tight), weak OBI, non-toxic
    // order_quantity/top5_depth = 50/100 = 0.5 > 0.2 threshold
    auto result = sel.select(70, true, 50000.0, 3.0, 0.1, 0.0, 50.0, 100.0, 1000000000LL);
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_GTD);
    CHECK(result.limit_price < 50000.0);    // Buy: passive side (below mid)
    CHECK(result.expire_ns > 1000000000LL); // Has expiry
}

TEST_CASE("AdaptiveOrderSelectorV2: GTD expire is now + gtd_seconds") {
    auto    sel    = make_selector();
    int64_t now    = 5000000000LL;
    auto    result = sel.select(70, true, 50000.0, 3.0, 0.1, 0.0, 50.0, 100.0, now);
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_GTD);
    // Default gtd_seconds = 30 → expire = now + 30 * 1e9
    CHECK(result.expire_ns == now + 30LL * 1000000000LL);
}

// ═══════════════════════════════════════════════════════════════════════════
// Low confidence → PostOnly
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: low confidence selects PostOnly") {
    auto sel = make_selector();
    // Low confidence, small order, non-toxic, normal spread
    auto result = sel.select(50, true, 50000.0, 2.0, 0.0, 0.0, 1.0, 100.0, 0);
    CHECK(result.kind == FastOrder::OrderKind::POST_ONLY);
    CHECK(result.limit_price < 50000.0); // Buy: behind best (below mid)
}

TEST_CASE("AdaptiveOrderSelectorV2: wide spread selects PostOnly") {
    auto sel = make_selector();
    // Medium confidence but very wide spread
    auto result = sel.select(70, true, 50000.0, 10.0, 0.0, 0.0, 1.0, 100.0, 0);
    CHECK(result.kind == FastOrder::OrderKind::POST_ONLY);
}

// ═══════════════════════════════════════════════════════════════════════════
// Default → IOC at mid
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: default selects IOC at mid") {
    auto sel = make_selector();
    // Medium confidence, normal spread, weak OBI, small order, non-toxic
    auto result = sel.select(70, true, 50000.0, 2.0, 0.0, 0.0, 1.0, 100.0, 0);
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_IOC);
    CHECK(result.limit_price == 50000.0); // At mid
}

// ═══════════════════════════════════════════════════════════════════════════
// Custom params
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: custom emergency threshold") {
    AdaptiveOrderSelectorV2::Params params;
    params.emergency_confidence = 50;
    AdaptiveOrderSelectorV2 sel(params);
    auto                    result = sel.select(55, true, 50000.0, 0.5, 0.0, 0.0, 1.0, 100.0, 0);
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_FOK);
}

TEST_CASE("AdaptiveOrderSelectorV2: custom toxic threshold") {
    AdaptiveOrderSelectorV2::Params params;
    params.toxic_threshold = 0.1;
    AdaptiveOrderSelectorV2 sel(params);
    auto                    result = sel.select(70, true, 50000.0, 2.0, 0.0, 0.15, 1.0, 100.0, 0);
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_IOC);
}

// ═══════════════════════════════════════════════════════════════════════════
// Binance mappings
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: binance type mapping") {
    using K = FastOrder::OrderKind;
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_binance_type(K::MARKET), "MARKET") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_binance_type(K::LIMIT_IOC), "LIMIT") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_binance_type(K::LIMIT_FOK), "LIMIT") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_binance_type(K::LIMIT_GTD), "LIMIT") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_binance_type(K::POST_ONLY), "GTX") == 0);
}

TEST_CASE("AdaptiveOrderSelectorV2: binance TIF mapping") {
    using K = FastOrder::OrderKind;
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_binance_tif(K::MARKET), "GTC") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_binance_tif(K::LIMIT_IOC), "IOC") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_binance_tif(K::LIMIT_FOK), "FOK") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_binance_tif(K::LIMIT_GTD), "GTC") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_binance_tif(K::POST_ONLY), "GTX") == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// OKX mappings
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: okx type mapping") {
    using K = FastOrder::OrderKind;
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_okx_type(K::MARKET), "market") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_okx_type(K::LIMIT_IOC), "ioc") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_okx_type(K::LIMIT_FOK), "fok") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_okx_type(K::LIMIT_GTD), "gtc") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_okx_type(K::POST_ONLY), "post_only") == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Bybit mappings
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: bybit type mapping") {
    using K = FastOrder::OrderKind;
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_bybit_type(K::MARKET), "Market") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_bybit_type(K::LIMIT_IOC), "Limit") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_bybit_type(K::LIMIT_FOK), "Limit") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_bybit_type(K::LIMIT_GTD), "Limit") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_bybit_type(K::POST_ONLY), "Limit") == 0);
}

TEST_CASE("AdaptiveOrderSelectorV2: bybit TIF mapping") {
    using K = FastOrder::OrderKind;
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_bybit_tif(K::MARKET), "GoodTillCancel") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_bybit_tif(K::LIMIT_IOC), "ImmediateOrCancel") ==
          0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_bybit_tif(K::LIMIT_FOK), "FillOrKill") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_bybit_tif(K::LIMIT_GTD), "GoodTillCancel") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_bybit_tif(K::POST_ONLY), "PostOnly") == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Exchange dispatch functions
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: to_exchange_type dispatches correctly") {
    using K = FastOrder::OrderKind;
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_exchange_type(K::POST_ONLY, "binance"), "GTX") ==
          0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_exchange_type(K::POST_ONLY, "okx"),
                      "post_only") == 0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_exchange_type(K::POST_ONLY, "bybit"), "Limit") ==
          0);
    // Unknown exchange defaults to Binance
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_exchange_type(K::POST_ONLY, "unknown"), "GTX") ==
          0);
}

TEST_CASE("AdaptiveOrderSelectorV2: to_exchange_tif dispatches correctly") {
    using K = FastOrder::OrderKind;
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_exchange_tif(K::LIMIT_IOC, "binance"), "IOC") ==
          0);
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_exchange_tif(K::LIMIT_IOC, "bybit"),
                      "ImmediateOrCancel") == 0);
    // OKX embeds TIF in order type, returns "GTC"
    CHECK(std::strcmp(AdaptiveOrderSelectorV2::to_exchange_tif(K::LIMIT_IOC, "okx"), "GTC") == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Sell side price direction
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: sell side prices are below mid for aggressive") {
    auto sel    = make_selector();
    auto result = sel.select(85, false, 50000.0, 0.5, 0.0, 0.0, 1.0, 100.0, 0);
    CHECK(result.kind == FastOrder::OrderKind::LIMIT_IOC);
    CHECK(result.limit_price < 50000.0); // Sell: below mid
}

TEST_CASE("AdaptiveOrderSelectorV2: sell side PostOnly is above mid") {
    auto sel    = make_selector();
    auto result = sel.select(50, false, 50000.0, 2.0, 0.0, 0.0, 1.0, 100.0, 0);
    CHECK(result.kind == FastOrder::OrderKind::POST_ONLY);
    CHECK(result.limit_price > 50000.0); // Sell: behind best (above mid)
}

// ═══════════════════════════════════════════════════════════════════════════
// Zero top5_depth edge case
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("AdaptiveOrderSelectorV2: zero depth does not trigger GTD") {
    auto sel = make_selector();
    // top5_depth = 0 → large order check skipped (division by zero guard)
    auto result = sel.select(70, true, 50000.0, 2.0, 0.0, 0.0, 50.0, 0.0, 0);
    // Should not be GTD, should fall through to default or low confidence
    CHECK(result.kind != FastOrder::OrderKind::LIMIT_GTD);
}
