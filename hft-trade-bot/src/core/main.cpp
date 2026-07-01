// Main entry point — HFT Trade Bot v2.0
//
// Connects to the exchange simulator, receives market data and AI signals,
// runs fast C++ signal engine v2 (native, no Python/LLM), manages risk and
// positions, executes orders with smart routing + adaptive order type selection.
//
// Architecture:
//   SignalReceiver (WebSocket) → Market Data → PressureModel → SignalEngineV2 (fast path)
//   + AI Signals (slow path) → Risk Manager → SmartOrderRouterV2 → AdaptiveOrderSelectorV2
//   → Order Executor → Exchange
//
// Latency optimization:
//   - Thread pinning to dedicated core
//   - Spinlock for < 1μs critical sections
//   - SPSC queue for signal → executor pipeline
//   - ObjectPool for Signal/Order objects
//   - Latency histogram with P50/P95/P99/P99.9 tracking
//   - CircuitBreaker + RetryPolicy for resilience

#include "core/logger.h"
#include "core/config.h"
#include "data/types.h"
#include "data/signal.h"
#include "data/aligned_types.h"
#include "communication/signal_receiver.h"
#include "execution/order_executor.h"
#include "execution/order_type_selector.h"
#include "execution/smart_order_router_v2.h"
#include "execution/adaptive_order_selector_v2.h"
#include "risk/risk_manager.h"
#include "position/position_manager.h"
#include "strategies/signal_engine.h"
#include "strategies/signal_engine_v2.h"
#include "strategies/pressure_model.h"
#include "utils/low_latency.h"

#include <spdlog/spdlog.h>
#include <nlohmann/json.hpp>

#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#include <atomic>
#include <csignal>
#include <filesystem>
#include <cstring>

using json = nlohmann::json;
using namespace hft;

static std::atomic<bool> g_running{true};

void signal_handler(int) {
    g_running = false;
}

// ─── Simulated exchange for smart router ───────────────────────────────────
class SimExchange : public ExchangeBase {
public:
    SimExchange(const std::string& id, double maker_bps, double taker_bps,
                SignalReceiver& receiver)
        : ExchangeBase(id, maker_bps, taker_bps)
        , receiver_(receiver) {}

    double best_bid(const std::string& symbol) const override {
        return receiver_.get_order_book(symbol).best_bid();
    }
    double best_ask(const std::string& symbol) const override {
        return receiver_.get_order_book(symbol).best_ask();
    }
    double mid_price(const std::string& symbol) const override {
        return receiver_.get_order_book(symbol).mid_price();
    }
    double bid_depth(const std::string& symbol, int levels) const override {
        auto ob = receiver_.get_order_book(symbol);
        double depth = 0.0;
        int n = std::min(levels, static_cast<int>(ob.bids.size()));
        for (int i = 0; i < n; ++i) depth += ob.bids[i].quantity;
        return depth;
    }
    double ask_depth(const std::string& symbol, int levels) const override {
        auto ob = receiver_.get_order_book(symbol);
        double depth = 0.0;
        int n = std::min(levels, static_cast<int>(ob.asks.size()));
        for (int i = 0; i < n; ++i) depth += ob.asks[i].quantity;
        return depth;
    }

private:
    SignalReceiver& receiver_;
};

int main(int argc, char* argv[]) {
    std::string config_path = "config/config.yaml";
    if (argc > 1) config_path = argv[1];

    // Create log directory
    std::filesystem::create_directories("logs");

    // Load config
    Config config = Config::load(config_path);

    // Initialize logger (timestamped file in logs/ directory)
    Logger::init(config.log_level, "logs");

    spdlog::info("=" + std::string(60, '='));
    spdlog::info("  HFT TRADE BOT v2.0.0");
    spdlog::info("  Symbols: {}", fmt::join(config.symbols, ", "));
    spdlog::info("  Exchange: {}", config.default_exchange);
    spdlog::info("  Paper trading: {}", config.paper_trading);
    spdlog::info("  Signal Engine V2: {}", config.signal_engine_v2_enabled);
    spdlog::info("  Smart Router: {}", config.smart_router_enabled);
    spdlog::info("  Adaptive Orders: {}", config.adaptive_order_enabled);
    spdlog::info("  Thread Pinning: {}", config.thread_pinning_enabled);
    spdlog::info("=" + std::string(60, '='));

    // Set up signal handler
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    // ─── Latency optimization: thread pinning + priority ───
    if (config.thread_pinning_enabled) {
        if (ThreadAffinity::pin_to_core(config.execution_core_id)) {
            spdlog::info("Execution thread pinned to core {}", config.execution_core_id);
        } else {
            spdlog::warn("Failed to pin thread to core {}", config.execution_core_id);
        }
        if (ThreadAffinity::set_priority_max()) {
            spdlog::info("Thread priority set to maximum");
        } else {
            spdlog::warn("Failed to set thread priority");
        }
    }

    // ─── Latency histograms ───
    LatencyHistogram signal_latency_hist;
    LatencyHistogram risk_check_hist;
    LatencyHistogram order_exec_hist;
    LatencyHistogram total_loop_hist;

    // ─── Initialize components ───
    SignalReceiver receiver(config.ws_url);
    SignalReceiver ai_signal_receiver("ws://localhost:8766");
    RiskManager risk_mgr({
        config.max_risk_per_trade_pct,
        config.max_daily_drawdown_pct,
        config.min_confidence,
        config.min_rr_ratio,
        config.max_position_size_pct,
        config.max_open_positions,
    });
    PositionManager pos_mgr;
    OrderExecutor executor(config.ws_url, config.default_exchange);

    // ─── Signal Engine V2 ───
    SignalEngineV2::Params v2_params;
    v2_params.ema_fast_period = config.v2_ema_fast_period;
    v2_params.ema_slow_period = config.v2_ema_slow_period;
    v2_params.ema_signal_period = config.v2_ema_signal_period;
    v2_params.rsi_period = config.v2_rsi_period;
    v2_params.rsi_overbought = config.v2_rsi_overbought;
    v2_params.rsi_oversold = config.v2_rsi_oversold;
    v2_params.adx_period = config.v2_adx_period;
    v2_params.adx_trend_threshold = config.v2_adx_trend_threshold;
    v2_params.adx_strong_threshold = config.v2_adx_strong_threshold;
    v2_params.obi_levels_5 = config.v2_obi_levels_5;
    v2_params.obi_levels_10 = config.v2_obi_levels_10;
    v2_params.obi_levels_20 = config.v2_obi_levels_20;
    v2_params.atr_period = config.v2_atr_period;
    v2_params.sl_atr_mult = config.v2_sl_atr_mult;
    v2_params.tp_atr_mult = config.v2_tp_atr_mult;
    v2_params.cooldown_ms = config.v2_cooldown_ms;
    v2_params.buy_threshold = config.v2_buy_threshold;
    v2_params.sell_threshold = config.v2_sell_threshold;
    v2_params.min_confidence = config.v2_min_confidence;
    v2_params.obi_threshold = config.v2_obi_threshold;
    v2_params.pressure_threshold = config.v2_pressure_threshold;
    v2_params.vwap_band_mult = config.v2_vwap_band_mult;
    v2_params.vwap_dev_threshold = config.v2_vwap_dev_threshold;
    v2_params.toxic_penalty = config.v2_toxic_penalty;
    v2_params.body_direction_lookback = config.v2_body_direction_lookback;
    v2_params.dynamic_leverage = config.v2_dynamic_leverage;
    v2_params.max_leverage = config.v2_max_leverage;
    v2_params.high_confidence_leverage = config.v2_high_confidence_leverage;
    v2_params.emergency_confidence_threshold = config.v2_emergency_confidence_threshold;
    v2_params.emergency_adx_threshold = config.v2_emergency_adx_threshold;
    if (!v2_params.validate()) {
        spdlog::error("Signal Engine V2 params invalid: {}", v2_params.validation_error());
        return 1;
    }
    SignalEngineV2 engine_v2(v2_params);

    // ─── Pressure Model ───
    PressureModel::Params pressure_params;
    pressure_params.toxic_size_threshold = config.v2_toxic_size_threshold;
    PressureModel pressure_model(pressure_params);

    // ─── Smart Order Router V2 — 3 simulated exchanges ───
    SimExchange sim_binance("binance", 0.02, 0.04, receiver);
    SimExchange sim_okx("okx", 0.01, 0.03, receiver);
    SimExchange sim_bybit("bybit", 0.03, 0.05, receiver);
    // Simulate different latencies
    sim_binance.record_latency(120);
    sim_okx.record_latency(200);
    sim_bybit.record_latency(350);
    SmartOrderRouterV2::RoutingConfig router_config;
    router_config.strategy = static_cast<SmartOrderRouterV2::Strategy>(config.router_strategy);
    router_config.toxic_threshold = config.router_toxic_threshold;
    SmartOrderRouterV2 router(router_config);
    if (config.smart_router_enabled) {
        router.add_exchange(&sim_binance);
        router.add_exchange(&sim_okx);
        router.add_exchange(&sim_bybit);
    }

    // ─── Adaptive Order Selector V2 ───
    AdaptiveOrderSelectorV2::Params adaptive_params;
    adaptive_params.high_confidence = config.adaptive_high_confidence;
    adaptive_params.low_confidence = config.adaptive_low_confidence;
    adaptive_params.emergency_confidence = config.adaptive_emergency_confidence;
    adaptive_params.gtd_seconds = config.adaptive_gtd_seconds;
    AdaptiveOrderSelectorV2 adaptive_selector(adaptive_params);

    // ─── SPSC Queue: signal → executor pipeline ───
    SPSCQueue<FastOrder, 64> order_queue;

    // ─── Object pools ───
    ObjectPool<Signal, 16> signal_pool;
    ObjectPool<Order, 16> order_pool;

    // ─── Circuit breakers ───
    CircuitBreaker ws_circuit(5, 30);
    CircuitBreaker order_circuit(5, 30);

    double balance = 10000.0;

    // AI signal callback — when AI Signal Bot broadcasts a validated signal
    std::atomic<bool> has_ai_signal{false};
    Signal latest_ai_signal{};
    Spinlock ai_signal_lock;

    ai_signal_receiver.on_signal([&](const Signal& sig) {
        if (sig.direction == "LONG" || sig.direction == "SHORT") {
            ai_signal_lock.lock();
            latest_ai_signal = sig;
            ai_signal_lock.unlock();
            has_ai_signal = true;
        }
    });

    // Arbitrage callback — execute when spread > 10 bps
    std::atomic<bool> has_arb_opportunity{false};
    struct ArbOpportunity {
        std::string symbol;
        std::string buy_exchange;
        std::string sell_exchange;
        double buy_price;
        double sell_price;
        double spread_bps;
        double max_quantity;
    };
    ArbOpportunity latest_arb{};
    Spinlock arb_lock;

    receiver.on_arbitrage([&](const std::string& symbol,
                               const std::string& buy_exchange,
                               const std::string& sell_exchange,
                               double buy_price, double sell_price,
                               double spread_bps, double max_quantity) {
        arb_lock.lock();
        latest_arb = {symbol, buy_exchange, sell_exchange,
                      buy_price, sell_price, spread_bps, max_quantity};
        arb_lock.unlock();
        has_arb_opportunity = true;
    });

    // Connect to exchange simulator
    if (!receiver.connect()) {
        spdlog::error("Failed to connect to exchange simulator");
        return 1;
    }

    // Connect to AI Signal Bot signal publisher (optional — bot still works without it)
    if (ai_signal_receiver.connect()) {
        spdlog::info("Connected to AI Signal Bot signal publisher (port 8766)");
    } else {
        spdlog::warn("Could not connect to AI Signal Bot (port 8766) — running in standalone HFT mode");
    }

    if (!executor.connect()) {
        spdlog::warn("Order executor failed to connect (orders will be logged only)");
    }

    // Give connection time to establish
    std::this_thread::sleep_for(std::chrono::seconds(2));

    spdlog::info("HFT Trade Bot v2 running. Press Ctrl+C to stop.");

    // Main loop
    while (g_running) {
        ScopedLatency loop_timer(total_loop_hist);

        // Update position PnL
        auto prices = receiver.get_all_prices();
        pos_mgr.update_all_pnl(prices);

        // Check SL/TP triggers
        auto triggers = pos_mgr.check_sl_tp(prices);
        for (const auto& trigger : triggers) {
            spdlog::info("SL/TP triggered: {} {} @ {:.2f} ({})",
                trigger.symbol, trigger.price, trigger.price, trigger.reason);
            executor.close_position(trigger.symbol);
            auto closed = pos_mgr.close_position(trigger.symbol, trigger.price);
            if (closed) {
                balance += closed->unrealized_pnl;
                risk_mgr.update_pnl(closed->unrealized_pnl);
                spdlog::info("Position closed: {} PnL: {:+.2f}",
                    trigger.symbol, closed->unrealized_pnl);
            }
        }

        // Process arbitrage opportunities (highest priority)
        if (has_arb_opportunity.load()) {
            ArbOpportunity arb;
            {
                arb_lock.lock();
                arb = latest_arb;
                arb_lock.unlock();
                has_arb_opportunity = false;
            }

            // Execute arbitrage: buy low, sell high simultaneously
            if (executor.is_connected() && arb.max_quantity > 0.001) {
                // Cap quantity to avoid moving the market
                double qty = std::min(arb.max_quantity, 0.5);
                executor.execute_arbitrage(
                    arb.symbol, arb.buy_exchange, arb.sell_exchange,
                    qty, arb.buy_price, arb.sell_price
                );
            }
        }

        // Process AI Signal Bot signals (slow path — higher confidence)
        if (has_ai_signal.load()) {
            Signal ai_sig;
            {
                ai_signal_lock.lock();
                ai_sig = latest_ai_signal;
                ai_signal_lock.unlock();
                has_ai_signal = false;
            }

            // Risk check
            auto risk_result = risk_mgr.check_signal(ai_sig, balance, pos_mgr.position_count());
            if (risk_result.passed && !pos_mgr.has_position(ai_sig.symbol)) {
                double qty = risk_mgr.calculate_position_size(ai_sig, balance);
                if (qty > 0) {
                    spdlog::info("AI Signal execution: {} {} conf={:.1f} entry={:.2f} ({})",
                        ai_sig.direction, ai_sig.symbol, ai_sig.confidence,
                        ai_sig.entry_price, ai_sig.reason);
                    if (executor.is_connected()) {
                        executor.submit_order(ai_sig, qty, receiver.get_order_book(ai_sig.symbol));
                    }
                    pos_mgr.open_position(ai_sig, qty, config.default_exchange);
                }
            } else if (!risk_result.passed) {
                spdlog::debug("AI signal rejected by risk: {} ({})", ai_sig.symbol, risk_result.reason);
            }
        }

        // ─── Run Signal Engine V2 for each symbol (fast path) ───
        if (config.signal_engine_v2_enabled) {
            for (const auto& symbol : config.symbols) {
                ScopedLatency signal_timer(signal_latency_hist);

                auto candles = receiver.get_candles(symbol, 100);
                if (candles.size() < 30) continue;

                auto ob = receiver.get_order_book(symbol);
                if (ob.bids.empty() || ob.asks.empty()) {
                    // Generate a simple order book from current price
                    double price = receiver.get_price(symbol);
                    if (price == 0) continue;
                    ob.symbol = symbol;
                    ob.exchange = config.default_exchange;
                    for (int i = 0; i < 10; ++i) {
                        ob.bids.push_back({price * (1.0 - 0.0001 * (i + 1)), 1.0});
                        ob.asks.push_back({price * (1.0 + 0.0001 * (i + 1)), 1.0});
                    }
                }

                // Pressure model analysis
                auto pressure = pressure_model.analyze(ob);

                // Generate signal using V2 engine (pass full PressureResult)
                int64_t now_ns = FastSignal::now_ns();
                auto fast_sig = engine_v2.analyze(
                    symbol.c_str(), candles.data(), candles.size(),
                    ob, pressure, now_ns
                );

                if (!fast_sig.is_actionable() || fast_sig.confidence < config.v2_min_confidence) {
                    continue;
                }

                // Convert to Signal for risk check
                Signal sig;
                sig.symbol = fast_sig.symbol;
                sig.direction = fast_sig.dir_str();
                sig.confidence = fast_sig.confidence;
                sig.strategy = "hft_signal_engine_v2";
                sig.entry_price = fast_sig.entry_price;
                sig.stop_loss = fast_sig.stop_loss;
                sig.take_profit = fast_sig.take_profit;

                // Format reason from composite score
                char reason_buf[128];
                std::snprintf(reason_buf, sizeof(reason_buf),
                    "v2: comp=%+.3f EMA=%+.2f RSI=%+.2f OBI=%+.2f VWAP=%+.2f ADX=%.1f P=%+.2f",
                    fast_sig.composite_score, fast_sig.ema_score, fast_sig.rsi_score,
                    fast_sig.obi_score, fast_sig.vwap_score, fast_sig.adx_score,
                    fast_sig.pressure_score);
                sig.reason = reason_buf;

                // Risk check
                ScopedLatency risk_timer(risk_check_hist);
                auto risk_result = risk_mgr.check_signal(sig, balance, pos_mgr.position_count());
                if (!risk_result.passed) continue;

                // Check if we already have a position for this symbol
                if (pos_mgr.has_position(symbol)) continue;

                // Calculate position size
                double qty = risk_mgr.calculate_position_size(sig, balance);
                if (qty <= 0) continue;

                // ─── Smart order routing ───
                double mid = ob.mid_price();
                double spread_bps = mid > 0 ? ob.spread() / mid * 10000.0 : 999.0;

                if (config.smart_router_enabled) {
                    auto routing = router.route(symbol, fast_sig.is_long(), qty);
                    if (std::strlen(routing.exchange) == 0) {
                        spdlog::warn("Router: no available exchange for {}", symbol);
                        continue;
                    }
                    spdlog::debug("Router: {} → {} eff_price={:.2f} fee={:.4f}bps lat={}μs ({})",
                        symbol, routing.exchange, routing.effective_price,
                        routing.fee_bps, routing.latency_us, routing.reason);
                }

                // ─── Adaptive order type selection ───
                FastOrder::OrderKind order_kind = FastOrder::OrderKind::MARKET;
                double limit_price = 0.0;
                const char* order_reason = "default";

                if (config.adaptive_order_enabled) {
                    double top5_depth = 0.0;
                    int n = std::min(5, static_cast<int>(std::min(ob.bids.size(), ob.asks.size())));
                    for (int i = 0; i < n; ++i) {
                        top5_depth += ob.bids[i].quantity + ob.asks[i].quantity;
                    }

                    auto selection = adaptive_selector.select(
                        fast_sig.confidence, fast_sig.is_long(), mid, spread_bps,
                        pressure.obi_weighted, pressure.toxic_score,
                        qty, top5_depth, now_ns
                    );
                    order_kind = selection.kind;
                    limit_price = selection.limit_price;
                    order_reason = selection.reason;

                    // Record toxic event on all exchanges if detected
                    if (pressure.toxic_score >= 0.5) {
                        sim_binance.record_toxic_event();
                        sim_okx.record_toxic_event();
                        sim_bybit.record_toxic_event();
                    }
                }

                // Execute order
                ScopedLatency exec_timer(order_exec_hist);
                spdlog::info("HFT v2 Signal: {} {} conf={} entry={:.2f} kind={} spread={:.1f}bps toxic={:.2f} ({})",
                    fast_sig.dir_str(), symbol, static_cast<int>(fast_sig.confidence),
                    fast_sig.entry_price, order_kind == FastOrder::OrderKind::MARKET ? "MKT" :
                    order_kind == FastOrder::OrderKind::LIMIT_IOC ? "IOC" :
                    order_kind == FastOrder::OrderKind::LIMIT_FOK ? "FOK" :
                    order_kind == FastOrder::OrderKind::LIMIT_GTD ? "GTD" : "POST",
                    spread_bps, pressure.toxic_score, order_reason);

                // Submit via executor (convert to legacy order for now)
                if (executor.is_connected()) {
                    // Use existing executor with limit price if needed
                    if (order_kind == FastOrder::OrderKind::MARKET) {
                        executor.submit_order(sig, qty, ob);
                    } else {
                        // For limit orders, set price in order book context
                        // The existing executor handles LIMIT vs MARKET
                        OrderType type = OrderType::LIMIT;
                        // Create a modified order book with the limit price
                        OrderBook ob_modified = ob;
                        if (limit_price > 0) {
                            // Adjust best bid/ask to reflect limit price
                            if (fast_sig.is_long()) {
                                ob_modified.bids.insert(ob_modified.bids.begin(), {limit_price, qty});
                            } else {
                                ob_modified.asks.insert(ob_modified.asks.begin(), {limit_price, qty});
                            }
                        }
                        executor.submit_order(sig, qty, ob_modified);
                    }
                }
                pos_mgr.open_position(sig, qty, config.default_exchange);
            }
        } else {
            // ─── Fallback: V1 signal engine ───
            SignalEngine::Params engine_params;
            engine_params.fast_ema_period = config.fast_ema_period;
            engine_params.slow_ema_period = config.slow_ema_period;
            engine_params.obi_enabled = config.obi_enabled;
            engine_params.vwap_enabled = config.vwap_enabled;
            engine_params.pressure_enabled = config.pressure_model_enabled;
            SignalEngine engine(engine_params);

            for (const auto& symbol : config.symbols) {
                auto candles = receiver.get_candles(symbol, 100);
                if (candles.size() < 30) continue;

                auto ob = receiver.get_order_book(symbol);
                if (ob.bids.empty() || ob.asks.empty()) {
                    double price = receiver.get_price(symbol);
                    if (price == 0) continue;
                    ob.symbol = symbol;
                    ob.exchange = config.default_exchange;
                    for (int i = 0; i < 10; ++i) {
                        ob.bids.push_back({price * (1.0 - 0.0001 * (i + 1)), 1.0});
                        ob.asks.push_back({price * (1.0 + 0.0001 * (i + 1)), 1.0});
                    }
                }

                auto fast_sig = engine.analyze(symbol, candles, ob);

                if (fast_sig.direction != "NEUTRAL" && fast_sig.confidence >= config.min_confidence) {
                    Signal sig;
                    sig.symbol = fast_sig.symbol;
                    sig.direction = fast_sig.direction;
                    sig.confidence = fast_sig.confidence;
                    sig.strategy = "hft_signal_engine";
                    sig.entry_price = fast_sig.entry_price;
                    sig.stop_loss = fast_sig.stop_loss;
                    sig.take_profit = fast_sig.take_profit;
                    sig.reason = fast_sig.reason;

                    auto risk_result = risk_mgr.check_signal(sig, balance, pos_mgr.position_count());
                    if (!risk_result.passed) continue;
                    if (pos_mgr.has_position(symbol)) continue;

                    double qty = risk_mgr.calculate_position_size(sig, balance);
                    if (qty <= 0) continue;

                    spdlog::info("HFT v1 Signal: {} {} conf={:.1f} entry={:.2f} ({})",
                        sig.direction, sig.symbol, sig.confidence, sig.entry_price, sig.reason);

                    if (executor.is_connected()) {
                        executor.submit_order(sig, qty, ob);
                    }
                    pos_mgr.open_position(sig, qty, config.default_exchange);
                }
            }
        }

        // Print status + latency stats every 10 seconds
        static auto last_print = std::chrono::steady_clock::now();
        auto now = std::chrono::steady_clock::now();
        if (std::chrono::duration_cast<std::chrono::seconds>(now - last_print).count() >= 10) {
            last_print = now;
            auto positions = pos_mgr.get_positions();
            double unrealized = pos_mgr.total_unrealized_pnl();
            spdlog::info("Status: balance={:.2f} equity={:.2f} positions={} unrealized={:+.2f}",
                balance, balance + unrealized, positions.size(), unrealized);

            if (config.latency_histogram_enabled) {
                spdlog::info("  Latency — signal: [{}] risk: [{}] exec: [{}] loop: [{}]",
                    signal_latency_hist.format_stats(),
                    risk_check_hist.format_stats(),
                    order_exec_hist.format_stats(),
                    total_loop_hist.format_stats());
            }
        }

        // Sleep between cycles (HFT loop runs every 1 second)
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    // ─── Graceful shutdown: cancel all orders before exit ───
    spdlog::info("Shutting down — cancelling all open orders...");

    auto positions = pos_mgr.get_positions();
    for (const auto& pos : positions) {
        spdlog::info("  Closing position: {} {} qty={:.4f}", pos.symbol, pos.is_long() ? "LONG" : "SHORT", pos.quantity);
        executor.close_position(pos.symbol);
    }

    receiver.disconnect();
    ai_signal_receiver.disconnect();
    executor.disconnect();

    // Final latency report
    if (config.latency_histogram_enabled) {
        spdlog::info("Final latency report:");
        spdlog::info("  Signal generation: [{}]", signal_latency_hist.format_stats());
        spdlog::info("  Risk check:        [{}]", risk_check_hist.format_stats());
        spdlog::info("  Order execution:   [{}]", order_exec_hist.format_stats());
        spdlog::info("  Total loop:        [{}]", total_loop_hist.format_stats());
    }

    spdlog::info("HFT Trade Bot v2 stopped");
    return 0;
}
