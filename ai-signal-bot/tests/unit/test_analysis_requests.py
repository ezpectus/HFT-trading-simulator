"""Contract tests for the risk/analytics WS request handlers.

Mirrors test_portfolio_requests.py: call the handler, assert the response
envelope + validated payload fields, and exercise the error paths.
"""
import numpy as np
import pytest

from src.communication.analysis_requests import (
    cvar_analysis_request,
    funding_arb_scan_request,
    hawkes_fit_request,
    position_size_request,
    stress_test_request,
)

RNG = np.random.default_rng(7)


def _returns(n=120):
    return RNG.normal(0.0005, 0.02, n).tolist()


# ── cvar_analysis ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cvar_historical_happy():
    res = await cvar_analysis_request({"returns": _returns(), "confidence": 0.95})
    assert res["type"] == "cvar_result"
    assert "error" not in res
    assert res["method"] == "historical"
    assert res["confidence_level"] == 0.95
    assert res["cvar"] <= res["var"] <= 0 or res["cvar"] < 0  # tail loss ≤ VaR
    assert {"skewness", "kurtosis", "tail_index", "max_drawdown"} <= set(res["tail"])
    assert "crisis_2008" in res["scenarios"]


@pytest.mark.asyncio
async def test_cvar_from_candles():
    candles = [{"close": 100 * (1 + r)} for r in _returns(60)]
    res = await cvar_analysis_request({"candles_data": candles, "method": "parametric"})
    assert "error" not in res
    assert res["method"] == "parametric"


@pytest.mark.asyncio
@pytest.mark.parametrize("params,frag", [
    ({"returns": [0.01] * 5}, "≥10"),
    ({"returns": ["x"] * 20}, "numbers"),
    ({"returns": _returns(), "method": "bogus"}, "unknown method"),
    ({"returns": _returns(), "confidence": 1.5}, "confidence"),
    ({}, "need returns"),
])
async def test_cvar_validation(params, frag):
    res = await cvar_analysis_request(params)
    assert res["type"] == "cvar_result"
    assert frag in res["error"]


# ── stress_test ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stress_all_scenarios():
    res = await stress_test_request({
        "positions": [{"symbol": "BTC/USDT", "qty": 0.5, "price": 64000},
                      {"symbol": "ETH/USDT", "qty": 4.0, "price": 3200}],
    })
    assert res["type"] == "stress_test_result"
    assert "error" not in res
    assert len(res["results"]) == 3
    names = {r["scenario"] for r in res["results"]}
    assert names == {"2008 Financial Crisis", "COVID-19 Crash", "FTX Collapse"}
    assert res["summary"]["total_scenarios"] == 3
    # 50% / 30% / ~25% drops → all pnl negative
    assert all(r["pnl"] < 0 for r in res["results"])
    assert res["summary"]["worst_pnl_percentage"] < 0


@pytest.mark.asyncio
async def test_stress_single_scenario_and_custom():
    res = await stress_test_request({
        "positions": [{"symbol": "BTC/USDT", "qty": 1.0, "price": 64000}],
        "scenario": "covid_crash",
        "custom_shocks": [0.9],
    })
    assert "error" not in res
    assert len(res["results"]) == 2
    assert res["results"][1]["scenario"] == "Custom Shock"
    assert abs(res["results"][1]["pnl_pct"] + 0.1) < 1e-9


@pytest.mark.asyncio
@pytest.mark.parametrize("params,frag", [
    ({"positions": []}, "need 1-"),
    ({"positions": [{"qty": "x", "price": 1}]}, "qty + price"),
    ({"positions": [{"qty": 1, "price": 1}], "scenario": "y2k"}, "unknown scenario"),
    ({"positions": [{"qty": 1, "price": 1}], "custom_shocks": [0.5, 0.5]},
     "length must match"),
])
async def test_stress_validation(params, frag):
    res = await stress_test_request(params)
    assert frag in res["error"]


# ── position_size ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_position_size_volatility():
    res = await position_size_request({
        "direction": "LONG", "price": 64000, "volatility": 0.02,
        "account_value": 10000, "method": "volatility",
    })
    assert res["type"] == "position_size_result"
    assert "error" not in res
    assert res["position_size"] > 0
    assert res["position_value"] <= 10000 * 0.2 * 1.0001  # capped by max_position


@pytest.mark.asyncio
async def test_position_size_hold_is_zero():
    res = await position_size_request({
        "direction": "HOLD", "price": 64000, "method": "risk_parity"})
    assert "error" not in res
    assert res["position_size"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("params,frag", [
    ({"direction": "UP", "price": 1}, "direction"),
    ({"direction": "LONG", "price": 1, "method": "x"}, "unknown method"),
    ({"direction": "LONG", "price": -5}, "price/account"),
    ({"direction": "LONG", "price": 1, "method": "kelly"}, "requires volatility"),
    ({"direction": "LONG", "price": 1, "volatility": 0, "method": "volatility"},
     "volatility must be > 0"),
])
async def test_position_size_validation(params, frag):
    res = await position_size_request(params)
    assert frag in res["error"]


# ── hawkes_fit ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_hawkes_fit_happy():
    # Clustered events: bursts around t=10, 30, 50 (Poisson baseline would
    # understate the clustering the fit should pick up)
    events = []
    rng = np.random.default_rng(3)
    for burst in (10.0, 30.0, 50.0):
        events.extend(sorted(burst + rng.exponential(0.5, 8)))
    res = await hawkes_fit_request({"events": events})
    assert res["type"] == "hawkes_result"
    assert "error" not in res
    p = res["params"]
    assert {"mu", "alpha", "beta", "branching_ratio", "log_lik"} <= set(p)
    assert 0 < p["branching_ratio"] < 1  # stationarity (alpha < beta enforced)
    assert res["n_events"] == len(events)
    assert len(res["intensity_path"]) > 10
    # Intensity should peak near event bursts, not be flat
    vals = [pt["intensity"] for pt in res["intensity_path"]]
    assert max(vals) > min(vals)


@pytest.mark.asyncio
@pytest.mark.parametrize("params,frag", [
    ({"events": [1.0, 2.0]}, "5-5000"),
    ({"events": ["x"] * 10}, "numbers"),
    ({"events": [5.0] * 10}, "span"),
])
async def test_hawkes_validation(params, frag):
    res = await hawkes_fit_request(params)
    assert res["type"] == "hawkes_result"
    assert frag in res["error"]


# ── funding_arb_scan ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_funding_arb_detects_spot_perp():
    # 0.05%/8h funding exceeds the 0.03% detector threshold; sim spot==perp.
    res = await funding_arb_scan_request({
        "funding_rates": {"binance": 0.0005},
        "prices": {"binance": {"BTC/USDT": 64000.0}},
        "symbols": ["BTC/USDT"],
    })
    assert res["type"] == "funding_arb_result"
    assert "error" not in res
    assert res["scanned_exchanges"] == 1
    assert len(res["opportunities"]) >= 1
    opp = res["opportunities"][0]
    assert opp["type"] == "spot_perp"
    assert opp["symbol"] == "BTC/USDT"
    assert opp["confidence"] >= 60
    assert opp["expected_daily_return"] > 0


@pytest.mark.asyncio
async def test_funding_arb_no_opportunity_below_threshold():
    res = await funding_arb_scan_request({
        "funding_rates": {"binance": 0.00001},
        "prices": {"binance": {"BTC/USDT": 64000.0}},
        "symbols": ["BTC/USDT"],
    })
    assert "error" not in res
    assert res["opportunities"] == []


@pytest.mark.asyncio
async def test_funding_arb_uses_live_exchange_fallback():
    class _Ex:
        funding_rates = {"okx": 0.0004}
        latest_prices = {"okx": {"ETH/USDT": 3200.0}}
    res = await funding_arb_scan_request({}, exchange=_Ex())
    assert "error" not in res
    assert res["scanned_exchanges"] == 1


@pytest.mark.asyncio
async def test_funding_arb_no_data():
    res = await funding_arb_scan_request({})
    assert "funding_rates" in res["error"]
