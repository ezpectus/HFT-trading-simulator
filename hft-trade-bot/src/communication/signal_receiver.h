// Signal receiver — WebSocket client that receives market data and AI signals
//
// Connects to:
// 1. Exchange simulator (ws://localhost:8765) — market data, order fills
// 2. AI Signal Bot signal publisher (ws://localhost:8766) — validated trading signals
#pragma once

#include "../data/signal.h"
#include "../data/types.h"
#include "../utils/low_latency.h"
#include "signal_receiver_data.h"
#include <atomic>
#include <condition_variable>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <vector>
#include <websocketpp/client.hpp>
#include <websocketpp/config/asio_client.hpp>

namespace hft {

using json = nlohmann::json;
using namespace std::string_view_literals;
using WSClient = websocketpp::client<websocketpp::config::asio_client>;

class SignalReceiver : private SignalReceiverData {
  public:
    using SignalCallback = std::function<void(const Signal&)>;
    using CandleCallback = std::function<void(const std::vector<Candle>&)>;
    using ArbitrageCallback =
        std::function<void(const std::string& symbol, const std::string& buy_exchange,
                           const std::string& sell_exchange, double buy_price, double sell_price,
                           double spread_bps, double max_quantity)>;

    explicit SignalReceiver(const std::string& ws_url)
        : ws_url_(ws_url), client_(std::make_unique<WSClient>()) {}

    void register_symbols(const std::vector<std::string>& symbols) {
        register_symbols_impl(symbols);
    }

    uint16_t symbol_id(const std::string& sym) const { return symbol_id_impl(sym); }

    double get_price_by_id(uint16_t id) const { return SignalReceiverData::get_price_by_id(id); }

    size_t get_candles_by_id(uint16_t id, size_t n, std::vector<Candle>& out) const {
        return SignalReceiverData::get_candles_by_id(id, n, out);
    }

    bool get_order_book_by_id(uint16_t id, OrderBook& out) const {
        return SignalReceiverData::get_order_book_by_id(id, out);
    }

    void inject_snapshot(uint16_t symbol_id, double bid, double ask, double last, double volume) {
        inject_snapshot_impl(symbol_id, bid, ask, last, volume);
    }

    bool has_shm_data() const noexcept { return has_shm_data_impl(); }

    bool connect() {
        should_reconnect_ = true;
        return do_connect();
    }

    bool do_connect() {
        try {
            client_ = std::make_unique<WSClient>();
            client_->init_asio();
            client_->set_open_handler([this](websocketpp::connection_hdl hdl) {
                connected_       = true;
                connection_      = hdl;
                reconnect_delay_ = 1000;
                spdlog::info("SignalReceiver connected to {}", ws_url_);
                json sub = {{"type", "subscribe"}, {"protocol_version", 2}, {"encoding", "msgpack"}};
                client_->send(hdl, sub.dump(), websocketpp::frame::opcode::text);
            });
            client_->set_close_handler([this](websocketpp::connection_hdl) {
                connected_ = false;
                spdlog::warn("SignalReceiver disconnected");
                if (should_reconnect_) {
                    spdlog::info("Reconnecting in {}ms...", reconnect_delay_);
                    auto delay = reconnect_delay_;
                    reconnect_delay_ = std::min(reconnect_delay_ * 2, 30000);
                    std::thread([this, delay]() {
                        std::this_thread::sleep_for(std::chrono::milliseconds(delay));
                        if (should_reconnect_) {
                            if (ws_thread_.joinable()) ws_thread_.join();
                            do_connect();
                        }
                    }).detach();
                }
            });
            client_->set_message_handler(
                [this](websocketpp::connection_hdl, WSClient::message_ptr msg) {
                    if (msg->get_opcode() == websocketpp::frame::opcode::binary) {
                        const auto& bin = msg->get_payload();
                        auto data = json::from_msgpack(bin);
                        handle_message_json(data);
                    } else {
                        handle_message(msg->get_payload());
                    }
                });
            websocketpp::lib::error_code ec;
            auto con = client_->get_connection(ws_url_, ec);
            if (ec) {
                spdlog::error("SignalReceiver connect error: {}", ec.message());
                return false;
            }
            client_->connect(con);
            ws_thread_ = std::thread([this]() { client_->run(); });
            return true;
        } catch (const std::exception& e) {
            spdlog::error("SignalReceiver connect failed: {}", e.what());
            return false;
        }
    }

    void disconnect() {
        should_reconnect_ = false;
        if (connected_) client_->close(connection_, websocketpp::close::status::normal, "shutdown");
        if (ws_thread_.joinable()) ws_thread_.join();
        connected_ = false;
    }

    void on_signal(SignalCallback cb) { signal_cb_ = std::move(cb); }
    void on_candles(CandleCallback cb) { candle_cb_ = std::move(cb); }
    void on_arbitrage(ArbitrageCallback cb) { arb_cb_ = std::move(cb); }

    bool is_connected() const { return connected_; }
    bool is_trading_active() const { return trading_active_.load(std::memory_order_relaxed); }

    bool wait_for_data(int timeout_ms = 1000) {
        std::unique_lock<std::mutex> lk(mutex_);
        if (has_new_data_) { has_new_data_ = false; return true; }
        cv_.wait_for(lk, std::chrono::milliseconds(timeout_ms),
                     [this] { return has_new_data_.load(); });
        if (has_new_data_) { has_new_data_ = false; return true; }
        return false;
    }

    double get_price(const std::string& symbol) const { return get_price_impl(symbol); }
    double get_best_bid(const std::string& symbol) const { return get_best_bid_impl(symbol); }
    double get_best_ask(const std::string& symbol) const { return get_best_ask_impl(symbol); }

    double get_mid_price(const std::string& symbol) const {
        double bid = get_best_bid_impl(symbol);
        double ask = get_best_ask_impl(symbol);
        if (bid == 0.0 || ask == 0.0) return 0.0;
        return (bid + ask) / 2.0;
    }

    double get_bid_depth(const std::string& symbol, int levels) const {
        return get_bid_depth_impl(symbol, levels);
    }

    double get_ask_depth(const std::string& symbol, int levels) const {
        return get_ask_depth_impl(symbol, levels);
    }

    size_t get_all_prices_into(std::unordered_map<std::string, double>& out) const {
        return get_all_prices_into_impl(out);
    }

    std::unordered_map<std::string, double> get_all_prices() const {
        return get_all_prices_impl();
    }

    std::vector<Candle> get_candles(const std::string& symbol, size_t n = 100) const {
        return get_candles_impl(symbol, n);
    }

    size_t get_candles_into(const std::string& symbol, size_t n, std::vector<Candle>& out) const {
        return get_candles_into_impl(symbol, n, out);
    }

    OrderBook get_order_book(const std::string& symbol) const {
        return get_order_book_impl(symbol);
    }

    bool get_order_book_into(const std::string& symbol, OrderBook& out) const {
        return get_order_book_into_impl(symbol, out);
    }

  private:
#include "signal_receiver_handlers.h"

    std::string                 ws_url_;
    std::unique_ptr<WSClient>   client_;
    websocketpp::connection_hdl connection_;
    std::thread                 ws_thread_;
    std::atomic<bool>           connected_{false};
    std::atomic<bool>           trading_active_{true};
    std::atomic<bool>           should_reconnect_{false};
    int                         reconnect_delay_{1000};

    SignalCallback    signal_cb_;
    CandleCallback    candle_cb_;
    ArbitrageCallback arb_cb_;
};

} // namespace hft
