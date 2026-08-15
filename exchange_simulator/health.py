"""Health check endpoint for Exchange Simulator.

Provides HTTP health check endpoint for monitoring and orchestration.
"""
from fastapi import FastAPI
from fastapi.responses import JSONResponse, PlainTextResponse
import os
import sys
import time
from pathlib import Path

_proj_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _proj_root not in sys.path:
    sys.path.insert(0, _proj_root)
_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

import yaml
from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.models import OrderStatus

app = FastAPI(title="HFT Exchange Simulator Health")

_exchanges = None
_market = None
_start_time = None


def _load_config() -> dict:
    config_path = Path(__file__).parent / "config.yaml"
    with open(config_path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _init():
    global _exchanges, _market, _start_time
    if _exchanges is None:
        config = _load_config()
        symbols = list(config["initial_prices"].keys())
        exchange_ids = list(config["exchanges"].keys())
        _market = MarketSimulator(
            symbols=symbols,
            exchanges=exchange_ids,
            initial_prices=config["initial_prices"],
            volatility=config["volatility"],
            timeframe_seconds=config["market"]["timeframe_seconds"],
            drift=config["market"]["drift"],
            seed=config["market"].get("seed"),
            warmup_candles=config["market"]["warmup_candles"],
            order_book_depth=config["market"]["order_book_depth"],
        )
        _exchanges = {}
        for ex_id, ex_cfg in config["exchanges"].items():
            _exchanges[ex_id] = SimulatedExchange(
                exchange_id=ex_id,
                name=ex_cfg["name"],
                fee_pct=ex_cfg["fee_pct"],
                slippage_bps=ex_cfg["slippage_bps"],
                market=_market,
                initial_balance=config["account"]["initial_balance"],
                leverage=config["account"]["leverage"],
            )
        _start_time = time.time()
    return _exchanges, _market, _start_time


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        exchanges, market, start_time = _init()
        first_ex = next(iter(exchanges.values()))
        
        return JSONResponse({
            "status": "healthy",
            "version": "2.2.0",
            "uptime": time.time() - start_time,
            "symbols": len(market.symbols),
            "exchanges": len(exchanges),
            "orders_submitted": len(first_ex._order_history),
            "audit_logging_enabled": first_ex._audit_logger is not None,
        })
    except Exception as e:
        return JSONResponse({
            "status": "unhealthy",
            "error": str(e),
        }, status_code=503)


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    try:
        exchanges, market, _ = _init()
        
        lines = []
        for ex_id, ex in exchanges.items():
            history = ex._order_history
            filled = sum(1 for o in history if o.status == OrderStatus.FILLED)
            rejected = sum(1 for o in history if o.status == OrderStatus.REJECTED)
            lines.append(f'hft_orders_submitted_total{{exchange="{ex_id}"}} {len(history)}')
            lines.append(f'hft_orders_filled_total{{exchange="{ex_id}"}} {filled}')
            lines.append(f'hft_orders_rejected_total{{exchange="{ex_id}"}} {rejected}')
            if ex._audit_logger:
                lines.append(f'hft_audit_log_entries_total{{exchange="{ex_id}"}} {len(ex._audit_logger._logs)}')
        
        lines.append(f'hft_symbols_count {len(market.symbols)}')
        lines.append(f'hft_exchanges_count {len(exchanges)}')
        
        return PlainTextResponse(content="\n".join(lines), media_type="text/plain; version=0.0.4; charset=utf-8")
    except Exception as e:
        return PlainTextResponse(content=f"# Error: {str(e)}", media_type="text/plain; version=0.0.4; charset=utf-8", status_code=503)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8775)
