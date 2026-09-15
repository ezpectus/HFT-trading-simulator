"""Contract tests for AISignalBot._snapshot_equity (run.py).

The method persists one equity-curve point per signal tick from the live
account dict — same source the dashboard reads.
"""
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from run import AISignalBot


def _bot(account=None):
    return SimpleNamespace(
        exchange=SimpleNamespace(
            accounts={"binance": account} if account is not None else {}
        ),
        config=SimpleNamespace(default_exchange="binance"),
        db=MagicMock(),
        logger=logging.getLogger("test"),
    )


class TestSnapshotEquity:
    def test_writes_balance_equity_position_count(self):
        bot = _bot({"balance": 10000.0, "equity": 10420.5, "positions": [{}, {}]})
        AISignalBot._snapshot_equity(bot)
        bot.db.save_equity.assert_called_once_with(
            balance=10000.0, equity=10420.5, open_positions=2
        )

    def test_equity_falls_back_to_balance(self):
        bot = _bot({"balance": 5000.0, "positions": []})
        AISignalBot._snapshot_equity(bot)
        bot.db.save_equity.assert_called_once_with(
            balance=5000.0, equity=5000.0, open_positions=0
        )

    def test_no_account_is_noop(self):
        bot = _bot(None)
        AISignalBot._snapshot_equity(bot)
        bot.db.save_equity.assert_not_called()

    def test_db_failure_warns_not_raises(self):
        bot = _bot({"balance": 1.0, "equity": 1.0, "positions": []})
        bot.db.save_equity.side_effect = OSError("disk full")
        AISignalBot._snapshot_equity(bot)  # must not raise — persistence is best-effort


def _closed_bot(account=None):
    bot = _bot(account)
    bot.tracker = MagicMock()
    bot.trade_logger = MagicMock()
    bot._closed_cursor = {}
    return bot


def _closed_trade(symbol="BTC/USDT", pnl=250.0, fee=1.5, closed_at=1700):
    return {
        "symbol": symbol, "exchange": "binance", "side": "BUY",
        "quantity": 0.5, "entry_price": 49000.0, "exit_price": 49500.0,
        "pnl": pnl, "fee": fee, "reason": "MANUAL",
        "opened_at": 1600, "closed_at": closed_at,
    }


class TestIngestClosedTrades:
    """S342: closed-trade ingestion from the sim's authoritative trade_history."""

    def test_first_sight_only_arms_cursor(self):
        """Existing history must not replay — stats are session-scoped."""
        bot = _closed_bot({"total_trades": 7, "trade_history": [_closed_trade()]})
        AISignalBot._ingest_closed_trades(bot)
        assert bot._closed_cursor == {"binance": 7}
        bot.db.save_trade.assert_not_called()
        bot.tracker.record_trade.assert_not_called()

    def test_new_closes_persist_and_count(self):
        bot = _closed_bot({"total_trades": 3, "trade_history": []})
        AISignalBot._ingest_closed_trades(bot)  # arm cursor at 3
        t1, t2 = _closed_trade(pnl=100.0, closed_at=1701), _closed_trade(
            symbol="ETH/USDT", pnl=-40.0, closed_at=1702)
        bot.exchange.accounts["binance"] = {
            "total_trades": 5, "trade_history": [t1, t2]}
        AISignalBot._ingest_closed_trades(bot)

        assert bot.db.save_trade.call_count == 2
        row = bot.db.save_trade.call_args_list[0][0][0]
        assert row["status"] == "CLOSED"
        assert row["pnl"] == 100.0
        assert row["exit_price"] == 49500.0
        assert row["exchange"] == "binance"
        assert bot.tracker.record_trade.call_count == 2
        bot.tracker.record_trade.assert_any_call(100.0, 1.5, winning=True)
        bot.tracker.record_trade.assert_any_call(-40.0, 1.5, winning=False)
        assert bot.trade_logger.log.call_count == 2

    def test_no_double_ingest_when_count_unchanged(self):
        bot = _closed_bot({"total_trades": 1, "trade_history": [_closed_trade()]})
        AISignalBot._ingest_closed_trades(bot)
        AISignalBot._ingest_closed_trades(bot)
        AISignalBot._ingest_closed_trades(bot)
        bot.db.save_trade.assert_not_called()

    def test_burst_ingests_only_tail(self):
        """When more closes happened than history retains, take the tail."""
        trades = [_closed_trade(closed_at=1700 + i) for i in range(3)]
        bot = _closed_bot({"total_trades": 0, "trade_history": []})
        AISignalBot._ingest_closed_trades(bot)  # arm at 0
        bot.exchange.accounts["binance"] = {
            "total_trades": 5, "trade_history": trades}  # 5 new, only 3 visible
        AISignalBot._ingest_closed_trades(bot)
        assert bot.db.save_trade.call_count == 3
        assert bot._closed_cursor["binance"] == 5

    def test_multi_exchange_cursors(self):
        bot = _closed_bot(None)
        bot.exchange.accounts = {
            "binance": {"total_trades": 1, "trade_history": [_closed_trade()]},
            "bybit": {"total_trades": 2, "trade_history": [_closed_trade(pnl=9.0)]},
        }
        AISignalBot._ingest_closed_trades(bot)  # arm both
        bot.exchange.accounts["bybit"]["total_trades"] = 3
        bot.exchange.accounts["bybit"]["trade_history"] = [_closed_trade(pnl=9.0)]
        AISignalBot._ingest_closed_trades(bot)
        bot.db.save_trade.assert_called_once()
        row = bot.db.save_trade.call_args[0][0]
        assert row["exchange"] == "bybit"

    def test_missing_fields_no_crash(self):
        bot = _closed_bot({"total_trades": 1, "trade_history": [{}]})
        AISignalBot._ingest_closed_trades(bot)  # arm at 1
        bot.exchange.accounts["binance"] = {
            "total_trades": 2, "trade_history": [{"pnl": 5.0}]}
        AISignalBot._ingest_closed_trades(bot)
        bot.tracker.record_trade.assert_called_once_with(5.0, 0.0, winning=True)


def _feed_bot(news=None, accounts=None, prices=None, strategies=None):
    bot = _bot(None)
    bot.strategies = strategies or []
    bot._news_sig = None
    bot._mm_positions = {}
    bot.exchange.news_event = news
    bot.exchange.latest_prices = prices or {}
    bot.exchange.accounts = accounts or {}
    return bot


_NEWS = {"symbol": "BTC/USDT", "intensity": 6, "direction": "up",
         "remaining": 10}


class TestRouteNewsEvent:
    """S343: sim news_event → SentimentStrategy.on_news_event."""

    def test_event_converted_and_routed(self):
        from src.strategies.sentiment import SentimentStrategy
        strat = SentimentStrategy()
        bot = _feed_bot(news=_NEWS, strategies=[strat])
        AISignalBot._route_news_event(bot)
        assert strat.event_count == 1
        assert strat.current_sentiment == pytest.approx(6 / 8.0)
        assert strat.sentiment_by_symbol["BTC/USDT"] == pytest.approx(0.75)

    def test_down_direction_negative(self):
        from src.strategies.sentiment import SentimentStrategy
        strat = SentimentStrategy()
        bot = _feed_bot(news={**_NEWS, "direction": "down"},
                        strategies=[strat])
        AISignalBot._route_news_event(bot)
        assert strat.current_sentiment < 0

    def test_same_event_deduped_while_rebroadcast(self):
        from src.strategies.sentiment import SentimentStrategy
        strat = SentimentStrategy()
        bot = _feed_bot(news=_NEWS, strategies=[strat])
        for remaining in (10, 9, 8):
            bot.exchange.news_event = {**_NEWS, "remaining": remaining}
            AISignalBot._route_news_event(bot)
        assert strat.event_count == 1

    def test_new_event_after_expiry_fires(self):
        from src.strategies.sentiment import SentimentStrategy
        strat = SentimentStrategy()
        bot = _feed_bot(news=_NEWS, strategies=[strat])
        AISignalBot._route_news_event(bot)
        bot.exchange.news_event = None  # event expired
        AISignalBot._route_news_event(bot)
        bot.exchange.news_event = {**_NEWS, "symbol": "ETH/USDT"}
        AISignalBot._route_news_event(bot)
        assert strat.event_count == 2

    def test_no_sentiment_strategy_is_noop(self):
        bot = _feed_bot(news=_NEWS, strategies=[])
        AISignalBot._route_news_event(bot)  # no crash, sig still dedupes
        assert bot._news_sig == ("BTC/USDT", 6, "up")


class TestSyncMMInventory:
    """S343: position deltas → MarketMakingStrategy.on_fill."""

    def _mm(self):
        from src.strategies.market_making import MarketMakingStrategy
        return MarketMakingStrategy()

    def test_open_long_fires_buy_fill(self):
        mm = self._mm()
        bot = _feed_bot(
            accounts={"binance": {"positions": [
                {"symbol": "BTC/USDT", "side": "BUY", "quantity": 0.5}]}},
            prices={"binance": {"BTC/USDT": 50000.0}},
            strategies=[mm])
        AISignalBot._sync_mm_inventory(bot)
        assert mm.inventory == pytest.approx(0.5)
        assert mm.fill_count == 1

    def test_close_fires_sell_and_realizes_pnl(self):
        mm = self._mm()
        acct = {"binance": {"positions": [
            {"symbol": "BTC/USDT", "side": "BUY", "quantity": 1.0}]}}
        px = {"binance": {"BTC/USDT": 50000.0}}
        bot = _feed_bot(accounts=acct, prices=px, strategies=[mm])
        AISignalBot._sync_mm_inventory(bot)
        # Price rises, position closes → SELL fill realizes pnl
        bot.exchange.latest_prices = {"binance": {"BTC/USDT": 51000.0}}
        bot.exchange.accounts = {"binance": {"positions": []}}
        AISignalBot._sync_mm_inventory(bot)
        assert mm.inventory == pytest.approx(0.0)
        assert mm.total_pnl == pytest.approx(1000.0)
        assert bot._mm_positions == {}

    def test_direction_flip_splits_fill(self):
        mm = self._mm()
        px = {"binance": {"BTC/USDT": 50000.0}}
        bot = _feed_bot(accounts={"binance": {"positions": [
            {"symbol": "BTC/USDT", "side": "BUY", "quantity": 1.0}]}},
            prices=px, strategies=[mm])
        AISignalBot._sync_mm_inventory(bot)
        # Flips to net short 0.5 → delta -1.5 closes long + opens short
        bot.exchange.accounts = {"binance": {"positions": [
            {"symbol": "BTC/USDT", "side": "SELL", "quantity": 0.5}]}}
        AISignalBot._sync_mm_inventory(bot)
        assert mm.inventory == pytest.approx(-0.5)

    def test_stable_position_no_duplicate_fill(self):
        mm = self._mm()
        acct = {"binance": {"positions": [
            {"symbol": "BTC/USDT", "side": "BUY", "quantity": 0.5}]}}
        px = {"binance": {"BTC/USDT": 50000.0}}
        bot = _feed_bot(accounts=acct, prices=px, strategies=[mm])
        for _ in range(3):
            AISignalBot._sync_mm_inventory(bot)
        assert mm.fill_count == 1

    def test_no_mm_strategy_is_noop(self):
        bot = _feed_bot(accounts={"binance": {"positions": [
            {"symbol": "BTC/USDT", "side": "BUY", "quantity": 1.0}]}},
            prices={"binance": {"BTC/USDT": 1.0}}, strategies=[])
        AISignalBot._sync_mm_inventory(bot)
        assert bot._mm_positions == {}

    def test_missing_price_retries_fill(self):
        mm = self._mm()
        bot = _feed_bot(
            accounts={"binance": {"positions": [
                {"symbol": "BTC/USDT", "side": "BUY", "quantity": 1.0}]}},
            prices={}, strategies=[mm])
        AISignalBot._sync_mm_inventory(bot)
        assert mm.fill_count == 0  # no price — not consumed yet
        bot.exchange.latest_prices = {"binance": {"BTC/USDT": 50000.0}}
        AISignalBot._sync_mm_inventory(bot)
        assert mm.fill_count == 1
        assert mm.inventory == pytest.approx(1.0)
