"""Tests for LLM Engine."""
import pytest
from src.llm_engine.engine import SecretStr


class TestSecretStr:
    def test_creation(self):
        s = SecretStr("my-api-key")
        assert s.get() == "my-api-key"

    def test_empty_default(self):
        s = SecretStr()
        assert s.get() == ""

    def test_repr_does_not_leak(self):
        s = SecretStr("secret123")
        repr_str = repr(s)
        assert "secret123" not in repr_str
