// Unit tests for OrderTypeSelector and core types (OrderBook, Position, Side)
// Tests: order type selection branches, limit price calc, OrderBook methods,
//        Position PnL update, side string conversion
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/data/types.h"
#include "../src/execution/order_type_selector.h"

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// Helper: create an OrderBook with given bid/ask levels
// ═══════════════════════════════════════════════════════════════════════════
static OrderBook makeOB(double bidPrice, double askPrice, int levels = 1) {
    OrderBook ob;
    ob.symbol   = "BTCUSDT";
    ob.exchange = "binance";
    for (int i = 0; i < levels; i++) {
        ob.bids.push_back({bidPrice - i * 0.5, 1.0});
        ob.asks.push_back({askPrice + i * 0.5, 1.0});
    }
    return ob;
}

static Signal makeSignal(int confidence) {
    Signal sig;
    sig.confidence = confidence;
    return sig;
}

// ═══════════════════════════════════════════════════════════════════════════
// OrderBook methods
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBook: best_bid returns first bid price") {
    auto ob = makeOB(49999.5, 50000.5);
    CHECK(ob.best_bid() == doctest::Approx(49999.5));
}

TEST_CASE("OrderBook: best_ask returns first ask price") {
    auto ob = makeOB(49999.5, 50000.5);
    CHECK(ob.best_ask() == doctest::Approx(50000.5));
}

TEST_CASE("OrderBook: spread is best_ask - best_bid") {
    auto ob = makeOB(49999.5, 50000.5);
    CHECK(ob.spread() == doctest::Approx(1.0));
}

TEST_CASE("OrderBook: mid_price is average of best bid and ask") {
    auto ob = makeOB(49999.5, 50000.5);
    CHECK(ob.mid_price() == doctest::Approx(50000.0));
}

TEST_CASE("OrderBook: empty book best_bid is 0") {
    OrderBook ob;
    CHECK(ob.best_bid() == 0.0);
}

TEST_CASE("OrderBook: empty book best_ask is 0") {
    OrderBook ob;
    CHECK(ob.best_ask() == 0.0);
}

TEST_CASE("OrderBook: empty book mid_price is 0") {
    OrderBook ob;
    CHECK(ob.mid_price() == 0.0);
}

TEST_CASE("OrderBook: empty book spread is 0") {
    OrderBook ob;
    CHECK(ob.spread() == 0.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Side conversion
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("side_to_string: BUY returns 'BUY'") {
    CHECK(side_to_string(Side::BUY) == "BUY");
}

TEST_CASE("side_to_string: SELL returns 'SELL'") {
    CHECK(side_to_string(Side::SELL) == "SELL");
}

TEST_CASE("string_to_side: 'BUY' returns Side::BUY") {
    CHECK(string_to_side("BUY") == Side::BUY);
}

TEST_CASE("string_to_side: 'SELL' returns Side::SELL") {
    CHECK(string_to_side("SELL") == Side::SELL);
}

TEST_CASE("string_to_side: unknown string returns SELL (default else branch)") {
    CHECK(string_to_side("UNKNOWN") == Side::SELL);
}

TEST_CASE("side_to_string and string_to_side round-trip") {
    CHECK(string_to_side(side_to_string(Side::BUY)) == Side::BUY);
    CHECK(string_to_side(side_to_string(Side::SELL)) == Side::SELL);
}

// ═══════════════════════════════════════════════════════════════════════════
// Position PnL
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Position: is_long returns true for BUY") {
    Position pos;
    pos.side = Side::BUY;
    CHECK(pos.is_long() == true);
}

TEST_CASE("Position: is_long returns false for SELL") {
    Position pos;
    pos.side = Side::SELL;
    CHECK(pos.is_long() == false);
}

TEST_CASE("Position: update_pnl long position profit") {
    Position pos;
    pos.side        = Side::BUY;
    pos.quantity    = 1.0;
    pos.entry_price = 50000.0;
    pos.update_pnl(51000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(1000.0));
}

TEST_CASE("Position: update_pnl long position loss") {
    Position pos;
    pos.side        = Side::BUY;
    pos.quantity    = 2.0;
    pos.entry_price = 50000.0;
    pos.update_pnl(49000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(-2000.0));
}

TEST_CASE("Position: update_pnl short position profit") {
    Position pos;
    pos.side        = Side::SELL;
    pos.quantity    = 1.0;
    pos.entry_price = 50000.0;
    pos.update_pnl(49000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(1000.0));
}

TEST_CASE("Position: update_pnl short position loss") {
    Position pos;
    pos.side        = Side::SELL;
    pos.quantity    = 2.0;
    pos.entry_price = 50000.0;
    pos.update_pnl(51000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(-2000.0));
}

TEST_CASE("Position: update_pnl zero quantity") {
    Position pos;
    pos.side        = Side::BUY;
    pos.quantity    = 0.0;
    pos.entry_price = 50000.0;
    pos.update_pnl(51000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(0.0));
}

TEST_CASE("Position: update_pnl price equals entry") {
    Position pos;
    pos.side        = Side::BUY;
    pos.quantity    = 5.0;
    pos.entry_price = 50000.0;
    pos.update_pnl(50000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// OrderTypeSelector::select
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderTypeSelector: high confidence + tight spread → MARKET") {
    // spread = 0.5, mid = 50000 → spread_bps = 0.1 < 5.0
    auto ob  = makeOB(49999.75, 50000.25);
    auto sig = makeSignal(85);
    CHECK(OrderTypeSelector::select(sig, ob) == OrderType::MARKET);
}

TEST_CASE("OrderTypeSelector: confidence exactly 80 + tight spread → MARKET") {
    auto ob  = makeOB(49999.75, 50000.25);
    auto sig = makeSignal(80);
    CHECK(OrderTypeSelector::select(sig, ob) == OrderType::MARKET);
}

TEST_CASE("OrderTypeSelector: low confidence → LIMIT") {
    // spread is tight but confidence < 70
    auto ob  = makeOB(49999.75, 50000.25);
    auto sig = makeSignal(60);
    CHECK(OrderTypeSelector::select(sig, ob) == OrderType::LIMIT);
}

TEST_CASE("OrderTypeSelector: wide spread → LIMIT regardless of confidence") {
    // spread = 100, mid = 50000 → spread_bps = 20 > 10.0
    auto ob  = makeOB(49950, 50050);
    auto sig = makeSignal(90);
    CHECK(OrderTypeSelector::select(sig, ob) == OrderType::LIMIT);
}

TEST_CASE("OrderTypeSelector: medium confidence + medium spread → MARKET (default)") {
    // confidence = 75, spread_bps = 0.1 → not high conf branch, not low/wide → default MARKET
    auto ob  = makeOB(49999.75, 50000.25);
    auto sig = makeSignal(75);
    CHECK(OrderTypeSelector::select(sig, ob) == OrderType::MARKET);
}

TEST_CASE("OrderTypeSelector: confidence 70 + tight spread → MARKET (default)") {
    // confidence = 70 → not < 70, spread_bps < 10 → default MARKET
    auto ob  = makeOB(49999.75, 50000.25);
    auto sig = makeSignal(70);
    CHECK(OrderTypeSelector::select(sig, ob) == OrderType::MARKET);
}

TEST_CASE("OrderTypeSelector: empty order book → spread_bps 999 → LIMIT") {
    OrderBook ob;
    auto      sig = makeSignal(90);
    // mid_price = 0 → spread_bps = 999 → LIMIT
    CHECK(OrderTypeSelector::select(sig, ob) == OrderType::LIMIT);
}

TEST_CASE("OrderTypeSelector: spread_bps exactly 5.0 boundary → not MARKET branch") {
    // spread_bps = 5.0 → not < 5.0, confidence = 85 → check second branch
    // spread_bps = 5.0, not > 10, confidence 85 not < 70 → default MARKET
    // spread = 25, mid = 50000 → 5.0 bps
    auto ob  = makeOB(49987.5, 50012.5);
    auto sig = makeSignal(85);
    CHECK(OrderTypeSelector::select(sig, ob) == OrderType::MARKET);
}

// ═══════════════════════════════════════════════════════════════════════════
// OrderTypeSelector::limit_price
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderTypeSelector: limit_price BUY below mid") {
    auto   ob    = makeOB(49999.5, 50000.5); // mid = 50000
    double price = OrderTypeSelector::limit_price(Side::BUY, ob, 1.0);
    // offset = 50000 * 1 / 10000 = 5.0
    // BUY → mid - offset = 49995
    CHECK(price == doctest::Approx(49995.0));
}

TEST_CASE("OrderTypeSelector: limit_price SELL above mid") {
    auto   ob    = makeOB(49999.5, 50000.5); // mid = 50000
    double price = OrderTypeSelector::limit_price(Side::SELL, ob, 1.0);
    // SELL → mid + offset = 50005
    CHECK(price == doctest::Approx(50005.0));
}

TEST_CASE("OrderTypeSelector: limit_price custom offset") {
    auto   ob    = makeOB(49999.5, 50000.5); // mid = 50000
    double price = OrderTypeSelector::limit_price(Side::BUY, ob, 2.0);
    // offset = 50000 * 2 / 10000 = 10.0
    // BUY → 49990
    CHECK(price == doctest::Approx(49990.0));
}

TEST_CASE("OrderTypeSelector: limit_price zero offset returns mid") {
    auto   ob    = makeOB(49999.5, 50000.5); // mid = 50000
    double price = OrderTypeSelector::limit_price(Side::BUY, ob, 0.0);
    CHECK(price == doctest::Approx(50000.0));
}

TEST_CASE("OrderTypeSelector: limit_price empty book returns 0") {
    OrderBook ob;
    double    price = OrderTypeSelector::limit_price(Side::BUY, ob, 1.0);
    CHECK(price == doctest::Approx(0.0));
}
