// Order executor — sends orders to the exchange simulator via WebSocket
#pragma once

#include "../data/aligned_types.h"
#include "../data/signal.h"
#include "../data/types.h"
#include "../monitoring/system_monitor.h"
#include "../network/watchdog.h"
#include "order_type_selector.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <functional>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>
#include <string>
#include <thread>
#include <websocketpp/client.hpp>
#include <websocketpp/config/asio_client.hpp>

namespace hft {

using json           = nlohmann::json;
using WSClient       = websocketpp::client<websocketpp::config::asio_client>;
using MessageHandler = std::function<void(const json&)>;

class OrderExecutor {
  public:
    OrderExecutor(const std::string& ws_url, const std::string& exchange_id)
        : ws_url_(ws_url), exchange_id_(exchange_id), client_(std::make_unique<WSClient>()) {}

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
            // Recreate client on each connect — websocketpp init_asio() must not
            // be called twice. Stored atomically: submit/watchdog threads take
            // lock-free snapshots, so a swap can never dangle a live deref.
            set_client(std::make_shared<WSClient>());
            client_snapshot()->init_asio();

            auto ep = client_snapshot();
            ep->set_open_handler([this](websocketpp::connection_hdl hdl) {
                set_conn(std::move(hdl));
                connected_ = true;
                activity_watchdog_.feed();
                reconnect_delay_.store(1000, std::memory_order_relaxed);
                spdlog::info("OrderExecutor connected to {}", ws_url_);
                // Control-plane auth must precede order sends — the sim gates
                // order/cancel/close commands behind EXCHANGE_CONTROL_TOKEN.
                if (const char* tok = std::getenv("EXCHANGE_CONTROL_TOKEN"); tok && *tok) {
                    char auth_buf[320];
                    int  m = std::snprintf(auth_buf, sizeof(auth_buf),
                                           "{\"type\":\"auth\",\"token\":\"%s\"}", tok);
                    if (m > 0 && m < static_cast<int>(sizeof(auth_buf))) {
                        websocketpp::lib::error_code auth_ec;
                        client_snapshot()->send(conn_snapshot(), std::string(auth_buf, m),
                                                websocketpp::frame::opcode::text, auth_ec);
                        if (auth_ec) {
                            spdlog::error("Failed to send auth frame: {}", auth_ec.message());
                        }
                    }
                }
            });

            ep->set_close_handler([this](websocketpp::connection_hdl) {
                connected_ = false;
                spdlog::warn("OrderExecutor disconnected");
                schedule_reconnect();
            });

            // This socket carries no inbound data stream — protocol pings from
            // the server (10s cadence) are the only liveness signal.
            ep->set_ping_handler([this](websocketpp::connection_hdl, std::string) {
                activity_watchdog_.feed();
                return true;
            });
            ep->set_pong_handler(
                [this](websocketpp::connection_hdl, std::string) { activity_watchdog_.feed(); });

            websocketpp::lib::error_code ec;
            auto                         con = ep->get_connection(ws_url_, ec);
            if (ec) {
                spdlog::error("WebSocket connect error: {}", ec.message());
                return false;
            }

            ep->connect(con);

            // Run client in background thread
            ws_thread_ = std::thread([this]() { client_snapshot()->run(); });
            return true;
        } catch (const std::exception& e) {
            spdlog::error("OrderExecutor connect failed: {}", e.what());
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

    // Submit order to exchange simulator. Returns true only if the order
    // bytes were handed to the WebSocket — callers must not book a local
    // position on false.
    bool submit_order(const Signal& signal, double quantity, const OrderBook& ob) {
        if (!connected_) [[unlikely]] {
            spdlog::warn("Cannot submit order — not connected");
            return false;
        }
        if (!signal.is_actionable()) [[unlikely]] {
            spdlog::debug("Skipping order — signal is NEUTRAL for {}", signal.symbol);
            return false;
        }

        OrderType type  = OrderTypeSelector::select(signal, ob);
        double    price = 0.0;
        if (type == OrderType::LIMIT) {
            price = OrderTypeSelector::limit_price(signal.side(), ob);
        }

        // Fast path: manual JSON serialization (avoids nlohmann/json heap alloc)
        char buf[512];
        int  n = std::snprintf(
            buf, sizeof(buf),
            "{\"type\":\"order\",\"exchange\":\"%s\",\"symbol\":\"%s\","
             "\"side\":\"%s\",\"quantity\":%.8f,\"order_type\":\"%s\","
             "\"stop_loss\":%.2f,\"take_profit\":%.2f,"
             "\"client_order_id\":\"hft_%s_%lld\"",
            exchange_id_.c_str(), signal.symbol.c_str(), signal.is_long() ? "BUY" : "SELL",
            quantity, type == OrderType::MARKET ? "MARKET" : "LIMIT", signal.stop_loss,
            signal.take_profit, signal.symbol.c_str(), static_cast<long long>(signal.timestamp));

        if (type == OrderType::LIMIT && n > 0 && n < static_cast<int>(sizeof(buf) - 32)) {
            n += std::snprintf(buf + n, sizeof(buf) - n, ",\"price\":%.2f", price);
        }
        if (n <= 0) [[unlikely]] {
            spdlog::error("Order JSON serialization failed");
            return false;
        }
        if (n >= static_cast<int>(sizeof(buf))) [[unlikely]] {
            spdlog::error("Order JSON truncated: exchange={}, symbol={} exceeds {} byte buffer",
                          exchange_id_, signal.symbol, sizeof(buf));
            return false;
        }
        if (n < static_cast<int>(sizeof(buf) - 2)) {
            buf[n++] = '}';
            buf[n]   = '\0';
        }

        websocketpp::lib::error_code ec;
        client_snapshot()->send(conn_snapshot(), std::string(buf, static_cast<size_t>(n)),
                                websocketpp::frame::opcode::text, ec);
        if (ec) [[unlikely]] {
            spdlog::error("Failed to send order: {}", ec.message());
            return false;
        }
        spdlog::info("Order sent: {} {} {:.4f} {} @ {:.2f}", signal.is_long() ? "BUY" : "SELL",
                     signal.symbol, quantity, exchange_id_, signal.entry_price);
        return true;
    }

    // Submit with an explicit adaptive kind — the selector's TIF/expiry/post-only
    // intent is serialized onto the wire (S154). The sim honours IOC/FOK
    // (cancel if not marketable), GTD (rest until expire_ms) and post_only
    // (reject if marketable).
    bool submit_order(const Signal& signal, double quantity, const OrderBook& ob,
                      FastOrder::OrderKind kind, double limit_price, int64_t expire_ns) {
        if (kind == FastOrder::OrderKind::MARKET) {
            return submit_order(signal, quantity, ob);
        }
        if (!connected_) [[unlikely]] {
            spdlog::warn("Cannot submit order — not connected");
            return false;
        }
        if (!signal.is_actionable()) [[unlikely]] {
            return false;
        }
        const char*  tif       = kind == FastOrder::OrderKind::LIMIT_IOC   ? "IOC"
                                 : kind == FastOrder::OrderKind::LIMIT_FOK ? "FOK"
                                 : kind == FastOrder::OrderKind::LIMIT_GTD ? "GTD"
                                                                           : "GTC";
        const bool   post_only = (kind == FastOrder::OrderKind::POST_ONLY);
        const double price     = limit_price > 0 ? limit_price : signal.entry_price;

        char buf[640];
        int  n = std::snprintf(
            buf, sizeof(buf),
            "{\"type\":\"order\",\"exchange\":\"%s\",\"symbol\":\"%s\","
             "\"side\":\"%s\",\"quantity\":%.8f,\"order_type\":\"LIMIT\",\"price\":%.2f,"
             "\"stop_loss\":%.2f,\"take_profit\":%.2f,\"time_in_force\":\"%s\","
             "\"post_only\":%s,\"client_order_id\":\"hft_%s_%lld\"",
            exchange_id_.c_str(), signal.symbol.c_str(), signal.is_long() ? "BUY" : "SELL",
            quantity, price, signal.stop_loss, signal.take_profit, tif,
            post_only ? "true" : "false", signal.symbol.c_str(),
            static_cast<long long>(signal.timestamp));
        if (kind == FastOrder::OrderKind::LIMIT_GTD && expire_ns > 0 && n > 0 &&
            n < static_cast<int>(sizeof(buf) - 32)) {
            n += std::snprintf(buf + n, sizeof(buf) - n, ",\"expire_ms\":%lld",
                               static_cast<long long>(expire_ns / 1000000LL));
        }
        if (n <= 0 || n >= static_cast<int>(sizeof(buf) - 2)) [[unlikely]] {
            spdlog::error("Order JSON serialization/truncation failed for {}", signal.symbol);
            return false;
        }
        buf[n++] = '}';
        buf[n]   = '\0';

        websocketpp::lib::error_code ec;
        client_snapshot()->send(conn_snapshot(), std::string(buf, static_cast<size_t>(n)),
                                websocketpp::frame::opcode::text, ec);
        if (ec) [[unlikely]] {
            spdlog::error("Failed to send order: {}", ec.message());
            return false;
        }
        spdlog::info("Order sent: {} {} {:.4f} {} @ {:.2f} tif={}{}",
                     signal.is_long() ? "BUY" : "SELL", signal.symbol, quantity, exchange_id_,
                     price, tif, post_only ? " post_only" : "");
        return true;
    }

    // Close an existing position — manual JSON to avoid heap alloc.
    // Returns true only if the close request was handed to the WebSocket.
    bool close_position(const std::string& symbol) {
        if (!connected_) [[unlikely]] {
            spdlog::warn("Cannot close position — not connected: {}", symbol);
            return false;
        }

        char buf[256];
        int  n = std::snprintf(buf, sizeof(buf),
                               "{\"type\":\"close_position\",\"exchange\":\"%s\",\"symbol\":\"%s\"}",
                               exchange_id_.c_str(), symbol.c_str());

        if (n <= 0) [[unlikely]] {
            spdlog::error("Close position JSON serialization failed");
            return false;
        }

        websocketpp::lib::error_code ec;
        client_snapshot()->send(conn_snapshot(), std::string(buf, static_cast<size_t>(n)),
                                websocketpp::frame::opcode::text, ec);
        if (ec) [[unlikely]] {
            spdlog::error("Failed to send close request for {}: {}", symbol, ec.message());
            return false;
        }
        spdlog::info("Close position request: {} on {}", symbol, exchange_id_);
        return true;
    }

    // Cancel every resting order on the exchange — kill-switch path.
    // Returns true only if the request was handed to the WebSocket.
    bool cancel_all_orders() {
        if (!connected_) [[unlikely]] {
            spdlog::warn("Cannot cancel orders — not connected");
            return false;
        }

        char buf[256];
        int  n =
            std::snprintf(buf, sizeof(buf), "{\"type\":\"cancel_all_orders\",\"exchange\":\"%s\"}",
                          exchange_id_.c_str());

        if (n <= 0) [[unlikely]] {
            spdlog::error("Cancel-all JSON serialization failed");
            return false;
        }

        websocketpp::lib::error_code ec;
        client_snapshot()->send(conn_snapshot(), std::string(buf, static_cast<size_t>(n)),
                                websocketpp::frame::opcode::text, ec);
        if (ec) [[unlikely]] {
            spdlog::error("Failed to send cancel-all: {}", ec.message());
            return false;
        }
        spdlog::info("Cancel-all-orders request sent on {}", exchange_id_);
        return true;
    }

    bool is_connected() const { return connected_; }

    // S246: expose channel age + metric sink so /health and hft_* counters
    // reflect the executor socket instead of defaults.
    uint64_t last_activity_ms() const { return activity_watchdog_.idle_ms(); }
    void     set_monitor(SystemMonitor* m) { monitor_ = m; }

    // Execute arbitrage: buy on one exchange, sell on another
    // Manual JSON serialization — avoids 2x nlohmann::json heap allocations
    bool execute_arbitrage(const std::string& symbol, const std::string& buy_exchange,
                           const std::string& sell_exchange, double quantity, double buy_price,
                           double sell_price) {
        if (!connected_) [[unlikely]] {
            spdlog::warn("Cannot execute arbitrage — not connected");
            return false;
        }

        // Buy on the cheaper exchange — snprintf to stack buffer
        char buy_buf[384];
        int  bn = std::snprintf(buy_buf, sizeof(buy_buf),
                                "{\"type\":\"order\",\"exchange\":\"%s\",\"symbol\":\"%s\","
                                 "\"side\":\"BUY\",\"quantity\":%.8f,\"order_type\":\"MARKET\"}",
                                buy_exchange.c_str(), symbol.c_str(), quantity);

        // Sell on the more expensive exchange
        char sell_buf[384];
        int  sn = std::snprintf(sell_buf, sizeof(sell_buf),
                                "{\"type\":\"order\",\"exchange\":\"%s\",\"symbol\":\"%s\","
                                 "\"side\":\"SELL\",\"quantity\":%.8f,\"order_type\":\"MARKET\"}",
                                sell_exchange.c_str(), symbol.c_str(), quantity);

        if (bn <= 0) [[unlikely]] {
            spdlog::error("Arb buy JSON serialization failed");
            return false;
        }

        websocketpp::lib::error_code ec;
        client_snapshot()->send(conn_snapshot(), std::string(buy_buf, static_cast<size_t>(bn)),
                                websocketpp::frame::opcode::text, ec);
        if (ec) [[unlikely]] {
            spdlog::error("Arb buy order failed: {}", ec.message());
            return false;
        }

        // Buy leg is out — if the sell leg fails for any reason, unwind the
        // naked long with a single market sell back on the buy exchange.
        auto unwind_buy_leg = [&](const char* reason) {
            spdlog::warn("Arb sell leg failed ({}), unwinding buy leg: SELL {} {:.4f} on {}",
                         reason, symbol, quantity, buy_exchange);
            char                         unwind_buf[384];
            int                          un = std::snprintf(unwind_buf, sizeof(unwind_buf),
                                                            "{\"type\":\"order\",\"exchange\":\"%s\",\"symbol\":\"%s\","
                                                                                     "\"side\":\"SELL\",\"quantity\":%.8f,\"order_type\":\"MARKET\"}",
                                                            buy_exchange.c_str(), symbol.c_str(), quantity);
            websocketpp::lib::error_code uec;
            if (un > 0 && un < static_cast<int>(sizeof(unwind_buf))) {
                client_snapshot()->send(conn_snapshot(),
                                        std::string(unwind_buf, static_cast<size_t>(un)),
                                        websocketpp::frame::opcode::text, uec);
            }
            if (un <= 0 || uec) {
                spdlog::critical("ARB UNWIND FAILED — NAKED LONG POSITION: {} {:.4f} on {} "
                                 "requires manual intervention",
                                 symbol, quantity, buy_exchange);
            }
        };

        if (sn <= 0) [[unlikely]] {
            unwind_buy_leg("sell JSON serialization failed");
            return false;
        }

        client_snapshot()->send(conn_snapshot(), std::string(sell_buf, static_cast<size_t>(sn)),
                                websocketpp::frame::opcode::text, ec);
        if (ec) [[unlikely]] {
            unwind_buy_leg(ec.message().c_str());
            return false;
        }

        double est_profit = (sell_price - buy_price) * quantity;
        spdlog::info("ARB EXECUTED: {} buy={}@{:.2f} sell={}@{:.2f} qty={:.4f} est_profit={:.2f}",
                     symbol, buy_exchange, buy_price, sell_exchange, sell_price, quantity,
                     est_profit);
        return true;
    }

  private:
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
        // mutex serializes reconnect_thread_ join/assign.
        std::lock_guard<std::mutex> lk(reconnect_mtx_);
        int                         delay = reconnect_delay_.load(std::memory_order_relaxed);
        spdlog::info("Reconnecting in {}ms...", delay);
        reconnect_delay_.store(std::min(delay * 2, 30000), std::memory_order_relaxed);
        // A newer schedule supersedes an in-flight sleeper: cancel wakes it so
        // the join doesn't stall the caller for the whole backoff window.
        // Joined in disconnect() too — no sleeper outlives this object.
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

    // Stale-connection watchdog: a dead TCP peer sends no close frame — 15s
    // without any inbound frame (server pings every 10s) means the socket is
    // silently dead. terminate() fires the normal close→schedule_reconnect path.
    void watchdog_loop() {
        while (!watchdog_stop_.load(std::memory_order_relaxed)) {
            std::this_thread::sleep_for(std::chrono::seconds(2));
            if (watchdog_stop_.load(std::memory_order_relaxed)) break;
            if (!connected_.load(std::memory_order_relaxed)) continue;
            if (!activity_watchdog_.is_alive()) {
                spdlog::warn("OrderExecutor stale ({}ms silent) — forcing reconnect",
                             activity_watchdog_.idle_ms());
                if (monitor_) monitor_->increment(SystemMonitor::Metric::HEARTBEATS_MISSED);
                activity_watchdog_.feed(); // don't re-trip while teardown runs
                websocketpp::lib::error_code ec;
                auto con = client_snapshot()->get_con_from_hdl(conn_snapshot(), ec);
                if (ec) {
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
    std::string               exchange_id_;
    std::shared_ptr<WSClient> client_; // guarded by client_mtx_
    std::mutex                client_mtx_;
    // Guarded by client_mtx_ like client_: the hdl is a non-atomic multi-word
    // handle, and readers gated on a relaxed connected_ load had no formal
    // happens-before with the open-handler's write — torn/stale hdl reads
    // were UB on weak-memory targets (S336). Snapshot it under the mutex;
    // connected_ stays a lock-free advisory gate.
    websocketpp::connection_hdl connection_;
    std::thread                 ws_thread_;
    std::thread                 reconnect_thread_;
    std::thread                 watchdog_thread_;
    std::atomic<bool>           watchdog_stop_{false};
    net::Watchdog               activity_watchdog_{15000};
    std::atomic<bool>           connected_{false};
    std::atomic<bool>           should_reconnect_{false};
    std::atomic<int>            reconnect_delay_{1000}; // ms, exponential backoff up to 30s
    std::mutex                  reconnect_mtx_;
    std::atomic<bool>           reconnect_cancel_{false};
    std::mutex                  reconnect_cv_mtx_;
    std::condition_variable     reconnect_cv_;
    SystemMonitor*              monitor_{nullptr};
};

} // namespace hft
