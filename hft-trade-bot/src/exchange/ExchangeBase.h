// ExchangeBase — partial implementation of IExchange with latency tracking
// and toxic-event backoff.
//
// Concrete exchange adapters (BinanceAdapter, OKXAdapter, BybitAdapter,
// SimExchange) inherit this class and implement the remaining pure-virtual
// market-data methods (best_bid, best_ask, mid_price, bid_depth, ask_depth).
#pragma once

#include "IExchange.h"
#include "../utils/low_latency.h"
#include <atomic>
#include <string>

namespace hft {

class ExchangeBase : public IExchange {
public:
    ExchangeBase(std::string exchange_id, double maker_bps, double taker_bps)
        : id_(std::move(exchange_id))
        , maker_fee_(maker_bps)
        , taker_fee_(taker_bps) {}

    const std::string& id() const override { return id_; }
    double maker_fee_bps() const override { return maker_fee_; }
    double taker_fee_bps() const override { return taker_fee_; }

    int64_t estimated_latency_us() const override {
        return latency_avg_.load(std::memory_order_relaxed);
    }

    // Record observed latency (called after each exchange interaction)
    void record_latency(int64_t us) noexcept {
        int64_t current = latency_avg_.load(std::memory_order_relaxed);
        if (current == 0) {
            latency_avg_.store(us, std::memory_order_relaxed);
        } else {
            int64_t next = current + (us - current) / 10;
            while (!latency_avg_.compare_exchange_weak(current, next,
                       std::memory_order_relaxed, std::memory_order_relaxed)) {
                next = current + (us - current) / 10;
            }
        }
    }

    void record_toxic_event() override {
        toxic_count_.fetch_add(1, std::memory_order_relaxed);
    }

    int toxic_event_count() const override {
        return toxic_count_.load(std::memory_order_relaxed);
    }

    void reset_toxic_events() override {
        toxic_count_.store(0, std::memory_order_relaxed);
    }

    bool is_available() const override {
        return toxic_count_.load(std::memory_order_relaxed) < 5;
    }

protected:
    std::string id_;
    double maker_fee_;
    double taker_fee_;
    std::atomic<int64_t> latency_avg_{0};
    std::atomic<int> toxic_count_{0};
};

} // namespace hft
