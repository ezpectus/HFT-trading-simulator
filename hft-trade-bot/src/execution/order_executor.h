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

namespace hft {

using json = nlohmann::json;
using WSClient = websocketpp::client<websocketpp::config::asio_tls_client>;
using MessageHandler = std::function<void(const json&)>;

class OrderExecutor {
public:
    OrderExecutor(const std::string& ws_url, const std::string& exchange_id)
        : ws_url_(ws_url), exchange_id_(exchange_id) {}

    bool connect() {
        try {
            client_.init_asio();
            client_.set_tls_init_handler([](websocketpp::connection_hdl) {
                return websocketpp::lib::make_shared<boost::asio::ssl::context>(
                    boost::asio::ssl::context::tlsv12);
            });

            websocketpp::lib::error_code ec;
            auto con = client_.get_connection(ws_url_, ec);
            if (ec) {
                spdlog::error("WebSocket connect error: {}", ec.message());
                return false;
            }

            client_.connect(con);
            connection_ = con->get_handle();

            // Run client in background thread
            ws_thread_ = std::thread([this]() { client_.run(); });
            connected_ = true;
            spdlog::info("OrderExecutor connected to {}", ws_url_);
            return true;
        } catch (const std::exception& e) {
            spdlog::error("OrderExecutor connect failed: {}", e.what());
            return false;
        }
    }

    void disconnect() {
        if (connected_) {
            client_.close(connection_, websocketpp::close::status::normal, "shutdown");
            if (ws_thread_.joinable()) ws_thread_.join();
            connected_ = false;
        }
    }

    // Submit order to exchange simulator
    void submit_order(const Signal& signal, double quantity, const OrderBook& ob) {
        if (!connected_) {
            spdlog::warn("Cannot submit order — not connected");
            return;
        }

        OrderType type = OrderTypeSelector::select(signal, ob);
        double price = 0.0;
        if (type == OrderType::LIMIT) {
            price = OrderTypeSelector::limit_price(signal.side(), ob);
        }

        json order_msg = {
            {"type", "order"},
            {"exchange", exchange_id_},
            {"symbol", signal.symbol},
            {"side", signal.is_long() ? "BUY" : "SELL"},
            {"quantity", quantity},
            {"order_type", type == OrderType::MARKET ? "MARKET" : "LIMIT"},
            {"stop_loss", signal.stop_loss},
            {"take_profit", signal.take_profit},
        };
        if (type == OrderType::LIMIT) {
            order_msg["price"] = price;
        }

        std::string msg = order_msg.dump();
        websocketpp::lib::error_code ec;
        client_.send(connection_, msg, websocketpp::frame::opcode::text, ec);
        if (ec) {
            spdlog::error("Failed to send order: {}", ec.message());
        } else {
            spdlog::info("Order sent: {} {} {:.4f} {} @ {:.2f}",
                signal.is_long() ? "BUY" : "SELL",
                signal.symbol, quantity, exchange_id_, signal.entry_price);
        }
    }

    // Close an existing position
    void close_position(const std::string& symbol) {
        if (!connected_) return;

        json msg = {
            {"type", "close_position"},
            {"exchange", exchange_id_},
            {"symbol", symbol},
        };

        websocketpp::lib::error_code ec;
        client_.send(connection_, msg.dump(), websocketpp::frame::opcode::text, ec);
        spdlog::info("Close position request: {} on {}", symbol, exchange_id_);
    }

    bool is_connected() const { return connected_; }

    // Execute arbitrage: buy on one exchange, sell on another
    void execute_arbitrage(const std::string& symbol,
                           const std::string& buy_exchange,
                           const std::string& sell_exchange,
                           double quantity,
                           double buy_price, double sell_price) {
        if (!connected_) {
            spdlog::warn("Cannot execute arbitrage — not connected");
            return;
        }

        // Buy on the cheaper exchange
        json buy_msg = {
            {"type", "order"},
            {"exchange", buy_exchange},
            {"symbol", symbol},
            {"side", "BUY"},
            {"quantity", quantity},
            {"order_type", "MARKET"},
        };

        // Sell on the more expensive exchange
        json sell_msg = {
            {"type", "order"},
            {"exchange", sell_exchange},
            {"symbol", symbol},
            {"side", "SELL"},
            {"quantity", quantity},
            {"order_type", "MARKET"},
        };

        websocketpp::lib::error_code ec;
        client_.send(connection_, buy_msg.dump(), websocketpp::frame::opcode::text, ec);
        if (ec) {
            spdlog::error("Arb buy order failed: {}", ec.message());
            return;
        }

        client_.send(connection_, sell_msg.dump(), websocketpp::frame::opcode::text, ec);
        if (ec) {
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
};

} // namespace hft
