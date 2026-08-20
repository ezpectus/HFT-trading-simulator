"""Tests for monitoring/ (health_server, metrics, tracker), data_collection/ (market_replay, timescaledb), llm_engine."""
import asyncio
import csv
import os
import time

import numpy as np
import pytest

from src.llm_engine.engine import LLMAnalysis, LLMConfig, LLMEngine, MarketContext
from src.monitoring.health_server import HealthServer
from src.monitoring.tracker import PerformanceTracker, SignalLogger, TradeLogger

# ─── PerformanceTracker ───


class TestPerformanceTracker:
    def test_defaults(self):
        t = PerformanceTracker()
        assert t.signals_generated == 0
        assert t.trades_closed == 0
        assert t.total_pnl == 0.0

    def test_record_signal_validated(self):
        t = PerformanceTracker()
        t.record_signal(validated=True)
        assert t.signals_generated == 1
        assert t.signals_validated == 1
        assert t.signals_rejected == 0

    def test_record_signal_rejected(self):
        t = PerformanceTracker()
        t.record_signal(validated=False)
        assert t.signals_generated == 1
        assert t.signals_rejected == 1

    def test_record_trade(self):
        t = PerformanceTracker()
        t.record_trade(pnl=100.0, fee=2.0, winning=True)
        assert t.trades_closed == 1
        assert t.total_pnl == 100.0
        assert t.total_fees == 2.0
        assert t.winning_trades == 1

    def test_win_rate_no_trades(self):
        t = PerformanceTracker()
        assert t.win_rate == 0

    def test_win_rate_with_trades(self):
        t = PerformanceTracker()
        t.record_trade(pnl=10, winning=True)
        t.record_trade(pnl=-5, winning=False)
        assert t.win_rate == 50.0

    def test_uptime(self):
        t = PerformanceTracker()
        assert t.uptime_seconds >= 0

    def test_summary(self):
        t = PerformanceTracker()
        t.record_signal(validated=True)
        t.record_trade(pnl=50, fee=1, winning=True)
        s = t.summary()
        assert s["signals_generated"] == 1
        assert s["trades_closed"] == 1
        assert s["total_pnl"] == 50.0
        assert "win_rate" in s


# ─── SignalLogger ───


class TestSignalLogger:
    def test_init(self, tmp_path):
        path = str(tmp_path / "signals.csv")
        sl = SignalLogger(path)
        assert os.path.exists(path)
        with open(path) as f:
            header = f.read()
        assert "timestamp" in header
        assert "symbol" in header

    def test_log(self, tmp_path):
        path = str(tmp_path / "signals.csv")
        sl = SignalLogger(path)
        sl.log({
            "timestamp": "2024-01-01",
            "symbol": "BTC/USDT",
            "direction": "LONG",
            "confidence": 0.85,
            "strategy": "trend",
            "entry_price": 50000,
            "stop_loss": 49000,
            "take_profit": 52000,
            "rr_ratio": 2.0,
            "reason": "EMA crossover",
        })
        with open(path) as f:
            reader = csv.reader(f)
            rows = list(reader)
        assert len(rows) == 2  # header + 1 data
        assert rows[1][1] == "BTC/USDT"


# ─── TradeLogger ───


class TestTradeLogger:
    def test_init(self, tmp_path):
        path = str(tmp_path / "trades.csv")
        tl = TradeLogger(path)
        assert os.path.exists(path)

    def test_log(self, tmp_path):
        path = str(tmp_path / "trades.csv")
        tl = TradeLogger(path)
        tl.log({
            "timestamp": "2024-01-01",
            "symbol": "BTC/USDT",
            "exchange": "binance",
            "side": "BUY",
            "quantity": 0.1,
            "entry_price": 50000,
            "exit_price": 51000,
            "pnl": 100,
            "fee": 2,
            "status": "CLOSED",
        })
        with open(path) as f:
            reader = csv.reader(f)
            rows = list(reader)
        assert len(rows) == 2
        assert rows[1][1] == "BTC/USDT"


# ─── HealthServer ───


class TestHealthServer:
    def test_init(self):
        hs = HealthServer(port=9090, host="127.0.0.1")
        assert hs.port == 9090
        assert hs.host == "127.0.0.1"
        assert len(hs._checks) == 0

    def test_register_check(self):
        hs = HealthServer()
        hs.register_check("exchange", lambda: {"healthy": True})
        assert "exchange" in hs._checks

    @pytest.mark.asyncio
    async def test_check_all_no_checks(self):
        hs = HealthServer()
        result = await hs._check_all()
        assert result["healthy"] is True
        assert "uptime_seconds" in result
        assert "components" in result

    @pytest.mark.asyncio
    async def test_check_exchange_registered(self):
        hs = HealthServer()
        hs.register_check("exchange", lambda: {"healthy": True, "latency": 50})
        result = await hs._check_exchange()
        assert result["healthy"] is True

    @pytest.mark.asyncio
    async def test_check_exchange_failing(self):
        hs = HealthServer()
        def bad_check():
            raise RuntimeError("Connection lost")
        hs.register_check("exchange", bad_check)
        result = await hs._check_exchange()
        assert result["healthy"] is False
        assert "Connection lost" in result["error"]

    @pytest.mark.asyncio
    async def test_check_database_async(self):
        hs = HealthServer()
        async def async_check():
            return {"healthy": True}
        hs.register_check("database", async_check)
        result = await hs._check_database()
        assert result["healthy"] is True

    @pytest.mark.asyncio
    async def test_check_shm_no_check(self):
        hs = HealthServer()
        result = await hs._check_shm()
        assert result["healthy"] is True
        assert "No SHM check" in result["message"]


# ─── LLMEngine ───


class TestLLMConfig:
    def test_defaults(self):
        cfg = LLMConfig()
        assert cfg.provider == "openai"
        assert cfg.model == "gpt-4o-mini"
        assert cfg.max_tokens == 500
        assert cfg.temperature == 0.3
        assert cfg.enabled is True

    def test_custom(self):
        cfg = LLMConfig(provider="anthropic", model="claude-3", api_key="test")
        assert cfg.provider == "anthropic"
        assert cfg.api_key == "test"


class TestMarketContext:
    def test_defaults(self):
        ctx = MarketContext()
        assert ctx.symbol == ""
        assert ctx.rsi == 50.0
        assert ctx.regime == "unknown"
        assert ctx.recent_signals == []

    def test_custom(self):
        ctx = MarketContext(symbol="BTC/USDT", price=50000, rsi=70)
        assert ctx.symbol == "BTC/USDT"
        assert ctx.price == 50000
        assert ctx.rsi == 70


class TestLLMAnalysis:
    def test_defaults(self):
        a = LLMAnalysis()
        assert a.sentiment == "neutral"
        assert a.confidence == 0.0
        assert a.recommendation == "hold"
        assert a.cached is False


class TestLLMEngine:
    def test_init_defaults(self):
        engine = LLMEngine()
        assert engine.config.provider == "openai"
        assert engine._request_count == 0
        assert engine._error_count == 0

    def test_init_with_config(self):
        cfg = LLMConfig(provider="none")
        engine = LLMEngine(cfg)
        assert engine.config.provider == "none"

    def test_load_prompt_missing(self):
        engine = LLMEngine()
        prompt = engine._load_prompt("nonexistent_prompt")
        assert "Analyze" in prompt

    def test_load_prompt_market_analysis(self):
        engine = LLMEngine()
        prompt = engine._load_prompt("market_analysis")
        assert "trading analyst" in prompt.lower()

    def test_default_prompt_signal_explanation(self):
        engine = LLMEngine()
        prompt = engine._default_prompt("signal_explanation")
        assert "direction" in prompt

    def test_default_prompt_unknown(self):
        engine = LLMEngine()
        prompt = engine._default_prompt("unknown")
        assert "Analyze" in prompt

    def test_build_context_str(self):
        engine = LLMEngine()
        ctx = MarketContext(symbol="BTC/USDT", price=50000, rsi=65)
        s = engine._build_context_str(ctx)
        assert "BTC/USDT" in s
        assert "50000" in s

    @pytest.mark.asyncio
    async def test_initialize_no_key(self):
        cfg = LLMConfig(provider="openai", api_key="")
        engine = LLMEngine(cfg)
        await engine.initialize()
        assert engine.config.provider == "none"

    @pytest.mark.asyncio
    async def test_initialize_with_key(self):
        cfg = LLMConfig(provider="openai", api_key="test-key")
        engine = LLMEngine(cfg)
        await engine.initialize()
        assert engine.config.provider == "openai"

    @pytest.mark.asyncio
    async def test_close_no_session(self):
        engine = LLMEngine()
        await engine.close()


# ─── data_collection/market_replay.py ───


def test_market_replay_import():
    """Test market_replay module imports."""
    try:
        from src.data_collection.market_replay import MarketReplay
    except ModuleNotFoundError:
        pytest.skip("market_replay module not available")
    assert MarketReplay is not None


# ─── data_collection/timescaledb_client.py ───


def test_timescaledb_client_import():
    """Test timescaledb_client module imports."""
    try:
        from src.data_collection.timescaledb_client import CandleRecord
    except ModuleNotFoundError:
        pytest.skip("timescaledb_client module not available")
    cr = CandleRecord(
        symbol="BTC/USDT",
        timestamp=1700000000,
        open=50000,
        high=51000,
        low=49500,
        close=50500,
        volume=100.5,
    )
    assert cr.symbol == "BTC/USDT"
    assert cr.close == 50500
