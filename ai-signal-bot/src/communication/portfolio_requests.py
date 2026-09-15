"""Portfolio + pricing request handling for the signal WebSocket server.

Same pattern as backtest_requests.py: self-free functions taking the raw
params dict and returning a JSON-ready payload. numpy/scipy work runs in
``asyncio.to_thread`` so an SLSQP/Nelder-Mead calibration can't stall the
broadcast loop.

Protocol:
  ← {"type": "optimize_portfolio", "method": "max_sharpe",
     "assets": [{"symbol": "BTC/USDT", "candles_data": [...]}, ...],
     "current_weights": [0.5, 0.5], "portfolio_value": 10000,   # optional → rebalance
     "views": [{"assets": ["BTC/USDT"], "weights": [1],         # black_litterman only
                "expected_return": 0.001, "confidence": 0.7}]}
  → {"type": "portfolio_result", "method": ..., "weights": {...}, ...}

  ← {"type": "vol_surface", "model": "svi", "forward": 64000,
     "points": [{"strike": 60000, "maturity_days": 30, "iv": 0.62}, ...],
     "eval_strikes": [...]}                                    # optional output grid
  → {"type": "vol_surface_result", "model": ..., "params": {...}, "fitted": [...]}
"""
import asyncio

import numpy as np

from src.observability.logging import get_logger

logger = get_logger("ai_signal_bot.signal_publisher")

_METHODS = ("max_sharpe", "min_variance", "risk_parity", "black_litterman")
_MODELS = ("svi", "sabr")
_MAX_ASSETS = 16
_MAX_CANDLES = 2000
_MAX_POINTS = 500


def _returns_from_candles(candles: list) -> "np.ndarray | None":
    """Close-to-close simple returns from a candles_data payload."""
    closes = []
    for c in candles[-_MAX_CANDLES:]:
        try:
            closes.append(float(c["close"]))
        except (TypeError, ValueError, KeyError):
            return None
    if len(closes) < 10:
        return None
    arr = np.asarray(closes)
    prev = arr[:-1]
    if not np.all(np.isfinite(arr)) or np.any(prev <= 0):
        return None
    return arr[1:] / prev - 1.0


def parse_assets(params: dict) -> "tuple[list[str], np.ndarray] | str":
    """Parse assets[] into (symbols, returns matrix) or an error string."""
    raw = params.get("assets")
    if not isinstance(raw, list) or not (2 <= len(raw) <= _MAX_ASSETS):
        return f"need 2-{_MAX_ASSETS} assets"
    symbols: list[str] = []
    series = []
    for entry in raw:
        symbol = str(entry.get("symbol", ""))[:32]
        candles = entry.get("candles_data")
        if not symbol or not isinstance(candles, list):
            return "each asset needs symbol + candles_data"
        rets = _returns_from_candles(candles)
        if rets is None:
            return f"asset {symbol or '?'}: bad or too-short candles_data (need ≥10 closes > 0)"
        symbols.append(symbol)
        series.append(rets)
    min_len = min(len(s) for s in series)
    returns = np.array([s[-min_len:] for s in series])
    if returns.shape[1] < 5:
        return "not enough aligned return observations (need ≥5)"
    return symbols, returns


def parse_views(params: dict, symbols: list[str]) -> "list | str":
    """Parse Black-Litterman views; asset names resolve to indices."""
    from src.portfolio.black_litterman import View

    raw = params.get("views")
    if not isinstance(raw, list) or not raw:
        return "black_litterman needs non-empty views[]"
    index = {s: i for i, s in enumerate(symbols)}
    views = []
    for v in raw[:8]:
        try:
            asset_names = [str(a)[:32] for a in v["assets"]]
            assets = [index[a] for a in asset_names]
            view_floats = [float(w) for w in v["weights"]] + [
                float(v["expected_return"]), float(v["confidence"])]
            if not all(np.isfinite(x) for x in view_floats):
                return "view values must be finite"
            views.append(View(
                assets=assets,
                weights=[float(w) for w in v["weights"]],
                expected_return=float(v["expected_return"]),
                confidence=float(v["confidence"]),
            ))
        except (TypeError, ValueError, KeyError) as e:
            return f"bad view: {e}"
        if len(views[-1].weights) != len(assets):
            return "view weights must match view assets"
    return views


def _optimize(parsed: dict) -> dict:
    """Run the selected optimizer on the parsed returns matrix."""
    from src.portfolio.black_litterman import BlackLittermanModel
    from src.portfolio.markowitz import MarkowitzOptimizer
    from src.portfolio.risk_parity import RiskParityOptimizer

    symbols = parsed["symbols"]
    returns = parsed["returns"]
    method = parsed["method"]
    rf = parsed["risk_free_rate"]

    expected_returns = np.mean(returns, axis=1)
    cov_matrix = np.cov(returns)

    out: dict = {"method": method, "symbols": symbols, "n_periods": int(returns.shape[1])}

    if method == "risk_parity":
        opt = RiskParityOptimizer(risk_free_rate=rf)
        result = opt.optimize_risk_parity(cov_matrix, expected_returns=expected_returns)
        contributions = opt.calculate_risk_contributions(result.weights, cov_matrix)
        out["risk_contributions"] = {
            symbols[rc.asset_index]: round(rc.percentage, 4) for rc in contributions
        }
    elif method == "black_litterman":
        market_weights = parsed["market_weights"]
        if market_weights is None:
            market_weights = np.ones(len(symbols)) / len(symbols)
        bl = BlackLittermanModel(risk_free_rate=rf)
        result = bl.calculate_black_litterman_portfolio(
            market_weights, cov_matrix, parsed["views"],
        )
    else:
        opt = MarkowitzOptimizer(risk_free_rate=rf)
        if method == "min_variance":
            result = opt.calculate_minimum_variance_portfolio(expected_returns, cov_matrix)
        else:
            result = opt.calculate_maximum_sharpe_portfolio(expected_returns, cov_matrix)

    out["weights"] = {s: round(float(w), 6) for s, w in zip(symbols, result.weights, strict=True)}
    out["expected_return"] = float(result.expected_return)
    out["volatility"] = float(result.volatility)
    out["sharpe_ratio"] = float(result.sharpe_ratio)

    if parsed["current_weights"] is not None and parsed["portfolio_value"]:
        out["rebalance"] = _rebalance_section(parsed, result.weights)
    return out


def _rebalance_section(parsed: dict, target_weights: np.ndarray) -> dict:
    """Rebalance orders from current → optimized weights (RebalancingStrategy)."""
    from src.portfolio.rebalancing import RebalancingStrategy

    strat = RebalancingStrategy()
    current = np.asarray(parsed["current_weights"], dtype=float)
    value = parsed["portfolio_value"]
    res = strat.execute_rebalance(current, target_weights, value)
    symbols = parsed["symbols"]
    return {
        "orders": [
            {
                "symbol": symbols[o.asset_index],
                "side": o.side,
                "trade_amount": round(o.trade_amount, 2),
                "current_weight": round(float(o.current_weight), 6),
                "target_weight": round(float(o.target_weight), 6),
            }
            for o in res.orders
        ],
        "turnover": round(float(res.turnover), 6),
        "estimated_cost": round(float(res.estimated_cost), 2),
    }


def parse_portfolio_params(params: dict) -> "dict | str":
    """Validate optimize_portfolio params; returns parsed dict or error string."""
    method = str(params.get("method", "max_sharpe"))[:32]
    if method not in _METHODS:
        return f"unknown method '{method}' — expected one of {_METHODS}"
    assets = parse_assets(params)
    if isinstance(assets, str):
        return assets
    symbols, returns = assets

    current_weights = params.get("current_weights")
    if current_weights is not None:
        try:
            current_weights = [float(w) for w in current_weights]
        except (TypeError, ValueError):
            return "current_weights must be numbers"
        if not all(np.isfinite(w) for w in current_weights):
            return "current_weights must be finite"
        if len(current_weights) != len(symbols):
            return "current_weights length must match assets"
    portfolio_value = params.get("portfolio_value")
    if portfolio_value is not None:
        try:
            portfolio_value = max(0.0, float(portfolio_value))
        except (TypeError, ValueError):
            return "portfolio_value must be a number"
        if not np.isfinite(portfolio_value):
            return "portfolio_value must be finite"

    views = None
    if method == "black_litterman":
        views = parse_views(params, symbols)
        if isinstance(views, str):
            return views
    market_weights = params.get("market_weights")
    if market_weights is not None:
        try:
            market_weights = np.asarray([float(w) for w in market_weights])
        except (TypeError, ValueError):
            return "market_weights must be numbers"
        if not np.all(np.isfinite(market_weights)):
            return "market_weights must be finite"
        if market_weights.shape[0] != len(symbols):
            return "market_weights length must match assets"

    try:
        rf = float(params.get("risk_free_rate", 0.0))
    except (TypeError, ValueError):
        rf = 0.0
    if not np.isfinite(rf):
        return "risk_free_rate must be finite"
    return {
        "method": method, "symbols": symbols, "returns": returns,
        "current_weights": current_weights, "portfolio_value": portfolio_value,
        "views": views, "market_weights": market_weights, "risk_free_rate": rf,
    }


async def optimize_portfolio_request(params: dict) -> dict:
    """Handle an optimize_portfolio WS request."""
    parsed = parse_portfolio_params(params)
    if isinstance(parsed, str):
        return {"type": "portfolio_result", "error": parsed}
    try:
        out = await asyncio.to_thread(_optimize, parsed)
    except (ValueError, np.linalg.LinAlgError, RuntimeError) as e:
        return {"type": "portfolio_result", "error": f"optimization failed: {e}"}
    logger.info("Portfolio optimized: %s over %s assets", parsed["method"], len(parsed["symbols"]))
    return {"type": "portfolio_result", **out}


def parse_surface_points(params: dict) -> "tuple[np.ndarray, np.ndarray, np.ndarray] | str":
    """Parse points[] into (strikes, maturities_years, ivs) or an error string."""
    raw = params.get("points")
    if not isinstance(raw, list) or not (4 <= len(raw) <= _MAX_POINTS):
        return f"need 4-{_MAX_POINTS} points"
    strikes, mats, ivs = [], [], []
    for p in raw:
        try:
            k, t, iv = float(p["strike"]), float(p["maturity_days"]), float(p["iv"])
        except (TypeError, ValueError, KeyError):
            return "each point needs strike + maturity_days + iv"
        if not (np.isfinite(k) and np.isfinite(t) and np.isfinite(iv)):
            return "point values must be finite"
        if k <= 0 or t <= 0 or not (0 < iv < 5):
            return "point out of range (strike>0, maturity_days>0, 0<iv<5)"
        strikes.append(k)
        mats.append(t / 365.0)
        ivs.append(iv)
    return np.asarray(strikes), np.asarray(mats), np.asarray(ivs)


def _calibrate(parsed: dict) -> dict:
    """Calibrate SVI/SABR to the parsed smile points."""
    from src.pricing.volatility_surface import VolatilitySurface

    vs = VolatilitySurface(model=parsed["model"])
    strikes, mats, ivs, forward = (
        parsed["strikes"], parsed["maturities"], parsed["ivs"], parsed["forward"])

    if parsed["model"] == "svi":
        log_moneyness = np.log(strikes / forward)
        implied_variances = ivs**2 * mats
        params = vs.calibrate_svi(log_moneyness, implied_variances)
        out_params = {"a": params.a, "b": params.b, "rho": params.rho,
                      "m": params.m, "sigma": params.sigma}
    else:
        params = vs.calibrate_sabr(
            np.full_like(strikes, forward), strikes, mats, ivs,
            beta=parsed["beta"],
        )
        out_params = {"alpha": params.alpha, "beta": params.beta,
                      "rho": params.rho, "nu": params.nu}

    eval_strikes = parsed["eval_strikes"] if parsed["eval_strikes"] is not None else strikes
    fitted = [
        {"strike": float(k), "maturity_days": float(t * 365),
         "iv_model": float(vs.implied_vol(float(k), float(t * 365), forward))}
        for k, t in zip(eval_strikes, mats, strict=False)
    ]
    if parsed["eval_strikes"] is not None:
        # eval grid at the median maturity — a 2-D grid would flood the frame
        med_t = float(np.median(mats))
        fitted = [
            {"strike": float(k), "maturity_days": med_t * 365,
             "iv_model": float(vs.implied_vol(float(k), med_t * 365, forward))}
            for k in eval_strikes[:100]
        ]
    return {
        "model": parsed["model"],
        "params": {k: round(v, 6) for k, v in out_params.items()},
        "fitted": fitted,
        "points": len(strikes),
        "calibrated": vs._calibrated,
    }


async def vol_surface_request(params: dict) -> dict:
    """Handle a vol_surface WS request — calibrate SVI/SABR to market IVs."""
    model = str(params.get("model", "svi"))[:16]
    if model not in _MODELS:
        return {"type": "vol_surface_result", "error": f"unknown model '{model}' — svi|sabr"}
    points = parse_surface_points(params)
    if isinstance(points, str):
        return {"type": "vol_surface_result", "error": points}
    strikes, mats, ivs = points
    try:
        forward = float(params.get("forward", 0))
    except (TypeError, ValueError):
        forward = 0.0
    if not np.isfinite(forward) or forward <= 0:
        return {"type": "vol_surface_result", "error": "forward must be a finite number > 0"}
    try:
        beta = float(params.get("beta", 0.5))
    except (TypeError, ValueError):
        beta = 0.5
    if not (0 <= beta <= 1):
        return {"type": "vol_surface_result", "error": "beta must be in [0, 1]"}
    eval_strikes = params.get("eval_strikes")
    if eval_strikes is not None:
        try:
            eval_strikes = [float(k) for k in eval_strikes[:100]]
        except (TypeError, ValueError):
            return {"type": "vol_surface_result", "error": "eval_strikes must be numbers"}
        if not all(np.isfinite(k) for k in eval_strikes):
            return {"type": "vol_surface_result", "error": "eval_strikes must be finite"}

    parsed = {"model": model, "strikes": strikes, "maturities": mats, "ivs": ivs,
              "forward": forward, "beta": beta, "eval_strikes": eval_strikes}
    try:
        out = await asyncio.to_thread(_calibrate, parsed)
    except (ValueError, RuntimeError, np.linalg.LinAlgError) as e:
        return {"type": "vol_surface_result", "error": f"calibration failed: {e}"}
    logger.info("Vol surface calibrated: %s over %s points", model, len(strikes))
    return {"type": "vol_surface_result", **out}
