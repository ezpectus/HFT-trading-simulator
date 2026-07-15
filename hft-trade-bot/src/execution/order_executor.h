// Order executor — sends orders to the exchange simulator via WebSocket
#pragma once

#include "../data/types.h"
#include "../data/signal.h"
#include "order_type_selector.h"
#include <websocketpp/client.hpp>
#include <websocketpp/config/asio_client.hpp>
#include <nlohmann/json.hpp>
#include <string>
#include <functional>
#include <mutex>
#include <atomic>
#include <cstdio>

namespace hft {

using json = nlohmann::json;
using WSClient = websocketpp::client<websocketpp::config::asio_client>;
using MessageHandler = std::function<void(const json&)>;

class OrderExecutor {
public:
    OrderExecutor(const std::string& ws_url, const std::string& exchange_id)
        : ws_url_(ws_url), exchange_id_(exchange_id) {}

    bool connect() {
        should_reconnect_ = true;
        return do_connect();
    }

    bool do_connect() {
        try {
            client_.init_asio();

            client_.set_open_handler([this](websocketpp::connection_hdl hdl) {
                connection_ = hdl;
                connected_ = true;
                reconnect_delay_ = 1000;
                spdlog::info("OrderExecutor connected to {}", ws_url_);
            });

            client_.set_close_handler([this](websocketpp::connection_hdl) {
                connected_ = false;
                spdlog::warn("OrderExecutor disconnected");
                if (should_reconnect_) {
                    spdlog::info("Reconnecting in {}ms...", reconnect_delay_);
                    auto delay = reconnect_delay_;
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

            websocketpp::lib::error_code ec;
            auto con = client_.get_connection(ws_url_, ec);
            if (ec) {
                spdlog::error("WebSocket connect error: {}", ec.message());
                return false;
            }

            client_.connect(con);

            // Run client in background thread
            ws_thread_ = std::thread([this]() { client_.run(); });
            return true;
        } catch (const std::exception& e) {
            spdlog::error("OrderExecutor connect failed: {}", e.what());
            return false;
        }
    }

    void disconnect() {
        should_reconnect_ = false;
        if (connected_) {
            client_.close(connection_, websocketpp::close::status::normal, "shutdown");
        }
        if (ws_thread_.joinable()) ws_thread_.join();
        connected_ = false;
    }

    // Submit order to exchange simulator
    void submit_order(const Signal& signal, double quantity, const OrderBook& ob) {
        if (!connected_) [[unlikely]] {
            spdlog::warn("Cannot submit order — not connected");
            return;
        }

        OrderType type = OrderTypeSelector::select(signal, ob);
        double price = 0.0;
        if (type == OrderType::LIMIT) {
            price = OrderTypeSelector::limit_price(signal.side(), ob);
        }

        // Fast path: manual JSON serialization (avoids nlohmann/json heap alloc)
        char buf[512];
        int n = std::snprintf(buf, sizeof(buf),
            "{\"type\":\"order\",\"exchange\":\"%s\",\"symbol\":\"%s\","
            "\"side\":\"%s\",\"quantity\":%.8f,\"order_type\":\"%s\","
            "\"stop_loss\":%.2f,\"take_profit\":%.2f",
            exchange_id_.c_str(), signal.symbol.c_str(),
            signal.is_long() ? "BUY" : "SELL",
            quantity,
            type == OrderType::MARKET ? "MARKET" : "LIMIT",
            signal.stop_loss, signal.take_profit);

        if (type == OrderType::LIMIT && n > 0 && n < static_cast<int>(sizeof(buf) - 32)) {
            n += std::snprintf(buf + n, sizeof(buf) - n, ",\"price\":%.2f", price);
        }
        if (n > 0 && n < static_cast<int>(sizeof(buf) - 2)) {
            buf[n++] = '}';
            buf[n] = '\0';
        }

        websocketpp::lib::error_code ec;
        client_.send(connection_, std::string(buf, n), websocketpp::frame::opcode::text, ec);
        if (ec) [[unlikely]] {
            spdlog::error("Failed to send order: {}", ec.message());
        } else {
            spdlog::info("Order sent: {} {} {:.4f} {} @ {:.2f}",
                signal.is_long() ? "BUY" : "SELL",
                signal.symbol, quantity, exchange_id_, signal.entry_price);
        }
    }

    // Close an existing position — manual JSON to avoid heap alloc
    void close_position(const std::string& symbol) {
        if (!connected_) [[unlikely]] return;

        char buf[256];
        int n = std::snprintf(buf, sizeof(buf),
            "{\"type\":\"close_position\",\"exchange\":\"%s\",\"symbol\":\"%s\"}",
            exchange_id_.c_str(), symbol.c_str());

        websocketpp::lib::error_code ec;
        client_.send(connection_, std::string(buf, n), websocketpp::frame::opcode::text, ec);
        spdlog::info("Close position request: {} on {}", symbol, exchange_id_);
    }

    bool is_connected() const { return connected_; }

    // Execute arbitrage: buy on one exchange, sell on another
    // Manual JSON serialization — avoids 2x nlohmann::json heap allocations
    void execute_arbitrage(const std::string& symbol,
                           const std::string& buy_exchange,
                           const std::string& sell_exchange,
                           double quantity,
                           double buy_price, double sell_price) {
        if (!connected_) [[unlikely]] {
            spdlog::warn("Cannot execute arbitrage — not connected");
            return;
        }

        // Buy on the cheaper exchange — snprintf to stack buffer
        char buy_buf[384];
        int bn = std::snprintf(buy_buf, sizeof(buy_buf),
            "{\"type\":\"order\",\"exchange\":\"%s\",\"symbol\":\"%s\","
            "\"side\":\"BUY\",\"quantity\":%.8f,\"order_type\":\"MARKET\"}",
            buy_exchange.c_str(), symbol.c_str(), quantity);

        // Sell on the more expensive exchange
        char sell_buf[384];
        int sn = std::snprintf(sell_buf, sizeof(sell_buf),
            "{\"type\":\"order\",\"exchange\":\"%s\",\"symbol\":\"%s\","
            "\"side\":\"SELL\",\"quantity\":%.8f,\"order_type\":\"MARKET\"}",
            sell_exchange.c_str(), symbol.c_str(), quantity);

        websocketpp::lib::error_code ec;
        client_.send(connection_, std::string(buy_buf, bn), websocketpp::frame::opcode::text, ec);
        if (ec) [[unlikely]] {
            spdlog::error("Arb buy order failed: {}", ec.message());
            return;
        }

        client_.send(connection_, std::string(sell_buf, sn), websocketpp::frame::opcode::text, ec);
        if (ec) [[unlikely]] {
            spdlog::error("Arb sell order failed: {}", ec.message());
            return;
        }

        double est_profit = (sell_price - buy_price) * quantity;
        spdlog::info("ARB EXECUTED: {} buy={}@{:.2f} sell={}@{:.2f} qty={:.4f} est_profit={:.2f}",
            symbol, buy_exchange, buy_price, sell_exchange, sell_price, quantity, est_profit);
    }

private:
    std::string ws_url_;
    std::string exchange_id_;
    WSClient client_;
    websocketpp::connection_hdl connection_;
    std::thread ws_thread_;
    std::atomic<bool> connected_{false};
    std::atomic<bool> should_reconnect_{false};
    int reconnect_delay_{1000}; // ms, exponential backoff up to 30s
};

} // namespace hft
