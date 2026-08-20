# OpenTelemetry Tracing for AI Signal Bot
#
# Implements distributed tracing with OpenTelemetry for key operations
# including signal generation, model inference, and trade execution.

import time
from typing import Any  # Any: OpenTelemetry context values are framework-defined

from opentelemetry import propagate, trace
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator


class AISignalBotTracer:
    """OpenTelemetry tracer for AI signal bot."""

    def __init__(self, service_name: str = "ai-signal-bot",
                 jaeger_host: str = "localhost",
                 jaeger_port: int = 6831):
        """
        Initialize tracer.

        Args:
            service_name: Service name for tracing
            jaeger_host: Jaeger agent host
            jaeger_port: Jaeger agent port
        """
        self.service_name = service_name

        # Set up tracing
        provider = TracerProvider()

        # Configure Jaeger exporter
        jaeger_exporter = JaegerExporter(
            agent_host_name=jaeger_host,
            agent_port=jaeger_port,
        )

        provider.add_span_processor(BatchSpanProcessor(jaeger_exporter))
        trace.set_tracer_provider(provider)

        # Configure propagator
        propagate.set_global_textmap(TraceContextTextMapPropagator())

        self.tracer = trace.get_tracer(__name__)

    def trace_signal_generation(self, strategy: str, symbol: str):
        """
        Trace signal generation operation.

        Args:
            strategy: Strategy name
            symbol: Trading symbol
        """
        with self.tracer.start_as_current_span(
            "signal_generation",
            attributes={
                "strategy": strategy,
                "symbol": symbol,
                "service": self.service_name
            }
        ) as span:
            span.add_event("feature_extraction", {"timestamp": time.time()})
            span.add_event("model_inference", {"timestamp": time.time()})
            span.set_status(trace.Status(trace.StatusCode.OK))

    def trace_model_inference(self, model_type: str, symbol: str):
        """
        Trace model inference operation.

        Args:
            model_type: Model type (LSTM, Transformer, etc.)
            symbol: Trading symbol
        """
        with self.tracer.start_as_current_span(
            "model_inference",
            attributes={
                "model_type": model_type,
                "symbol": symbol,
                "service": self.service_name
            }
        ) as span:
            span.add_event("model_loaded", {"timestamp": time.time()})
            span.add_event("prediction_made", {"timestamp": time.time()})
            span.set_status(trace.Status(trace.StatusCode.OK))

    def trace_trade_execution(self, symbol: str, side: str, quantity: float):
        """
        Trace trade execution operation.

        Args:
            symbol: Trading symbol
            side: Trade side
            quantity: Trade quantity
        """
        with self.tracer.start_as_current_span(
            "trade_execution",
            attributes={
                "symbol": symbol,
                "side": side,
                "quantity": str(quantity),
                "service": self.service_name
            }
        ) as span:
            span.add_event("order_submitted", {"timestamp": time.time()})
            span.add_event("order_filled", {"timestamp": time.time()})
            span.set_status(trace.Status(trace.StatusCode.OK))

    def trace_portfolio_rebalancing(self, strategy: str):
        """
        Trace portfolio rebalancing operation.

        Args:
            strategy: Strategy name
        """
        with self.tracer.start_as_current_span(
            "portfolio_rebalancing",
            attributes={
                "strategy": strategy,
                "service": self.service_name
            }
        ) as span:
            span.add_event("rebalancing_started", {"timestamp": time.time()})
            span.add_event("rebalancing_completed", {"timestamp": time.time()})
            span.set_status(trace.Status(trace.StatusCode.OK))

    def trace_risk_check(self, check_type: str, symbol: str):
        """
        Trace risk check operation.

        Args:
            check_type: Type of risk check
            symbol: Trading symbol
        """
        with self.tracer.start_as_current_span(
            "risk_check",
            attributes={
                "check_type": check_type,
                "symbol": symbol,
                "service": self.service_name
            }
        ) as span:
            span.add_event("check_started", {"timestamp": time.time()})
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
_tracer_instance: AISignalBotTracer | None = None


def get_tracer() -> AISignalBotTracer:
    """Get or create the global tracer instance."""
    global _tracer_instance
    if _tracer_instance is None:
        _tracer_instance = AISignalBotTracer()
    return _tracer_instance


def init_tracer(service_name: str = "ai-signal-bot",
                jaeger_host: str = "localhost",
                jaeger_port: int = 6831) -> AISignalBotTracer:
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
    _tracer_instance = AISignalBotTracer(service_name, jaeger_host, jaeger_port)
    return _tracer_instance
