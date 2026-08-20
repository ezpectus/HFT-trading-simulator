// ═══════════════════════════════════════════════════════════════════════════════
// SignalReceiverData — Data storage and accessors for SignalReceiver
//
// Extracted from signal_receiver.h for file-size compliance.
// Contains: symbol registry, price/orderbook/candle storage, fast-path accessors.
// ═══════════════════════════════════════════════════════════════════════════════
#pragma once

#include "../data/signal.h"
#include "../data/types.h"
#include "../utils/low_latency.h"
#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace hft {

class SignalReceiverData {
  protected:
    using Spinlock = SpinLock;

    void register_symbols_impl(const std::vector<std::string>& symbols) {
        symbol_to_id_.clear();
        id_to_symbol_.clear();
        for (size_t i = 0; i < symbols.size(); ++i) {
            symbol_to_id_[symbols[i]] = static_cast<uint16_t>(i);
            id_to_symbol_.push_back(symbols[i]);
        }
        prices_by_id_.assign(symbols.size(), 0.0);
        obs_by_id_.assign(symbols.size(), OrderBook{});
        candles_by_id_.assign(symbols.size(), {});
    }

    uint16_t symbol_id_impl(const std::string& sym) const {
        auto it = symbol_to_id_.find(sym);
        return it != symbol_to_id_.end() ? it->second : 0xFFFF;
    }

    double get_price_by_id(uint16_t id) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        return id < prices_by_id_.size() ? prices_by_id_[id] : 0.0;
    }

    size_t get_candles_by_id(uint16_t id, size_t n, std::vector<Candle>& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        if (id >= candles_by_id_.size()) { out.clear(); return 0; }
        const auto& hist = candles_by_id_[id];
        if (hist.empty()) { out.clear(); return 0; }
        size_t start = hist.size() >= n ? hist.size() - n : 0;
        out.assign(hist.begin() + start, hist.end());
        return out.size();
    }

    bool get_order_book_by_id(uint16_t id, OrderBook& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        if (id >= obs_by_id_.size()) return false;
        if (obs_by_id_[id].bids.empty()) return false;
        out = obs_by_id_[id];
        return true;
    }

    void inject_snapshot_impl(uint16_t symbol_id, double bid, double ask,
                              double /*last*/, double volume) {
        if (symbol_id >= id_to_symbol_.size()) return;
        const auto& sym = id_to_symbol_[symbol_id];
        double      mid = (bid + ask) / 2.0;
        {
            std::lock_guard<Spinlock> lock(data_lock_);
            prices_[sym]             = mid;
            prices_by_id_[symbol_id] = mid;
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

    bool has_shm_data_impl() const noexcept { return !id_to_symbol_.empty(); }

    double get_price_impl(const std::string& symbol) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto it = prices_.find(symbol);
        return it != prices_.end() ? it->second : 0.0;
    }

    double get_best_bid_impl(const std::string& symbol) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto it = order_books_.find(symbol);
        if (it == order_books_.end() || it->second.bids.empty()) return 0.0;
        return it->second.bids[0].price;
    }

    double get_best_ask_impl(const std::string& symbol) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto it = order_books_.find(symbol);
        if (it == order_books_.end() || it->second.asks.empty()) return 0.0;
        return it->second.asks[0].price;
    }

    double get_bid_depth_impl(const std::string& symbol, int levels) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto it = order_books_.find(symbol);
        if (it == order_books_.end()) return 0.0;
        double depth = 0.0;
        int n = std::min(levels, static_cast<int>(it->second.bids.size()));
        for (int i = 0; i < n; ++i) depth += it->second.bids[i].quantity;
        return depth;
    }

    double get_ask_depth_impl(const std::string& symbol, int levels) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto it = order_books_.find(symbol);
        if (it == order_books_.end()) return 0.0;
        double depth = 0.0;
        int n = std::min(levels, static_cast<int>(it->second.asks.size()));
        for (int i = 0; i < n; ++i) depth += it->second.asks[i].quantity;
        return depth;
    }

    size_t get_all_prices_into_impl(std::unordered_map<std::string, double>& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        out = prices_;
        return out.size();
    }

    std::unordered_map<std::string, double> get_all_prices_impl() const {
        std::lock_guard<Spinlock> lock(data_lock_);
        return prices_;
    }

    std::vector<Candle> get_candles_impl(const std::string& symbol, size_t n = 100) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto it = candle_history_.find(symbol);
        if (it == candle_history_.end()) return {};
        const auto& hist = it->second;
        return hist.size() <= n ? hist : std::vector<Candle>(hist.end() - n, hist.end());
    }

    size_t get_candles_into_impl(const std::string& symbol, size_t n, std::vector<Candle>& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto it = candle_history_.find(symbol);
        if (it == candle_history_.end()) { out.clear(); return 0; }
        const auto& hist = it->second;
        size_t count = std::min(n, hist.size());
        out.assign(hist.end() - count, hist.end());
        return count;
    }

    OrderBook get_order_book_impl(const std::string& symbol) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto it = order_books_.find(symbol);
        return it != order_books_.end() ? it->second : OrderBook{};
    }

    bool get_order_book_into_impl(const std::string& symbol, OrderBook& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto it = order_books_.find(symbol);
        if (it == order_books_.end()) return false;
        out = it->second;
        return true;
    }

    // ── Data members ──
    mutable std::mutex      mutex_;
    std::condition_variable cv_;
    std::atomic<bool>       has_new_data_{false};
    mutable Spinlock        data_lock_;

    std::unordered_map<std::string, double>              prices_;
    std::unordered_map<std::string, std::vector<Candle>> candle_history_;
    std::unordered_map<std::string, OrderBook>           order_books_;

    std::unordered_map<std::string, uint16_t> symbol_to_id_;
    std::vector<std::string>                  id_to_symbol_;
    std::vector<double>                       prices_by_id_;
    std::vector<OrderBook>                    obs_by_id_;
    std::vector<std::vector<Candle>>          candles_by_id_;
};

} // namespace hft
