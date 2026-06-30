// OKX exchange specifics — WebSocket channels, rate limits, API endpoints.
//
// OKX V5 API specific configuration:
// - WS public: wss://ws.okx.com/ws/v5/public
// - WS private: wss://ws.okx.com/ws/v5/private
// - REST base: https://www.okx.com
// - Rate limits: 20 req/2s per endpoint
// - Channels: books, trades, candle, tickers
#pragma once

#include "../OKXAdapter.h"
#include <string>
#include <string_view>
#include <vector>
#include <cstdint>

namespace hft::exchange::okx {

// ─── Endpoints ───
constexpr const char* WS_PUBLIC_URL = "wss://ws.okx.com/ws/v5/public";
constexpr const char* WS_PRIVATE_URL = "wss://ws.okx.com/ws/v5/private";
constexpr const char* REST_BASE_URL = "https://www.okx.com";
constexpr const char* SIMULATION_WS_PUBLIC = "wss://wspap.okx.com/ws/v5/public?brokerId=9999";
constexpr const char* SIMULATION_REST = "https://www.okx.com";

// ─── Rate limits ───
constexpr uint32_t RATE_LIMIT_PER_2S = 20;
constexpr uint32_t RATE_LIMIT_ORDERS_PER_2S = 60;
constexpr uint32_t RATE_LIMIT_REQUESTS_PER_SEC = 10;

// ─── WebSocket channels ───
constexpr const char* CHANNEL_BOOKS = "books";
constexpr const char* CHANNEL_BOOKS5 = "books5";
constexpr const char* CHANNEL_TRADES = "trades";
constexpr const char* CHANNEL_CANDLE1M = "candle1m";
constexpr const char* CHANNEL_CANDLE5M = "candle5m";
constexpr const char* CHANNEL_TICKERS = "tickers";
constexpr const char* CHANNEL_PRICE = "mark-price";
constexpr const char* CHANNEL_ORDERS = "orders";
constexpr const char* CHANNEL_POSITION = "positions";
constexpr const char* CHANNEL_ACCOUNT = "account";

// ─── Order types ───
constexpr const char* ORDER_TYPE_MARKET = "market";
constexpr const char* ORDER_TYPE_LIMIT = "limit";
constexpr const char* ORDER_TYPE_POST_ONLY = "post_only";
constexpr const char* ORDER_TYPE_FOK = "fok";
constexpr const char* ORDER_TYPE_IOC = "ioc";
constexpr const char* ORDER_TYPE_OPTIMAL_LIMIT_IOC = "optimal_limit_ioc";

// ─── Side ───
constexpr const char* SIDE_BUY = "buy";
constexpr const char* SIDE_SELL = "sell";

// ─── Position side ───
constexpr const char* POS_SIDE_LONG = "long";
constexpr const char* POS_SIDE_SHORT = "short";
constexpr const char* POS_SIDE_NET = "net";

// ─── Subscription helpers ───
inline std::string build_subscribe_args(const std::string& channel,
                                         const std::string& inst_id) {
    return std::string("{\"channel\":\"") + channel +
           "\",\"instId\":\"" + inst_id + "\"}";
}

inline std::string build_subscribe_message(const std::vector<std::string>& args) {
    std::string msg = "{\"op\":\"subscribe\",\"args\":[";
    for (size_t i = 0; i < args.size(); ++i) {
        if (i > 0) msg += ",";
        msg += args[i];
    }
    msg += "]}";
    return msg;
}

inline std::string build_unsubscribe_message(const std::vector<std::string>& args) {
    std::string msg = "{\"op\":\"unsubscribe\",\"args\":[";
    for (size_t i = 0; i < args.size(); ++i) {
        if (i > 0) msg += ",";
        msg += args[i];
    }
    msg += "]}";
    return msg;
}

inline std::string build_login_message(const std::string& api_key,
                                        const std::string& passphrase,
                                        const std::string& timestamp,
                                        const std::string& sign) {
    return std::string("{\"op\":\"login\",\"args\":[{\"apiKey\":\"") +
           api_key + "\",\"passphrase\":\"" + passphrase +
           "\",\"timestamp\":\"" + timestamp +
           "\",\"sign\":\"" + sign + "\"}]}";
}

// ─── REST endpoints ───
inline std::string rest_endpoint(const char* path) {
    return std::string(REST_BASE_URL) + path;
}

inline std::string rest_order_endpoint() {
    return rest_endpoint("/api/v5/trade/order");
}

inline std::string rest_cancel_endpoint() {
    return rest_endpoint("/api/v5/trade/cancel-order");
}

inline std::string rest_position_endpoint() {
    return rest_endpoint("/api/v5/account/positions");
}

inline std::string rest_account_endpoint() {
    return rest_endpoint("/api/v5/account/balance");
}

inline std::string rest_leverage_endpoint() {
    return rest_endpoint("/api/v5/account/set-leverage");
}

inline std::string rest_kline_endpoint() {
    return rest_endpoint("/api/v5/market/candles");
}

inline std::string rest_depth_endpoint() {
    return rest_endpoint("/api/v5/market/books");
}

// ─── Symbol normalization ───
// OKX uses uppercase instrument IDs like BTC-USDT-SWAP
inline std::string normalize_symbol(const std::string& symbol) {
    // Convert BTCUSDT → BTC-USDT-SWAP
    if (symbol.size() < 4) return symbol;
    std::string base, quote;
    // Try to split at common quote currencies
    for (const char* q : {"USDT", "USDC", "BTC", "ETH"}) {
        size_t qlen = strlen(q);
        if (symbol.size() > qlen && symbol.substr(symbol.size() - qlen) == q) {
            base = symbol.substr(0, symbol.size() - qlen);
            quote = q;
            break;
        }
    }
    if (base.empty()) return symbol;
    return base + "-" + quote + "-SWAP";
}

} // namespace hft::exchange::okx
