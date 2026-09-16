// Doctest: SignalReceiver data store — multi-exchange isolation
// The wire protocol qualifies every datum with its exchange; symbol-only
// storage merged binance/bybit/okx into one corrupt series.
#include "../src/communication/signal_receiver.h"
#include <doctest.h>

TEST_SUITE("SignalReceiver multi-exchange data") {

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

TEST_SUITE("SignalReceiver order events") {

    TEST_CASE("fills_batch: every order in the batch reaches on_fill") {
        // Exchange-initiated terminal events (SL/TP closes, GTD expiry, ARB
        // legs) arrive as fills_batch — before they were dropped whole.
        hft::SignalReceiver                              r("ws://localhost:0");
        std::vector<std::pair<std::string, std::string>> seen;
        r.on_fill([&](const std::string&, const std::string&, const std::string& st, double, double,
                      double, const std::string& cid) { seen.emplace_back(st, cid); });
        r.feed_frame_json({{"type", "fills_batch"},
                           {"orders",
                            {{{"symbol", "BTC/USDT"},
                              {"side", "SELL"},
                              {"status", "FILLED"},
                              {"filled_quantity", 0.5},
                              {"filled_price", 100.0},
                              {"fee", 0.01},
                              {"client_order_id", "hft_BTC_1"}},
                             {{"symbol", "ETH/USDT"},
                              {"side", "BUY"},
                              {"status", "CANCELLED"},
                              {"filled_quantity", 0.0},
                              {"filled_price", 0.0},
                              {"fee", 0.0},
                              {"client_order_id", "hft_ETH_2"}},
                             {{"symbol", "SOL/USDT"},
                              {"side", "BUY"},
                              {"status", "FILLED"},
                              {"filled_quantity", 1.0},
                              {"filled_price", 50.0},
                              {"fee", 0.0},
                              {"client_order_id", nullptr}}}}});
        REQUIRE(seen.size() == 3);
        CHECK(seen[0].first == "FILLED");
        // client_order_id rides through so callers can tell own orders from
        // foreign traffic on the shared account.
        CHECK(seen[0].second == "hft_BTC_1");
        CHECK(seen[1].first == "CANCELLED");
        CHECK(seen[1].second == "hft_ETH_2");
        // JSON null client_order_id (foreign traffic) must not throw — the
        // fill reaches the callback with an empty id.
        CHECK(seen[2].first == "FILLED");
        CHECK(seen[2].second.empty());
    }

    TEST_CASE("orders_cancelled: batch frame carries its order count") {
        // cancel-all reported +1 regardless of how many orders died.
        hft::SignalReceiver r("ws://localhost:0");
        int64_t             total    = 0;
        std::string         last_sym = "x";
        r.on_order_cancelled([&](const std::string& sym, int64_t count) {
            total += count;
            last_sym = sym;
        });
        r.feed_frame_json(
            {{"type", "orders_cancelled"}, {"count", 7}, {"order_ids", {"a", "b", "c"}}});
        CHECK(total == 7);
        CHECK(last_sym.empty());
        // Single cancel still reports exactly one.
        r.feed_frame_json({{"type", "order_cancelled"}, {"order", {{"symbol", "BTC/USDT"}}}});
        CHECK(total == 8);
        CHECK(last_sym == "BTC/USDT");
    }
}
