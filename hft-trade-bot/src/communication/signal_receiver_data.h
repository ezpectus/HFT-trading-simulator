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
    void set_default_exchange_impl(const std::string& ex) {
        std::lock_guard<Spinlock> lock(data_lock_);
        default_exchange_ = ex;
    }

    // The wire protocol qualifies every market datum with its exchange
    // ("binance|BTC/USDT" orderbook keys, nested prices, candle.exchange).
    // Symbol-only keys merged all three venues into one corrupt series (S252).
    static std::string book_key(const std::string& ex, const std::string& sym) {
        return ex.empty() ? sym : ex + "|" + sym;
    }

    // The by-id fast arrays stay symbol-indexed (SHM/fill protocol is
    // symbol-keyed); only the primary venue's data may occupy them.
    bool primary_exchange(const std::string& ex) const {
        return default_exchange_.empty() || ex == default_exchange_ || ex == "shm";
    }

    // Resolve a consumer's bare symbol to the configured venue first, then the
    // shm-injected copy, then an unqualified legacy key.
    template <typename Map>
    typename Map::const_iterator find_for_symbol(const Map& m, const std::string& sym) const {
        // Scratch buffer — every caller holds data_lock_, so reuse is
        // serialized. Build order matches book_key(): empty exchange → bare
        // symbol key.
        key_scratch_ = default_exchange_;
        if (!key_scratch_.empty()) key_scratch_ += '|';
        key_scratch_ += sym;
        auto it = m.find(key_scratch_);
        if (it != m.end()) return it;
        if (default_exchange_ != "shm") {
            key_scratch_ = "shm|";
            key_scratch_ += sym;
            auto it = m.find(key_scratch_);
            if (it != m.end()) return it;
        }
        return m.find(sym);
    }

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

    bool get_order_book_by_id(uint16_t id, OrderBook& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        if (id >= obs_by_id_.size()) return false;
        if (obs_by_id_[id].bids.empty()) return false;
        out = obs_by_id_[id];
        return true;
    }

    void inject_snapshot_impl(uint16_t symbol_id, double bid, double ask, double /*last*/,
                              double volume) {
        if (symbol_id >= id_to_symbol_.size()) return;
        const auto& sym = id_to_symbol_[symbol_id];
        double      mid = (bid + ask) / 2.0;
        {
            std::lock_guard<Spinlock> lock(data_lock_);
            prices_[book_key("shm", sym)] = mid;
            prices_by_id_[symbol_id]      = mid;
            OrderBook& ob                 = obs_by_id_[symbol_id];
            ob.symbol                     = sym;
            ob.exchange                   = "shm";
            if (ob.bids.empty()) ob.bids.resize(1);
            if (ob.asks.empty()) ob.asks.resize(1);
            ob.bids[0]                         = {bid, volume * 0.1};
            ob.asks[0]                         = {ask, volume * 0.1};
            order_books_[book_key("shm", sym)] = ob;
        }
        has_new_data_.store(true, std::memory_order_release);
    }

    bool has_shm_data_impl() const noexcept { return !id_to_symbol_.empty(); }

    double get_price_impl(const std::string& symbol) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = find_for_symbol(prices_, symbol);
        return it != prices_.end() ? it->second : 0.0;
    }

    double get_best_bid_impl(const std::string& symbol) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = find_for_symbol(order_books_, symbol);
        if (it == order_books_.end() || it->second.bids.empty()) return 0.0;
        return it->second.bids[0].price;
    }

    double get_best_ask_impl(const std::string& symbol) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = find_for_symbol(order_books_, symbol);
        if (it == order_books_.end() || it->second.asks.empty()) return 0.0;
        return it->second.asks[0].price;
    }

    double get_bid_depth_impl(const std::string& symbol, int levels) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = find_for_symbol(order_books_, symbol);
        if (it == order_books_.end()) return 0.0;
        double depth = 0.0;
        int    n     = std::min(levels, static_cast<int>(it->second.bids.size()));
        for (int i = 0; i < n; ++i)
            depth += it->second.bids[i].quantity;
        return depth;
    }

    double get_ask_depth_impl(const std::string& symbol, int levels) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = find_for_symbol(order_books_, symbol);
        if (it == order_books_.end()) return 0.0;
        double depth = 0.0;
        int    n     = std::min(levels, static_cast<int>(it->second.asks.size()));
        for (int i = 0; i < n; ++i)
            depth += it->second.asks[i].quantity;
        return depth;
    }

    // Consumers (pos_mgr SL/TP, PnL) key by bare symbol — project only the
    // primary venue's prices back onto bare symbols so one exchange's tick
    // can't move a position opened on another (S252).
    size_t get_all_prices_into_impl(std::unordered_map<std::string, double>& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        out.clear();
        for (const auto& [k, v] : prices_) {
            const auto pos = k.find('|');
            if (pos == std::string::npos) {
                out[k] = v;
                continue;
            }
            // compare() instead of substr — no allocation per key inside the lock.
            if (k.compare(0, pos, default_exchange_) == 0 || k.compare(0, pos, "shm") == 0)
                out[k.substr(pos + 1)] = v;
        }
        return out.size();
    }

    std::unordered_map<std::string, double> get_all_prices_impl() const {
        std::unordered_map<std::string, double> out;
        get_all_prices_into_impl(out);
        return out;
    }

    std::vector<Candle> get_candles_impl(const std::string& symbol, size_t n = 100) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = find_for_symbol(candle_history_, symbol);
        if (it == candle_history_.end()) return {};
        const auto& hist = it->second;
        return hist.size() <= n ? hist : std::vector<Candle>(hist.end() - n, hist.end());
    }

    size_t get_candles_into_impl(const std::string& symbol, size_t n,
                                 std::vector<Candle>& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = find_for_symbol(candle_history_, symbol);
        if (it == candle_history_.end()) {
            out.clear();
            return 0;
        }
        const auto& hist  = it->second;
        size_t      count = std::min(n, hist.size());
        out.assign(hist.end() - count, hist.end());
        return count;
    }

    OrderBook get_order_book_impl(const std::string& symbol) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = find_for_symbol(order_books_, symbol);
        return it != order_books_.end() ? it->second : OrderBook{};
    }

    bool get_order_book_into_impl(const std::string& symbol, OrderBook& out) const {
        std::lock_guard<Spinlock> lock(data_lock_);
        auto                      it = find_for_symbol(order_books_, symbol);
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

    std::string         default_exchange_;
    mutable std::string key_scratch_; // find_for_symbol scratch — data_lock_-guarded

    std::unordered_map<std::string, uint16_t> symbol_to_id_;
    std::vector<std::string>                  id_to_symbol_;
    std::vector<double>                       prices_by_id_;
    std::vector<OrderBook>                    obs_by_id_;
    std::vector<std::vector<Candle>>          candles_by_id_;
};

} // namespace hft
