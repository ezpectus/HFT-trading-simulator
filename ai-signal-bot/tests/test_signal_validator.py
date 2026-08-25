"""Tests for SignalValidator."""
import pytest
import pytest_asyncio
from src.signal_validation.validator import SignalValidator, ValidationResult
from src.strategies.signal import Signal, SignalDirection


@pytest.fixture
def validator():
    return SignalValidator(
        min_confidence=65,
        min_rr_ratio=1.5,
        max_drawdown_pct=8.0,
        max_open_positions=3,
    )


@pytest.fixture
def good_signal():
    return Signal(
        symbol="BTC/USDT",
        direction=SignalDirection.LONG,
        confidence=80,
        entry_price=65000,
        stop_loss=63700,
        take_profit=67600,
        strategy="trend",
        reason="Strong uptrend",
    )


@pytest.fixture
def weak_signal():
    return Signal(
        symbol="BTC/USDT",
        direction=SignalDirection.LONG,
        confidence=50,
        entry_price=65000,
        stop_loss=63700,
        take_profit=67600,
        strategy="trend",
        reason="Weak signal",
    )


@pytest.fixture
def neutral_signal():
    return Signal(
        symbol="BTC/USDT",
        direction=SignalDirection.NEUTRAL,
        confidence=50,
        entry_price=65000,
        stop_loss=63700,
        take_profit=67600,
        strategy="trend",
        reason="Neutral",
    )


class TestSignalValidator:
    @pytest.mark.asyncio
    async def test_valid_signal_passes(self, validator, good_signal):
        result = await validator.validate(good_signal)
        assert result.passed is True
        assert "validated" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_neutral_signal_rejected(self, validator, neutral_signal):
        result = await validator.validate(neutral_signal)
        assert result.passed is False
        assert "neutral" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_low_confidence_rejected(self, validator, weak_signal):
        result = await validator.validate(weak_signal)
        assert result.passed is False
        assert "confidence" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_low_rr_ratio_rejected(self, validator):
        signal = Signal(
            symbol="BTC/USDT",
            direction=SignalDirection.LONG,
            confidence=80,
            entry_price=65000,
            stop_loss=64000,
            take_profit=65500,
            strategy="trend",
            reason="Poor R:R",
        )
        result = await validator.validate(signal)
        assert result.passed is False
        assert "r:r" in result.reason.lower() or "ratio" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_max_positions_rejected(self, validator, good_signal):
        await validator.update_position_count(3)
        result = await validator.validate(good_signal)
        assert result.passed is False
        assert "position" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_duplicate_signal_rejected(self, validator, good_signal):
        await validator.validate(good_signal)
        result = await validator.validate(good_signal)
        assert result.passed is False
        assert "duplicate" in result.reason.lower() or "cooldown" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_drawdown_rejected(self, validator, good_signal):
        await validator.update_pnl(-900)  # 9% of 10000
        result = await validator.validate(good_signal, account_balance=10000)
        assert result.passed is False
        assert "drawdown" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_reset_daily(self, validator):
        await validator.update_pnl(-500)
        validator.reset_daily()
        assert validator._daily_pnl == 0.0

    @pytest.mark.asyncio
    async def test_update_position_count(self, validator):
        await validator.update_position_count(2)
        assert validator._open_positions == 2

    def test_validation_result_dataclass(self):
        sig = Signal("BTC/USDT", SignalDirection.LONG, 80, 65000, 64000, 66000, "test", "reason")
        result = ValidationResult(True, "OK", sig)
        assert result.passed is True
        assert result.reason == "OK"
        assert result.signal is sig
