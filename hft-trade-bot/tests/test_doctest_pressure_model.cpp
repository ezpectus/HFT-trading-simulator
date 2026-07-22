// Unit tests for PressureModel using doctest header-only framework
// Tests: OBI computation, trade imbalance, toxicity, microprice, queue position
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/strategies/pressure_model.h"

using namespace hft;

// ─── Helper: create a simple order book ───────────────────────────────────
static OrderBook make_order_book(double mid = 50000.0, int levels = 10) {
    OrderBook ob;
    ob.symbol          = "BTC/USDT";
    ob.exchange        = "binance";
    double half_spread = mid * 0.0001;
    for (int i = 0; i < levels; ++i) {
        ob.bids.push_back({mid - half_spread * (1 + i), 1.0 + i * 0.1});
        ob.asks.push_back({mid + half_spread * (1 + i), 0.8 + i * 0.1});
    }
    return ob;
}

TEST_CASE("Empty order book returns zero results") {
    OrderBook     ob;
    PressureModel pm;
    auto          result = pm.analyze(ob);
    CHECK(result.spread_bps == 0.0);
    CHECK(result.obi_5 == 0.0);
}

TEST_CASE("OBI computation with bid-heavy book") {
    auto ob = make_order_book(50000, 10);
    // Bids have more volume than asks
    PressureModel pm;
    auto          result = pm.analyze(ob);
    CHECK(result.obi_5 > 0.0); // More bid volume → positive OBI
    CHECK(result.obi_10 > 0.0);
    CHECK(result.obi_20 > 0.0);
}

TEST_CASE("Weighted OBI differs from simple OBI") {
    auto          ob = make_order_book(50000, 20);
    PressureModel pm;
    auto          result = pm.analyze(ob);
    // Weighted OBI should differ from simple OBI due to distance weighting
    CHECK(result.obi_weighted != result.obi_20);
}

TEST_CASE("Trade flow imbalance — all buys") {
    auto                     ob       = make_order_book();
    PressureModel::TradeTick trades[] = {
        {true, 1.0}, {true, 2.0}, {true, 1.5}, {true, 0.5}, {true, 1.0}};
    PressureModel pm;
    auto          result = pm.analyze(ob, trades, 5);
    CHECK(result.trade_imbalance == doctest::Approx(1.0)); // All buys
}

TEST_CASE("Trade flow imbalance — all sells") {
    auto                     ob       = make_order_book();
    PressureModel::TradeTick trades[] = {{false, 1.0}, {false, 2.0}, {false, 1.5}};
    PressureModel            pm;
    auto                     result = pm.analyze(ob, trades, 3);
    CHECK(result.trade_imbalance == doctest::Approx(-1.0)); // All sells
}

TEST_CASE("Trade flow imbalance — balanced") {
    auto                     ob       = make_order_book();
    PressureModel::TradeTick trades[] = {{true, 1.0}, {false, 1.0}};
    PressureModel            pm;
    auto                     result = pm.analyze(ob, trades, 2);
    CHECK(result.trade_imbalance == doctest::Approx(0.0));
}

TEST_CASE("Toxicity with no trades returns 0") {
    auto          ob = make_order_book();
    PressureModel pm;
    auto          result = pm.analyze(ob, nullptr, 0);
    CHECK(result.toxic_score == 0.0);
}

TEST_CASE("Toxicity with few trades returns 0") {
    auto                     ob       = make_order_book();
    PressureModel::TradeTick trades[] = {{true, 1.0}};
    PressureModel            pm;
    auto                     result = pm.analyze(ob, trades, 1);
    CHECK(result.toxic_score == 0.0); // n < 3
}

TEST_CASE("Microprice deviation is computed") {
    auto          ob = make_order_book(50000, 5);
    PressureModel pm;
    auto          result = pm.analyze(ob);
    // With bid qty > ask qty at level 0, microprice should deviate
    CHECK(result.microprice_dev != 0.0);
}

TEST_CASE("Spread regime classification") {
    auto          ob = make_order_book(50000, 5);
    PressureModel pm;
    auto          result = pm.analyze(ob);
    // With 1bps spread, should be TIGHT
    CHECK(result.spread_regime == PressureResult::SpreadRegime::TIGHT);
}

TEST_CASE("Queue position estimation") {
    auto          ob = make_order_book(50000, 10);
    PressureModel pm;
    auto          result = pm.analyze(ob);
    CHECK(result.queue_pos_bid >= 0.0);
    CHECK(result.queue_pos_bid <= 1.0);
    CHECK(result.queue_pos_ask >= 0.0);
    CHECK(result.queue_pos_ask <= 1.0);
}

TEST_CASE("Predicted impact is computed") {
    auto                     ob       = make_order_book(50000, 10);
    PressureModel::TradeTick trades[] = {{true, 1.0}, {true, 2.0}, {true, 1.5}, {true, 0.5}};
    PressureModel            pm;
    auto                     result = pm.analyze(ob, trades, 4);
    // Impact should be positive with bid-heavy book + buy trades
    CHECK(result.predicted_impact > 0.0);
}

TEST_CASE("get_pressure_score combines OBI and trade flow") {
    auto                     ob       = make_order_book(50000, 20);
    PressureModel::TradeTick trades[] = {{true, 1.0}, {true, 2.0}, {true, 1.0}};
    PressureModel            pm;
    double                   score = pm.get_pressure_score(ob, trades, 3);
    CHECK(score > 0.0); // Bid-heavy + buy trades → positive pressure
}

TEST_CASE("Analyze with only order book (no trades)") {
    auto          ob = make_order_book(50000, 10);
    PressureModel pm;
    auto          result = pm.analyze(ob);
    CHECK(result.obi_5 > 0.0);
    CHECK(result.trade_imbalance == 0.0);
    CHECK(result.toxic_score == 0.0);
}
