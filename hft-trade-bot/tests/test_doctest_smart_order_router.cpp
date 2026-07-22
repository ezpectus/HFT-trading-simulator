// Unit tests for SmartOrderRouterV2 and ExchangeBase using doctest
// Tests: latency tracking, toxic backoff, 5 routing strategies, depth filtering
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/execution/smart_order_router_v2.h"

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// Mock exchange for testing
// ═══════════════════════════════════════════════════════════════════════════
class MockExchange : public ExchangeBase {
  public:
    MockExchange(const std::string& id, double maker_bps, double taker_bps, double bid, double ask,
                 double depth = 10.0)
        : ExchangeBase(id, maker_bps, taker_bps), bid_(bid), ask_(ask), depth_(depth) {}

    double best_bid(const std::string& /*symbol*/) const override { return bid_; }
    double best_ask(const std::string& /*symbol*/) const override { return ask_; }
    double mid_price(const std::string& /*symbol*/) const override { return (bid_ + ask_) / 2.0; }
    double bid_depth(const std::string& /*symbol*/, int /*levels*/) const override {
        return depth_;
    }
    double ask_depth(const std::string& /*symbol*/, int /*levels*/) const override {
        return depth_;
    }

    void set_bid(double b) { bid_ = b; }
    void set_ask(double a) { ask_ = a; }
    void set_depth(double d) { depth_ = d; }

  private:
    double bid_;
    double ask_;
    double depth_;
};

// ═══════════════════════════════════════════════════════════════════════════
// ExchangeBase tests
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ExchangeBase basic properties") {
    MockExchange ex("binance", 2.0, 4.0, 50000, 50010);
    CHECK(ex.id() == "binance");
    CHECK(ex.maker_fee_bps() == doctest::Approx(2.0));
    CHECK(ex.taker_fee_bps() == doctest::Approx(4.0));
    CHECK(ex.best_bid("BTC") == doctest::Approx(50000));
    CHECK(ex.best_ask("BTC") == doctest::Approx(50010));
}

TEST_CASE("ExchangeBase latency tracking") {
    MockExchange ex("okx", 1.0, 3.0, 100, 101);
    CHECK(ex.estimated_latency_us() == 0);
    ex.record_latency(100);
    CHECK(ex.estimated_latency_us() == 100);
    ex.record_latency(200);
    // EMA: 100 + (200 - 100) / 10 = 110
    CHECK(ex.estimated_latency_us() == 110);
}

TEST_CASE("ExchangeBase toxic event tracking") {
    MockExchange ex("bybit", 1.5, 3.5, 100, 101);
    CHECK(ex.toxic_event_count() == 0);
    CHECK(ex.is_available() == true);
    ex.record_toxic_event();
    ex.record_toxic_event();
    CHECK(ex.toxic_event_count() == 2);
    CHECK(ex.is_available() == true);
    // 5 toxic events → unavailable
    ex.record_toxic_event();
    ex.record_toxic_event();
    ex.record_toxic_event();
    CHECK(ex.toxic_event_count() == 5);
    CHECK(ex.is_available() == false);
    ex.reset_toxic_events();
    CHECK(ex.toxic_event_count() == 0);
    CHECK(ex.is_available() == true);
}

// ═══════════════════════════════════════════════════════════════════════════
// SmartOrderRouterV2 — no exchanges
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Router returns no available exchanges when empty") {
    SmartOrderRouterV2 router;
    auto               decision = router.route("BTC/USDT", true, 1.0);
    CHECK(std::string(decision.exchange) == "");
    CHECK(std::string(decision.reason) == "No available exchanges");
}

TEST_CASE("Router skips unavailable exchanges") {
    SmartOrderRouterV2 router;
    MockExchange       ex("binance", 2.0, 4.0, 50000, 50010);
    // Make unavailable via toxic events
    for (int i = 0; i < 5; ++i)
        ex.record_toxic_event();
    router.add_exchange(&ex);
    auto decision = router.route("BTC/USDT", true, 1.0);
    CHECK(std::string(decision.reason) == "No available exchanges");
}

// ═══════════════════════════════════════════════════════════════════════════
// SmartOrderRouterV2 — BEST_PRICE strategy
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Router BEST_PRICE picks lowest ask for buy") {
    SmartOrderRouterV2::RoutingConfig cfg;
    cfg.strategy = SmartOrderRouterV2::Strategy::BEST_PRICE;
    SmartOrderRouterV2 router(cfg);

    MockExchange ex1("binance", 2.0, 4.0, 50000, 50100);
    MockExchange ex2("okx", 1.0, 3.0, 50000, 50050);
    router.add_exchange(&ex1);
    router.add_exchange(&ex2);

    auto decision = router.route("BTC/USDT", true, 1.0);
    CHECK(std::string(decision.exchange) == "okx");
}

TEST_CASE("Router BEST_PRICE picks highest bid for sell") {
    SmartOrderRouterV2::RoutingConfig cfg;
    cfg.strategy = SmartOrderRouterV2::Strategy::BEST_PRICE;
    SmartOrderRouterV2 router(cfg);

    MockExchange ex1("binance", 2.0, 4.0, 50100, 50200);
    MockExchange ex2("okx", 1.0, 3.0, 50050, 50150);
    router.add_exchange(&ex1);
    router.add_exchange(&ex2);

    auto decision = router.route("BTC/USDT", false, 1.0);
    CHECK(std::string(decision.exchange) == "binance");
}

// ═══════════════════════════════════════════════════════════════════════════
// SmartOrderRouterV2 — LOWEST_LATENCY strategy
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Router LOWEST_LATENCY picks fastest exchange") {
    SmartOrderRouterV2::RoutingConfig cfg;
    cfg.strategy = SmartOrderRouterV2::Strategy::LOWEST_LATENCY;
    SmartOrderRouterV2 router(cfg);

    MockExchange ex1("binance", 2.0, 4.0, 50000, 50100);
    MockExchange ex2("okx", 1.0, 3.0, 50000, 50100);
    ex1.record_latency(500);
    ex2.record_latency(200);
    router.add_exchange(&ex1);
    router.add_exchange(&ex2);

    auto decision = router.route("BTC/USDT", true, 1.0);
    CHECK(std::string(decision.exchange) == "okx");
    CHECK(decision.latency_us == 200);
}

// ═══════════════════════════════════════════════════════════════════════════
// SmartOrderRouterV2 — LOWEST_FEES strategy
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Router LOWEST_FEES picks cheapest maker fee") {
    SmartOrderRouterV2::RoutingConfig cfg;
    cfg.strategy     = SmartOrderRouterV2::Strategy::LOWEST_FEES;
    cfg.prefer_maker = true;
    SmartOrderRouterV2 router(cfg);

    MockExchange ex1("binance", 2.0, 4.0, 50000, 50100);
    MockExchange ex2("okx", 0.5, 2.0, 50000, 50100);
    router.add_exchange(&ex1);
    router.add_exchange(&ex2);

    auto decision = router.route("BTC/USDT", true, 1.0);
    CHECK(std::string(decision.exchange) == "okx");
    CHECK(decision.fee_bps == doctest::Approx(0.5));
}

// ═══════════════════════════════════════════════════════════════════════════
// SmartOrderRouterV2 — BEST_EFFECTIVE strategy
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Router BEST_EFFECTIVE considers fees in price") {
    SmartOrderRouterV2::RoutingConfig cfg;
    cfg.strategy     = SmartOrderRouterV2::Strategy::BEST_EFFECTIVE;
    cfg.prefer_maker = true;
    SmartOrderRouterV2 router(cfg);

    // Exchange A: ask=50000, maker_fee=10bps → effective = 50000 * 1.001 = 50050
    // Exchange B: ask=50020, maker_fee=1bps  → effective = 50020 * 1.0001 = 50025.002
    MockExchange ex1("binance", 10.0, 20.0, 49990, 50000);
    MockExchange ex2("okx", 1.0, 3.0, 50010, 50020);
    router.add_exchange(&ex1);
    router.add_exchange(&ex2);

    auto decision = router.route("BTC/USDT", true, 1.0);
    // OKX has lower effective price despite higher raw price
    CHECK(std::string(decision.exchange) == "okx");
}

// ═══════════════════════════════════════════════════════════════════════════
// SmartOrderRouterV2 — DEPTH_AWARE strategy
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Router DEPTH_AWARE penalizes insufficient depth") {
    SmartOrderRouterV2::RoutingConfig cfg;
    cfg.strategy      = SmartOrderRouterV2::Strategy::DEPTH_AWARE;
    cfg.prefer_maker  = true;
    cfg.min_depth_qty = 0.0; // Don't filter out, just penalize
    SmartOrderRouterV2 router(cfg);

    // Exchange A: better price but low depth
    MockExchange ex1("binance", 2.0, 4.0, 50000, 50000);
    ex1.set_depth(0.5);
    // Exchange B: worse price but high depth
    MockExchange ex2("okx", 2.0, 4.0, 50000, 50010);
    ex2.set_depth(100.0);
    router.add_exchange(&ex1);
    router.add_exchange(&ex2);

    // Order qty = 5.0 — ex1 has depth 0.5 (penalty), ex2 has depth 100 (no penalty)
    auto decision = router.route("BTC/USDT", true, 5.0);
    CHECK(std::string(decision.exchange) == "okx");
}

TEST_CASE("Router filters exchanges below min_depth_qty") {
    SmartOrderRouterV2::RoutingConfig cfg;
    cfg.strategy      = SmartOrderRouterV2::Strategy::BEST_EFFECTIVE;
    cfg.prefer_maker  = true;
    cfg.min_depth_qty = 1.0;
    SmartOrderRouterV2 router(cfg);

    MockExchange ex1("binance", 2.0, 4.0, 50000, 50000);
    ex1.set_depth(0.5); // Below min_depth_qty
    MockExchange ex2("okx", 2.0, 4.0, 50000, 50010);
    ex2.set_depth(10.0);
    router.add_exchange(&ex1);
    router.add_exchange(&ex2);

    auto decision = router.route("BTC/USDT", true, 1.0);
    // ex1 should be filtered out
    CHECK(std::string(decision.exchange) == "okx");
}

// ═══════════════════════════════════════════════════════════════════════════
// SmartOrderRouterV2 — set_strategy and reset
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Router set_strategy changes routing behavior") {
    SmartOrderRouterV2 router;
    MockExchange       ex1("binance", 10.0, 20.0, 50000, 50000);
    MockExchange       ex2("okx", 1.0, 3.0, 50000, 50010);
    router.add_exchange(&ex1);
    router.add_exchange(&ex2);

    // BEST_PRICE → binance (lower ask)
    router.set_strategy(SmartOrderRouterV2::Strategy::BEST_PRICE);
    auto d1 = router.route("BTC/USDT", true, 1.0);
    CHECK(std::string(d1.exchange) == "binance");

    // LOWEST_FEES → okx (lower fee)
    router.set_strategy(SmartOrderRouterV2::Strategy::LOWEST_FEES);
    auto d2 = router.route("BTC/USDT", true, 1.0);
    CHECK(std::string(d2.exchange) == "okx");
}

TEST_CASE("Router reset_toxic_counters clears all exchanges") {
    SmartOrderRouterV2 router;
    MockExchange       ex1("binance", 2.0, 4.0, 50000, 50100);
    MockExchange       ex2("okx", 1.0, 3.0, 50000, 50100);
    ex1.record_toxic_event();
    ex2.record_toxic_event();
    router.add_exchange(&ex1);
    router.add_exchange(&ex2);
    CHECK(ex1.toxic_event_count() == 1);
    CHECK(ex2.toxic_event_count() == 1);

    router.reset_toxic_counters();
    CHECK(ex1.toxic_event_count() == 0);
    CHECK(ex2.toxic_event_count() == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// RoutingDecision structure
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("RoutingDecision default values") {
    RoutingDecision d;
    CHECK(d.exchange[0] == '\0');
    CHECK(d.effective_price == doctest::Approx(0.0));
    CHECK(d.fee_bps == doctest::Approx(0.0));
    CHECK(d.latency_us == 0);
    CHECK(d.is_maker == false);
}

TEST_CASE("RoutingDecision set_exchange truncates safely") {
    RoutingDecision d;
    d.set_exchange("very_long_exchange_name_that_exceeds_buffer");
    // Should be truncated to 15 chars + null
    CHECK(std::string(d.exchange) == "very_long_exchan");
}

TEST_CASE("RoutingDecision set_reason truncates safely") {
    RoutingDecision d;
    d.set_reason("a very long reason that exceeds the 32 byte buffer limit");
    CHECK(std::string(d.reason).size() <= 31u);
}
