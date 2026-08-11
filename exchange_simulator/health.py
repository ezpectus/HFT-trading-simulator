"""Health check endpoint for Exchange Simulator.

Provides HTTP health check endpoint for monitoring and orchestration.
"""
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import time
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from exchange_simulator import SimulatedExchange

app = FastAPI(title="HFT Exchange Simulator Health")

# Global exchange instance
_exchange = None


def get_exchange():
    """Get or create exchange instance."""
    global _exchange
    if _exchange is None:
        config_path = Path(__file__).parent / "config.yaml"
        _exchange = SimulatedExchange(
            exchange_id="binance",
            config_path=config_path,
        )
    return _exchange


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        exchange = get_exchange()
        
        return JSONResponse({
            "status": "healthy",
            "version": "3.0.0",
            "uptime": time.time() - exchange._start_time if hasattr(exchange, '_start_time') else 0,
            "connections": len(exchange._websocket_server._clients) if exchange._websocket_server else 0,
            "symbols": len(exchange._config["exchanges"]["binance"]["symbols"]),
            "orders_submitted": exchange._order_history_count if hasattr(exchange, '_order_history_count') else 0,
            "audit_logging_enabled": exchange._audit_logger is not None if hasattr(exchange, '_audit_logger') else False,
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
        exchange = get_exchange()
        
        metrics = []
        
        # Order metrics
        metrics.append(f'hft_orders_submitted_total {len(exchange._order_history)}')
        metrics.append(f'hft_orders_filled_total {sum(1 for o in exchange._order_history if o.status.value == "FILLED")}')
        metrics.append(f'hft_orders_rejected_total {sum(1 for o in exchange._order_history if o.status.value == "REJECTED")}')
        
        # WebSocket metrics
        if exchange._websocket_server:
            metrics.append(f'hft_websocket_connections {len(exchange._websocket_server._clients)}')
        
        # Symbol count
        metrics.append(f'hft_symbols_count {len(exchange._config["exchanges"]["binance"]["symbols"])}')
        
        # Audit log metrics
        if exchange._audit_logger:
            metrics.append(f'hft_audit_log_entries_total {len(exchange._audit_logger._logs)}')
        
        return "\n".join(metrics)
    except Exception as e:
        return f"# Error: {str(e)}"


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8775)
