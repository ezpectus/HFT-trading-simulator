// Signal receiver — WebSocket client that receives market data and AI signals
//
// Connects to:
// 1. Exchange simulator (ws://localhost:8765) — market data, order fills
// 2. AI Signal Bot signal publisher (ws://localhost:8766) — validated trading signals
#pragma once

#include "../data/signal.h"
#include "../data/types.h"
#include "../ipc/shm_fill_producer.h"
#include "../monitoring/system_monitor.h"
#include "../network/watchdog.h"
#include "../utils/low_latency.h"
#include "signal_receiver_data.h"
#include <atomic>
#include <condition_variable>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>
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

class SignalReceiver : private SignalReceiverData {
  public:
    using SignalCallback = std::function<void(const Signal&)>;
    using CandleCallback = std::function<void(const std::vector<Candle>&)>;
    using ArbitrageCallback =
        std::function<void(const std::string& symbol, const std::string& buy_exchange,
                           const std::string& sell_exchange, double buy_price, double sell_price,
                           double spread_bps, double max_quantity)>;
    // Fired for every order update: status is PENDING/FILLED/REJECTED/CANCELLED.
    using FillCallback =
        std::function<void(const std::string& symbol, const std::string& side,
                           const std::string& status, double qty, double price, double fee)>;
    // Fired with the raw "accounts" map ({exchange_id: account}) on every broadcast.
    using AccountCallback = std::function<void(const json& accounts)>;
    // Fired on order_cancelled (symbol, count=1) and orders_cancelled
    // (empty symbol = all symbols, count = orders cancelled).
    using OrderCancelledCallback = std::function<void(const std::string& symbol, int64_t count)>;

    explicit SignalReceiver(const std::string& ws_url)
        : ws_url_(ws_url), client_(std::make_unique<WSClient>()) {}

    void register_symbols(const std::vector<std::string>& symbols) {
        register_symbols_impl(symbols);
    }

    // The venue this bot trades on — market data is stored per
    // "exchange|symbol" and symbol-only accessors resolve to this exchange
    // (S252). Wire from Config::default_exchange at setup.
    void set_default_exchange(const std::string& ex) { set_default_exchange_impl(ex); }

    // Test/replay seam — feeds a decoded frame through the same dispatch the
    // websocket handler uses (mirrors inject_snapshot for the SHM path).
    void feed_frame_json(const json& data) { handle_message_json(data); }

    uint16_t symbol_id(const std::string& sym) const { return symbol_id_impl(sym); }

    double get_price_by_id(uint16_t id) const { return SignalReceiverData::get_price_by_id(id); }

    size_t get_candles_by_id(uint16_t id, size_t n, std::vector<Candle>& out) const {
        return SignalReceiverData::get_candles_by_id(id, n, out);
    }

    bool get_order_book_by_id(uint16_t id, OrderBook& out) const {
        return SignalReceiverData::get_order_book_by_id(id, out);
    }

    void inject_snapshot(uint16_t symbol_id, double bid, double ask, double last, double volume) {
        inject_snapshot_impl(symbol_id, bid, ask, last, volume);
    }

    // Batched inject — one data_lock_ acquisition for a whole sweep. The
    // callback receives an injector; the per-tick SHM poll used to re-take the
    // spinlock for every symbol.
    template <typename F> void inject_snapshots_scoped(F&& fill) {
        {
            std::lock_guard<Spinlock> lock(data_lock_);
            fill([this](uint16_t sid, double bid, double ask, double vol) {
                inject_snapshot_locked(sid, bid, ask, vol);
            });
        }
        has_new_data_.store(true, std::memory_order_release);
    }

    bool has_shm_data() const noexcept { return has_shm_data_impl(); }

    bool connect() {
        should_reconnect_ = true;
        watchdog_stop_.store(false, std::memory_order_relaxed);
        if (!watchdog_thread_.joinable()) {
            watchdog_thread_ = std::thread([this]() { watchdog_loop(); });
        }
        return do_connect();
    }

    bool do_connect() {
        try {
            set_client(std::make_shared<WSClient>());
            auto ep = client_snapshot();
            ep->init_asio();
            ep->set_open_handler([this](websocketpp::connection_hdl hdl) {
                set_conn(hdl); // copy — hdl is used again for the subscribe frame below
                connected_       = true;
                reconnect_delay_ = 1000;
                activity_watchdog_.feed();
                spdlog::info("SignalReceiver connected to {}", ws_url_);
                json sub = {
                    {"type", "subscribe"}, {"protocol_version", 2}, {"encoding", "msgpack"}};
                client_snapshot()->send(hdl, sub.dump(), websocketpp::frame::opcode::text);
            });
            ep->set_close_handler([this](websocketpp::connection_hdl) {
                connected_ = false;
                spdlog::warn("SignalReceiver disconnected");
                schedule_reconnect();
            });
            // Any inbound frame counts as liveness — data or protocol ping/pong.
            ep->set_ping_handler([this](websocketpp::connection_hdl, std::string) {
                activity_watchdog_.feed();
                return true; // still auto-pong
            });
            ep->set_pong_handler(
                [this](websocketpp::connection_hdl, std::string) { activity_watchdog_.feed(); });
            ep->set_message_handler([this](websocketpp::connection_hdl, WSClient::message_ptr msg) {
                activity_watchdog_.feed();
                try {
                    if (msg->get_opcode() == websocketpp::frame::opcode::binary) {
                        const auto& bin  = msg->get_payload();
                        auto        data = json::from_msgpack(bin);
                        handle_message_json(data);
                    } else {
                        handle_message(msg->get_payload());
                    }
                } catch (const std::exception& e) {
                    // S244: one malformed frame must not kill the process —
                    // websocketpp invokes this handler unguarded, so an escape
                    // here is std::terminate on ws_thread_.
                    spdlog::warn("SignalReceiver dropped unparseable frame: {}", e.what());
                }
            });
            websocketpp::lib::error_code ec;
            auto                         con = ep->get_connection(ws_url_, ec);
            if (ec) {
                spdlog::error("SignalReceiver connect error: {}", ec.message());
                return false;
            }
            ep->connect(con);
            // Last-resort guard (S244): any exception escaping client->run()
            // would terminate the process — catch, log, let close/reconnect
            // handlers drive recovery.
            ws_thread_ = std::thread([this]() {
                try {
                    client_snapshot()->run();
                } catch (const std::exception& e) {
                    spdlog::error("SignalReceiver ws thread died: {}", e.what());
                    connected_ = false;
                    schedule_reconnect();
                }
            });
            return true;
        } catch (const std::exception& e) {
            spdlog::error("SignalReceiver connect failed: {}", e.what());
            return false;
        }
    }

    void disconnect() {
        should_reconnect_ = false;
        watchdog_stop_.store(true, std::memory_order_relaxed);
        {
            // Cancel + join any in-flight reconnect sleeper BEFORE tearing the
            // socket down — it must not touch `this` after destruction.
            std::lock_guard<std::mutex> lk(reconnect_mtx_);
            reconnect_cancel_.store(true, std::memory_order_relaxed);
            reconnect_cv_.notify_all();
            if (reconnect_thread_.joinable()) reconnect_thread_.join();
        }
        if (connected_) {
            client_snapshot()->close(conn_snapshot(), websocketpp::close::status::normal,
                                     "shutdown");
        }
        if (ws_thread_.joinable()) ws_thread_.join();
        if (watchdog_thread_.joinable()) watchdog_thread_.join();
        connected_ = false;
    }

    void on_signal(SignalCallback cb) { signal_cb_ = std::move(cb); }
    void on_candles(CandleCallback cb) { candle_cb_ = std::move(cb); }
    void on_arbitrage(ArbitrageCallback cb) { arb_cb_ = std::move(cb); }
    void on_fill(FillCallback cb) { fill_cb_ = std::move(cb); }
    void on_account(AccountCallback cb) { account_cb_ = std::move(cb); }
    void on_order_cancelled(OrderCancelledCallback cb) { order_cancelled_cb_ = std::move(cb); }

    // Non-owning — producer lives in BotContext (bot_setup wires it after init).
    void set_fill_producer(ipc::ShmFillProducer* p) { fill_producer_ = p; }

    bool is_connected() const { return connected_; }

    // S246: feed-age + monitor hooks so /health and hft_* counters reflect
    // real socket state instead of defaults.
    uint64_t last_activity_ms() const { return activity_watchdog_.idle_ms(); }
    void     set_monitor(SystemMonitor* m) { monitor_ = m; }
    bool     is_trading_active() const { return trading_active_.load(std::memory_order_relaxed); }

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

    double get_price(const std::string& symbol) const { return get_price_impl(symbol); }
    double get_best_bid(const std::string& symbol) const { return get_best_bid_impl(symbol); }
    double get_best_ask(const std::string& symbol) const { return get_best_ask_impl(symbol); }

    double get_mid_price(const std::string& symbol) const {
        double bid = get_best_bid_impl(symbol);
        double ask = get_best_ask_impl(symbol);
        if (bid == 0.0 || ask == 0.0) return 0.0;
        return (bid + ask) / 2.0;
    }

    double get_bid_depth(const std::string& symbol, int levels) const {
        return get_bid_depth_impl(symbol, levels);
    }

    double get_ask_depth(const std::string& symbol, int levels) const {
        return get_ask_depth_impl(symbol, levels);
    }

    size_t get_all_prices_into(std::unordered_map<std::string, double>& out) const {
        return get_all_prices_into_impl(out);
    }

    std::unordered_map<std::string, double> get_all_prices() const { return get_all_prices_impl(); }

    std::vector<Candle> get_candles(const std::string& symbol, size_t n = 100) const {
        return get_candles_impl(symbol, n);
    }

    size_t get_candles_into(const std::string& symbol, size_t n, std::vector<Candle>& out) const {
        return get_candles_into_impl(symbol, n, out);
    }

    OrderBook get_order_book(const std::string& symbol) const {
        return get_order_book_impl(symbol);
    }

    bool get_order_book_into(const std::string& symbol, OrderBook& out) const {
        return get_order_book_into_impl(symbol, out);
    }

  private:
#include "signal_receiver_handlers.h"

    // Snapshot/replace the client under the mutex — do_connect can swap it
    // while watchdog/send threads hold a live shared_ptr to the old one.
    std::shared_ptr<WSClient> client_snapshot() {
        std::lock_guard<std::mutex> lk(client_mtx_);
        return client_;
    }
    void set_client(std::shared_ptr<WSClient> c) {
        std::lock_guard<std::mutex> lk(client_mtx_);
        client_ = std::move(c);
    }
    websocketpp::connection_hdl conn_snapshot() {
        std::lock_guard<std::mutex> lk(client_mtx_);
        return connection_;
    }
    void set_conn(websocketpp::connection_hdl h) {
        std::lock_guard<std::mutex> lk(client_mtx_);
        connection_ = std::move(h);
    }

    void schedule_reconnect() {
        if (!should_reconnect_) return;
        // Callable from the asio close-handler AND the watchdog thread — the
        // mutex serializes delay-computation so two events can't double-schedule.
        std::lock_guard<std::mutex> lk(reconnect_mtx_);
        int                         delay = reconnect_delay_.load(std::memory_order_relaxed);
        spdlog::info("Reconnecting in {}ms...", delay);
        reconnect_delay_.store(std::min(delay * 2, 30000), std::memory_order_relaxed);
        // A newer schedule supersedes an in-flight sleeper: cancel wakes it,
        // join before reassigning (assignment over a joinable thread is
        // std::terminate). Joined in disconnect() too — no detached thread
        // can outlive this object.
        reconnect_cancel_.store(true, std::memory_order_relaxed);
        reconnect_cv_.notify_all();
        if (reconnect_thread_.joinable()) reconnect_thread_.join();
        reconnect_cancel_.store(false, std::memory_order_relaxed);
        reconnect_thread_ = std::thread([this, delay]() {
            std::unique_lock<std::mutex> clk(reconnect_cv_mtx_);
            reconnect_cv_.wait_for(clk, std::chrono::milliseconds(delay),
                                   [this] { return reconnect_cancel_.load(); });
            clk.unlock();
            if (should_reconnect_ && !reconnect_cancel_.load(std::memory_order_relaxed)) {
                if (monitor_) monitor_->increment(SystemMonitor::Metric::RECONNECTS);
                if (ws_thread_.joinable()) ws_thread_.join();
                do_connect();
            }
        });
    }

    // Stale-connection watchdog: the sim pings every 10s and broadcasts every
    // 1s — 15s without ANY inbound frame means a dead TCP peer (no close frame).
    // terminate() tears the socket down, which fires the normal
    // close→schedule_reconnect path above.
    void watchdog_loop() {
        while (!watchdog_stop_.load(std::memory_order_relaxed)) {
            std::this_thread::sleep_for(std::chrono::seconds(2));
            if (watchdog_stop_.load(std::memory_order_relaxed)) break;
            if (!connected_.load(std::memory_order_relaxed)) continue;
            if (!activity_watchdog_.is_alive()) {
                spdlog::warn("SignalReceiver stale ({}ms silent) — forcing reconnect",
                             activity_watchdog_.idle_ms());
                if (monitor_) monitor_->increment(SystemMonitor::Metric::HEARTBEATS_MISSED);
                activity_watchdog_.feed(); // don't re-trip while teardown runs
                websocketpp::lib::error_code ec;
                auto con = client_snapshot()->get_con_from_hdl(conn_snapshot(), ec);
                if (ec) {
                    // Handle already dead — no close event will fire; drive
                    // the reconnect ourselves.
                    connected_ = false;
                    schedule_reconnect();
                } else {
                    con->terminate(ec);
                    if (ec) {
                        spdlog::warn("Stale terminate failed: {}", ec.message());
                        connected_ = false;
                        schedule_reconnect();
                    }
                }
            }
        }
    }

    std::string               ws_url_;
    std::shared_ptr<WSClient> client_; // guarded by client_mtx_
    std::mutex                client_mtx_;
    // Guarded by client_mtx_ like client_ — non-atomic hdl published by the
    // open-handler while watchdog/disconnect read it after a relaxed
    // connected_ load had no formal happens-before (S336, sibling of the
    // order_executor.h fix).
    websocketpp::connection_hdl connection_;
    std::thread                 ws_thread_;
    std::thread                 watchdog_thread_;
    std::atomic<bool>           watchdog_stop_{false};
    net::Watchdog               activity_watchdog_{15000};
    std::atomic<bool>           connected_{false};
    std::atomic<bool>           trading_active_{true};
    std::atomic<bool>           should_reconnect_{false};
    std::atomic<int>            reconnect_delay_{1000};
    std::mutex                  reconnect_mtx_;
    std::thread                 reconnect_thread_;
    std::atomic<bool>           reconnect_cancel_{false};
    std::mutex                  reconnect_cv_mtx_;
    std::condition_variable     reconnect_cv_;

    SignalCallback         signal_cb_;
    CandleCallback         candle_cb_;
    ArbitrageCallback      arb_cb_;
    FillCallback           fill_cb_;
    AccountCallback        account_cb_;
    OrderCancelledCallback order_cancelled_cb_;

    ipc::ShmFillProducer* fill_producer_{nullptr};
    SystemMonitor*        monitor_{nullptr};
};

} // namespace hft
