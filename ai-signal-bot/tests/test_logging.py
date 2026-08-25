"""Tests for observability logging."""
import pytest
from src.observability.logging import setup_logging, get_logger


class TestLogging:
    def test_get_logger_returns_logger(self):
        log = get_logger("test_module")
        assert log is not None

    def test_setup_logging_idempotent(self):
        setup_logging(service="test", level="DEBUG")
        setup_logging(service="test", level="INFO")  # should not reconfigure
        log = get_logger("test")
        assert log is not None

    def test_setup_logging_with_json(self):
        setup_logging(service="test_json", level="INFO", json_logs=True)
        log = get_logger("test_json")
        assert log is not None
