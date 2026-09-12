#pragma once
// Shared market-data builders for the v2 test files.
#include "../src/data/types.h"

#include <cmath>
#include <vector>

using namespace hft;
// ─── Generate test candle data ───
static std::vector<Candle> make_trending_candles(int n, double start_price,
                                                 double trend_per_candle) {
    std::vector<Candle> candles;
    double              price = start_price;
    for (int i = 0; i < n; ++i) {
        Candle c;
        c.timestamp = i * 60000;
        c.open      = price;
        c.high      = price + std::abs(trend_per_candle) * 0.5 + 0.1;
        c.low       = price - std::abs(trend_per_candle) * 0.3;
        c.close     = price + trend_per_candle;
        c.volume    = 100.0 + (i % 10) * 10.0;
        c.symbol    = "BTC/USDT";
        c.exchange  = "binance";
        candles.push_back(c);
        price = c.close;
    }
    return candles;
}

static std::vector<Candle> make_ranging_candles(int n, double center_price, double amplitude) {
    std::vector<Candle> candles;
    for (int i = 0; i < n; ++i) {
        Candle c;
        c.timestamp   = i * 60000;
        double offset = amplitude * std::sin(i * 0.3);
        c.open        = center_price + offset - amplitude * 0.1;
        c.high        = center_price + offset + amplitude * 0.5;
        c.low         = center_price + offset - amplitude * 0.5;
        c.close       = center_price + offset;
        c.volume      = 100.0;
        c.symbol      = "BTC/USDT";
        c.exchange    = "binance";
        candles.push_back(c);
    }
    return candles;
}

static OrderBook make_order_book(double mid, double spread, int levels, double qty,
                                 double ask_scale = 0.7) {
    OrderBook ob;
    ob.symbol   = "BTC/USDT";
    ob.exchange = "binance";
    for (int i = 0; i < levels; ++i) {
        ob.bids.push_back({mid - spread * (i + 1), qty * (1.0 - i * 0.05)});
        ob.asks.push_back({mid + spread * (i + 1), qty * (ask_scale - i * 0.03)});
    }
    return ob;
}
