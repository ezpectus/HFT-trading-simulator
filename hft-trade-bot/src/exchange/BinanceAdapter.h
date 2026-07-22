// Binance Futures adapter — real exchange connectivity via WebSocket + REST.
//
// Market data: wss://fstream.binance.com/ws/<stream>
// Order submission: POST /fapi/v1/order (HMAC-SHA256 auth)
// User data stream: listenKey → wss://fstream.binance.com/ws/<listenKey>
//
// Rate limits: 1200 weight/min, 300 orders/10s, 1200 orders/min
// Implements IExchange interface.
#pragma once

#include "../data/aligned_types.h"
#include "../utils/low_latency.h"
#include "ExchangeBase.h"
#include <atomic>
#include <chrono>
#include <cstdint>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

namespace hft {

class BinanceAdapter : public ExchangeBase {
  public:
    struct Config {
        std::string api_key;
        std::string api_secret;
        std::string base_url    = "https://fapi.binance.com";
        std::string ws_url      = "wss://fstream.binance.com";
        int         recv_window = 5000;
    };

    explicit BinanceAdapter(const Config& cfg)
        : ExchangeBase("binance", 0.02, 0.04) // 2 bps maker, 4 bps taker
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
        double b = best_bid(symbol);
        double a = best_ask(symbol);
        return (b + a) / 2.0;
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

    // Update market data from WebSocket feed
    void on_book_ticker(const std::string& symbol, double bid, double bid_qty, double ask,
                        double ask_qty) {
        std::lock_guard<Spinlock> lk(price_lock_);
        bids_[symbol] = bid;
        asks_[symbol] = ask;
        std::lock_guard<Spinlock> lk2(depth_lock_);
        bid_depth_[symbol] = bid_qty;
        ask_depth_[symbol] = ask_qty;
    }

    // Update depth from diff depth stream
    void on_depth_update(const std::string&                            symbol,
                         const std::vector<std::pair<double, double>>& bids,
                         const std::vector<std::pair<double, double>>& asks) {
        // In production: maintain full L2 book from diffs
        // For now, just update best bid/ask
        if (!bids.empty()) {
            std::lock_guard<Spinlock> lk(price_lock_);
            bids_[symbol] = bids[0].first;
            std::lock_guard<Spinlock> lk2(depth_lock_);
            bid_depth_[symbol] = bids[0].second;
        }
        if (!asks.empty()) {
            std::lock_guard<Spinlock> lk(price_lock_);
            asks_[symbol] = asks[0].first;
            std::lock_guard<Spinlock> lk2(depth_lock_);
            ask_depth_[symbol] = asks[0].second;
        }
    }

    // Build HMAC-SHA256 signature for REST API
    std::string sign(const std::string& payload) const;

    // Submit order via REST API
    struct OrderResult {
        bool        success;
        std::string order_id;
        std::string client_order_id;
        std::string status;
        double      avg_price;
        double      executed_qty;
        std::string error;
    };

    OrderResult place_order(const std::string& symbol, const std::string& side,
                            const std::string& type, double quantity, double price = 0.0,
                            const std::string& time_in_force = "", int64_t recv_window = 5000);

    OrderResult cancel_order(const std::string& symbol, const std::string& order_id);

    // Rate limiting
    bool can_send_order() {
        auto now_ns     = std::chrono::duration_cast<std::chrono::nanoseconds>(
                              std::chrono::steady_clock::now().time_since_epoch())
                              .count();
        auto window_ns  = order_window_start_ns_.load(std::memory_order_relaxed);
        auto elapsed_ns = now_ns - window_ns;
        if (elapsed_ns >= 10'000'000'000) {
            if (order_window_start_ns_.compare_exchange_strong(
                    window_ns, now_ns, std::memory_order_relaxed, std::memory_order_relaxed)) {
                orders_in_window_.store(0, std::memory_order_relaxed);
            }
        }
        return orders_in_window_.fetch_add(1, std::memory_order_relaxed) < 300;
    }

    // WebSocket stream URLs
    std::string book_ticker_stream(const std::string& symbol) const {
        return config_.ws_url + "/ws/" + symbol_lower(symbol) + "@bookTicker";
    }

    std::string depth_stream(const std::string& symbol, int /*levels*/ = 20) const {
        return config_.ws_url + "/ws/" + symbol_lower(symbol) + "@depth20@100ms";
    }

    std::string agg_trade_stream(const std::string& symbol) const {
        return config_.ws_url + "/ws/" + symbol_lower(symbol) + "@aggTrade";
    }

    std::string user_data_stream(const std::string& listen_key) const {
        return config_.ws_url + "/ws/" + listen_key;
    }

    // Create listen key for user data stream
    std::string create_listen_key();

    // Ping listen key (call every 30 min)
    void ping_listen_key(const std::string& listen_key);

    // Close listen key
    void close_listen_key(const std::string& listen_key);

    const Config& config() const { return config_; }

  private:
    static std::string symbol_lower(const std::string& s) {
        std::string r = s;
        for (auto& c : r)
            c = static_cast<char>(tolower(c));
        return r;
    }

    Config                                  config_;
    mutable Spinlock                        price_lock_;
    mutable Spinlock                        depth_lock_;
    std::unordered_map<std::string, double> bids_;
    std::unordered_map<std::string, double> asks_;
    std::unordered_map<std::string, double> bid_depth_;
    std::unordered_map<std::string, double> ask_depth_;

    std::atomic<int64_t> order_window_start_ns_{
        std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::steady_clock::now().time_since_epoch())
            .count()};
    std::atomic<int> orders_in_window_{0};
};

} // namespace hft
