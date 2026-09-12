"""Contract tests for the backtest-request module extracted from SignalPublisher.

Verifies the WS-facing behaviors the publisher relied on: param clamps,
client-candle parsing/fallback, deterministic synthetic candles, risk config,
strategy selection, and the run/compare response envelopes.
"""
import pytest

from src.communication.backtest_requests import (
    build_risk_config,
    build_strategies,
    compare_backtests_request,
    generate_synthetic_candles,
    parse_backtest_params,
    parse_client_candles,
    run_backtest_request,
)


class TestParseBacktestParams:
    def test_defaults(self):
        p = parse_backtest_params({})
        assert p["candles"] == 500
        assert p["balance"] == 10000.0
        assert p["symbol"] == "BTC/USDT"
        assert p["initial_price"] == 65000.0
        assert p["volatility"] == 0.75
        assert p["strategy"] == "all"

    def test_candles_clamped(self):
        assert parse_backtest_params({"candles": 5})["candles"] == 10
        assert parse_backtest_params({"candles": 999999})["candles"] == 10000

    def test_balance_and_price_floors(self):
        p = parse_backtest_params({"balance": 0, "initial_price": 0})
        assert p["balance"] == 1.0
        assert p["initial_price"] == 0.01

    def test_volatility_clamped(self):
        assert parse_backtest_params({"volatility": 99})["volatility"] == 5.0
        assert parse_backtest_params({"volatility": -1})["volatility"] == 0.0

    def test_string_fields_capped_at_32(self):
        p = parse_backtest_params({"symbol": "X" * 100, "strategy": "Y" * 100})
        assert len(p["symbol"]) == 32
        assert len(p["strategy"]) == 32


class TestParseClientCandles:
    def _candle(self, ts=1.0):
        return {"timestamp": ts, "open": 1.0, "high": 2.0,
                "low": 0.5, "close": 1.5, "volume": 10.0}

    def test_none_and_empty_fallback(self):
        assert parse_client_candles({}) is None
        assert parse_client_candles({"candles_data": []}) is None
        assert parse_client_candles({"candles_data": "notalist"}) is None

    def test_valid_candles_normalized(self):
        out = parse_client_candles({"candles_data": [self._candle()]})
        assert out == [{"timestamp": 1.0, "open": 1.0, "high": 2.0,
                        "low": 0.5, "close": 1.5, "volume": 10.0}]

    def test_time_alias_accepted(self):
        c = self._candle()
        c["time"], _ = c.pop("timestamp"), None
        out = parse_client_candles({"candles_data": [c]})
        assert out[0]["timestamp"] == 1.0

    def test_malformed_row_falls_back(self):
        bad = {"timestamp": 1.0, "open": "NaN-not-a-number"}
        assert parse_client_candles({"candles_data": [bad]}) is None

    def test_missing_required_key_falls_back(self):
        assert parse_client_candles({"candles_data": [{"open": 1.0}]}) is None


class TestSyntheticCandles:
    def test_deterministic(self):
        a = generate_synthetic_candles(50, 100.0, 0.5)
        b = generate_synthetic_candles(50, 100.0, 0.5)
        assert a == b  # seeded RNG — identical output

    def test_ohlcv_invariants(self):
        for c in generate_synthetic_candles(100, 100.0, 0.5):
            assert c["high"] >= c["low"] >= 0
            assert c["low"] <= c["open"] <= c["high"]
            assert c["low"] <= c["close"] <= c["high"]
            assert c["volume"] > 0

    def test_length_and_timeframe(self):
        candles = generate_synthetic_candles(20, 100.0, 0.5)
        assert len(candles) == 20
        assert candles[1]["timestamp"] - candles[0]["timestamp"] == 300


class TestBuildRiskConfig:
    def test_none_when_disabled(self):
        assert build_risk_config({"trailing_stop": False, "breakeven": False}) is None

    def test_enabled_flags(self):
        rc = build_risk_config({"trailing_stop": True, "breakeven": False})
        assert rc is not None
        assert rc.trailing_stop_enabled is True


class TestBuildStrategies:
    def test_all_returns_full_set(self):
        strategies = build_strategies("all")
        assert len(strategies) >= 3  # trend + mean_rev + fft (+ ensemble)

    def test_single_strategy(self):
        strategies = build_strategies("trend")
        assert len(strategies) == 1

    def test_unknown_returns_empty(self):
        # Unknown names match no branch — the error surfaces in the response
        # envelope rather than silently running "all".
        assert build_strategies("nonexistent_xyz") == {}


@pytest.mark.asyncio
class TestRunBacktestRequest:
    async def test_synthetic_response_envelope(self):
        result = await run_backtest_request(
            {"candles": 50, "strategy": "trend", "symbol": "ETH/USDT"})
        assert result["type"] == "backtest_result"
        assert result["strategy"] == "trend"
        assert result["symbol"] == "ETH/USDT"
        assert result["candles"] == 50
        assert result["data_source"] == "synthetic"
        assert list(result["results"].keys()) == ["Trend Following"]
        r = result["results"]["Trend Following"]
        assert "total_return_pct" in r and "sharpe_ratio" in r

    async def test_unknown_strategy_returns_error_envelope(self):
        result = await run_backtest_request({"strategy": "nonexistent_xyz"})
        assert result["type"] == "backtest_result"
        assert result["error"] == "Unknown strategy: nonexistent_xyz"

    async def test_client_candles_used(self):
        candles = [{"timestamp": float(i * 300), "open": 100 + i, "high": 105 + i,
                    "low": 95 + i, "close": 102 + i, "volume": 10.0}
                   for i in range(60)]
        result = await run_backtest_request(
            {"candles_data": candles, "strategy": "mean_reversion"})
        assert result["data_source"] == "client"
        assert result["candles"] == 60

    async def test_malformed_candles_fall_back(self):
        result = await run_backtest_request(
            {"candles_data": [{"garbage": True}], "candles": 30, "strategy": "trend"})
        assert result["data_source"] == "synthetic"
        assert result["candles"] == 30


class TestCompareBacktests:
    def _bt(self, name, ret):
        return {"name": name, "results": {name: {
            "total_return_pct": ret, "sharpe_ratio": 1.0, "sortino_ratio": 1.2,
            "calmar_ratio": 0.8, "max_drawdown_pct": 5.0, "win_rate": 50.0,
            "profit_factor": 1.5, "total_trades": 10, "final_balance": 11000,
            "equity_curve": [10000, 10500, 11000]}}}

    def test_requires_two(self):
        result = compare_backtests_request({"backtests": [self._bt("a", 1.0)]})
        assert result["type"] == "comparison_result"
        assert result["error"] == "Need at least 2 backtests to compare"

    def test_comparison_envelope(self):
        result = compare_backtests_request({"backtests": [
            self._bt("trend", 10.0), self._bt("fft", -2.0)]})
        assert result["type"] == "comparison_result"
        assert result["best_by_return"] == "trend"  # 10.0 > -2.0
        assert len(result["rows"]) == 2
        assert len(result["equity_curves"]) == 2
