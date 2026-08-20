#pragma once

#include "communication/signal_receiver.h"
#include "core/config.h"
#include "data/signal.h"
#include "data/types.h"
#include "execution/adaptive_order_selector_v2.h"
#include "execution/order_executor.h"
#include "execution/smart_order_router_v2.h"
#include "exchange/BinanceAdapter.h"
#include "exchange/BybitAdapter.h"
#include "exchange/OKXAdapter.h"
#include "ipc/shm_fill_producer.h"
#include "ipc/shm_market_data.h"
#include "ipc/shm_signal_consumer.h"
#include "monitoring/health_server.h"
#include "monitoring/system_monitor.h"
#include "position/position_manager.h"
#include "risk/kill_switch.h"
#include "risk/risk_manager.h"
#include "strategies/pressure_model.h"
#include "strategies/signal_engine.h"
#include "strategies/signal_engine_v2.h"
#include "strategies/signal_engine_v3.h"
#include "utils/low_latency.h"

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace hft {

class SimExchange : public ExchangeBase {
  public:
    SimExchange(const std::string& id, double maker_bps, double taker_bps, SignalReceiver& receiver)
        : ExchangeBase(id, maker_bps, taker_bps), receiver_(receiver) {}

    double best_bid(const std::string& symbol) const override { return receiver_.get_best_bid(symbol); }
    double best_ask(const std::string& symbol) const override { return receiver_.get_best_ask(symbol); }
    double mid_price(const std::string& symbol) const override { return receiver_.get_mid_price(symbol); }
    double bid_depth(const std::string& symbol, int levels) const override { return receiver_.get_bid_depth(symbol, levels); }
    double ask_depth(const std::string& symbol, int levels) const override { return receiver_.get_ask_depth(symbol, levels); }

  private:
    SignalReceiver& receiver_;
};

struct SymbolEntry {
    std::string symbol;
    const char* cstr;
    uint16_t    id;
};

struct ArbOpportunity {
    std::string symbol;
    std::string buy_exchange;
    std::string sell_exchange;
    double      buy_price;
    double      sell_price;
    double      spread_bps;
    double      max_quantity;
};

struct BotContext {
    Config                                   config;
    std::unique_ptr<SignalReceiver>          receiver;
    std::unique_ptr<SignalReceiver>          ai_signal_receiver;
    std::unique_ptr<RiskManager>             risk_mgr;
    PositionManager                          pos_mgr;
    std::unique_ptr<OrderExecutor>           executor;
    std::unique_ptr<SignalEngineV2>          engine_v2;
    std::unique_ptr<SignalEngineV3>          engine_v3;
    std::unique_ptr<SignalEngine>            engine_v1;
    std::unique_ptr<PressureModel>           pressure_model;
    std::unique_ptr<SmartOrderRouterV2>      router;
    std::unique_ptr<AdaptiveOrderSelectorV2> adaptive_selector;
    std::unique_ptr<KillSwitch>              kill_switch;
    SystemMonitor                            sys_monitor;
    std::unique_ptr<HealthServer>            health_server;
    LatencyHistogram                         signal_latency_hist;
    LatencyHistogram                         risk_check_hist;
    LatencyHistogram                         order_exec_hist;
    LatencyHistogram                         total_loop_hist;

    std::unique_ptr<ipc::ShmSignalConsumer> shm_signal_consumer;
    std::unique_ptr<ipc::ShmFillProducer>   shm_fill_producer;
    std::unique_ptr<ipc::ShmMarketData>     shm_market_data;

    std::unique_ptr<BinanceAdapter> real_binance;
    std::unique_ptr<OKXAdapter>     real_okx;
    std::unique_ptr<BybitAdapter>   real_bybit;
    std::unique_ptr<SimExchange>    sim_binance;
    std::unique_ptr<SimExchange>    sim_okx;
    std::unique_ptr<SimExchange>    sim_bybit;

    SPSCQueue<Signal, 16> ai_signal_queue;
    std::mutex            ai_signal_queue_mtx;

    std::atomic<double>      balance{10000.0};
    std::atomic<bool>        has_arb_opportunity{false};
    ArbOpportunity           latest_arb{};
    Spinlock                 arb_lock;

    std::unordered_map<std::string, double> prices_cache;
    std::vector<Candle>                     candles_buf;
    OrderBook                               ob_buf;
    std::vector<SymbolEntry>                symbol_entries;
};

} // namespace hft
