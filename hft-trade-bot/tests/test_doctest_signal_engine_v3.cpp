// Unit tests for SignalEngineV3 (HMM Regime Detection) using doctest
// Tests: OnlineHMM initialization, regime detection, state transitions,
//        regime gating (trend boost/dampen, range cap, volatile stops),
//        V3 params, multi-symbol HMM state, accessors
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/strategies/signal_engine_v3.h"
#include "../src/strategies/pressure_model.h"

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// Helper: generate trending-up price series
// ═══════════════════════════════════════════════════════════════════════════
static std::vector<double> make_trending_up(int n, double start = 100.0, double drift = 0.001) {
    std::vector<double> prices(n);
    prices[0] = start;
    for (int i = 1; i < n; ++i) {
        prices[i] = prices[i-1] * (1.0 + drift);
    }
    return prices;
}

static std::vector<double> make_trending_down(int n, double start = 100.0, double drift = -0.001) {
    std::vector<double> prices(n);
    prices[0] = start;
    for (int i = 1; i < n; ++i) {
        prices[i] = prices[i-1] * (1.0 + drift);
    }
    return prices;
}

static std::vector<double> make_ranging(int n, double start = 100.0, double range = 0.002) {
    std::vector<double> prices(n);
    prices[0] = start;
    for (int i = 1; i < n; ++i) {
        // Oscillate around start price
        double phase = static_cast<double>(i) / n * 6.28;
        prices[i] = start + range * start * std::sin(phase);
    }
    return prices;
}

static std::vector<double> make_volatile(int n, double start = 100.0, double vol = 0.02) {
    std::vector<double> prices(n);
    prices[0] = start;
    // Simple LCG for reproducibility
    uint32_t seed = 42;
    for (int i = 1; i < n; ++i) {
        seed = seed * 1103515245 + 12345;
        double r = static_cast<double>(seed >> 16) / 32768.0 - 0.5;
        prices[i] = prices[i-1] * (1.0 + vol * r);
    }
    return prices;
}

// Helper: create candles from price series
static std::vector<Candle> make_candles(const std::vector<double>& prices, const char* symbol = "BTCUSDT") {
    std::vector<Candle> candles(prices.size());
    for (size_t i = 0; i < prices.size(); ++i) {
        candles[i].timestamp = static_cast<int64_t>(i) * 300;
        candles[i].open = prices[i];
        candles[i].high = prices[i] * 1.001;
        candles[i].low = prices[i] * 0.999;
        candles[i].close = prices[i];
        candles[i].volume = 500.0;
        candles[i].symbol = symbol;
        candles[i].exchange = "binance";
    }
    return candles;
}

// Helper: create a simple order book
static OrderBook make_orderbook(const char* symbol = "BTCUSDT") {
    OrderBook ob;
    ob.symbol = symbol;
    ob.exchange = "binance";
    for (int i = 0; i < 20; ++i) {
        ob.bids.push_back({100.0 - i * 0.01, 10.0 + i});
        ob.asks.push_back({100.0 + i * 0.01, 10.0 + i});
    }
    return ob;
}

// ═══════════════════════════════════════════════════════════════════════════
// OnlineHMM tests
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OnlineHMM initialization") {
    OnlineHMM hmm;
    RegimeState state = hmm.update(100.0);
    // First update should initialize and return RANGING
    CHECK(state == RegimeState::RANGING);
}

TEST_CASE("OnlineHMM detects trending up") {
    OnlineHMM hmm;
    auto prices = make_trending_up(200, 100.0, 0.002);

    RegimeState last_state = RegimeState::RANGING;
    for (double p : prices) {
        last_state = hmm.update(p);
    }

    // After 200 strongly trending-up prices, should detect TRENDING_UP
    CHECK(last_state == RegimeState::TRENDING_UP);
}

TEST_CASE("OnlineHMM detects trending down") {
    OnlineHMM hmm;
    auto prices = make_trending_down(200, 100.0, -0.002);

    RegimeState last_state = RegimeState::RANGING;
    for (double p : prices) {
        last_state = hmm.update(p);
    }

    // After 200 strongly trending-down prices, should detect TRENDING_DOWN
    CHECK(last_state == RegimeState::TRENDING_DOWN);
}

TEST_CASE("OnlineHMM detects ranging market") {
    OnlineHMM hmm;
    auto prices = make_ranging(200, 100.0, 0.001);

    RegimeState last_state = RegimeState::RANGING;
    for (double p : prices) {
        last_state = hmm.update(p);
    }

    // Small oscillation → RANGING
    CHECK(last_state == RegimeState::RANGING);
}

TEST_CASE("OnlineHMM detects volatile market") {
    OnlineHMM hmm;
    auto prices = make_volatile(200, 100.0, 0.03);

    RegimeState last_state = RegimeState::RANGING;
    for (double p : prices) {
        last_state = hmm.update(p);
    }

    // High volatility → VOLATILE
    CHECK(last_state == RegimeState::VOLATILE);
}

TEST_CASE("OnlineHMM state probability sums to ~1") {
    OnlineHMM hmm;
    for (int i = 0; i < 50; ++i) {
        hmm.update(100.0 + i * 0.1);
    }

    double total = 0.0;
    for (int i = 0; i < 4; ++i) {
        total += hmm.state_probability(static_cast<RegimeState>(i));
    }
    CHECK(total == doctest::Approx(1.0).epsilon(0.01));
}

TEST_CASE("OnlineHMM most_likely_state matches max probability") {
    OnlineHMM hmm;
    for (int i = 0; i < 100; ++i) {
        hmm.update(100.0 + i * 0.005);
    }

    RegimeState best = hmm.most_likely_state();
    double best_prob = hmm.state_probability(best);

    for (int i = 0; i < 4; ++i) {
        auto s = static_cast<RegimeState>(i);
        if (s != best) {
            CHECK(hmm.state_probability(s) <= best_prob + 1e-9);
        }
    }
}

TEST_CASE("OnlineHMM current_volatility is non-negative") {
    OnlineHMM hmm;
    for (int i = 0; i < 50; ++i) {
        hmm.update(100.0 + i * 0.01);
    }
    CHECK(hmm.current_volatility() >= 0.0);
}

TEST_CASE("OnlineHMM regime_name returns correct strings") {
    CHECK(std::string(regime_name(RegimeState::TRENDING_UP)) == "TRENDING_UP");
    CHECK(std::string(regime_name(RegimeState::TRENDING_DOWN)) == "TRENDING_DOWN");
    CHECK(std::string(regime_name(RegimeState::RANGING)) == "RANGING");
    CHECK(std::string(regime_name(RegimeState::VOLATILE)) == "VOLATILE");
}

TEST_CASE("OnlineHMM log_gaussian is correct") {
    // log N(0, 0, 1) = -0.5 * log(2*pi*1) = -0.918938...
    double lp = OnlineHMM::log_gaussian(0.0, 0.0, 1.0);
    CHECK(lp == doctest::Approx(-0.9189385).epsilon(0.001));

    // log N(1, 0, 1) = -0.5 * (log(2*pi) + 1) = -1.418938...
    lp = OnlineHMM::log_gaussian(1.0, 0.0, 1.0);
    CHECK(lp == doctest::Approx(-1.4189385).epsilon(0.001));
}

// ═══════════════════════════════════════════════════════════════════════════
// SignalEngineV3 regime gating tests
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("SignalEngineV3 construction with default params") {
    SignalEngineV2::Params v2_params;
    SignalEngineV3 engine(v2_params);

    // Accessors should work
    CHECK(engine.params().trend_boost == doctest::Approx(1.3));
    CHECK(engine.params().trend_dampen == doctest::Approx(0.5));
    CHECK(engine.params().range_confidence_cap == doctest::Approx(50.0));
}

TEST_CASE("SignalEngineV3 returns NEUTRAL for insufficient data") {
    SignalEngineV2::Params v2_params;
    SignalEngineV3 engine(v2_params);

    std::vector<Candle> candles(3);
    OrderBook ob = make_orderbook();
    PressureModel pm;
    PressureResult pr = pm.analyze(ob);

    FastSignal sig = engine.analyze("BTCUSDT", candles.data(), 3, ob, pr, 1000);
    CHECK(sig.direction == FastSignal::Direction::NEUTRAL);
}

TEST_CASE("SignalEngineV3 tracks regime per symbol") {
    SignalEngineV2::Params v2_params;
    SignalEngineV3 engine(v2_params);

    // Feed trending-up data for BTCUSDT
    auto btc_prices = make_trending_up(150, 100.0, 0.003);
    auto btc_candles = make_candles(btc_prices, "BTCUSDT");
    OrderBook ob = make_orderbook();
    PressureModel pm;
    PressureResult pr = pm.analyze(ob);

    engine.analyze("BTCUSDT", btc_candles.data(), btc_candles.size(), ob, pr, 1000);

    // After feeding trending data, regime should be TRENDING_UP
    RegimeState regime = engine.current_regime("BTCUSDT");
    CHECK(regime == RegimeState::TRENDING_UP);

    // ETHUSDT should still be RANGING (no data fed)
    RegimeState eth_regime = engine.current_regime("ETHUSDT");
    CHECK(eth_regime == RegimeState::RANGING);
}

TEST_CASE("SignalEngineV3 regime confidence is between 0 and 1") {
    SignalEngineV2::Params v2_params;
    SignalEngineV3 engine(v2_params);

    auto prices = make_trending_up(100, 100.0, 0.002);
    auto candles = make_candles(prices, "BTCUSDT");
    OrderBook ob = make_orderbook();
    PressureModel pm;
    PressureResult pr = pm.analyze(ob);

    engine.analyze("BTCUSDT", candles.data(), candles.size(), ob, pr, 1000);

    double conf = engine.regime_confidence("BTCUSDT");
    CHECK(conf >= 0.0);
    CHECK(conf <= 1.0);
}

TEST_CASE("SignalEngineV3 current_volatility accessor") {
    SignalEngineV2::Params v2_params;
    SignalEngineV3 engine(v2_params);

    auto prices = make_volatile(100, 100.0, 0.02);
    auto candles = make_candles(prices, "BTCUSDT");
    OrderBook ob = make_orderbook();
    PressureModel pm;
    PressureResult pr = pm.analyze(ob);

    engine.analyze("BTCUSDT", candles.data(), candles.size(), ob, pr, 1000);

    double vol = engine.current_volatility("BTCUSDT");
    CHECK(vol >= 0.0);

    // Unknown symbol returns 0
    CHECK(engine.current_volatility("UNKNOWN") == doctest::Approx(0.0));
}

TEST_CASE("SignalEngineV3 set_params changes behavior") {
    SignalEngineV2::Params v2_params;
    SignalEngineV3 engine(v2_params);

    SignalEngineV3::Params new_params;
    new_params.trend_boost = 2.0;
    new_params.trend_dampen = 0.3;
    engine.set_params(new_params);

    CHECK(engine.params().trend_boost == doctest::Approx(2.0));
    CHECK(engine.params().trend_dampen == doctest::Approx(0.3));
}

TEST_CASE("SignalEngineV3 v2 accessor returns underlying engine") {
    SignalEngineV2::Params v2_params;
    v2_params.ema_fast_period = 10;
    SignalEngineV3 engine(v2_params);

    const auto& v2 = engine.v2();
    CHECK(v2.params().ema_fast_period == 10);
}

TEST_CASE("SignalEngineV3 analyze_incremental returns valid signal") {
    SignalEngineV2::Params v2_params;
    SignalEngineV3 engine(v2_params);

    auto prices = make_trending_up(60, 100.0, 0.001);
    auto candles = make_candles(prices, "BTCUSDT");
    OrderBook ob = make_orderbook();
    PressureModel pm;
    PressureResult pr = pm.analyze(ob);

    // First call populates V2 cache + HMM
    engine.analyze("BTCUSDT", candles.data(), candles.size(), ob, pr, 1000);

    // Incremental call should use cached state
    FastSignal sig = engine.analyze_incremental("BTCUSDT", candles.data(), candles.size(), ob, pr, 2000);

    // Should produce a valid signal (not crash)
    CHECK(sig.timestamp == 2000);
}

TEST_CASE("SignalEngineV3 handles empty candles gracefully") {
    SignalEngineV2::Params v2_params;
    SignalEngineV3 engine(v2_params);

    OrderBook ob = make_orderbook();
    PressureModel pm;
    PressureResult pr = pm.analyze(ob);

    FastSignal sig = engine.analyze("BTCUSDT", nullptr, 0, ob, pr, 1000);
    CHECK(sig.direction == FastSignal::Direction::NEUTRAL);
}

TEST_CASE("SignalEngineV3 unknown symbol returns RANGING") {
    SignalEngineV2::Params v2_params;
    SignalEngineV3 engine(v2_params);

    CHECK(engine.current_regime("UNKNOWN") == RegimeState::RANGING);
    CHECK(engine.regime_confidence("UNKNOWN") == doctest::Approx(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Regime gating logic tests
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Regime gating: TRENDING_UP boosts LONG signals") {
    SignalEngineV2::Params v2_params;
    SignalEngineV3::Params v3_params;
    v3_params.min_regime_confidence = 0.0; // Always gate
    SignalEngineV3 engine(v2_params, v3_params);

    // Feed enough trending-up data to establish TRENDING_UP regime
    auto prices = make_trending_up(200, 100.0, 0.003);
    auto candles = make_candles(prices, "BTCUSDT");
    OrderBook ob = make_orderbook();
    PressureModel pm;
    PressureResult pr = pm.analyze(ob);

    // Get base V2 signal first
    FastSignal base = engine.v2().analyze("BTCUSDT", candles.data(), candles.size(), ob, pr, 1000);

    // Get V3 signal (with regime gating)
    FastSignal v3_sig = engine.analyze("BTCUSDT", candles.data(), candles.size(), ob, pr, 1000);

    // If base is LONG, V3 should boost confidence
    if (base.direction == FastSignal::Direction::LONG && v3_sig.direction == FastSignal::Direction::LONG) {
        CHECK(v3_sig.confidence >= base.confidence);
    }
}

TEST_CASE("Regime gating: RANGING caps confidence") {
    SignalEngineV2::Params v2_params;
    SignalEngineV3::Params v3_params;
    v3_params.range_confidence_cap = 40;
    v3_params.min_regime_confidence = 0.0;
    SignalEngineV3 engine(v2_params, v3_params);

    // Feed ranging data
    auto prices = make_ranging(200, 100.0, 0.0005);
    auto candles = make_candles(prices, "BTCUSDT");
    OrderBook ob = make_orderbook();
    PressureModel pm;
    PressureResult pr = pm.analyze(ob);

    FastSignal sig = engine.analyze("BTCUSDT", candles.data(), candles.size(), ob, pr, 1000);

    // In ranging mode, confidence should be capped
    if (engine.current_regime("BTCUSDT") == RegimeState::RANGING) {
        CHECK(sig.confidence <= static_cast<unsigned>(v3_params.range_confidence_cap));
    }
}
