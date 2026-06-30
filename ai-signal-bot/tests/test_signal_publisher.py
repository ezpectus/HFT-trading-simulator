"""Tests for signal publisher backtest endpoint."""
import asyncio
import json
import pytest

from src.communication.signal_publisher import SignalPublisher


@pytest.fixture
def publisher():
    return SignalPublisher(host="localhost", port=18766)


class TestRunBacktest:
    """Test the _run_backtest method."""

    @pytest.mark.asyncio
    async def test_backtest_trend_strategy(self, publisher):
        result = await publisher._run_backtest({
            "strategy": "trend",
            "candles": 200,
            "balance": 10000,
            "symbol": "BTC/USDT",
        })
        assert result["type"] == "backtest_result"
        assert result["strategy"] == "trend"
        assert result["symbol"] == "BTC/USDT"
        assert "results" in result
        assert "Trend Following" in result["results"]
        r = result["results"]["Trend Following"]
        assert "total_return_pct" in r
        assert "total_trades" in r
        assert "win_rate" in r
        assert "equity_curve" in r
        assert "final_balance" in r
        assert len(r["equity_curve"]) > 0

    @pytest.mark.asyncio
    async def test_backtest_all_strategies(self, publisher):
        result = await publisher._run_backtest({
            "strategy": "all",
            "candles": 300,
        })
        assert result["type"] == "backtest_result"
        assert "results" in result
        assert "Trend Following" in result["results"]
        assert "Mean Reversion" in result["results"]
        assert "FFT Cycle" in result["results"]

    @pytest.mark.asyncio
    async def test_backtest_with_risk_options(self, publisher):
        result = await publisher._run_backtest({
            "strategy": "trend",
            "candles": 200,
            "trailing_stop": True,
            "breakeven": True,
        })
        assert result["type"] == "backtest_result"
        assert "results" in result
        assert "Trend Following" in result["results"]

    @pytest.mark.asyncio
    async def test_backtest_unknown_strategy(self, publisher):
        result = await publisher._run_backtest({
            "strategy": "nonexistent",
            "candles": 100,
        })
        assert result["type"] == "backtest_result"
        assert "error" in result

    @pytest.mark.asyncio
    async def test_backtest_default_params(self, publisher):
        result = await publisher._run_backtest({})
        assert result["type"] == "backtest_result"
        assert result["strategy"] == "all"
        assert result["candles"] == 500
        assert result["symbol"] == "BTC/USDT"

    @pytest.mark.asyncio
    async def test_backtest_equity_curve_length(self, publisher):
        result = await publisher._run_backtest({
            "strategy": "trend",
            "candles": 100,
        })
        r = result["results"]["Trend Following"]
        assert len(r["equity_curve"]) >= 50

    @pytest.mark.asyncio
    async def test_backtest_custom_price(self, publisher):
        result = await publisher._run_backtest({
            "strategy": "trend",
            "candles": 100,
            "initial_price": 100,
            "volatility": 1.5,
        })
        assert result["type"] == "backtest_result"
        r = result["results"]["Trend Following"]
        assert isinstance(r["final_balance"], float)
        assert isinstance(r["total_return_pct"], float)
