// IExchange — abstract exchange interface for dependency inversion.
//
// Defines the common contract for all exchange adapters (Binance, OKX, Bybit,
// simulator). The SmartOrderRouterV2 and all consumers depend on this interface,
// not on concrete exchange implementations (DIP/SOLID).
//
// Concrete adapters inherit ExchangeBase (which provides latency tracking,
// toxic-event backoff, and fee storage) and implement the market-data methods.
#pragma once

#include <cstdint>
#include <string>

namespace hft {

class IExchange {
  public:
    virtual ~IExchange() = default;

    // ── Exchange identity ──
    virtual const std::string& id() const                   = 0;
    virtual double             maker_fee_bps() const        = 0;
    virtual double             taker_fee_bps() const        = 0;
    virtual int64_t            estimated_latency_us() const = 0;

    // ── Market data (must be implemented by concrete adapter) ──
    virtual double best_bid(const std::string& symbol) const  = 0;
    virtual double best_ask(const std::string& symbol) const  = 0;
    virtual double mid_price(const std::string& symbol) const = 0;

    // ── Available depth at top of book ──
    virtual double bid_depth(const std::string& symbol, int levels) const = 0;
    virtual double ask_depth(const std::string& symbol, int levels) const = 0;

    // ── Availability and toxic-flow tracking ──
    virtual bool is_available() const      = 0;
    virtual void record_toxic_event()      = 0;
    virtual int  toxic_event_count() const = 0;
    virtual void reset_toxic_events()      = 0;
};

} // namespace hft
