"""
Distributed tracing setup using OpenTelemetry + Jaeger.

Provides tracing across all Python components (AI Signal Bot, Exchange Simulator).
C++ HFT bot uses its own spdlog-based tracing; traces are correlated via trace IDs.

Usage:
    from src.observability.tracing import setup_tracing, get_tracer

    setup_tracing(service_name="ai-signal-bot", endpoint="http://jaeger:4317")
    tracer = get_tracer(__name__)

    with tracer.start_as_current_span("generate_signals") as span:
        span.set_attribute("symbol", symbol)
        span.set_attribute("strategy", strategy_name)
        # ... do work ...
"""

from __future__ import annotations

from src.observability.logging import get_logger
import os

logger = get_logger(__name__)

_tracer: object | None = None
_initialized: bool = False


def setup_tracing(
    service_name: str = "ai-signal-bot",
    endpoint: str | None = None,
    enabled: bool = True,
    insecure: bool = False,
) -> None:
    """Initialize OpenTelemetry tracing with OTLP exporter (Jaeger).

    Args:
        endpoint: OTLP collector URL. Defaults to OTEL_EXPORTER_OTLP_ENDPOINT
                  env var, or http://localhost:4317 if not set.
        insecure: If True, uses plaintext gRPC (for local dev only).
                  If False, uses TLS for secure trace export (production).
    """
    if endpoint is None:
        endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    global _tracer, _initialized

    if not enabled:
        logger.info("[Tracing] Disabled")
        return

    if _initialized:
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.asyncio import AsyncioInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create({
            "service.name": service_name,
            "service.namespace": "hft-trading-simulator",
            "service.version": "1.0.0",
        })

        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=endpoint, insecure=insecure)
        processor = BatchSpanProcessor(exporter)
        provider.add_span_processor(processor)
        trace.set_tracer_provider(provider)

        AsyncioInstrumentor().instrument()

        _tracer = trace.get_tracer(service_name)
        _initialized = True
        logger.info("[Tracing] Initialized: %s → %s", service_name, endpoint)

    except ImportError:
        logger.warning("[Tracing] opentelemetry not installed — run: pip install opentelemetry-distro opentelemetry-exporter-otlp")
    except (RuntimeError, OSError, ValueError) as e:
        logger.warning("[Tracing] Failed to initialize: %s", e)


def get_tracer(name: str = __name__):
    """Get the tracer instance. Returns a no-op tracer if not initialized."""
    if _tracer:
        return _tracer

    from contextlib import contextmanager

    class NoopSpan:
        def set_attribute(self, key, value): pass
        def set_status(self, status): pass
        def record_exception(self, exc): pass
        def add_event(self, name, attributes=None): pass

    class NoopTracer:
        @contextmanager
        def start_as_current_span(self, name, **kwargs):
            yield NoopSpan()

    return NoopTracer()


def shutdown_tracing() -> None:
    """Flush pending traces and shutdown."""
    global _initialized
    if not _initialized:
        return
    try:
        from opentelemetry import trace
        provider = trace.get_tracer_provider()
        if hasattr(provider, "shutdown"):
            provider.shutdown()
        _initialized = False
        logger.info("[Tracing] Shutdown complete")
    except (RuntimeError, OSError) as e:
        logger.warning("[Tracing] Shutdown error: %s", e)
