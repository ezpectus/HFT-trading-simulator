// Signal receiver — WebSocket client that receives market data and AI signals
//
// Connects to:
// 1. Exchange simulator (ws://localhost:8765) — market data, order fills
// 2. AI Signal Bot signal publisher (ws://localhost:8766) — validated trading signals
#pragma once

#include "../data/signal.h"
#include "../data/types.h"
#include "../utils/low_latency.h"
#include <atomic>
#include <condition_variable>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <vector>
#include <websocketpp/client.hpp>
#include <websocketpp/config/asio_client.hpp>

namespace hft {

using json = nlohmann::json;
using namespace std::string_view_literals;
using WSClient = websocketpp::client<websocketpp::config::asio_client>;

class SignalReceiver {
  public:
    using SignalCallback = std::function<void(const Signal&)>;
    using CandleCallback = std::function<void(const std::vector<Candle>&)>;
    using ArbitrageCallback =
        std::function<void(const std::string& symbol, const std::string& buy_exchange,
                           const std::string& sell_exchange, double buy_price, double sell_price,
                           double spread_bps, double max_quantity)>;

    explicit SignalReceiver(const std::string& ws_url)
        : ws_url_(ws_url), client_(std::make_unique<WSClient>()) {}

    // Register known symbols for numeric ID-based fast path lookups
    void register_symbols(const std::vector<std::string>& symbols) {
        symbol_to_id_.clear();
        id_to_symbol_.clear();
        for (uint16_t i = 0; i < symbols.size(); ++i) {
            symbol_to_id_[symbols[i]] = i;
            id_to_symbol_.push_back(symbols[i]);
        }
        prices_by_id_.assign(symbols.size(), 0.0);
        obs_by_id_.assign(symbols.size(), OrderBook{});
        candles_by_id_.assign(symbols.size(), {});
    }

    uint16_t symbol_id(const std::string& sym) const {
        auto it = symbol_to_id_.find(sym);
        return it != symbol_to_id_.end() ? it->second : 0xFFFF;
    }

    // Fast path: get price by numeric ID (no string hash lookup)
    double get_price_by_id(uint16_t id) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        return id < prices_by_id_.size() ? prices_by_id_[id] : 0.0;
    }

    // Fast path: get candles by numeric ID into pre-allocated buffer
    size_t get_candles_by_id(uint16_t id, size_t n, std::vector<Candle>& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        if (id >= candles_by_id_.size()) {
            out.clear();
            return 0;
        }
        const auto& hist = candles_by_id_[id];
        if (hist.empty()) {
            out.clear();
            return 0;
        }
        size_t start = hist.size() >= n ? hist.size() - n : 0;
        out.assign(hist.begin() + start, hist.end());
        return out.size();
    }

    // Fast path: get order book by numeric ID into pre-allocated buffer
    bool get_order_book_by_id(uint16_t id, OrderBook& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        if (id >= obs_by_id_.size()) return false;
        if (obs_by_id_[id].bids.empty()) return false;
        out = obs_by_id_[id];
        return true;
    }

    // Inject market data snapshot from SHM (HFT-O16 — bypass WebSocket)
    void inject_snapshot(uint16_t symbol_id, double bid, double ask, double /*last*/,
                         double volume) {
        if (symbol_id >= id_to_symbol_.size()) return;
        const auto& sym = id_to_symbol_[symbol_id];
        double      mid = (bid + ask) / 2.0;
        {
            std::lock_guard<Spinlock> lock(data_lock_);
            prices_[sym]             = mid;
            prices_by_id_[symbol_id] = mid;
            // Update order book with best bid/ask
            OrderBook& ob = obs_by_id_[symbol_id];
            ob.symbol     = sym;
            ob.exchange   = "shm";
            if (ob.bids.empty()) ob.bids.resize(1);
            if (ob.asks.empty()) ob.asks.resize(1);
            ob.bids[0]        = {bid, volume * 0.1};
            ob.asks[0]        = {ask, volume * 0.1};
            order_books_[sym] = ob;
        }
        has_new_data_.store(true, std::memory_order_release);
    }

    bool has_shm_data() const noexcept { return !id_to_symbol_.empty(); }

    bool connect() {
        should_reconnect_ = true;
        return do_connect();
    }

    bool do_connect() {
        try {
            // Recreate client on each connect — websocketpp init_asio() must not be called twice
            client_ = std::make_unique<WSClient>();
            client_->init_asio();
            client_->set_open_handler([this](websocketpp::connection_hdl hdl) {
                connected_       = true;
                connection_      = hdl;
                reconnect_delay_ = 1000; // Reset backoff on success
                spdlog::info("SignalReceiver connected to {}", ws_url_);

                // Send subscribe message with protocol version 2 and msgpack encoding (HFT-O15)
                json sub = {
                    {"type", "subscribe"}, {"protocol_version", 2}, {"encoding", "msgpack"}};
                client_->send(hdl, sub.dump(), websocketpp::frame::opcode::text);
            });

            client_->set_close_handler([this](websocketpp::connection_hdl) {
                connected_ = false;
                spdlog::warn("SignalReceiver disconnected");
                if (should_reconnect_) {
                    spdlog::info("Reconnecting in {}ms...", reconnect_delay_);
                    auto delay       = reconnect_delay_;
                    reconnect_delay_ = std::min(reconnect_delay_ * 2, 30000);
                    std::thread([this, delay]() {
                        std::this_thread::sleep_for(std::chrono::milliseconds(delay));
                        if (should_reconnect_) {
                            if (ws_thread_.joinable()) ws_thread_.join();
                            do_connect();
                        }
                    }).detach();
                }
            });

            client_->set_message_handler(
                [this](websocketpp::connection_hdl, WSClient::message_ptr msg) {
                    if (msg->get_opcode() == websocketpp::frame::opcode::binary) {
                        // Binary frame — server sent msgpack (HFT-O15)
                        // Convert binary payload to JSON string via nlohmann/json
                        const auto& bin  = msg->get_payload();
                        auto        data = json::from_msgpack(bin);
                        handle_message_json(data);
                    } else {
                        handle_message(msg->get_payload());
                    }
                });

            websocketpp::lib::error_code ec;
            auto                         con = client_->get_connection(ws_url_, ec);
            if (ec) {
                spdlog::error("SignalReceiver connect error: {}", ec.message());
                return false;
            }

            client_->connect(con);
            ws_thread_ = std::thread([this]() { client_->run(); });
            return true;
        } catch (const std::exception& e) {
            spdlog::error("SignalReceiver connect failed: {}", e.what());
            return false;
        }
    }

    void disconnect() {
        should_reconnect_ = false;
        if (connected_) {
            client_->close(connection_, websocketpp::close::status::normal, "shutdown");
        }
        if (ws_thread_.joinable()) ws_thread_.join();
        connected_ = false;
    }

    void on_signal(SignalCallback cb) { signal_cb_ = std::move(cb); }
    void on_candles(CandleCallback cb) { candle_cb_ = std::move(cb); }
    void on_arbitrage(ArbitrageCallback cb) { arb_cb_ = std::move(cb); }

    bool is_connected() const { return connected_; }
    bool is_trading_active() const { return trading_active_.load(std::memory_order_relaxed); }

    // Wait for new market data or timeout. Returns true if data arrived, false on timeout.
    // This replaces polling sleep — the main loop wakes instantly when new data arrives.
    bool wait_for_data(int timeout_ms = 1000) {
        std::unique_lock<std::mutex> lk(mutex_);
        if (has_new_data_) {
            has_new_data_ = false;
            return true;
        }
        cv_.wait_for(lk, std::chrono::milliseconds(timeout_ms),
                     [this] { return has_new_data_.load(); });
        if (has_new_data_) {
            has_new_data_ = false;
            return true;
        }
        return false;
    }

    // Get latest price for a symbol
    double get_price(const std::string& symbol) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = prices_.find(symbol);
        return it != prices_.end() ? it->second : 0.0;
    }

    // Get best bid without copying the full OrderBook
    double get_best_bid(const std::string& symbol) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = order_books_.find(symbol);
        if (it == order_books_.end() || it->second.bids.empty()) return 0.0;
        return it->second.bids[0].price;
    }

    // Get best ask without copying the full OrderBook
    double get_best_ask(const std::string& symbol) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = order_books_.find(symbol);
        if (it == order_books_.end() || it->second.asks.empty()) return 0.0;
        return it->second.asks[0].price;
    }

    // Get mid price without copying the full OrderBook
    double get_mid_price(const std::string& symbol) const {
        double bid = get_best_bid(symbol);
        double ask = get_best_ask(symbol);
        if (bid == 0.0 || ask == 0.0) return 0.0;
        return (bid + ask) / 2.0;
    }

    // Get bid depth without copying the full OrderBook
    double get_bid_depth(const std::string& symbol, int levels) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = order_books_.find(symbol);
        if (it == order_books_.end()) return 0.0;
        double depth = 0.0;
        int    n     = std::min(levels, static_cast<int>(it->second.bids.size()));
        for (int i = 0; i < n; ++i)
            depth += it->second.bids[i].quantity;
        return depth;
    }

    // Get ask depth without copying the full OrderBook
    double get_ask_depth(const std::string& symbol, int levels) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = order_books_.find(symbol);
        if (it == order_books_.end()) return 0.0;
        double depth = 0.0;
        int    n     = std::min(levels, static_cast<int>(it->second.asks.size()));
        for (int i = 0; i < n; ++i)
            depth += it->second.asks[i].quantity;
        return depth;
    }

    // Fill pre-allocated output map to avoid heap allocation on every call.
    // Returns number of prices written.
    size_t get_all_prices_into(std::unordered_map<std::string, double>& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        out = prices_;
        return out.size();
    }

    // Legacy: returns a copy (allocates). Prefer get_all_prices_into for hot path.
    std::unordered_map<std::string, double> get_all_prices() const {
        std::lock_guard<Spinlock> lock(data_lock_);
        return prices_;
    }

    // Get candle history for a symbol
    std::vector<Candle> get_candles(const std::string& symbol, size_t n = 100) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = candle_history_.find(symbol);
        if (it == candle_history_.end()) return {};
        const auto& hist = it->second;
        return hist.size() <= n ? hist : std::vector<Candle>(hist.end() - n, hist.end());
    }

    // Fill pre-allocated buffer with candle history (avoids heap allocation)
    // Returns number of candles written.
    size_t get_candles_into(const std::string& symbol, size_t n, std::vector<Candle>& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = candle_history_.find(symbol);
        if (it == candle_history_.end()) {
            out.clear();
            return 0;
        }
        const auto& hist  = it->second;
        size_t      count = std::min(n, hist.size());
        out.assign(hist.end() - count, hist.end());
        return count;
    }

    // Get latest order book
    OrderBook get_order_book(const std::string& symbol) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = order_books_.find(symbol);
        return it != order_books_.end() ? it->second : OrderBook{};
    }

    // Fill pre-allocated order book (avoids heap allocation for bids/asks vectors)
    // Returns true if order book was found and filled.
    bool get_order_book_into(const std::string& symbol, OrderBook& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = order_books_.find(symbol);
        if (it == order_books_.end()) return false;
        out = it->second; // Still copies, but caller can reuse buffer capacity
        return true;
    }

  private:
    void handle_message(const std::string& payload) {
        // Exception-free JSON parse — returns null on invalid JSON
        auto data = json::parse(payload, nullptr, false);
        if (data.is_discarded() || !data.is_object()) {
            spdlog::warn("Invalid JSON received (len={})", payload.size());
            return;
        }
        handle_message_json(data);
    }

    void handle_message_json(const json& data) {
        // Use string_view for type comparison — avoids heap-allocating std::string on every message
        const auto       type_sv = data.value("type", ""sv);
        std::string_view type    = type_sv;

        if (type == "candles" || type == "snapshot" || type == "sync_state") {
            // Check for trading_active field in broadcast
            if (data.contains("trading_active")) {
                trading_active_.store(data["trading_active"].get<bool>(),
                                      std::memory_order_relaxed);
            }

            // Notify main loop that new market data has arrived
            has_new_data_.store(true, std::memory_order_release);
            cv_.notify_one();

            // Update prices
            if (data.contains("prices")) {
                std::lock_guard<Spinlock> lock(data_lock_);
                for (auto& [exchange, symbols] : data["prices"].items()) {
                    for (auto& [symbol, price] : symbols.items()) {
                        prices_[symbol] = price.get<double>();
                        // Sync array-based fast path
                        auto id_it = symbol_to_id_.find(symbol);
                        if (id_it != symbol_to_id_.end()) {
                            prices_by_id_[id_it->second] = price.get<double>();
                        }
                    }
                }
            }

            // Update order books
            if (data.contains("orderbooks")) {
                std::lock_guard<Spinlock> lock(data_lock_);
                for (auto& [key, ob_data] : data["orderbooks"].items()) {
                    OrderBook ob;
                    ob.symbol    = ob_data.value("symbol", "");
                    ob.exchange  = ob_data.value("exchange", "");
                    ob.timestamp = data.value("timestamp", 0);
                    if (ob_data.contains("bids")) {
                        for (const auto& b : ob_data["bids"]) {
                            ob.bids.push_back({b.value("price", 0.0), b.value("quantity", 0.0)});
                        }
                    }
                    if (ob_data.contains("asks")) {
                        for (const auto& a : ob_data["asks"]) {
                            ob.asks.push_back({a.value("price", 0.0), a.value("quantity", 0.0)});
                        }
                    }
                    order_books_[ob.symbol] = std::move(ob);
                    // Sync array-based fast path
                    auto id_it = symbol_to_id_.find(ob.symbol);
                    if (id_it != symbol_to_id_.end()) {
                        obs_by_id_[id_it->second] = order_books_[ob.symbol];
                    }
                }
            }

            // Apply order book deltas (incremental updates)
            if (data.contains("orderbook_deltas")) {
                std::lock_guard<Spinlock> lock(data_lock_);
                for (auto& [key, delta_data] : data["orderbook_deltas"].items()) {
                    std::string symbol = delta_data.value("symbol", "");
                    auto        it     = order_books_.find(symbol);
                    if (it == order_books_.end()) continue; // Need full snapshot first

                    OrderBook& ob = it->second;
                    ob.timestamp  = data.value("timestamp", 0);

                    // Apply bid deltas: {"p": price, "q": qty} — q=0 means remove level
                    if (delta_data.contains("bids")) {
                        for (const auto& d : delta_data["bids"]) {
                            double price = d.value("p", 0.0);
                            double qty   = d.value("q", 0.0);
                            auto&  bids  = ob.bids;
                            auto   lit   = std::find_if(
                                bids.begin(), bids.end(),
                                [price](const OrderBookLevel& l) { return l.price == price; });
                            if (qty > 0.0) {
                                if (lit != bids.end()) {
                                    lit->quantity = qty; // Update existing
                                } else {
                                    // Insertion sort: find position and insert (O(n) vs O(n log n)
                                    // for std::sort)
                                    bids.push_back({price, qty});
                                    auto cmp = [](const OrderBookLevel& a,
                                                  const OrderBookLevel& b) {
                                        return a.price > b.price;
                                    };
                                    auto last = bids.end() - 1;
                                    while (last != bids.begin() && cmp(*last, *(last - 1))) {
                                        std::iter_swap(last, last - 1);
                                        --last;
                                    }
                                }
                            } else if (lit != bids.end()) {
                                bids.erase(lit); // Remove level
                            }
                        }
                    }

                    // Apply ask deltas
                    if (delta_data.contains("asks")) {
                        for (const auto& d : delta_data["asks"]) {
                            double price = d.value("p", 0.0);
                            double qty   = d.value("q", 0.0);
                            auto&  asks  = ob.asks;
                            auto   lit   = std::find_if(
                                asks.begin(), asks.end(),
                                [price](const OrderBookLevel& l) { return l.price == price; });
                            if (qty > 0.0) {
                                if (lit != asks.end()) {
                                    lit->quantity = qty;
                                } else {
                                    // Insertion sort: find position and insert
                                    asks.push_back({price, qty});
                                    auto cmp = [](const OrderBookLevel& a,
                                                  const OrderBookLevel& b) {
                                        return a.price < b.price;
                                    };
                                    auto last = asks.end() - 1;
                                    while (last != asks.begin() && cmp(*last, *(last - 1))) {
                                        std::iter_swap(last, last - 1);
                                        --last;
                                    }
                                }
                            } else if (lit != asks.end()) {
                                asks.erase(lit);
                            }
                        }
                    }
                }
            }

            // Update candle history — take spinlock once for entire batch
            std::vector<Candle> new_candles;
            if (data.contains("candles")) {
                new_candles.reserve(data["candles"].size());
                {
                    std::lock_guard<Spinlock> lock(data_lock_);
                    for (const auto& c : data["candles"]) {
                        Candle candle;
                        candle.timestamp = c.value("timestamp", 0);
                        candle.open      = c.value("open", 0.0);
                        candle.high      = c.value("high", 0.0);
                        candle.low       = c.value("low", 0.0);
                        candle.close     = c.value("close", 0.0);
                        candle.volume    = c.value("volume", 0.0);
                        candle.symbol    = c.value("symbol", "");
                        candle.exchange  = c.value("exchange", "");

                        auto& hist = candle_history_[candle.symbol];
                        hist.push_back(candle);
                        if (hist.size() > 200u) {
                            hist.erase(hist.begin(), hist.end() - 200);
                        }
                        auto id_it = symbol_to_id_.find(candle.symbol);
                        if (id_it != symbol_to_id_.end()) {
                            auto& arr_hist = candles_by_id_[id_it->second];
                            arr_hist.push_back(candle);
                            if (arr_hist.size() > 200u) {
                                arr_hist.erase(arr_hist.begin(), arr_hist.end() - 200);
                            }
                        }
                        new_candles.push_back(candle);
                    }
                }
                // Callback outside mutex to prevent deadlock
                if (candle_cb_) candle_cb_(new_candles);
            }
        } else if (type == "trading_state") {
            bool active = data.value("trading_active", true);
            trading_active_.store(active, std::memory_order_relaxed);
            spdlog::info("Trading state: {}", active ? "ACTIVE" : "STOPPED");
        } else if (type == "replay_state") {
            bool paused = data.value("paused", false);
            if (paused) {
                spdlog::info("Simulation PAUSED");
            }
        } else if (type == "fill") {
            // Order fill notification
            if (data.contains("order")) {
                auto& o = data["order"];
                spdlog::info("Order filled: {} {} {:.4f} @ {:.2f}", o.value("side", ""),
                             o.value("symbol", ""), o.value("filled_quantity", 0.0),
                             o.value("filled_price", 0.0));
            }
        } else if (type == "error") {
            std::string msg = data.value("message", "unknown error");
            spdlog::warn("Exchange error: {}", msg);
        } else if (type == "signal") {
            // AI Signal Bot broadcast — validated trading signal
            Signal sig;
            sig.symbol      = data.value("symbol", "");
            sig.direction   = data.value("direction", "NEUTRAL");
            sig.confidence  = data.value("confidence", 0.0);
            sig.strategy    = data.value("strategy", "ai_signal_bot");
            sig.entry_price = data.value("entry_price", 0.0);
            sig.stop_loss   = data.value("stop_loss", 0.0);
            sig.take_profit = data.value("take_profit", 0.0);
            sig.timestamp   = data.value("timestamp", 0);
            sig.reason      = data.value("reason", "");

            spdlog::info("AI Signal received: {} {} {} conf={:.1f} entry={:.2f}", sig.symbol,
                         sig.direction, sig.strategy, sig.confidence, sig.entry_price);

            if (signal_cb_) signal_cb_(sig);
        } else if (type == "signal_history") {
            // Initial signal history on connect
            if (data.contains("signals")) {
                int count = 0;
                for (const auto& s : data["signals"]) {
                    Signal sig;
                    sig.symbol      = s.value("symbol", "");
                    sig.direction   = s.value("direction", "NEUTRAL");
                    sig.confidence  = s.value("confidence", 0.0);
                    sig.strategy    = s.value("strategy", "ai_signal_bot");
                    sig.entry_price = s.value("entry_price", 0.0);
                    sig.stop_loss   = s.value("stop_loss", 0.0);
                    sig.take_profit = s.value("take_profit", 0.0);
                    sig.timestamp   = s.value("timestamp", 0);
                    count++;
                }
                spdlog::info("Received {} historical AI signals", count);
            }
        } else if (type == "market_regime") {
            // FFT regime update from AI bot
            std::string symbol         = data.value("symbol", "");
            std::string regime         = data.value("regime", "");
            double      trend_score    = data.value("trend_score", 0.0);
            double      cycle_strength = data.value("cycle_strength", 0.0);
            spdlog::debug("Market regime: {} {} trend={:.2f} cycle={:.2f}", symbol, regime,
                          trend_score, cycle_strength);
        } else if (type == "circuit_breaker_status") {
            std::string state    = data.value("state", "CLOSED");
            int         failures = data.value("consecutive_failures", 0);
            if (state != "CLOSED") {
                spdlog::warn("Circuit breaker: {} (failures={})", state, failures);
            }
        } else if (type == "welcome") {
            int  ver     = data.value("protocol_version", 1);
            bool trading = data.value("trading_active", true);
            trading_active_.store(trading, std::memory_order_relaxed);
            spdlog::info("Server welcome: protocol v{}, trading={}", ver,
                         trading ? "ACTIVE" : "STOPPED");
        } else if (type == "arbitrage_scan") {
            // Arbitrage opportunities from exchange simulator
            if (data.contains("active") && data["active"].is_array()) {
                auto count = data["active"].size();
                if (count > 0) {
                    for (const auto& arb : data["active"]) {
                        std::string symbol     = arb.value("symbol", "");
                        std::string buy_ex     = arb.value("buy_exchange", "");
                        std::string sell_ex    = arb.value("sell_exchange", "");
                        double      buy_price  = arb.value("buy_price", 0.0);
                        double      sell_price = arb.value("sell_price", 0.0);
                        double      spread_bps = arb.value("spread_bps", 0.0);
                        double      max_qty    = arb.value("max_quantity", 0.0);

                        spdlog::info("ARB: {} buy={}@{:.2f} sell={}@{:.2f} net={:.2f} ({:.1f}bps)",
                                     symbol, buy_ex, buy_price, sell_ex, sell_price,
                                     arb.value("net_spread", 0.0), spread_bps);

                        if (arb_cb_ && spread_bps > 10.0 && max_qty > 0.001) {
                            arb_cb_(symbol, buy_ex, sell_ex, buy_price, sell_price, spread_bps,
                                    max_qty);
                        }
                    }
                }
            }
        }
    }

    std::string                 ws_url_;
    std::unique_ptr<WSClient>   client_;
    websocketpp::connection_hdl connection_;
    std::thread                 ws_thread_;
    std::atomic<bool>           connected_{false};
    std::atomic<bool>           trading_active_{true};
    std::atomic<bool>           should_reconnect_{false};
    int                         reconnect_delay_{1000}; // ms, exponential backoff up to 30s

    SignalCallback    signal_cb_;
    CandleCallback    candle_cb_;
    ArbitrageCallback arb_cb_;

    mutable std::mutex      mutex_; // Used only for condition_variable
    std::condition_variable cv_;
    std::atomic<bool>       has_new_data_{false};
    mutable Spinlock        data_lock_; // Protects prices_, order_books_, candle_history_
    std::unordered_map<std::string, double>              prices_;
    std::unordered_map<std::string, std::vector<Candle>> candle_history_;
    std::unordered_map<std::string, OrderBook>           order_books_;

    // Numeric ID-based fast path (array lookup, no string hash)
    std::unordered_map<std::string, uint16_t> symbol_to_id_;
    std::vector<std::string>                  id_to_symbol_;
    std::vector<double>                       prices_by_id_;
    std::vector<OrderBook>                    obs_by_id_;
    std::vector<std::vector<Candle>>          candles_by_id_;
};

} // namespace hft
