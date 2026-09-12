"""Contract tests for llm_engine.llm_types — SecretStr + dataclasses."""
from src.llm_engine.llm_types import LLMAnalysis, LLMConfig, SecretStr


class TestSecretStr:
    def test_hides_value_in_repr_and_str(self):
        s = SecretStr("hunter2")
        assert repr(s) == "SecretStr('***')"
        assert str(s) == "***"
        assert "hunter2" not in repr(s)
        assert "hunter2" not in str(s)

    def test_get_returns_value(self):
        assert SecretStr("abc").get() == "abc"

    def test_bool_reflects_emptiness(self):
        assert not SecretStr("")
        assert SecretStr("x")

    def test_equality(self):
        assert SecretStr("k") == SecretStr("k")
        assert SecretStr("k") != SecretStr("j")
        assert SecretStr("k") != "k"  # never equal to plaintext


class TestLLMTypesDefaults:
    def test_analysis_is_dataclass(self):
        a = LLMAnalysis(symbol="BTC")
        assert a.sentiment == "neutral" and a.recommendation == "hold"

    def test_config_default_secret_empty(self):
        assert not LLMConfig().api_key
