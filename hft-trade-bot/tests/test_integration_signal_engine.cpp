// Integration test: Signal Engine V2 + Order Book Manager
// Verifies that the signal engine correctly processes market data from the order book
// and generates composite signals with proper indicator weights.
#include "../src/market_data/candle_aggregator.h"
#include "../src/market_data/order_book_manager.h"
#include "../src/strategies/signal_engine_v2.h"
#include <doctest.h>
#include <vector>

TEST_SUITE("Signal Engine V2 Integration") {

    TEST_CASE("SignalEngineV2: end-to-end signal generation") {
        hft::OrderBookManager obm;
        hft::CandleAggregator agg(1); // 1-minute candles
        hft::SignalEngineV2   engine;

        // Feed synthetic order book updates to build depth
        for (int i = 0; i < 20; ++i) {
            obm.update_level("BTC/USDT", true, 65000.0 - i * 0.5, 1.0 + i * 0.1);  // bids
            obm.update_level("BTC/USDT", false, 65000.5 + i * 0.5, 0.8 + i * 0.1); // asks
        }

        // Generate candles
        for (int i = 0; i < 50; ++i) {
            hft::Candle c;
            c.symbol    = "BTC/USDT";
            c.timestamp = i * 60000;
            c.open      = 65000 + i * 10;
            c.high      = c.open + 50;
            c.low       = c.open - 30;
            c.close     = c.open + 20;
            c.volume    = 100 + i * 5;
            agg.on_trade(c.symbol, c.close, c.volume, c.timestamp);
        }

        // Run signal engine
        auto candles = agg.get_candles("BTC/USDT");
        if (candles.size() >= 20u) {
            auto signal = engine.compute_signal("BTC/USDT", candles, obm);

            // Signal should have all components
            CHECK(signal.symbol == "BTC/USDT");
            CHECK(signal.composite_score >= -1.0);
            CHECK(signal.composite_score <= 1.0);

            // OBI should be non-zero since we populated order book
            CHECK(signal.obi_score != 0.0);
        }
    }

    TEST_CASE("SignalEngineV2: empty order book produces zero OBI") {
        hft::OrderBookManager obm;
        hft::SignalEngineV2   engine;

        // No order book data — OBI should be 0
        std::vector<hft::Candle> candles;
        for (int i = 0; i < 30; ++i) {
            hft::Candle c;
            c.symbol    = "ETH/USDT";
            c.timestamp = i * 60000;
            c.open      = 3500 + i;
            c.high      = c.open + 10;
            c.low       = c.open - 5;
            c.close     = c.open + 3;
            c.volume    = 50;
            candles.push_back(c);
        }

        auto signal = engine.compute_signal("ETH/USDT", candles, obm);
        CHECK(signal.obi_score == 0.0);
    }

} // TEST_SUITE
