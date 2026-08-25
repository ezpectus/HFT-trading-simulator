"""Tests for Database (SQLite layer)."""
import os
import tempfile
import pytest
from src.database.db import Database


@pytest.fixture
def db():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_trading.db")
        db = Database(db_path)
        yield db
        db.close()


class TestDatabase:
    def test_init_creates_tables(self, db):
        conn = db._get_conn()
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        names = {r[0] for r in tables}
        assert "signals" in names
        assert "trades" in names
        assert "equity_curve" in names

    def test_save_and_get_signal(self, db):
        signal_id = db.save_signal({
            "symbol": "BTC/USDT",
            "direction": "LONG",
            "confidence": 80,
            "strategy": "trend",
            "entry_price": 65000,
            "stop_loss": 63700,
            "take_profit": 67600,
            "rr_ratio": 2.0,
            "reason": "Strong uptrend",
        })
        assert signal_id > 0
        signals = db.get_recent_signals(limit=10)
        assert len(signals) == 1
        assert signals[0]["symbol"] == "BTC/USDT"
        assert signals[0]["direction"] == "LONG"

    def test_save_and_close_trade(self, db):
        trade_id = db.save_trade({
            "symbol": "BTC/USDT",
            "exchange": "binance",
            "side": "BUY",
            "quantity": 0.1,
            "entry_price": 65000,
        })
        assert trade_id > 0
        db.close_trade(trade_id, exit_price=66000, pnl=100, fee=5)
        trades = db.get_recent_trades(limit=10)
        assert len(trades) == 1
        assert trades[0]["status"] == "CLOSED"
        assert trades[0]["pnl"] == 100

    def test_save_equity(self, db):
        db.save_equity(balance=10000, equity=10500, open_positions=2)
        conn = db._get_conn()
        rows = conn.execute("SELECT * FROM equity_curve").fetchall()
        assert len(rows) == 1
        assert rows[0]["balance"] == 10000
        assert rows[0]["equity"] == 10500

    def test_get_stats_empty(self, db):
        stats = db.get_stats()
        assert stats["total_signals"] == 0
        assert stats["total_trades"] == 0
        assert stats["win_rate"] == 0
        assert stats["total_pnl"] == 0

    def test_get_stats_with_data(self, db):
        db.save_signal({
            "symbol": "BTC/USDT", "direction": "LONG", "confidence": 80,
            "strategy": "trend", "entry_price": 65000, "stop_loss": 63700,
            "take_profit": 67600,
        })
        trade_id = db.save_trade({
            "symbol": "BTC/USDT", "exchange": "binance", "side": "BUY",
            "quantity": 0.1, "entry_price": 65000,
        })
        db.close_trade(trade_id, exit_price=66000, pnl=100, fee=5)
        stats = db.get_stats()
        assert stats["total_signals"] == 1
        assert stats["total_trades"] == 1
        assert stats["winning_trades"] == 1
        assert stats["win_rate"] == 100.0
        assert stats["total_pnl"] == 100

    def test_purge_old_records(self, db):
        import time
        old_ts = int(time.time()) - 100 * 86400  # 100 days ago
        conn = db._get_conn()
        conn.execute(
            "INSERT INTO signals (timestamp, symbol, direction, confidence, strategy, entry_price, stop_loss, take_profit) VALUES (?, 'BTC', 'LONG', 80, 'test', 65000, 63000, 67000)",
            (old_ts,),
        )
        conn.commit()
        deleted = db.purge_old_records(max_age_days=90)
        assert deleted["signals"] == 1
