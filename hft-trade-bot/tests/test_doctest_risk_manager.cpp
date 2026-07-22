// Unit tests for RiskManager using doctest header-only framework
// Tests: signal checks, order checks, position sizing, daily reset, blacklist
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/data/signal.h"
#include "../src/risk/risk_manager.h"

using namespace hft;

// ─── Helper: create a valid LONG signal ───────────────────────────────────
static Signal make_long_signal(double confidence = 80.0, double entry = 50000.0,
                               double sl = 49500.0, double tp = 51500.0) {
    Signal s;
    s.symbol      = "BTC/USDT";
    s.direction   = "LONG";
    s.confidence  = confidence;
    s.strategy    = "test";
    s.entry_price = entry;
    s.stop_loss   = sl;
    s.take_profit = tp;
    return s;
}

// ─── Helper: create a valid SHORT signal ──────────────────────────────────
static Signal make_short_signal(double confidence = 75.0, double entry = 50000.0,
                                double sl = 50500.0, double tp = 48500.0) {
    Signal s;
    s.symbol      = "BTC/USDT";
    s.direction   = "SHORT";
    s.confidence  = confidence;
    s.strategy    = "test";
    s.entry_price = entry;
    s.stop_loss   = sl;
    s.take_profit = tp;
    return s;
}

// ═══════════════════════════════════════════════════════════════════════════
// TestCircuitBreakerInit
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("RiskManager default params") {
    RiskManager::Params params;
    CHECK(params.max_risk_per_trade_pct == 2.0);
    CHECK(params.max_daily_drawdown_pct == 8.0);
    CHECK(params.min_confidence == 65.0);
    CHECK(params.min_rr_ratio == 1.5);
    CHECK(params.max_open_positions == 3);
    CHECK(params.max_leverage == 20);
}

TEST_CASE("RiskManager custom params") {
    RiskManager::Params params;
    params.min_confidence     = 70.0;
    params.max_open_positions = 5;
    RiskManager rm(params);
    CHECK(rm.params().min_confidence == 70.0);
    CHECK(rm.params().max_open_positions == 5);
}

// ═══════════════════════════════════════════════════════════════════════════
// TestSignalCheck
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Valid LONG signal passes") {
    RiskManager rm({});
    auto        sig    = make_long_signal(80.0);
    auto        result = rm.check_signal(sig, 10000.0, 1);
    CHECK(result.passed);
    CHECK(result.code == 0);
}

TEST_CASE("Low confidence rejected") {
    RiskManager rm({});
    auto        sig    = make_long_signal(50.0); // below default 65
    auto        result = rm.check_signal(sig, 10000.0, 1);
    CHECK_FALSE(result.passed);
}

TEST_CASE("Neutral signal rejected") {
    RiskManager rm({});
    Signal      sig;
    sig.direction  = "NEUTRAL";
    sig.confidence = 90.0;
    auto result    = rm.check_signal(sig, 10000.0, 0);
    CHECK_FALSE(result.passed);
}

TEST_CASE("Max positions reached") {
    RiskManager rm({});
    auto        sig    = make_long_signal(80.0);
    auto        result = rm.check_signal(sig, 10000.0, 3); // max_open_positions=3
    CHECK_FALSE(result.passed);
}

TEST_CASE("Low R:R ratio rejected") {
    RiskManager::Params params;
    params.min_rr_ratio = 2.0;
    RiskManager rm(params);
    // entry=50000, sl=49500, tp=51000 → R:R = 1000/500 = 2.0 (borderline)
    auto sig    = make_long_signal(80.0, 50000, 49500, 50999);
    auto result = rm.check_signal(sig, 10000.0, 0);
    CHECK_FALSE(result.passed);
}

TEST_CASE("SHORT signal with valid R:R passes") {
    RiskManager rm({});
    auto        sig    = make_short_signal(75.0, 50000, 50500, 48500);
    auto        result = rm.check_signal(sig, 10000.0, 0);
    CHECK(result.passed);
}

// ═══════════════════════════════════════════════════════════════════════════
// TestOrderCheck
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Valid order passes all checks") {
    RiskManager rm({});
    auto        result = rm.check_order("BTC/USDT", "BUY", 0.1, 50000, 5, 10000, 5000, 0);
    CHECK(result.passed);
    CHECK(result.code == 0);
}

TEST_CASE("Blacklisted symbol rejected") {
    RiskManager::Params params;
    params.blacklisted_symbols.insert("BTC/USDT");
    RiskManager rm(params);
    auto        result = rm.check_order("BTC/USDT", "BUY", 0.1, 50000, 5, 10000, 5000, 0);
    CHECK_FALSE(result.passed);
    CHECK(result.code == 6);
}

TEST_CASE("Excessive leverage rejected") {
    RiskManager rm({});
    auto        result = rm.check_order("BTC/USDT", "BUY", 0.1, 50000, 25, 10000, 5000, 0);
    CHECK_FALSE(result.passed);
    CHECK(result.code == 7);
}

TEST_CASE("Position size limit rejected") {
    RiskManager::Params params;
    params.max_position_qty = 0.05;
    RiskManager rm(params);
    auto        result = rm.check_order("BTC/USDT", "BUY", 0.1, 50000, 5, 10000, 5000, 0);
    CHECK_FALSE(result.passed);
    CHECK(result.code == 1);
}

TEST_CASE("Total exposure limit rejected") {
    RiskManager::Params params;
    params.max_total_exposure = 1000.0;
    RiskManager rm(params);
    auto        result = rm.check_order("BTC/USDT", "BUY", 0.1, 50000, 5, 10000, 5000, 0);
    CHECK_FALSE(result.passed);
    CHECK(result.code == 2);
}

TEST_CASE("Daily loss limit triggers kill switch") {
    RiskManager::Params params;
    params.daily_loss_limit = 100.0;
    RiskManager rm(params);
    rm.update_pnl(-200.0); // exceeds daily loss limit
    auto result = rm.check_order("BTC/USDT", "BUY", 0.1, 50000, 5, 10000, 5000, 0);
    CHECK_FALSE(result.passed);
    CHECK(result.code == 3);
}

TEST_CASE("Max drawdown rejected") {
    RiskManager::Params params;
    params.max_drawdown_pct = 0.10; // 10%
    RiskManager rm(params);
    rm.update_pnl_v2(0, -2000, 8000); // peak=10000, equity=8000 → 20% drawdown
    auto result = rm.check_order("BTC/USDT", "BUY", 0.1, 50000, 5, 8000, 4000, 0);
    CHECK_FALSE(result.passed);
    CHECK(result.code == 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// TestPositionSizing
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Position size calculation") {
    RiskManager rm({});
    auto        sig = make_long_signal(80.0, 50000, 49500, 51500);
    // risk_amount = 10000 * 2% = 200
    // risk_per_unit = |50000 - 49500| = 500
    // qty = 200 / 500 = 0.4
    // max_notional = 10000 * 10% = 1000
    // max_qty = 1000 / 50000 = 0.02
    // result = min(0.4, 0.02) = 0.02
    double qty = rm.calculate_position_size(sig, 10000.0);
    CHECK(qty == doctest::Approx(0.02).epsilon(0.01));
}

TEST_CASE("Position size with zero risk per unit returns 0") {
    RiskManager rm({});
    auto        sig = make_long_signal(80.0, 50000, 50000, 51500); // SL = entry
    double      qty = rm.calculate_position_size(sig, 10000.0);
    CHECK(qty == 0.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// TestBlacklistManagement
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Blacklist and unblacklist symbol") {
    RiskManager rm({});
    rm.blacklist_symbol("DOGE/USDT");
    auto result = rm.check_order("DOGE/USDT", "BUY", 0.1, 0.1, 5, 10000, 5000, 0);
    CHECK_FALSE(result.passed);
    CHECK(result.code == 6);

    rm.unblacklist_symbol("DOGE/USDT");
    auto result2 = rm.check_order("DOGE/USDT", "BUY", 0.1, 0.1, 5, 10000, 5000, 0);
    CHECK(result2.passed);
}

// ═══════════════════════════════════════════════════════════════════════════
// TestDailyReset
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Daily reset zeros PnL") {
    RiskManager rm({});
    rm.update_pnl(-500.0);
    CHECK(rm.daily_pnl() == doctest::Approx(-500.0));
    rm.reset_daily();
    CHECK(rm.daily_pnl() == doctest::Approx(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// TestGetters
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Monitoring getters return values") {
    RiskManager rm({});
    rm.update_pnl(100.0);
    CHECK(rm.daily_pnl() == doctest::Approx(100.0));
    CHECK(rm.total_exposure() == doctest::Approx(0.0));
    CHECK(rm.peak_equity() == doctest::Approx(0.0));
    CHECK(rm.orders_this_second() == 0);
}

TEST_CASE("Per-symbol position limit override") {
    RiskManager::Params params;
    params.per_symbol_max_qty["ETH/USDT"] = 2.0;
    params.max_position_qty               = 0.1;
    RiskManager rm(params);
    // ETH should use override (2.0), BTC should use default (0.1)
    auto eth_result = rm.check_order("ETH/USDT", "BUY", 1.0, 3000, 5, 10000, 5000, 0);
    CHECK(eth_result.passed);
    auto btc_result = rm.check_order("BTC/USDT", "BUY", 1.0, 50000, 5, 10000, 5000, 0);
    CHECK_FALSE(btc_result.passed);
    CHECK(btc_result.code == 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// on_fill exposure tracking (regression for notional bug)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("on_fill tracks notional (qty * price) not just price") {
    RiskManager rm({});
    // Fill: 0.5 BTC at $60,000 → notional = $30,000
    rm.on_fill("BTC/USDT", "BUY", 0.5, 60000.0, 10.0);
    CHECK(rm.total_exposure() == doctest::Approx(30000.0));
    // Fee deducted from daily PnL
    CHECK(rm.daily_pnl() == doctest::Approx(-10.0));
}

TEST_CASE("on_fill accumulates exposure across multiple fills") {
    RiskManager rm({});
    rm.on_fill("BTC/USDT", "BUY", 1.0, 50000.0, 5.0); // 50000
    rm.on_fill("ETH/USDT", "BUY", 2.0, 3000.0, 3.0);  // 6000
    CHECK(rm.total_exposure() == doctest::Approx(56000.0));
    CHECK(rm.daily_pnl() == doctest::Approx(-8.0));
}

TEST_CASE("reduce_exposure subtracts notional") {
    RiskManager rm({});
    rm.on_fill("BTC/USDT", "BUY", 1.0, 50000.0, 0.0);
    CHECK(rm.total_exposure() == doctest::Approx(50000.0));
    rm.reduce_exposure(50000.0);
    CHECK(rm.total_exposure() == doctest::Approx(0.0));
}
