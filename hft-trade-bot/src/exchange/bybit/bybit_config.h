// Bybit exchange specifics — WebSocket channels, rate limits, API endpoints.
//
// Bybit V5 API specific configuration:
// - WS public: wss://stream.bybit.com/v5/public/linear
// - WS private: wss://stream.bybit.com/v5/private
// - REST base: https://api.bybit.com
// - Rate limits: 120 req/min per endpoint
// - Channels: orderbook.50, publicTrade, kline, tickers
#pragma once

#include "../BybitAdapter.h"
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace hft::exchange::bybit {

// ─── Endpoints ───
constexpr const char* WS_PUBLIC_URL     = "wss://stream.bybit.com/v5/public/linear";
constexpr const char* WS_PRIVATE_URL    = "wss://stream.bybit.com/v5/private";
constexpr const char* REST_BASE_URL     = "https://api.bybit.com";
constexpr const char* TESTNET_WS_PUBLIC = "wss://stream-testnet.bybit.com/v5/public/linear";
constexpr const char* TESTNET_REST      = "https://api-testnet.bybit.com";

// ─── Rate limits ───
constexpr uint32_t RATE_LIMIT_PER_MIN          = 120;
constexpr uint32_t RATE_LIMIT_ORDERS_PER_MIN   = 120;
constexpr uint32_t RATE_LIMIT_REQUESTS_PER_SEC = 10;

// ─── WebSocket channels ───
constexpr const char* CHANNEL_ORDERBOOK_50  = "orderbook.50";
constexpr const char* CHANNEL_ORDERBOOK_200 = "orderbook.200";
constexpr const char* CHANNEL_TRADES        = "publicTrade";
constexpr const char* CHANNEL_KLINE_1M      = "kline.1";
constexpr const char* CHANNEL_KLINE_5M      = "kline.5";
constexpr const char* CHANNEL_KLINE_15M     = "kline.15";
constexpr const char* CHANNEL_KLINE_1H      = "kline.60";
constexpr const char* CHANNEL_TICKERS       = "tickers";
constexpr const char* CHANNEL_LIQUIDATION   = "liquidation";
constexpr const char* CHANNEL_ORDER         = "order";
constexpr const char* CHANNEL_POSITION      = "position";
constexpr const char* CHANNEL_WALLET        = "wallet";

// ─── Order types ───
constexpr const char* ORDER_TYPE_MARKET    = "Market";
constexpr const char* ORDER_TYPE_LIMIT     = "Limit";
constexpr const char* ORDER_TYPE_POST_ONLY = "PostOnly";

// ─── Time in force ───
constexpr const char* TIF_GTC       = "GTC";
constexpr const char* TIF_IOC       = "IOC";
constexpr const char* TIF_FOK       = "FOK";
constexpr const char* TIF_POST_ONLY = "PostOnly";

// ─── Side ───
constexpr const char* SIDE_BUY  = "Buy";
constexpr const char* SIDE_SELL = "Sell";

// ─── Category ───
constexpr const char* CATEGORY_LINEAR = "linear";
constexpr const char* CATEGORY_SPOT   = "spot";
constexpr const char* CATEGORY_OPTION = "option";

// ─── Subscription helpers ───
inline std::string build_subscribe_message(const std::vector<std::string>& channels,
                                           const std::string&              symbol) {
    std::string msg = "{\"op\":\"subscribe\",\"args\":[";
    for (size_t i = 0; i < channels.size(); ++i) {
        if (i > 0) msg += ",";
        msg += std::string("\"") + channels[i] + "." + symbol + "\"";
    }
    msg += "]}";
    return msg;
}

inline std::string build_unsubscribe_message(const std::vector<std::string>& channels,
                                             const std::string&              symbol) {
    std::string msg = "{\"op\":\"unsubscribe\",\"args\":[";
    for (size_t i = 0; i < channels.size(); ++i) {
        if (i > 0) msg += ",";
        msg += std::string("\"") + channels[i] + "." + symbol + "\"";
    }
    msg += "]}";
    return msg;
}

inline std::string build_auth_message(const std::string& api_key, const std::string& timestamp,
                                      const std::string& sign) {
    return std::string("{\"op\":\"auth\",\"args\":[\"") + api_key + "\",\"" + timestamp + "\",\"" +
           sign + "\"]}";
}

// ─── REST endpoints ───
inline std::string rest_endpoint(const char* path) {
    return std::string(REST_BASE_URL) + path;
}

inline std::string rest_order_endpoint() {
    return rest_endpoint("/v5/order/create");
}

inline std::string rest_cancel_endpoint() {
    return rest_endpoint("/v5/order/cancel");
}

inline std::string rest_position_endpoint() {
    return rest_endpoint("/v5/position/list");
}

inline std::string rest_account_endpoint() {
    return rest_endpoint("/v5/account/wallet-balance");
}

inline std::string rest_leverage_endpoint() {
    return rest_endpoint("/v5/position/set-leverage");
}

inline std::string rest_kline_endpoint() {
    return rest_endpoint("/v5/market/kline");
}

inline std::string rest_depth_endpoint() {
    return rest_endpoint("/v5/market/orderbook");
}

// ─── Symbol normalization ───
// Bybit uses uppercase like BTCUSDT
inline std::string normalize_symbol(const std::string& symbol) {
    std::string result = symbol;
    for (auto& c : result) {
        if (c >= 'a' && c <= 'z') c -= 32;
    }
    return result;
}

} // namespace hft::exchange::bybit
