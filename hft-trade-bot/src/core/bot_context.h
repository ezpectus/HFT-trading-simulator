#pragma once

#include "communication/signal_receiver.h"
#include "core/config.h"
#include "data/signal.h"
#include "data/types.h"
#include "execution/adaptive_order_selector_v2.h"
#include "execution/order_executor.h"
#include "ipc/shm_fill_producer.h"
#include "ipc/shm_heartbeat.h"
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
    std::unique_ptr<ipc::ShmHeartbeat>      shm_heartbeat;

    SPSCQueue<Signal, 16> ai_signal_queue;
    std::mutex            ai_signal_queue_mtx;

    // Initialized from config.initial_balance; kept in sync with the
    // exchange's account broadcast (accounts[exchange].balance) — S180.
    std::atomic<double> balance{10000.0};
    // Snapshot of total_realized_pnl() at the last UTC-day rollover — daily
    // realized PnL = total_realized_pnl() - daily_realized_baseline.
    double            daily_realized_baseline{0.0};
    std::atomic<bool> has_arb_opportunity{false};
    ArbOpportunity    latest_arb{};
    Spinlock          arb_lock;

    // Wall-clock ms of the last FILLED event — feeds /health last_fill_age_ms.
    std::atomic<int64_t>                    last_fill_ms{0};
    std::unordered_map<std::string, double> prices_cache;
    Spinlock                                prices_cache_lock;
    std::vector<Candle>                     candles_buf;
    OrderBook                               ob_buf;
    std::vector<SymbolEntry>                symbol_entries;
};

} // namespace hft
