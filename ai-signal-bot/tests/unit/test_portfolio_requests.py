"""Contract tests for optimize_portfolio / vol_surface WS request handlers
 — exercises the previously-dead portfolio/ + pricing/ modules through
the same dispatch path signal_publisher uses."""
import math

import numpy as np
import pytest

from src.communication.portfolio_requests import (
    optimize_portfolio_request,
    parse_portfolio_params,
    vol_surface_request,
)


def _candles(closes):
    base = 1704067200
    return [
        {"timestamp": base + i * 300, "open": p, "high": p * 1.001,
         "low": p * 0.999, "close": p, "volume": 100.0}
        for i, p in enumerate(closes)
    ]


def _series(n, drift, vol, seed):
    rng = np.random.RandomState(seed)
    prices = [100.0]
    for _ in range(n):
        prices.append(prices[-1] * math.exp(drift + vol * rng.randn()))
    return prices


def _assets(n=3, candles=200):
    specs = [(0.0008, 0.010), (0.0002, 0.020), (-0.0001, 0.005), (0.0005, 0.015)]
    return [
        {"symbol": f"A{i}/USDT", "candles_data": _candles(_series(candles, d, v, seed=40 + i))}
        for i, (d, v) in enumerate(specs[:n])
    ]


class TestOptimizePortfolio:
    @pytest.mark.asyncio
    async def test_max_sharpe_returns_normalized_weights(self):
        result = await optimize_portfolio_request({"method": "max_sharpe", "assets": _assets(3)})
        assert result["type"] == "portfolio_result"
        assert "error" not in result
        weights = result["weights"]
        assert set(weights) == {"A0/USDT", "A1/USDT", "A2/USDT"}
        assert all(0 <= w <= 1 for w in weights.values())
        assert sum(weights.values()) == pytest.approx(1.0, abs=1e-3)
        for key in ("expected_return", "volatility", "sharpe_ratio", "n_periods"):
            assert key in result
            assert math.isfinite(result[key])

    @pytest.mark.asyncio
    async def test_min_variance_prefers_low_vol_asset(self):
        result = await optimize_portfolio_request({"method": "min_variance", "assets": _assets(3)})
        assert "error" not in result
        # A2 has ~3x lower vol than A1 — min-variance must tilt toward it
        assert result["weights"]["A2/USDT"] >= result["weights"]["A1/USDT"]

    @pytest.mark.asyncio
    async def test_risk_parity_equalizes_contributions(self):
        result = await optimize_portfolio_request({"method": "risk_parity", "assets": _assets(3)})
        assert "error" not in result
        rc = result["risk_contributions"]
        assert set(rc) == set(result["symbols"])
        for pct in rc.values():
            assert pct == pytest.approx(1 / 3, abs=0.05)

    @pytest.mark.asyncio
    async def test_black_litterman_with_view(self):
        params = {
            "method": "black_litterman",
            "assets": _assets(3),
            "views": [{"assets": ["A0/USDT"], "weights": [1.0],
                       "expected_return": 0.01, "confidence": 0.8}],
        }
        result = await optimize_portfolio_request(params)
        assert "error" not in result
        assert sum(result["weights"].values()) == pytest.approx(1.0, abs=1e-3)

    @pytest.mark.asyncio
    async def test_rebalance_orders_when_weights_supplied(self):
        result = await optimize_portfolio_request({
            "method": "max_sharpe",
            "assets": _assets(2),
            "current_weights": [0.9, 0.1],
            "portfolio_value": 10000,
        })
        assert "error" not in result
        reb = result["rebalance"]
        assert "turnover" in reb and "estimated_cost" in reb
        for order in reb["orders"]:
            assert order["side"] in ("BUY", "SELL")
            assert order["trade_amount"] > 0
            assert order["symbol"] in result["symbols"]

    @pytest.mark.asyncio
    async def test_rebalance_omitted_without_inputs(self):
        result = await optimize_portfolio_request({"method": "max_sharpe", "assets": _assets(2)})
        assert "rebalance" not in result

    @pytest.mark.asyncio
    @pytest.mark.parametrize("params,needle", [
        ({"method": "bogus", "assets": _assets(2)}, "unknown method"),
        ({"method": "max_sharpe", "assets": [_assets(2)[0]]}, "need 2-16 assets"),
        ({"method": "max_sharpe", "assets": [{"symbol": "X/USDT"}, {"symbol": "Y/USDT"}]}, "candles_data"),
        ({"method": "black_litterman", "assets": _assets(2)}, "views"),
        ({"method": "max_sharpe", "assets": _assets(2),
          "current_weights": [1.0]}, "current_weights length"),
        # 1e999 is valid JSON → parses to inf → must not reach the optimizer
        # (NaN/inf outputs serialize as bare NaN → unparseable frame)
        ({"method": "max_sharpe", "assets": _assets(2),
          "current_weights": [1e999, 0.0]}, "must be finite"),
        ({"method": "max_sharpe", "assets": _assets(2),
          "risk_free_rate": -1e999}, "must be finite"),
        ({"method": "max_sharpe", "assets": _assets(2),
          "portfolio_value": 1e999}, "must be finite"),
    ])
    async def test_error_paths(self, params, needle):
        result = await optimize_portfolio_request(params)
        assert result["type"] == "portfolio_result"
        assert needle in result["error"]

    def test_parse_short_candles_rejected(self):
        bad = [{"symbol": "X/USDT", "candles_data": _candles([100.0, 101.0])},
               {"symbol": "Y/USDT", "candles_data": _candles(_series(100, 0.001, 0.01, 1))}]
        err = parse_portfolio_params({"method": "max_sharpe", "assets": bad})
        assert "too-short" in err


class TestVolSurface:
    def _smile_points(self, a=0.09, b=0.1, rho=-0.3, m=0.0, sigma=0.2,
                      t_days=30, forward=64000.0):
        """Synthetic market smile generated FROM a known SVI param set."""
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface(model="svi")
        vs.svi_params = SVIParams(a, b, rho, m, sigma)
        vs._calibrated = True
        t = t_days / 365.0
        points = []
        for k_mult in (0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2):
            k_strike = forward * k_mult
            iv = vs.implied_vol(k_strike, t_days, forward)
            points.append({"strike": k_strike, "maturity_days": t_days, "iv": iv})
        assert t > 0
        return points, forward

    @pytest.mark.asyncio
    async def test_svi_calibration_recovers_params(self):
        points, forward = self._smile_points()
        result = await vol_surface_request({
            "model": "svi", "forward": forward, "points": points,
        })
        assert result["type"] == "vol_surface_result"
        assert "error" not in result
        assert result["calibrated"] is True
        p = result["params"]
        for key in ("a", "b", "rho", "m", "sigma"):
            assert key in p
        # SVI params are non-identifiable on a single-expiry smile — the
        # contract is that the FITTED smile reproduces the input IVs.
        for f, pt in zip(result["fitted"], points, strict=True):
            assert f["iv_model"] == pytest.approx(pt["iv"], abs=0.02)

    @pytest.mark.asyncio
    async def test_sabr_calibration(self):
        points, forward = self._smile_points()
        result = await vol_surface_request({
            "model": "sabr", "forward": forward, "points": points, "beta": 0.5,
        })
        assert "error" not in result
        p = result["params"]
        for key in ("alpha", "beta", "rho", "nu"):
            assert key in p
        assert p["alpha"] > 0

    @pytest.mark.asyncio
    async def test_eval_strikes_grid(self):
        points, forward = self._smile_points()
        result = await vol_surface_request({
            "model": "svi", "forward": forward, "points": points,
            "eval_strikes": [60000, 64000, 68000],
        })
        assert "error" not in result
        assert [f["strike"] for f in result["fitted"]] == [60000, 64000, 68000]

    @pytest.mark.asyncio
    @pytest.mark.parametrize("params,needle", [
        ({"model": "bs", "points": []}, "unknown model"),
        ({"model": "svi", "forward": 64000, "points": [{"strike": 1, "maturity_days": 30, "iv": 0.5}]}, "need 4-500"),
        ({"model": "svi", "forward": -1,
          "points": [{"strike": 60000, "maturity_days": 30, "iv": 0.5}] * 4}, "forward"),
        ({"model": "svi", "forward": 64000,
          "points": [{"strike": -5, "maturity_days": 30, "iv": 0.5}] * 4}, "out of range"),
        ({"model": "svi", "forward": 1e999,
          "points": [{"strike": 60000, "maturity_days": 30, "iv": 0.5}] * 4}, "finite"),
        ({"model": "svi", "forward": 64000,
          "points": [{"strike": 1e999, "maturity_days": 30, "iv": 0.5}] * 4}, "finite"),
        ({"model": "svi", "forward": 64000, "eval_strikes": [1e999],
          "points": [{"strike": 60000, "maturity_days": 30, "iv": 0.5}] * 4}, "finite"),
    ])
    async def test_error_paths(self, params, needle):
        result = await vol_surface_request(params)
        assert result["type"] == "vol_surface_result"
        assert needle in result["error"]
