// Doctest: SignalReceiver data store — multi-exchange isolation (S252)
// The wire protocol qualifies every datum with its exchange; symbol-only
// storage merged binance/bybit/okx into one corrupt series.
#include "../src/communication/signal_receiver.h"
#include <doctest.h>

TEST_SUITE("SignalReceiver multi-exchange data (S252)") {

    TEST_CASE("prices: same symbol on three exchanges stays isolated") {
        hft::SignalReceiver r("ws://localhost:0");
        r.register_symbols({"BTC/USDT"});
        r.set_default_exchange("binance");
        r.feed_frame_json({{"type", "snapshot"},
                           {"prices",
                            {{"binance", {{"BTC/USDT", 100.0}}},
                             {"bybit", {{"BTC/USDT", 200.0}}},
                             {"okx", {{"BTC/USDT", 300.0}}}}}});
        // Symbol accessor resolves the configured venue.
        CHECK(r.get_price("BTC/USDT") == doctest::Approx(100.0));
        // By-id fast path is scoped to the primary venue too.
        CHECK(r.get_price_by_id(r.symbol_id("BTC/USDT")) == doctest::Approx(100.0));
        // Bare-symbol projection for pos_mgr carries only the primary venue.
        auto all = r.get_all_prices();
        CHECK(all.size() == 1);
        CHECK(all.at("BTC/USDT") == doctest::Approx(100.0));
    }

    TEST_CASE("orderbooks: per-venue books, deltas hit their own venue") {
        hft::SignalReceiver r("ws://localhost:0");
        r.register_symbols({"BTC/USDT"});
        r.set_default_exchange("binance");
        r.feed_frame_json({{"type", "snapshot"},
                           {"orderbooks",
                            {{"binance|BTC/USDT",
                              {{"exchange", "binance"},
                               {"symbol", "BTC/USDT"},
                               {"bids", {{{"price", 99.0}, {"quantity", 1.0}}}},
                               {"asks", {{{"price", 101.0}, {"quantity", 1.0}}}}}},
                             {"bybit|BTC/USDT",
                              {{"exchange", "bybit"},
                               {"symbol", "BTC/USDT"},
                               {"bids", {{{"price", 199.0}, {"quantity", 1.0}}}},
                               {"asks", {{{"price", 201.0}, {"quantity", 1.0}}}}}}}}});
        CHECK(r.get_best_bid("BTC/USDT") == doctest::Approx(99.0));
        CHECK(r.get_best_ask("BTC/USDT") == doctest::Approx(101.0));

        // A bybit delta must not mutate the binance book.
        r.feed_frame_json({{"type", "snapshot"},
                           {"orderbook_deltas",
                            {{"bybit|BTC/USDT",
                              {{"exchange", "bybit"},
                               {"symbol", "BTC/USDT"},
                               {"bids", {{{"p", 199.0}, {"q", 5.0}}}},
                               {"asks", nlohmann::json::array()}}}}}});
        CHECK(r.get_best_bid("BTC/USDT") == doctest::Approx(99.0));
    }

    TEST_CASE("candles: multi-exchange history does not interleave") {
        hft::SignalReceiver r("ws://localhost:0");
        r.register_symbols({"BTC/USDT"});
        r.set_default_exchange("binance");
        r.feed_frame_json({{"type", "candles"},
                           {"candles",
                            {{{"timestamp", 1},
                              {"open", 1.0},
                              {"high", 1.0},
                              {"low", 1.0},
                              {"close", 100.0},
                              {"volume", 1.0},
                              {"symbol", "BTC/USDT"},
                              {"exchange", "binance"}},
                             {{"timestamp", 1},
                              {"open", 1.0},
                              {"high", 1.0},
                              {"low", 1.0},
                              {"close", 500.0},
                              {"volume", 1.0},
                              {"symbol", "BTC/USDT"},
                              {"exchange", "okx"}}}}});
        auto candles = r.get_candles("BTC/USDT", 10);
        REQUIRE(candles.size() == 1);
        CHECK(candles[0].exchange == "binance");
        CHECK(candles[0].close == doctest::Approx(100.0));
        // By-id path serves the primary venue's series only.
        std::vector<hft::Candle> buf;
        CHECK(r.get_candles_by_id(r.symbol_id("BTC/USDT"), 10, buf) == 1);
        CHECK(buf[0].close == doctest::Approx(100.0));
    }
}
