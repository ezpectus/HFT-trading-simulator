// Binance exchange specifics — WebSocket channels, rate limits, API endpoints.
//
// Binance Futures (USD-M) specific configuration:
// - WS base: wss://fstream.binance.com
// - REST base: https://fapi.binance.com
// - Rate limits: 2400 weight/min, 1200 req/min
// - Channels: depth, aggTrade, kline, markPrice, forceOrder
#pragma once

#include "../BinanceAdapter.h"
#include <string>
#include <string_view>
#include <vector>
#include <cstdint>

namespace hft::exchange::binance {

// ─── Endpoints ───
constexpr const char* WS_BASE_URL = "wss://fstream.binance.com/ws";
constexpr const char* WS_COMBINED_URL = "wss://fstream.binance.com/stream";
constexpr const char* REST_BASE_URL = "https://fapi.binance.com";
constexpr const char* TESTNET_WS_URL = "wss://stream.binancefuture.com/ws";
constexpr const char* TESTNET_REST_URL = "https://testnet.binancefuture.com";

// ─── Rate limits ───
constexpr uint32_t RATE_LIMIT_WEIGHT_PER_MIN = 2400;
constexpr uint32_t RATE_LIMIT_ORDERS_PER_MIN = 1200;
constexpr uint32_t RATE_LIMIT_REQUESTS_PER_SEC = 10;

// ─── WebSocket channels ───
constexpr const char* CHANNEL_DEPTH = "depth";
constexpr const char* CHANNEL_AGG_TRADE = "aggTrade";
constexpr const char* CHANNEL_KLINE = "kline";
constexpr const char* CHANNEL_MARK_PRICE = "markPrice";
constexpr const char* CHANNEL_FORCE_ORDER = "forceOrder";
constexpr const char* CHANNEL_USER_DATA = "userDataStream";

// ─── Kline intervals ───
constexpr const char* INTERVAL_1M = "1m";
constexpr const char* INTERVAL_5M = "5m";
constexpr const char* INTERVAL_15M = "15m";
constexpr const char* INTERVAL_1H = "1h";
constexpr const char* INTERVAL_4H = "4h";
constexpr const char* INTERVAL_1D = "1d";

// ─── Order types ───
constexpr const char* ORDER_TYPE_MARKET = "MARKET";
constexpr const char* ORDER_TYPE_LIMIT = "LIMIT";
constexpr const char* ORDER_TYPE_STOP = "STOP";
constexpr const char* ORDER_TYPE_STOP_MARKET = "STOP_MARKET";
constexpr const char* ORDER_TYPE_TAKE_PROFIT = "TAKE_PROFIT";
constexpr const char* ORDER_TYPE_TAKE_PROFIT_MARKET = "TAKE_PROFIT_MARKET";

// ─── Time in force ───
constexpr const char* TIF_GTC = "GTC";   // Good till cancel
constexpr const char* TIF_IOC = "IOC";   // Immediate or cancel
constexpr const char* TIF_FOK = "FOK";   // Fill or kill
constexpr const char* TIF_GTX = "GTX";   // Good till crossing (post-only)

// ─── Subscription helpers ───
inline std::string build_depth_stream(const std::string& symbol, int levels = 20) {
    return symbol + "@depth" + std::to_string(levels) + "@100ms";
}

inline std::string build_kline_stream(const std::string& symbol, const char* interval) {
    return symbol + "@kline_" + interval;
}

inline std::string build_agg_trade_stream(const std::string& symbol) {
    return symbol + "@aggTrade";
}

inline std::string build_mark_price_stream(const std::string& symbol) {
    return symbol + "@markPrice@1s";
}

inline std::string build_combined_url(const std::vector<std::string>& streams) {
    std::string url = WS_COMBINED_URL;
    url += "?streams=";
    for (size_t i = 0; i < streams.size(); ++i) {
        if (i > 0) url += "/";
        url += streams[i];
    }
    return url;
}

// ─── REST endpoints ───
inline std::string rest_endpoint(const char* path) {
    return std::string(REST_BASE_URL) + path;
}

inline std::string rest_order_endpoint() {
    return rest_endpoint("/fapi/v1/order");
}

inline std::string rest_cancel_endpoint() {
    return rest_endpoint("/fapi/v1/order");
}

inline std::string rest_position_endpoint() {
    return rest_endpoint("/fapi/v2/positionRisk");
}

inline std::string rest_account_endpoint() {
    return rest_endpoint("/fapi/v2/account");
}

inline std::string rest_leverage_endpoint() {
    return rest_endpoint("/fapi/v1/leverage");
}

inline std::string rest_kline_endpoint() {
    return rest_endpoint("/fapi/v1/klines");
}

inline std::string rest_depth_endpoint() {
    return rest_endpoint("/fapi/v1/depth");
}

// ─── Symbol normalization ───
inline std::string normalize_symbol(const std::string& symbol) {
    // Binance uses lowercase for WS, uppercase for REST
    // This returns uppercase for REST
    std::string result = symbol;
    for (auto& c : result) {
        if (c >= 'a' && c <= 'z') c -= 32;
    }
    return result;
}

inline std::string ws_symbol(const std::string& symbol) {
    // Lowercase for WebSocket streams
    std::string result = symbol;
    for (auto& c : result) {
        if (c >= 'A' && c <= 'Z') c += 32;
    }
    return result;
}

} // namespace hft::exchange::binance
