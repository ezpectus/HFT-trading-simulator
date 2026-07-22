// Unit tests for exchange-specific configuration headers
#include "../../src/exchange/binance/binance_config.h"
#include "../../src/exchange/bybit/bybit_config.h"
#include "../../src/exchange/okx/okx_config.h"
#include <cassert>
#include <iostream>
#include <string>

using namespace hft::exchange;

void test_binance_depth_stream() {
    std::string s = binance::build_depth_stream("btcusdt", 20);
    assert(s == "btcusdt@depth20@100ms");
    std::cout << "  [PASS] test_binance_depth_stream\n";
}

void test_binance_kline_stream() {
    std::string s = binance::build_kline_stream("btcusdt", binance::INTERVAL_1M);
    assert(s == "btcusdt@kline_1m");
    std::cout << "  [PASS] test_binance_kline_stream\n";
}

void test_binance_combined_url() {
    std::vector<std::string> streams = {"btcusdt@depth20@100ms", "ethusdt@aggTrade"};
    std::string              url     = binance::build_combined_url(streams);
    assert(url.find("streams=btcusdt@depth20@100ms/ethusdt@aggTrade") != std::string::npos);
    std::cout << "  [PASS] test_binance_combined_url\n";
}

void test_binance_rest_endpoints() {
    assert(binance::rest_order_endpoint().find("/fapi/v1/order") != std::string::npos);
    assert(binance::rest_account_endpoint().find("/fapi/v2/account") != std::string::npos);
    assert(binance::rest_leverage_endpoint().find("/fapi/v1/leverage") != std::string::npos);
    std::cout << "  [PASS] test_binance_rest_endpoints\n";
}

void test_binance_symbol_norm() {
    assert(binance::normalize_symbol("btcusdt") == "BTCUSDT");
    assert(binance::ws_symbol("BTCUSDT") == "btcusdt");
    std::cout << "  [PASS] test_binance_symbol_norm\n";
}

void test_okx_subscribe() {
    std::string args = okx::build_subscribe_args("books", "BTC-USDT-SWAP");
    assert(args.find("\"channel\":\"books\"") != std::string::npos);
    assert(args.find("\"instId\":\"BTC-USDT-SWAP\"") != std::string::npos);
    std::cout << "  [PASS] test_okx_subscribe\n";
}

void test_okx_subscribe_message() {
    std::vector<std::string> args = {
        okx::build_subscribe_args("books", "BTC-USDT-SWAP"),
        okx::build_subscribe_args("trades", "BTC-USDT-SWAP"),
    };
    std::string msg = okx::build_subscribe_message(args);
    assert(msg.find("\"op\":\"subscribe\"") != std::string::npos);
    assert(msg.find("books") != std::string::npos);
    assert(msg.find("trades") != std::string::npos);
    std::cout << "  [PASS] test_okx_subscribe_message\n";
}

void test_okx_symbol_norm() {
    assert(okx::normalize_symbol("BTCUSDT") == "BTC-USDT-SWAP");
    assert(okx::normalize_symbol("ETHUSDT") == "ETH-USDT-SWAP");
    std::cout << "  [PASS] test_okx_symbol_norm\n";
}

void test_okx_rest_endpoints() {
    assert(okx::rest_order_endpoint().find("/api/v5/trade/order") != std::string::npos);
    assert(okx::rest_position_endpoint().find("/api/v5/account/positions") != std::string::npos);
    std::cout << "  [PASS] test_okx_rest_endpoints\n";
}

void test_bybit_subscribe() {
    std::vector<std::string> channels = {"orderbook.50", "publicTrade"};
    std::string              msg      = bybit::build_subscribe_message(channels, "BTCUSDT");
    assert(msg.find("\"op\":\"subscribe\"") != std::string::npos);
    assert(msg.find("orderbook.50.BTCUSDT") != std::string::npos);
    assert(msg.find("publicTrade.BTCUSDT") != std::string::npos);
    std::cout << "  [PASS] test_bybit_subscribe\n";
}

void test_bybit_unsubscribe() {
    std::vector<std::string> channels = {"tickers"};
    std::string              msg      = bybit::build_unsubscribe_message(channels, "BTCUSDT");
    assert(msg.find("\"op\":\"unsubscribe\"") != std::string::npos);
    assert(msg.find("tickers.BTCUSDT") != std::string::npos);
    std::cout << "  [PASS] test_bybit_unsubscribe\n";
}

void test_bybit_auth() {
    std::string msg = bybit::build_auth_message("key123", "1234567890", "signature");
    assert(msg.find("\"op\":\"auth\"") != std::string::npos);
    assert(msg.find("key123") != std::string::npos);
    std::cout << "  [PASS] test_bybit_auth\n";
}

void test_bybit_rest_endpoints() {
    assert(bybit::rest_order_endpoint().find("/v5/order/create") != std::string::npos);
    assert(bybit::rest_position_endpoint().find("/v5/position/list") != std::string::npos);
    std::cout << "  [PASS] test_bybit_rest_endpoints\n";
}

void test_bybit_symbol_norm() {
    assert(bybit::normalize_symbol("btcusdt") == "BTCUSDT");
    std::cout << "  [PASS] test_bybit_symbol_norm\n";
}

int main() {
    std::cout << "=== Exchange Config Tests ===\n";
    // Binance
    test_binance_depth_stream();
    test_binance_kline_stream();
    test_binance_combined_url();
    test_binance_rest_endpoints();
    test_binance_symbol_norm();
    // OKX
    test_okx_subscribe();
    test_okx_subscribe_message();
    test_okx_symbol_norm();
    test_okx_rest_endpoints();
    // Bybit
    test_bybit_subscribe();
    test_bybit_unsubscribe();
    test_bybit_auth();
    test_bybit_rest_endpoints();
    test_bybit_symbol_norm();
    std::cout << "=== All tests passed! ===\n";
    return 0;
}
