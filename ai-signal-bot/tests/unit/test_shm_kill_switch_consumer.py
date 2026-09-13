"""Tests for shm_kill_switch_consumer.py — C++→Python kill-switch channel (S132)."""
import asyncio
from unittest.mock import MagicMock, patch

import pytest

from src.communication.shm_kill_switch_consumer import (
    KILL_SWITCH_STRUCT,
    REASON_NAMES,
    ShmKillSwitchConsumer,
)


class TestStruct:
    def test_struct_layout_matches_cpp(self):
        """KillSwitchMsg: <Q B B 6x> = 16 bytes (shm_protocol.h static_assert)."""
        assert KILL_SWITCH_STRUCT.size == 16

    def test_reason_names_cover_enum(self):
        assert REASON_NAMES == {
            0: "manual", 1: "daily_loss", 2: "max_drawdown",
            3: "margin_call", 4: "file_trigger",
        }


class TestConsumer:
    def test_init_opens_ring_create_false(self):
        consumer = ShmKillSwitchConsumer(name="/t_kill", capacity=64)
        with patch("src.communication.shm_kill_switch_consumer.ShmRingBuffer") as RB:
            RB.return_value = MagicMock()
            assert consumer.init() is True
            RB.assert_called_once()
            kwargs = RB.call_args[1]
            assert kwargs["create"] is False
            assert kwargs["element_struct"] is KILL_SWITCH_STRUCT

    def test_init_failure_returns_false(self):
        consumer = ShmKillSwitchConsumer(name="/missing")
        with patch("src.communication.shm_kill_switch_consumer.ShmRingBuffer",
                   side_effect=FileNotFoundError("no segment")):
            assert consumer.init() is False

    def test_try_pop_none_without_buffer(self):
        assert ShmKillSwitchConsumer().try_pop() is None

    @pytest.mark.asyncio
    async def test_polling_sets_latch_and_calls_back(self):
        consumer = ShmKillSwitchConsumer()
        buf = MagicMock()
        buf.try_pop.side_effect = [(1_700_000_000_000_000_000, 1, 2)] + [None] * 50
        consumer._buffer = buf
        seen = []
        task = asyncio.create_task(
            consumer.run_polling(lambda ts, r: seen.append((ts, r)),
                                 poll_interval=0.001))
        await asyncio.sleep(0.05)
        consumer.stop()
        await task
        assert seen == [(1_700_000_000_000_000_000, 2)]
        assert consumer.activated is True
        assert consumer.last_reason == 2
