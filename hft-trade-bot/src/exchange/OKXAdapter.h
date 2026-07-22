// OKX Futures adapter — real exchange connectivity via WebSocket + REST.
//
// Market data: wss://ws.okx.com:8443/ws/v5/public
// Private:     wss://ws.okx.com:8443/ws/v5/private
// Orders:      POST /api/v5/trade/order (HMAC-SHA256 + passphrase)
//
// Rate limits: 20 req/2s per endpoint, 60 req/2s for order placement
// Implements IExchange interface.
#pragma once

#include "../data/aligned_types.h"
#include "../utils/low_latency.h"
#include "ExchangeBase.h"
#include <atomic>
#include <chrono>
#include <string>
#include <unordered_map>

namespace hft {

class OKXAdapter : public ExchangeBase {
  public:
    struct Config {
        std::string api_key;
        std::string api_secret;
        std::string passphrase;
        std::string base_url  = "https://www.okx.com";
        std::string ws_url    = "wss://ws.okx.com:8443";
        std::string inst_type = "SWAP"; // Futures
    };

    explicit OKXAdapter(const Config& cfg)
        : ExchangeBase("okx", 0.02, 0.05) // 2 bps maker, 5 bps taker
          ,
          config_(cfg) {}

    // IExchange interface
    double best_bid(const std::string& symbol) const override {
        std::lock_guard<Spinlock> lk(price_lock_);
        auto                      it = bids_.find(symbol);
        return it != bids_.end() ? it->second : 0.0;
    }

    double best_ask(const std::string& symbol) const override {
        std::lock_guard<Spinlock> lk(price_lock_);
        auto                      it = asks_.find(symbol);
        return it != asks_.end() ? it->second : 0.0;
    }

    double mid_price(const std::string& symbol) const override {
        return (best_bid(symbol) + best_ask(symbol)) / 2.0;
    }

    double bid_depth(const std::string& symbol, int /*levels*/) const override {
        std::lock_guard<Spinlock> lk(depth_lock_);
        auto                      it = bid_depth_.find(symbol);
        return it != bid_depth_.end() ? it->second : 0.0;
    }

    double ask_depth(const std::string& symbol, int /*levels*/) const override {
        std::lock_guard<Spinlock> lk(depth_lock_);
        auto                      it = ask_depth_.find(symbol);
        return it != ask_depth_.end() ? it->second : 0.0;
    }

    // Update from OKX tickers channel
    void on_ticker(const std::string& inst_id, double bid, double bid_sz, double ask,
                   double ask_sz) {
        std::lock_guard<Spinlock> lk(price_lock_);
        bids_[inst_id] = bid;
        asks_[inst_id] = ask;
        std::lock_guard<Spinlock> lk2(depth_lock_);
        bid_depth_[inst_id] = bid_sz;
        ask_depth_[inst_id] = ask_sz;
    }

    // OKX uses instrument IDs like "BTC-USDT-SWAP"
    static std::string to_inst_id(const std::string& symbol) {
        // Convert "BTCUSDT" → "BTC-USDT-SWAP"
        if (symbol.size() >= 4u && symbol.substr(symbol.size() - 4) == "USDT") {
            std::string base = symbol.substr(0, symbol.size() - 4);
            return base + "-USDT-SWAP";
        }
        return symbol;
    }

    // Build OKX signature: base64(HMAC-SHA256(timestamp + method + requestPath + body))
    std::string sign(const std::string& timestamp, const std::string& method,
                     const std::string& request_path, const std::string& body) const;

    // Submit order
    struct OrderResult {
        bool        success;
        std::string order_id;
        std::string client_order_id;
        std::string state;
        double      avg_px;
        double      acc_fill_sz;
        std::string error_code;
        std::string error_msg;
    };

    OrderResult place_order(const std::string& inst_id, const std::string& side,
                            const std::string& ord_type, double sz, double px = 0.0,
                            const std::string& tif = "", int leverage = 1,
                            int64_t recv_window = 5000);

    OrderResult cancel_order(const std::string& inst_id, const std::string& ord_id);

    // WebSocket subscription messages
    std::string subscribe_ticker(const std::string& inst_id) const {
        return R"({"op":"subscribe","args":[{"channel":"tickers","instId":")" + inst_id + R"("}]})";
    }

    std::string subscribe_depth(const std::string& inst_id) const {
        return R"({"op":"subscribe","args":[{"channel":"books5","instId":")" + inst_id + R"("}]})";
    }

    std::string subscribe_orders() const {
        return R"({"op":"subscribe","args":[{"channel":"orders","instType":")" + config_.inst_type +
               R"("}]})";
    }

    // Login message for private WebSocket
    std::string login_message(const std::string& timestamp) const;

    const Config& config() const { return config_; }

  private:
    Config                                  config_;
    mutable Spinlock                        price_lock_;
    mutable Spinlock                        depth_lock_;
    std::unordered_map<std::string, double> bids_;
    std::unordered_map<std::string, double> asks_;
    std::unordered_map<std::string, double> bid_depth_;
    std::unordered_map<std::string, double> ask_depth_;
};

} // namespace hft
