"""Tests for Database — SQLite storage for signals, trades, and equity curve."""
import os
import tempfile
import time

import pytest

from src.database.db import Database


@pytest.fixture
def db():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = os.path.join(tmpdir, "test_trading.db")
        db = Database(path=path)
        yield db
        db.close()


def make_signal(symbol="BTC/USDT", direction="LONG", confidence=75.0):
    return {
        "symbol": symbol,
        "direction": direction,
        "confidence": confidence,
        "strategy": "trend",
        "entry_price": 50000.0,
        "stop_loss": 49000.0,
        "take_profit": 51000.0,
        "rr_ratio": 2.0,
        "reason": "EMA crossover",
    }


def make_trade(symbol="BTC/USDT", side="buy", quantity=1.0):
    return {
        "symbol": symbol,
        "exchange": "binance",
        "side": side,
        "quantity": quantity,
        "entry_price": 50000.0,
    }


class TestInit:
    def test_creates_db_file(self, db):
        assert os.path.exists(db.path)

    def test_tables_exist(self, db):
        with db._conn() as conn:
            tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        assert "signals" in tables
        assert "trades" in tables
        assert "equity_curve" in tables

    def test_indexes_exist(self, db):
        with db._conn() as conn:
            indexes = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()}
        assert "idx_signals_symbol" in indexes
        assert "idx_trades_symbol" in indexes
        assert "idx_trades_status" in indexes


class TestSaveSignal:
    def test_save_returns_id(self, db):
        sid = db.save_signal(make_signal())
        assert sid == 1

    def test_save_multiple(self, db):
        db.save_signal(make_signal())
        sid2 = db.save_signal(make_signal(symbol="ETH/USDT"))
        assert sid2 == 2

    def test_validated_flag_true(self, db):
        db.save_signal(make_signal(), validated=True)
        signals = db.get_recent_signals()
        assert signals[0]["validated"] == 1

    def test_validated_flag_false(self, db):
        db.save_signal(make_signal(), validated=False)
        signals = db.get_recent_signals()
        assert signals[0]["validated"] == 0

    def test_default_timestamp(self, db):
        before = int(time.time())
        db.save_signal(make_signal())
        after = int(time.time())
        signals = db.get_recent_signals()
        assert before <= signals[0]["timestamp"] <= after


class TestSaveTrade:
    def test_save_returns_id(self, db):
        tid = db.save_trade(make_trade())
        assert tid == 1

    def test_default_status_open(self, db):
        db.save_trade(make_trade())
        trades = db.get_recent_trades()
        assert trades[0]["status"] == "OPEN"

    def test_custom_status(self, db):
        trade = make_trade()
        trade["status"] = "FILLED"
        db.save_trade(trade)
        trades = db.get_recent_trades()
        assert trades[0]["status"] == "FILLED"


class TestCloseTrade:
    def test_close_updates_fields(self, db):
        tid = db.save_trade(make_trade())
        db.close_trade(tid, exit_price=51000.0, pnl=1000.0, fee=5.0)
        trades = db.get_recent_trades()
        assert trades[0]["status"] == "CLOSED"
        assert trades[0]["exit_price"] == 51000.0
        assert trades[0]["pnl"] == 1000.0
        assert trades[0]["fee"] == 5.0


class TestSaveEquity:
    def test_save_equity(self, db):
        db.save_equity(balance=100000.0, equity=100500.0, open_positions=2)
        with db._conn() as conn:
            row = conn.execute("SELECT * FROM equity_curve ORDER BY id DESC LIMIT 1").fetchone()
        assert row["balance"] == 100000.0
        assert row["equity"] == 100500.0
        assert row["open_positions"] == 2


class TestGetStats:
    def test_empty_stats(self, db):
        stats = db.get_stats()
        assert stats["total_signals"] == 0
        assert stats["total_trades"] == 0
        assert stats["winning_trades"] == 0
        assert stats["win_rate"] == 0
        assert stats["total_pnl"] == 0
        assert stats["total_fees"] == 0

    def test_stats_with_data(self, db):
        db.save_signal(make_signal())
        db.save_signal(make_signal(symbol="ETH/USDT"))
        tid1 = db.save_trade(make_trade())
        db.close_trade(tid1, exit_price=51000.0, pnl=1000.0, fee=5.0)
        tid2 = db.save_trade(make_trade(symbol="ETH/USDT"))
        db.close_trade(tid2, exit_price=49000.0, pnl=-1000.0, fee=5.0)
        stats = db.get_stats()
        assert stats["total_signals"] == 2
        assert stats["total_trades"] == 2
        assert stats["winning_trades"] == 1
        assert stats["win_rate"] == 50.0
        assert stats["total_pnl"] == 0.0
        assert stats["total_fees"] == 10.0


class TestGetRecentSignals:
    def test_empty(self, db):
        assert db.get_recent_signals() == []

    def test_limit(self, db):
        for i in range(10):
            db.save_signal(make_signal(symbol=f"COIN{i}/USDT"))
        signals = db.get_recent_signals(limit=3)
        assert len(signals) == 3
        assert signals[0]["symbol"] == "COIN9/USDT"


class TestGetRecentTrades:
    def test_empty(self, db):
        assert db.get_recent_trades() == []

    def test_limit(self, db):
        for i in range(10):
            db.save_trade(make_trade(symbol=f"COIN{i}/USDT"))
        trades = db.get_recent_trades(limit=3)
        assert len(trades) == 3
        assert trades[0]["symbol"] == "COIN9/USDT"
