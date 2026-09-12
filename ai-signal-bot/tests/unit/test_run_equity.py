"""Contract tests for AISignalBot._snapshot_equity (run.py).

The method persists one equity-curve point per signal tick from the live
account dict — same source the dashboard reads.
"""
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from run import AISignalBot


def _bot(account=None):
    return SimpleNamespace(
        exchange=SimpleNamespace(
            accounts={"binance": account} if account is not None else {}
        ),
        config=SimpleNamespace(default_exchange="binance"),
        db=MagicMock(),
        logger=logging.getLogger("test"),
    )


class TestSnapshotEquity:
    def test_writes_balance_equity_position_count(self):
        bot = _bot({"balance": 10000.0, "equity": 10420.5, "positions": [{}, {}]})
        AISignalBot._snapshot_equity(bot)
        bot.db.save_equity.assert_called_once_with(
            balance=10000.0, equity=10420.5, open_positions=2
        )

    def test_equity_falls_back_to_balance(self):
        bot = _bot({"balance": 5000.0, "positions": []})
        AISignalBot._snapshot_equity(bot)
        bot.db.save_equity.assert_called_once_with(
            balance=5000.0, equity=5000.0, open_positions=0
        )

    def test_no_account_is_noop(self):
        bot = _bot(None)
        AISignalBot._snapshot_equity(bot)
        bot.db.save_equity.assert_not_called()

    def test_db_failure_warns_not_raises(self):
        bot = _bot({"balance": 1.0, "equity": 1.0, "positions": []})
        bot.db.save_equity.side_effect = OSError("disk full")
        AISignalBot._snapshot_equity(bot)  # must not raise — persistence is best-effort
