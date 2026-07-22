"""Tests for PerformanceTracker, SignalLogger, TradeLogger.

Tests cover: init/default values, record_signal (validated/rejected),
record_trade (winning/losing, PnL/fee accumulation), win_rate edge cases,
signals_per_hour, summary dict, SignalLogger CSV creation/logging,
TradeLogger CSV creation/logging.
"""
import csv
import os
import tempfile
import time

import pytest

from src.monitoring.tracker import PerformanceTracker, SignalLogger, TradeLogger


class TestPerformanceTrackerInit:
    def test_default_values(self):
        tracker = PerformanceTracker()
        assert tracker.signals_generated == 0
        assert tracker.signals_validated == 0
        assert tracker.signals_rejected == 0
        assert tracker.orders_sent == 0
        assert tracker.trades_closed == 0
        assert tracker.winning_trades == 0
        assert tracker.total_pnl == 0.0
        assert tracker.total_fees == 0.0

    def test_start_time_is_set(self):
        tracker = PerformanceTracker()
        assert tracker.start_time > 0
        assert tracker.uptime_seconds >= 0

    def test_custom_start_time(self):
        t = time.time() - 3600  # 1 hour ago
        tracker = PerformanceTracker(start_time=t)
        assert tracker.uptime_seconds >= 3600


class TestRecordSignal:
    def test_record_validated_signal(self):
        tracker = PerformanceTracker()
        tracker.record_signal(validated=True)
        assert tracker.signals_generated == 1
        assert tracker.signals_validated == 1
        assert tracker.signals_rejected == 0

    def test_record_rejected_signal(self):
        tracker = PerformanceTracker()
        tracker.record_signal(validated=False)
        assert tracker.signals_generated == 1
        assert tracker.signals_validated == 0
        assert tracker.signals_rejected == 1

    def test_record_multiple_signals(self):
        tracker = PerformanceTracker()
        tracker.record_signal(validated=True)
        tracker.record_signal(validated=True)
        tracker.record_signal(validated=False)
        assert tracker.signals_generated == 3
        assert tracker.signals_validated == 2
        assert tracker.signals_rejected == 1


class TestRecordTrade:
    def test_record_winning_trade(self):
        tracker = PerformanceTracker()
        tracker.record_trade(pnl=100.0, fee=1.5, winning=True)
        assert tracker.trades_closed == 1
        assert tracker.winning_trades == 1
        assert tracker.total_pnl == 100.0
        assert tracker.total_fees == 1.5

    def test_record_losing_trade(self):
        tracker = PerformanceTracker()
        tracker.record_trade(pnl=-50.0, fee=2.0, winning=False)
        assert tracker.trades_closed == 1
        assert tracker.winning_trades == 0
        assert tracker.total_pnl == -50.0
        assert tracker.total_fees == 2.0

    def test_record_multiple_trades_accumulate(self):
        tracker = PerformanceTracker()
        tracker.record_trade(pnl=100.0, fee=1.0, winning=True)
        tracker.record_trade(pnl=-30.0, fee=0.5, winning=False)
        tracker.record_trade(pnl=50.0, fee=0.8, winning=True)
        assert tracker.trades_closed == 3
        assert tracker.winning_trades == 2
        assert tracker.total_pnl == 120.0
        assert tracker.total_fees == 2.3

    def test_record_trade_default_fee(self):
        tracker = PerformanceTracker()
        tracker.record_trade(pnl=10.0, winning=True)
        assert tracker.total_fees == 0.0


class TestWinRate:
    def test_win_rate_zero_trades(self):
        tracker = PerformanceTracker()
        assert tracker.win_rate == 0

    def test_win_rate_all_wins(self):
        tracker = PerformanceTracker()
        tracker.record_trade(pnl=10, winning=True)
        tracker.record_trade(pnl=20, winning=True)
        assert tracker.win_rate == 100.0

    def test_win_rate_all_losses(self):
        tracker = PerformanceTracker()
        tracker.record_trade(pnl=-10, winning=False)
        tracker.record_trade(pnl=-20, winning=False)
        assert tracker.win_rate == 0.0

    def test_win_rate_partial(self):
        tracker = PerformanceTracker()
        tracker.record_trade(pnl=10, winning=True)
        tracker.record_trade(pnl=-10, winning=False)
        tracker.record_trade(pnl=10, winning=True)
        tracker.record_trade(pnl=-10, winning=False)
        assert tracker.win_rate == 50.0


class TestSignalsPerHour:
    def test_signals_per_hour_zero(self):
        tracker = PerformanceTracker()
        assert tracker.signals_per_hour == 0

    def test_signals_per_hour_positive(self):
        tracker = PerformanceTracker(start_time=time.time() - 3600)
        tracker.record_signal(validated=True)
        tracker.record_signal(validated=True)
        # 2 signals in ~1 hour
        rate = tracker.signals_per_hour
        assert 1.5 <= rate <= 2.5


class TestSummary:
    def test_summary_has_all_keys(self):
        tracker = PerformanceTracker()
        s = tracker.summary()
        expected_keys = {
            "uptime_seconds", "signals_generated", "signals_validated",
            "signals_rejected", "orders_sent", "trades_closed",
            "winning_trades", "win_rate", "total_pnl", "total_fees",
            "signals_per_hour",
        }
        assert set(s.keys()) == expected_keys

    def test_summary_reflects_state(self):
        tracker = PerformanceTracker()
        tracker.record_signal(validated=True)
        tracker.record_signal(validated=False)
        tracker.record_trade(pnl=50.0, fee=1.0, winning=True)
        s = tracker.summary()
        assert s["signals_generated"] == 2
        assert s["signals_validated"] == 1
        assert s["signals_rejected"] == 1
        assert s["trades_closed"] == 1
        assert s["winning_trades"] == 1
        assert s["win_rate"] == 100.0
        assert s["total_pnl"] == 50.0
        assert s["total_fees"] == 1.0


class TestSignalLogger:
    def test_creates_csv_file_with_header(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "signals.csv")
            SignalLogger(path)
            assert os.path.exists(path)
            with open(path) as f:
                reader = csv.reader(f)
                header = next(reader)
                assert "timestamp" in header
                assert "symbol" in header
                assert "direction" in header
                assert "confidence" in header

    def test_logs_signal(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "signals.csv")
            logger = SignalLogger(path)
            logger.log({
                "timestamp": "2025-01-01T00:00:00",
                "symbol": "BTC/USDT",
                "direction": "LONG",
                "confidence": 85,
                "strategy": "trend",
                "entry_price": 50000,
                "stop_loss": 49000,
                "take_profit": 52000,
                "rr_ratio": 2.5,
                "reason": "Strong uptrend",
            })
            with open(path) as f:
                reader = csv.reader(f)
                next(reader)  # skip header
                row = next(reader)
                assert row[1] == "BTC/USDT"
                assert row[2] == "LONG"
                assert row[3] == "85"

    def test_does_not_overwrite_existing_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "signals.csv")
            logger1 = SignalLogger(path)
            logger1.log({
                "timestamp": "t1", "symbol": "BTC/USDT", "direction": "LONG",
                "confidence": 80, "strategy": "trend", "entry_price": 50000,
                "stop_loss": 49000, "take_profit": 52000,
            })
            # Create second logger — should not overwrite
            logger2 = SignalLogger(path)
            logger2.log({
                "timestamp": "t2", "symbol": "ETH/USDT", "direction": "SHORT",
                "confidence": 70, "strategy": "mean_rev", "entry_price": 3000,
                "stop_loss": 3100, "take_profit": 2800,
            })
            with open(path) as f:
                reader = csv.reader(f)
                next(reader)  # header
                row1 = next(reader)
                row2 = next(reader)
                assert row1[1] == "BTC/USDT"
                assert row2[1] == "ETH/USDT"


class TestTradeLogger:
    def test_creates_csv_file_with_header(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "trades.csv")
            TradeLogger(path)
            assert os.path.exists(path)
            with open(path) as f:
                reader = csv.reader(f)
                header = next(reader)
                assert "timestamp" in header
                assert "symbol" in header
                assert "exchange" in header
                assert "side" in header
                assert "pnl" in header

    def test_logs_trade(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "trades.csv")
            logger = TradeLogger(path)
            logger.log({
                "timestamp": "2025-01-01T00:00:00",
                "symbol": "BTC/USDT",
                "exchange": "binance",
                "side": "LONG",
                "quantity": 0.5,
                "entry_price": 50000,
                "exit_price": 51000,
                "pnl": 500.0,
                "fee": 2.5,
                "status": "CLOSED",
            })
            with open(path) as f:
                reader = csv.reader(f)
                next(reader)  # header
                row = next(reader)
                assert row[1] == "BTC/USDT"
                assert row[2] == "binance"
                assert row[3] == "LONG"
                assert row[7] == "500.0"

    def test_logs_trade_with_defaults(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "trades.csv")
            logger = TradeLogger(path)
            logger.log({
                "symbol": "ETH/USDT",
                "side": "SHORT",
                "quantity": 2.0,
                "entry_price": 3000,
            })
            with open(path) as f:
                reader = csv.reader(f)
                next(reader)  # header
                row = next(reader)
                # exchange defaults to empty, status defaults to OPEN
                assert row[2] == ""
                assert row[9] == "OPEN"


class TestLoggerNoDirectory:
    """Regression tests for os.makedirs crash when path has no directory component."""

    def test_signal_logger_no_directory_path(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "signals.csv")
            # Should not crash — os.path.dirname("signals.csv") would be ""
            # but here we use a path inside tmpdir which has a dirname
            SignalLogger(path)
            assert os.path.exists(path)

    def test_signal_logger_filename_only_no_crash(self):
        # Change to a temp dir so the file is created there
        with tempfile.TemporaryDirectory() as tmpdir:
            old_cwd = os.getcwd()
            os.chdir(tmpdir)
            try:
                SignalLogger("signals.csv")
                assert os.path.exists("signals.csv")
            finally:
                os.chdir(old_cwd)

    def test_trade_logger_filename_only_no_crash(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            old_cwd = os.getcwd()
            os.chdir(tmpdir)
            try:
                TradeLogger("trades.csv")
                assert os.path.exists("trades.csv")
            finally:
                os.chdir(old_cwd)

    def test_signal_logger_nested_directory_created(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "nested", "deep", "signals.csv")
            SignalLogger(path)
            assert os.path.exists(path)

    def test_trade_logger_nested_directory_created(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "nested", "deep", "trades.csv")
            TradeLogger(path)
            assert os.path.exists(path)
