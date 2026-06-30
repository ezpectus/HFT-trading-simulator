// Bybit Futures adapter — real exchange connectivity via WebSocket + REST.
//
// Market data: wss://stream.bybit.com/v5/public/linear
// Private:     wss://stream.bybit.com/v5/private
// Orders:      POST /v5/order/create (HMAC-SHA256 auth)
//
// Rate limits: 120 req/min for order creation, 600 req/min for queries
// Implements IExchange interface.
#pragma once

#include "../execution/smart_order_router_v2.h"
#include "../data/aligned_types.h"
#include "../utils/low_latency.h"
#include <string>
#include <unordered_map>
#include <atomic>
#include <chrono>

namespace hft {

class BybitAdapter : public ExchangeBase {
public:
    struct Config {
        std::string api_key;
        std::string api_secret;
        std::string base_url = "https://api.bybit.com";
        std::string ws_url = "wss://stream.bybit.com";
        std::string category = "linear";
    };

    explicit BybitAdapter(const Config& cfg)
        : ExchangeBase("bybit", 0.01, 0.06)  // 1 bps maker, 6 bps taker
        , config_(cfg)
    {}

    // IExchange interface
    double best_bid(const std::string& symbol) const override {
        std::lock_guard<Spinlock> lk(price_lock_);
        auto it = bids_.find(symbol);
        return it != bids_.end() ? it->second : 0.0;
    }

    double best_ask(const std::string& symbol) const override {
        std::lock_guard<Spinlock> lk(price_lock_);
        auto it = asks_.find(symbol);
        return it != asks_.end() ? it->second : 0.0;
    }

    double mid_price(const std::string& symbol) const override {
        return (best_bid(symbol) + best_ask(symbol)) / 2.0;
    }

    double bid_depth(const std::string& symbol, int levels) const override {
        std::lock_guard<Spinlock> lk(depth_lock_);
        auto it = bid_depth_.find(symbol);
        return it != bid_depth_.end() ? it->second : 0.0;
    }

    double ask_depth(const std::string& symbol, int levels) const override {
        std::lock_guard<Spinlock> lk(depth_lock_);
        auto it = ask_depth_.find(symbol);
        return it != ask_depth_.end() ? it->second : 0.0;
    }

    // Update from Bybit orderbook.50 stream
    void on_orderbook(const std::string& symbol,
                      double bid, double bid_sz,
                      double ask, double ask_sz) {
        std::lock_guard<Spinlock> lk(price_lock_);
        bids_[symbol] = bid;
        asks_[symbol] = ask;
        bid_depth_[symbol] = bid_sz;
        ask_depth_[symbol] = ask_sz;
    }

    // Build Bybit signature: HMAC-SHA256(timestamp + api_key + recv_window + param_str)
    std::string sign(const std::string& timestamp, int64_t recv_window,
                     const std::string& param_str) const;

    // Submit order
    struct OrderResult {
        bool success;
        std::string order_id;
        std::string order_link_id;  // Client order ID
        std::string status;
        double avg_price;
        double cum_exec_qty;
        std::string ret_code;
        std::string ret_msg;
    };

    OrderResult place_order(const std::string& symbol, const std::string& side,
                            const std::string& order_type, double qty,
                            double price = 0.0,
                            const std::string& time_in_force = "",
                            const std::string& order_link_id = "",
                            int64_t recv_window = 5000);

    OrderResult cancel_order(const std::string& symbol,
                             const std::string& order_id = "",
                             const std::string& order_link_id = "");

    // WebSocket subscription messages
    std::string subscribe_orderbook(const std::string& symbol) const {
        return R"({"op":"subscribe","args":["orderbook.50.)" +
               symbol + R"("]})";
    }

    std::string subscribe_ticker(const std::string& symbol) const {
        return R"({"op":"subscribe","args":["tickers.)" +
               symbol + R"("]})";
    }

    std::string subscribe_trades(const std::string& symbol) const {
        return R"({"op":"subscribe","args":["publicTrade.)" +
               symbol + R"("]})";
    }

    std::string subscribe_orders() const {
        return R"({"op":"subscribe","args":["order.create","order.update"]})";
    }

    // WebSocket auth message
    std::string auth_message(const std::string& api_key,
                             const std::string& timestamp,
                             const std::string& signature) const {
        return R"({"op":"auth","args":[")" + api_key + R"(",")" +
               timestamp + R"(",")" + signature + R"("]})";
    }

    const Config& config() const { return config_; }

private:
    Config config_;
    mutable Spinlock price_lock_;
    mutable Spinlock depth_lock_;
    std::unordered_map<std::string, double> bids_;
    std::unordered_map<std::string, double> asks_;
    std::unordered_map<std::string, double> bid_depth_;
    std::unordered_map<std::string, double> ask_depth_;
};

} // namespace hft
