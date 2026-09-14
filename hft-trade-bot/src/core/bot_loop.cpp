#include "core/bot_loop.h"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <ctime>

#ifdef _WIN32
#include <psapi.h>
#include <windows.h>
#else
#include <fstream>
#include <limits>
#endif

#include <spdlog/spdlog.h>

namespace hft {

namespace {
double process_memory_mb() {
#ifdef _WIN32
    PROCESS_MEMORY_COUNTERS pmc{};
    if (GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc))) {
        return static_cast<double>(pmc.WorkingSetSize) / (1024.0 * 1024.0);
    }
    return 0.0;
#else
    std::ifstream status("/proc/self/status");
    std::string   key;
    double        kb = 0.0;
    std::string   unit;
    while (status >> key) {
        if (key == "VmRSS:") {
            status >> kb >> unit;
            return kb / 1024.0;
        }
        status.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    }
    return 0.0;
#endif
}
} // namespace

void process_sl_tp(BotContext& ctx, double current_balance) {
    {
        SpinlockGuard guard(ctx.prices_cache_lock);
        ctx.receiver->get_all_prices_into(ctx.prices_cache);
    }
    ctx.pos_mgr.update_all_pnl(ctx.prices_cache);
    auto triggers = ctx.pos_mgr.check_sl_tp(ctx.prices_cache);
    for (const auto& trigger : triggers) {
        spdlog::info("SL/TP triggered: {} @ {:.2f} ({})", trigger.symbol, trigger.price,
                     trigger.reason);
        if (ctx.executor->close_position(trigger.symbol)) {
            // Keep the position on the book — the close fill arrives at the
            // real price with its fee and is booked by apply_fill (the
            // exchange is the source of truth, S248). Mark closing so this
            // trigger doesn't refire while the order is in flight; a stale
            // mark expires and re-fires.
            ctx.pos_mgr.mark_closing(trigger.symbol);
        } else {
            spdlog::warn("SL/TP close request not sent — keeping local position: {}",
                         trigger.symbol);
        }
    }
}

void process_arbitrage(BotContext& ctx, bool can_trade) {
    if (!ctx.has_arb_opportunity.load() || !can_trade) return;
    ArbOpportunity arb;
    {
        ctx.arb_lock.lock();
        arb = ctx.latest_arb;
        ctx.arb_lock.unlock();
        ctx.has_arb_opportunity = false;
    }
    if (ctx.executor->is_connected() && arb.max_quantity > 0.001) {
        double qty = std::min(arb.max_quantity, 0.5);
        if (ctx.executor->execute_arbitrage(arb.symbol, arb.buy_exchange, arb.sell_exchange, qty,
                                            arb.buy_price, arb.sell_price)) {
            ctx.sys_monitor.increment(SystemMonitor::Metric::ORDERS_SENT, 2);
        }
    }
}

// V2 pre-trade gate (S178): blacklist, leverage, per-symbol qty, total
// exposure, daily-loss, peak-drawdown, rate throttle, margin. Runs before
// every order submission — this is the production safety layer.
static bool precheck_order(BotContext& ctx, const Signal& sig, double qty, double price) {
    const double bal    = ctx.balance.load(std::memory_order_relaxed);
    const double equity = bal + ctx.pos_mgr.total_unrealized_pnl();
    auto check = ctx.risk_mgr->check_order(sig.symbol, sig.is_long() ? "BUY" : "SELL", qty, price,
                                           std::max<int>(1, static_cast<int>(sig.leverage)), equity,
                                           bal, ctx.pos_mgr.position_qty(sig.symbol));
    if (!check.passed) {
        ctx.sys_monitor.increment(SystemMonitor::Metric::ORDERS_REJECTED);
        spdlog::debug("Pre-trade risk rejected {}: {}", sig.symbol, check.reason);
    }
    return check.passed;
}

void process_ai_signals(BotContext& ctx, double current_balance, bool can_trade) {
    if (!can_trade) return;
    while (true) {
        Signal ai_sig;
        if (!ctx.ai_signal_queue.pop(ai_sig)) break;
        auto risk_result =
            ctx.risk_mgr->check_signal(ai_sig, current_balance, ctx.pos_mgr.position_count());
        if (risk_result.passed && !ctx.pos_mgr.has_position(ai_sig.symbol)) {
            double qty = ctx.risk_mgr->calculate_position_size(ai_sig, current_balance);
            if (qty > 0) {
                spdlog::info("AI Signal execution: {} {} conf={:.1f} entry={:.2f} ({})",
                             ai_sig.direction, ai_sig.symbol, ai_sig.confidence, ai_sig.entry_price,
                             ai_sig.reason);
                if (precheck_order(ctx, ai_sig, qty, ai_sig.entry_price)) {
                    if (ctx.executor->is_connected() &&
                        ctx.executor->submit_order(ai_sig, qty,
                                                   ctx.receiver->get_order_book(ai_sig.symbol))) {
                        ctx.sys_monitor.increment(SystemMonitor::Metric::ORDERS_SENT);
                        // Book on fill, not on send — a send ack is not a
                        // position (S179).
                        ctx.pos_mgr.add_pending_order(ai_sig, qty, ctx.config.default_exchange);
                    } else {
                        spdlog::warn("Order not sent — no local order recorded for {}",
                                     ai_sig.symbol);
                    }
                }
                ctx.sys_monitor.increment(SystemMonitor::Metric::SIGNALS_PROCESSED);
            }
        } else if (!risk_result.passed) {
            spdlog::debug("AI signal rejected by risk: {} ({})", ai_sig.symbol, risk_result.reason);
        }
    }
}

static void prepare_order_book(BotContext& ctx, uint16_t sym_id, const std::string& symbol) {
    bool ob_found = ctx.receiver->get_order_book_by_id(sym_id, ctx.ob_buf);
    if (ob_found && !ctx.ob_buf.bids.empty() && !ctx.ob_buf.asks.empty()) return;
    double price = ctx.receiver->get_price_by_id(sym_id);
    if (price == 0) return;
    static bool synthetic_warned = false;
    if (!synthetic_warned) {
        spdlog::warn("Generating synthetic order book for {} — no real order book data available. "
                     "Using fake 10-level book with 1bp spacing and 1.0 qty. "
                     "Results are unrealistic for production trading.",
                     symbol);
        synthetic_warned = true;
    }
    ctx.ob_buf.symbol   = symbol;
    ctx.ob_buf.exchange = ctx.config.default_exchange;
    ctx.ob_buf.bids.clear();
    ctx.ob_buf.asks.clear();
    for (int i = 0; i < 10; ++i) {
        ctx.ob_buf.bids.push_back({price * (1.0 - 0.0001 * (i + 1)), 1.0});
        ctx.ob_buf.asks.push_back({price * (1.0 + 0.0001 * (i + 1)), 1.0});
    }
}

static FastSignal generate_signal(BotContext& ctx, const char* sym_cstr, const Candle* candles,
                                  size_t n, const OrderBook& ob, int64_t now_ns) {
    auto pressure = ctx.pressure_model->analyze(ob);
    if (ctx.engine_v3) {
        return ctx.engine_v3->analyze_incremental(sym_cstr, candles, n, ob, pressure, now_ns);
    }
    return ctx.engine_v2->analyze_incremental(sym_cstr, candles, n, ob, pressure, now_ns);
}

static Signal convert_fast_signal(BotContext& ctx, const FastSignal& fast_sig) {
    Signal sig;
    sig.symbol      = fast_sig.symbol;
    sig.direction   = fast_sig.dir_str();
    sig.confidence  = fast_sig.confidence;
    sig.strategy    = ctx.engine_v3 ? "hft_signal_engine_v3" : "hft_signal_engine_v2";
    sig.entry_price = fast_sig.entry_price;
    sig.stop_loss   = fast_sig.stop_loss;
    sig.take_profit = fast_sig.take_profit;
    // S243: carry engine-computed leverage + timestamp — timestamp feeds the
    // wire client_order_id ("hft_<sym>_<ts>"); dropping it collapsed every
    // engine order onto cid "..._0" and the sim dedup replayed the first fill.
    sig.leverage  = fast_sig.leverage;
    sig.timestamp = fast_sig.timestamp;
    char reason_buf[128];
    std::snprintf(reason_buf, sizeof(reason_buf),
                  "v2: comp=%+.3f EMA=%+.2f RSI=%+.2f OBI=%+.2f VWAP=%+.2f ADX=%.1f P=%+.2f",
                  fast_sig.composite_score, fast_sig.ema_score, fast_sig.rsi_score,
                  fast_sig.obi_score, fast_sig.vwap_score, fast_sig.adx_score,
                  fast_sig.pressure_score);
    sig.reason = reason_buf;
    return sig;
}

struct OrderSelection {
    FastOrder::OrderKind kind;
    double               limit_price;
    int64_t              expire_ns;
    const char*          reason;
};

static OrderSelection select_order_kind(BotContext& ctx, const FastSignal& fast_sig,
                                        const OrderBook& ob, double qty, double mid,
                                        double spread_bps, int64_t now_ns) {
    if (!ctx.config.adaptive_order_enabled)
        return {FastOrder::OrderKind::MARKET, 0.0, 0, "default"};
    auto pressure = ctx.pressure_model->analyze(ob);
    // Depth on the side the order crosses: buys lift asks, sells hit bids.
    const auto& levels     = fast_sig.is_long() ? ob.asks : ob.bids;
    double      top5_depth = 0.0;
    for (size_t i = 0; i < levels.size() && i < 5; ++i)
        top5_depth += levels[i].quantity;
    auto sel = ctx.adaptive_selector->select(fast_sig.confidence, fast_sig.is_long(), mid,
                                             spread_bps, pressure.obi_weighted,
                                             pressure.toxic_score, qty, top5_depth, now_ns);
    return {sel.kind, sel.limit_price, sel.expire_ns, sel.reason};
}

static void execute_v2_order(BotContext& ctx, const Signal& sig, const FastSignal& fast_sig,
                             const OrderBook& ob, double qty, int64_t now_ns) {
    double mid        = ob.mid_price();
    double spread_bps = mid > 0 ? ob.spread() / mid * 10000.0 : 999.0;
    auto   os         = select_order_kind(ctx, fast_sig, ob, qty, mid, spread_bps, now_ns);
    spdlog::info("HFT v2 Signal: {} {} conf={} entry={:.2f} kind={} spread={:.1f}bps ({})",
                 fast_sig.dir_str(), sig.symbol, static_cast<int>(fast_sig.confidence),
                 fast_sig.entry_price,
                 os.kind == FastOrder::OrderKind::MARKET      ? "MKT"
                 : os.kind == FastOrder::OrderKind::LIMIT_IOC ? "IOC"
                 : os.kind == FastOrder::OrderKind::LIMIT_FOK ? "FOK"
                 : os.kind == FastOrder::OrderKind::LIMIT_GTD ? "GTD"
                                                              : "POST",
                 spread_bps, os.reason);
    bool sent = false;
    if (ctx.executor->is_connected()) {
        const double order_price = (os.limit_price > 0) ? os.limit_price : mid;
        if (!precheck_order(ctx, sig, qty, order_price)) {
            ctx.sys_monitor.increment(SystemMonitor::Metric::SIGNALS_PROCESSED);
            return;
        }
        // The selected kind now reaches the wire: IOC/FOK/GTD/post_only are
        // serialized instead of silently degrading to plain LIMIT (S154).
        sent = ctx.executor->submit_order(sig, qty, ob, os.kind, os.limit_price, os.expire_ns);
        if (sent)
            ctx.sys_monitor.increment(SystemMonitor::Metric::ORDERS_SENT);
        else
            spdlog::warn("Order not sent — no local order recorded for {}", sig.symbol);
    }
    ctx.sys_monitor.increment(SystemMonitor::Metric::SIGNALS_PROCESSED);
    // Book on fill, not on send — resting LIMITs (GTD/POST/IOC leftovers)
    // must not appear as positions before the exchange confirms them (S179).
    if (sent) ctx.pos_mgr.add_pending_order(sig, qty, ctx.config.default_exchange);
}

void run_v2_signal_loop(BotContext& ctx, double current_balance, bool can_trade) {
    // v3 replaces v2 inside generate_signal when constructed — the loop must
    // run when *either* engine is enabled, or v3-only configs stay dark.
    if ((!ctx.config.signal_engine_v2_enabled && !ctx.config.signal_engine_v3_enabled) ||
        !can_trade)
        return;
    for (const auto& [symbol, sym_cstr, sym_id] : ctx.symbol_entries) {
        ScopedLatency signal_timer(ctx.signal_latency_hist);
        auto          candles_count = ctx.receiver->get_candles_by_id(sym_id, 100, ctx.candles_buf);
        if (candles_count < 30) continue;
        prepare_order_book(ctx, sym_id, symbol);
        if (ctx.ob_buf.bids.empty() || ctx.ob_buf.asks.empty()) continue;
        int64_t now_ns   = FastSignal::now_ns();
        auto    fast_sig = generate_signal(ctx, sym_cstr, ctx.candles_buf.data(),
                                           ctx.candles_buf.size(), ctx.ob_buf, now_ns);
        if (!fast_sig.is_actionable() || fast_sig.confidence < ctx.config.v2_min_confidence)
            continue;
        auto          sig = convert_fast_signal(ctx, fast_sig);
        ScopedLatency risk_timer(ctx.risk_check_hist);
        auto          risk_result =
            ctx.risk_mgr->check_signal(sig, current_balance, ctx.pos_mgr.position_count());
        if (!risk_result.passed || ctx.pos_mgr.has_position(symbol)) continue;
        double qty = ctx.risk_mgr->calculate_position_size(sig, current_balance);
        if (qty <= 0) continue;
        ScopedLatency exec_timer(ctx.order_exec_hist);
        execute_v2_order(ctx, sig, fast_sig, ctx.ob_buf, qty, now_ns);
    }
}

void run_v1_fallback_loop(BotContext& ctx, double current_balance) {
    for (const auto& symbol : ctx.config.symbols) {
        auto candles = ctx.receiver->get_candles(symbol, 100);
        if (candles.size() < 30u) continue;
        auto ob = ctx.receiver->get_order_book(symbol);
        if (ob.bids.empty() || ob.asks.empty()) {
            double price = ctx.receiver->get_price(symbol);
            if (price == 0) continue;
            static bool synthetic_warned = false;
            if (!synthetic_warned) {
                spdlog::warn("Generating synthetic order book (v1 fallback) for {} — no real order "
                             "book data available. Using fake 10-level book with 1bp spacing and "
                             "1.0 qty. Results are unrealistic for production trading.",
                             symbol);
                synthetic_warned = true;
            }
            ob.symbol   = symbol;
            ob.exchange = ctx.config.default_exchange;
            for (int i = 0; i < 10; ++i) {
                ob.bids.push_back({price * (1.0 - 0.0001 * (i + 1)), 1.0});
                ob.asks.push_back({price * (1.0 + 0.0001 * (i + 1)), 1.0});
            }
        }
        auto fast_sig = ctx.engine_v1->analyze(symbol, candles, ob);
        if (fast_sig.direction == "NEUTRAL" || fast_sig.confidence < ctx.config.min_confidence)
            continue;
        Signal sig;
        sig.symbol      = fast_sig.symbol;
        sig.direction   = fast_sig.direction;
        sig.confidence  = fast_sig.confidence;
        sig.strategy    = "hft_signal_engine";
        sig.entry_price = fast_sig.entry_price;
        sig.stop_loss   = fast_sig.stop_loss;
        sig.take_profit = fast_sig.take_profit;
        sig.reason      = fast_sig.reason;
        // S243: V1's FastSignal carries no timestamp — stamp order time so the
        // wire client_order_id is unique per order (sim dedups on sym+ts).
        sig.timestamp = FastSignal::now_ns();
        auto rr = ctx.risk_mgr->check_signal(sig, current_balance, ctx.pos_mgr.position_count());
        if (!rr.passed || ctx.pos_mgr.has_position(symbol)) continue;
        double qty = ctx.risk_mgr->calculate_position_size(sig, current_balance);
        if (qty <= 0) continue;
        spdlog::info("HFT v1 Signal: {} {} conf={:.1f} entry={:.2f} ({})", sig.direction,
                     sig.symbol, sig.confidence, sig.entry_price, sig.reason);
        if (precheck_order(ctx, sig, qty, sig.entry_price)) {
            if (ctx.executor->is_connected() && ctx.executor->submit_order(sig, qty, ob)) {
                ctx.pos_mgr.add_pending_order(sig, qty, ctx.config.default_exchange);
            } else {
                spdlog::warn("Order not sent — no local order recorded for {}", sig.symbol);
            }
        }
    }
}

// Feeds the V2 risk trackers every loop tick (S178): UTC-day rollover resets
// daily counters, mark-to-market updates daily PnL + peak equity, and the
// daily-loss / max-drawdown limits trip the kill switch (the file trigger was
// previously the only live path — activate() had zero callers).
void update_risk_state(BotContext& ctx, double current_balance) {
    static int        last_day_key = -1;
    const std::time_t tt = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
    std::tm           tm_utc{};
#ifdef _WIN32
    gmtime_s(&tm_utc, &tt);
#else
    gmtime_r(&tt, &tm_utc);
#endif
    const int day_key = tm_utc.tm_year * 1000 + tm_utc.tm_yday;
    if (day_key != last_day_key) {
        last_day_key                = day_key;
        ctx.daily_realized_baseline = ctx.pos_mgr.total_realized_pnl();
        ctx.risk_mgr->reset_daily();
    }

    const double unrealized     = ctx.pos_mgr.total_unrealized_pnl();
    const double realized_today = ctx.pos_mgr.total_realized_pnl() - ctx.daily_realized_baseline;
    const double equity         = current_balance + unrealized;
    ctx.risk_mgr->update_pnl_v2(realized_today, unrealized, equity);

    if (ctx.risk_mgr->daily_pnl() < -ctx.config.daily_loss_limit) {
        spdlog::critical("Daily loss limit breached: {:.2f} < -{:.2f}", ctx.risk_mgr->daily_pnl(),
                         ctx.config.daily_loss_limit);
        ctx.kill_switch->activate(KillSwitch::Reason::DAILY_LOSS);
    }
    const double peak = ctx.risk_mgr->peak_equity();
    if (peak > 0.0 && (1.0 - equity / peak) > ctx.config.max_drawdown_pct) {
        spdlog::critical("Max drawdown breached: equity={:.2f} peak={:.2f}", equity, peak);
        ctx.kill_switch->activate(KillSwitch::Reason::MAX_DRAWDOWN);
    }
}

// Refresh the /health snapshot from live state every loop iteration — the
// endpoint is only as honest as this feed (S246). All fields are cheap
// atomic reads; the error window is a file-local rolling baseline.
void update_health_status(BotContext& ctx) {
    if (!ctx.health_server) return;

    static int64_t err_baseline = 0;
    static auto    err_window   = std::chrono::steady_clock::now();
    const int64_t  err_total    = ctx.sys_monitor.get(SystemMonitor::Metric::ERRORS);
    const auto     now_steady   = std::chrono::steady_clock::now();
    if (now_steady - err_window >= std::chrono::minutes(5)) {
        err_window   = now_steady;
        err_baseline = err_total;
    }

    const int64_t last_fill = ctx.last_fill_ms.load(std::memory_order_relaxed);
    const int64_t now_ms    = std::chrono::duration_cast<std::chrono::milliseconds>(
                               std::chrono::system_clock::now().time_since_epoch())
                               .count();

    HealthStatus hs;
    hs.shm_healthy = !ctx.config.ipc_enabled || (ctx.shm_signal_consumer != nullptr);
    hs.exchange_connected =
        ctx.receiver->is_connected() && ctx.executor && ctx.executor->is_connected();
    hs.signal_engine_active = ctx.config.signal_engine_v2_enabled ? (ctx.engine_v2 || ctx.engine_v3)
                                                                  : (ctx.engine_v1 != nullptr);
    hs.last_signal_age_ms   = ctx.receiver->last_activity_ms();
    hs.last_fill_age_ms     = last_fill > 0 ? static_cast<uint64_t>(now_ms - last_fill) : 0;
    hs.error_count_5min     = err_total - err_baseline;
    hs.memory_usage_mb      = process_memory_mb();
    ctx.health_server->update_health(hs);

    // Feed the /hft_heartbeat region scripts/monitor.py tails (S224).
    if (ctx.shm_heartbeat) {
        ctx.shm_heartbeat->beat(ctx.sys_monitor.get(SystemMonitor::Metric::ORDERS_SENT),
                                ctx.sys_monitor.get(SystemMonitor::Metric::ORDERS_FILLED),
                                ctx.sys_monitor.get(SystemMonitor::Metric::SIGNALS_PROCESSED),
                                err_total);
    }
}

void print_status(BotContext& ctx) {
    auto   positions  = ctx.pos_mgr.get_positions();
    double unrealized = ctx.pos_mgr.total_unrealized_pnl();
    {
        uint64_t buckets[SystemMonitor::LATENCY_BUCKETS]{};
        uint64_t lat_total = 0;
        double   lat_sum   = 0.0;
        ctx.order_exec_hist.snapshot_buckets(buckets, SystemMonitor::LATENCY_BUCKETS, &lat_total,
                                             &lat_sum);
        ctx.sys_monitor.set_latency_histogram(buckets, SystemMonitor::LATENCY_BUCKETS, lat_total,
                                              lat_sum);
        ctx.sys_monitor.set_runtime_gauges(SystemMonitor::RuntimeGauges{
            .active_positions       = static_cast<double>(positions.size()),
            .pnl_unrealized         = unrealized,
            .pnl_total              = ctx.pos_mgr.total_realized_pnl() + unrealized,
            .memory_usage_mb        = process_memory_mb(),
            .shm_signal_queue_depth = static_cast<double>(
                ctx.shm_signal_consumer ? ctx.shm_signal_consumer->pending() : 0),
            .shm_order_queue_depth = static_cast<double>(ctx.ai_signal_queue.size()),
            .shm_fill_queue_depth =
                static_cast<double>(ctx.shm_fill_producer ? ctx.shm_fill_producer->pending() : 0),
        });
    }
    spdlog::info(
        "Status: balance={:.2f} equity={:.2f} positions={} unrealized={:+.2f} trading={} kill={}",
        ctx.balance.load(std::memory_order_relaxed),
        ctx.balance.load(std::memory_order_relaxed) + unrealized, positions.size(), unrealized,
        ctx.receiver->is_trading_active() ? "ACTIVE" : "STOPPED",
        ctx.kill_switch->is_active() ? "TRIGGERED" : "ARMED");
    if (ctx.config.latency_histogram_enabled) {
        spdlog::info("  Latency — signal: [{}] risk: [{}] exec: [{}] loop: [{}]",
                     ctx.signal_latency_hist.format_stats(), ctx.risk_check_hist.format_stats(),
                     ctx.order_exec_hist.format_stats(), ctx.total_loop_hist.format_stats());
    }
    auto snap = ctx.sys_monitor.snapshot();
    spdlog::info("  Monitor — orders: sent={} filled={} rejected={} | signals: recv={} "
                 "proc={} | errors={} uptime={}s fill_rate={:.1f}%",
                 snap.orders_sent, snap.orders_filled, snap.orders_rejected, snap.signals_received,
                 snap.signals_processed, snap.errors, snap.uptime_seconds, snap.fill_rate * 100.0);
}

void poll_shm_market_data(BotContext& ctx) {
    if (!ctx.shm_market_data || !ctx.receiver->has_shm_data()) return;
    uint8_t max_sym = ctx.shm_market_data->max_symbols();
    for (uint8_t sid = 0; sid < max_sym; ++sid) {
        ipc::MarketSnapshotMsg snap;
        if (ctx.shm_market_data->read_snapshot(sid, snap)) {
            ctx.receiver->inject_snapshot(sid, snap.bid, snap.ask, snap.last, snap.volume);
        }
    }
}

void graceful_shutdown(BotContext& ctx) {
    spdlog::info("Shutting down — cancelling all open orders...");
    if (ctx.executor && ctx.executor->cancel_all_orders()) {
        spdlog::info("  Cancel-all-orders request sent");
    } else {
        spdlog::warn("  Cancel-all-orders request NOT sent — resting orders may stay live");
    }
    auto positions = ctx.pos_mgr.get_positions();
    for (const auto& pos : positions) {
        spdlog::info("  Closing position: {} {} qty={:.4f}", pos.symbol,
                     pos.is_long() ? "LONG" : "SHORT", pos.quantity);
        ctx.executor->close_position(pos.symbol);
    }
    ctx.receiver->disconnect();
    if (ctx.ai_signal_receiver) ctx.ai_signal_receiver->disconnect();
    ctx.executor->disconnect();
    ctx.kill_switch->stop_monitoring();
    ctx.kill_switch->close();
    if (ctx.shm_signal_consumer) ctx.shm_signal_consumer->stop();
    if (ctx.shm_fill_producer) ctx.shm_fill_producer->close();
    ctx.health_server->stop();
    if (ctx.config.latency_histogram_enabled) {
        spdlog::info("Final latency report:");
        spdlog::info("  Signal generation: [{}]", ctx.signal_latency_hist.format_stats());
        spdlog::info("  Risk check:        [{}]", ctx.risk_check_hist.format_stats());
        spdlog::info("  Order execution:   [{}]", ctx.order_exec_hist.format_stats());
        spdlog::info("  Total loop:        [{}]", ctx.total_loop_hist.format_stats());
    }
    spdlog::info("HFT Trade Bot v2 stopped");
}

} // namespace hft
