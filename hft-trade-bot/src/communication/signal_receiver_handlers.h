// ═══════════════════════════════════════════════════════════════════════════════
// SignalReceiver message handlers — JSON message dispatch and parsing
//
// Extracted from signal_receiver.h for file-size compliance.
// All methods are private members of SignalReceiver, defined inline.
// Included from within SignalReceiver's private section.
// ═══════════════════════════════════════════════════════════════════════════════

void handle_message(const std::string& payload) {
    auto data = json::parse(payload, nullptr, false);
    if (data.is_discarded() || !data.is_object()) {
        spdlog::warn("Invalid JSON received (len={})", payload.size());
        return;
    }
    handle_message_json(data);
}

void handle_message_json(const json& data) {
    const auto       type_sv = data.value("type", ""sv);
    std::string_view type    = type_sv;

    if (type == "candles" || type == "snapshot" || type == "sync_state") {
        handle_market_data(data);
    } else if (type == "trading_state") {
        trading_active_.store(data.value("trading_active", true), std::memory_order_relaxed);
        spdlog::info("Trading state: {}",
                     data.value("trading_active", true) ? "ACTIVE" : "STOPPED");
    } else if (type == "replay_state") {
        if (data.value("paused", false)) spdlog::info("Simulation PAUSED");
    } else if (type == "fill") {
        if (data.contains("order")) {
            auto&             o       = data["order"];
            const std::string fside   = o.value("side", "");
            const std::string fsymbol = o.value("symbol", "");
            const std::string fstatus = o.value("status", "FILLED");
            const double      fqty    = o.value("filled_quantity", 0.0);
            const double      fprice  = o.value("filled_price", 0.0);
            const double      ffee    = o.value("fee", 0.0);
            spdlog::info("Order {}: {} {} {:.4f} @ {:.2f}", fstatus, fside, fsymbol, fqty, fprice);
            // Reconcile the local position book — fills are the exchange's
            // source of truth (S179).
            if (fill_cb_) fill_cb_(fsymbol, fside, fstatus, fqty, fprice, ffee);
            // Share the fill with the Python side over SHM (ipc.fills ring).
            if (fill_producer_) {
                const auto sid = symbol_id_impl(o.value("symbol", ""));
                if (sid != 0xFFFF) {
                    ipc::FillMsg f{};
                    f.timestamp = static_cast<uint64_t>(
                        std::chrono::duration_cast<std::chrono::nanoseconds>(
                            std::chrono::system_clock::now().time_since_epoch())
                            .count());
                    f.symbol_id = static_cast<uint8_t>(sid);
                    f.side = (o.value("side", "") == "SELL") ? static_cast<uint8_t>(ipc::Side::SELL)
                                                             : static_cast<uint8_t>(ipc::Side::BUY);
                    f.qty  = static_cast<float>(o.value("filled_quantity", 0.0));
                    f.price       = static_cast<float>(o.value("filled_price", 0.0));
                    f.fee         = static_cast<float>(o.value("fee", 0.0));
                    f.exchange_id = static_cast<uint8_t>(ipc::ExchangeId::SIMULATOR);
                    // S246: a full SHM ring silently dropped fills — count it.
                    if (!fill_producer_->push_fill(f) && monitor_) {
                        monitor_->increment(SystemMonitor::Metric::SHM_DROPS);
                    }
                }
            }
        }
    } else if (type == "error") {
        spdlog::warn("Exchange error: {}", data.value("message", "unknown error"));
    } else if (type == "signal") {
        handle_signal_msg(data);
    } else if (type == "signal_history") {
        handle_signal_history(data);
    } else if (type == "market_regime") {
        spdlog::debug("Market regime: {} {} trend={:.2f} cycle={:.2f}", data.value("symbol", ""),
                      data.value("regime", ""), data.value("trend_score", 0.0),
                      data.value("cycle_strength", 0.0));
    } else if (type == "circuit_breaker_status") {
        std::string state = data.value("state", "CLOSED");
        if (state != "CLOSED") {
            spdlog::warn("Circuit breaker: {} (failures={})", state,
                         data.value("consecutive_failures", 0));
        }
    } else if (type == "welcome") {
        trading_active_.store(data.value("trading_active", true), std::memory_order_relaxed);
        spdlog::info("Server welcome: protocol v{}, trading={}", data.value("protocol_version", 1),
                     data.value("trading_active", true) ? "ACTIVE" : "STOPPED");
    } else if (type == "arbitrage_scan") {
        handle_arbitrage_msg(data);
    } else if (type == "order_cancelled") {
        if (order_cancelled_cb_ && data.contains("order")) {
            order_cancelled_cb_(data["order"].value("symbol", ""));
        }
    } else if (type == "orders_cancelled") {
        // Cancel-all carries order_ids only — clear every pending order.
        if (order_cancelled_cb_) order_cancelled_cb_("");
    }
}

void handle_market_data(const json& data) {
    if (data.contains("trading_active")) {
        trading_active_.store(data["trading_active"].get<bool>(), std::memory_order_relaxed);
    }
    has_new_data_.store(true, std::memory_order_release);
    cv_.notify_one();

    if (data.contains("prices")) update_prices(data["prices"], data);
    // Account snapshot (balance/equity/positions) rides every broadcast — the
    // exchange is the source of truth for account state (S180).
    if (data.contains("accounts") && account_cb_) account_cb_(data["accounts"]);
    if (data.contains("orderbooks")) update_orderbooks(data, data.value("timestamp", 0));
    if (data.contains("orderbook_deltas"))
        update_orderbook_deltas(data, data.value("timestamp", 0));
    if (data.contains("candles")) update_candles(data["candles"]);
}

void update_prices(const json& prices_data, const json& /*full_data*/) {
    std::lock_guard<Spinlock> lock(data_lock_);
    for (auto& [exchange, symbols] : prices_data.items()) {
        for (auto& [symbol, price] : symbols.items()) {
            // Key by venue+symbol — bare-symbol keys collapsed all three
            // exchanges into one last-writer-wins slot (S252).
            prices_[book_key(exchange, symbol)] = price.get<double>();
            if (!primary_exchange(exchange)) continue;
            auto id_it = symbol_to_id_.find(symbol);
            if (id_it != symbol_to_id_.end()) {
                prices_by_id_[id_it->second] = price.get<double>();
            }
        }
    }
}

void update_orderbooks(const json& data, int64_t timestamp) {
    std::lock_guard<Spinlock> lock(data_lock_);
    for (auto& [key, ob_data] : data["orderbooks"].items()) {
        // Fill the stored book in place — bids/asks keep capacity across
        // snapshots instead of reallocating from empty every message.
        std::string symbol   = ob_data.value("symbol", "");
        std::string exchange = ob_data.value("exchange", "");
        OrderBook&  ob       = order_books_[book_key(exchange, symbol)];
        ob.symbol            = std::move(symbol);
        ob.exchange          = std::move(exchange);
        ob.timestamp         = timestamp;
        ob.bids.clear();
        ob.asks.clear();
        if (ob_data.contains("bids")) {
            for (const auto& b : ob_data["bids"])
                ob.bids.push_back({b.value("price", 0.0), b.value("quantity", 0.0)});
        }
        if (ob_data.contains("asks")) {
            for (const auto& a : ob_data["asks"])
                ob.asks.push_back({a.value("price", 0.0), a.value("quantity", 0.0)});
        }
        if (primary_exchange(ob.exchange)) {
            auto id_it = symbol_to_id_.find(ob.symbol);
            if (id_it != symbol_to_id_.end()) {
                obs_by_id_[id_it->second] = ob;
            }
        }
    }
}

void update_orderbook_deltas(const json& data, int64_t timestamp) {
    std::lock_guard<Spinlock> lock(data_lock_);
    for (auto& [key, delta_data] : data["orderbook_deltas"].items()) {
        std::string symbol   = delta_data.value("symbol", "");
        std::string exchange = delta_data.value("exchange", "");
        // Deltas must hit their own venue's book — a symbol-only lookup let a
        // bybit delta mutate the binance book (S252).
        auto it = order_books_.find(book_key(exchange, symbol));
        if (it == order_books_.end()) continue;
        OrderBook& ob = it->second;
        ob.timestamp  = timestamp;
        if (delta_data.contains("bids")) apply_level_deltas(ob.bids, delta_data["bids"], true);
        if (delta_data.contains("asks")) apply_level_deltas(ob.asks, delta_data["asks"], false);
    }
}

static void apply_level_deltas(std::vector<OrderBookLevel>& levels, const json& deltas,
                               bool is_bid) {
    for (const auto& d : deltas) {
        double price = d.value("p", 0.0);
        double qty   = d.value("q", 0.0);
        auto   lit   = std::find_if(levels.begin(), levels.end(),
                                    [price](const OrderBookLevel& l) { return l.price == price; });
        if (qty > 0.0) {
            if (lit != levels.end()) {
                lit->quantity = qty;
            } else {
                levels.push_back({price, qty});
                auto cmp = [is_bid](const OrderBookLevel& a, const OrderBookLevel& b) {
                    return is_bid ? a.price > b.price : a.price < b.price;
                };
                auto last = levels.end() - 1;
                while (last != levels.begin() && cmp(*last, *(last - 1))) {
                    std::iter_swap(last, last - 1);
                    --last;
                }
            }
        } else if (lit != levels.end()) {
            levels.erase(lit);
        }
    }
}

void update_candles(const json& candles_data) {
    std::vector<Candle> new_candles;
    new_candles.reserve(candles_data.size());
    {
        std::lock_guard<Spinlock> lock(data_lock_);
        for (const auto& c : candles_data) {
            Candle candle;
            candle.timestamp = c.value("timestamp", 0);
            candle.open      = c.value("open", 0.0);
            candle.high      = c.value("high", 0.0);
            candle.low       = c.value("low", 0.0);
            candle.close     = c.value("close", 0.0);
            candle.volume    = c.value("volume", 0.0);
            candle.symbol    = c.value("symbol", "");
            candle.exchange  = c.value("exchange", "");
            // Per-venue history — interleaved multi-exchange candles corrupt
            // every EMA/RSI/OBI consumer (S252).
            auto& hist = candle_history_[book_key(candle.exchange, candle.symbol)];
            hist.push_back(candle);
            if (hist.size() > 200u) hist.erase(hist.begin(), hist.end() - 200);
            if (!primary_exchange(candle.exchange)) {
                new_candles.push_back(candle);
                continue;
            }
            auto id_it = symbol_to_id_.find(candle.symbol);
            if (id_it != symbol_to_id_.end()) {
                auto& arr_hist = candles_by_id_[id_it->second];
                arr_hist.push_back(candle);
                if (arr_hist.size() > 200u) arr_hist.erase(arr_hist.begin(), arr_hist.end() - 200);
            }
            new_candles.push_back(candle);
        }
    }
    if (candle_cb_) candle_cb_(new_candles);
}

void handle_signal_msg(const json& data) {
    Signal sig;
    sig.symbol      = data.value("symbol", "");
    sig.direction   = data.value("direction", "NEUTRAL");
    sig.confidence  = data.value("confidence", 0.0);
    sig.strategy    = data.value("strategy", "ai_signal_bot");
    sig.entry_price = data.value("entry_price", 0.0);
    sig.stop_loss   = data.value("stop_loss", 0.0);
    sig.take_profit = data.value("take_profit", 0.0);
    sig.timestamp   = data.value("timestamp", 0);
    sig.reason      = data.value("reason", "");
    spdlog::info("AI Signal received: {} {} {} conf={:.1f} entry={:.2f}", sig.symbol, sig.direction,
                 sig.strategy, sig.confidence, sig.entry_price);
    if (signal_cb_) signal_cb_(sig);
}

void handle_signal_history(const json& data) {
    if (!data.contains("signals")) return;
    int count = 0;
    for (const auto& s : data["signals"]) {
        Signal sig;
        sig.symbol      = s.value("symbol", "");
        sig.direction   = s.value("direction", "NEUTRAL");
        sig.confidence  = s.value("confidence", 0.0);
        sig.strategy    = s.value("strategy", "ai_signal_bot");
        sig.entry_price = s.value("entry_price", 0.0);
        sig.stop_loss   = s.value("stop_loss", 0.0);
        sig.take_profit = s.value("take_profit", 0.0);
        sig.timestamp   = s.value("timestamp", 0);
        count++;
    }
    spdlog::info("Received {} historical AI signals", count);
}

void handle_arbitrage_msg(const json& data) {
    if (!data.contains("active") || !data["active"].is_array()) return;
    if (data["active"].empty()) return;
    for (const auto& arb : data["active"]) {
        std::string symbol     = arb.value("symbol", "");
        std::string buy_ex     = arb.value("buy_exchange", "");
        std::string sell_ex    = arb.value("sell_exchange", "");
        double      buy_price  = arb.value("buy_price", 0.0);
        double      sell_price = arb.value("sell_price", 0.0);
        double      spread_bps = arb.value("spread_bps", 0.0);
        double      max_qty    = arb.value("max_quantity", 0.0);
        spdlog::info("ARB: {} buy={}@{:.2f} sell={}@{:.2f} net={:.2f} ({:.1f}bps)", symbol, buy_ex,
                     buy_price, sell_ex, sell_price, arb.value("net_spread", 0.0), spread_bps);
        if (arb_cb_ && spread_bps > 10.0 && max_qty > 0.001) {
            arb_cb_(symbol, buy_ex, sell_ex, buy_price, sell_price, spread_bps, max_qty);
        }
    }
}
