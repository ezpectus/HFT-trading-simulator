# OpenTelemetry Tracing for Exchange Simulator
#
# Implements distributed tracing with OpenTelemetry for key operations
# including trace context propagation and span annotations.

import os
import time
from typing import Any

try:
    from opentelemetry import propagate, trace
    from opentelemetry.exporter.jaeger.thrift import JaegerExporter
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
    _OTEL_AVAILABLE = True
except ImportError:
    _OTEL_AVAILABLE = False
    propagate = None
    trace = None
    JaegerExporter = None
    TracerProvider = None
    BatchSpanProcessor = None
    TraceContextTextMapPropagator = None


class _NoopSpan:
    """No-op span context manager for when OpenTelemetry is not installed."""

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def set_attribute(self, key, value):
        pass

    def set_status(self, status):
        pass

    def add_event(self, name, attributes=None):
        pass

    def record_exception(self, exception):
        pass


class _NoopTracer:
    """No-op tracer for when OpenTelemetry is not installed."""

    def start_as_current_span(self, name, **kwargs):
        return _NoopSpan()

    def start_span(self, name, **kwargs):
        return _NoopSpan()


class ExchangeSimulatorTracer:
    """OpenTelemetry tracer for exchange simulator."""

    def __init__(self, service_name: str = "exchange-simulator",
                 jaeger_host: str | None = None,
                 jaeger_port: int = 6831):
        """
        Initialize tracer.

        Args:
            service_name: Service name for tracing
            jaeger_host: Jaeger agent host (env: JAEGER_HOST, default: localhost)
            jaeger_port: Jaeger agent port
        """
        self.service_name = service_name
        self._provider = None

        if not _OTEL_AVAILABLE:
            self.tracer = _NoopTracer()
            return

        # Resolve Jaeger host from env or parameter
        jaeger_host = jaeger_host or os.getenv("JAEGER_HOST", "localhost")

        # Set up tracing
        provider = TracerProvider()

        # Configure Jaeger exporter
        jaeger_exporter = JaegerExporter(
            agent_host_name=jaeger_host,
            agent_port=jaeger_port,
        )

        provider.add_span_processor(BatchSpanProcessor(jaeger_exporter))
        trace.set_tracer_provider(provider)
        self._provider = provider

        # Configure propagator
        propagate.set_global_textmap(TraceContextTextMapPropagator())

        self.tracer = trace.get_tracer(__name__)

    def shutdown(self) -> None:
        """Flush pending spans and shut down the tracer provider."""
        if self._provider is not None:
            self._provider.shutdown()
            self._provider = None

    def trace_order_processing(self, symbol: str, side: str, quantity: float):
        """
        Trace order processing operation.

        Args:
            symbol: Trading symbol
            side: Order side
            quantity: Order quantity
        """
        with self.tracer.start_as_current_span(
            "order_processing",
            attributes={
                "symbol": symbol,
                "side": side,
                "quantity": str(quantity),
                "service": self.service_name
            }
        ) as span:
            # Annotate with additional context
            span.set_attribute("order_type", "market")
            span.add_event("order_received", {"timestamp": time.time()})

            span.add_event("order_processed", {"timestamp": time.time()})
            span.set_status(trace.Status(trace.StatusCode.OK))

    def trace_price_update(self, symbol: str, price: float, source: str):
        """
        Trace price update operation.

        Args:
            symbol: Trading symbol
            price: Current price
            source: Price source
        """
        with self.tracer.start_as_current_span(
            "price_update",
            attributes={
                "symbol": symbol,
                "price": str(price),
                "source": source,
                "service": self.service_name
            }
        ) as span:
            span.add_event("price_received", {"timestamp": time.time()})
            span.set_status(trace.Status(trace.StatusCode.OK))

    def trace_websocket_message(self, client_id: str, message_type: str):
        """
        Trace WebSocket message operation.

        Args:
            client_id: Client identifier
            message_type: Message type
        """
        with self.tracer.start_as_current_span(
            "websocket_message",
            attributes={
                "client_id": client_id,
                "message_type": message_type,
                "service": self.service_name
            }
        ) as span:
            span.add_event("message_sent", {"timestamp": time.time()})
            span.set_status(trace.Status(trace.StatusCode.OK))

    def trace_database_operation(self, operation: str, table: str):
        """
        Trace database operation.

        Args:
            operation: Operation type (SELECT, INSERT, UPDATE)
            table: Table name
        """
        with self.tracer.start_as_current_span(
            "database_operation",
            attributes={
                "operation": operation,
                "table": table,
                "service": self.service_name
            }
        ) as span:
            span.add_event("query_started", {"timestamp": time.time()})
            span.set_status(trace.Status(trace.StatusCode.OK))

    def inject_context(self, headers: dict[str, str]) -> dict[str, str]:
        """
        Inject trace context into headers.

        Args:
            headers: Existing headers dictionary

        Returns:
            Headers with trace context
        """
        propagate.inject(headers)
        return headers

    def extract_context(self, headers: dict[str, str]) -> dict[str, Any]:
        """
        Extract trace context from headers.

        Args:
            headers: Headers with trace context

        Returns:
            Extracted context
        """
        context = {}
        propagate.extract(headers, context)
        return context


# Global tracer instance
_tracer_instance: ExchangeSimulatorTracer | None = None


def get_tracer() -> ExchangeSimulatorTracer:
    """Get or create the global tracer instance."""
    global _tracer_instance
    if _tracer_instance is None:
        _tracer_instance = ExchangeSimulatorTracer()
    return _tracer_instance


def init_tracer(service_name: str = "exchange-simulator",
                jaeger_host: str | None = None,
                jaeger_port: int = 6831) -> ExchangeSimulatorTracer:
    """
    Initialize the tracer.

    Args:
        service_name: Service name
        jaeger_host: Jaeger agent host
        jaeger_port: Jaeger agent port

    Returns:
        Tracer instance
    """
    global _tracer_instance
    _tracer_instance = ExchangeSimulatorTracer(service_name, jaeger_host, jaeger_port)
    return _tracer_instance
