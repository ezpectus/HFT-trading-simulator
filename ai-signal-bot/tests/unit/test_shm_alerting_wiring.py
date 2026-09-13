"""Contract tests for S125 wiring: SHM channel + AlertSystem in run.py,
ws_client funding storage, and the analysis WS endpoints end-to-end."""
import asyncio
import json
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
import websockets

from run import AISignalBot
from src.communication.signal_publisher import SignalPublisher
from src.communication.ws_client import ExchangeClient


def _cfg(**over):
    base = dict(
        symbols=["BTC/USDT", "ETH/USDT"], default_exchange="binance",
        shm_enabled=True, shm_signals_name="/t_sig", shm_fills_name="/t_fill",
        shm_market_name="/t_mkt", shm_kill_name="/t_kill", shm_capacity=64,
        alerting_enabled=True, alerting_check_interval=15.0,
        alerting_webhook_url="", alerting_discord_webhook="",
        alerting_telegram_token="", alerting_telegram_chat_id="",
        max_drawdown_pct=8.0,
    )
    base.update(over)
    return SimpleNamespace(**base)


class TestShmChannel:
    @pytest.mark.asyncio
    async def test_start_builds_symbol_map_and_inits_all(self):
        bot = SimpleNamespace(
            config=_cfg(), logger=logging.getLogger("t"),
            _background_tasks=set(), _on_task_done=lambda t: None,
            _on_shm_fills=lambda f: None, _on_kill_switch=lambda t, r: None,
        )
        with patch("src.communication.shm_signal_producer.ShmSignalProducer") as P, \
             patch("src.communication.shm_market_data_writer.ShmMarketDataWriter") as M, \
             patch("src.communication.shm_fill_consumer.ShmFillConsumer") as C, \
             patch("src.communication.shm_kill_switch_consumer.ShmKillSwitchConsumer") as K:
            P.return_value.init.return_value = True
            M.return_value.init.return_value = True
            C.return_value.init.return_value = True
            K.return_value.init.return_value = True
            C.return_value.run_polling = lambda *a, **kw: asyncio.sleep(0)
            K.return_value.run_polling = lambda *a, **kw: asyncio.sleep(0)
            AISignalBot._start_shm_channel(bot)
        assert bot._symbol_map == {"BTC/USDT": 0, "ETH/USDT": 1}
        P.assert_called_once_with(name="/t_sig", capacity=64)
        M.assert_called_once_with(name="/t_mkt", max_symbols=2)
        C.assert_called_once_with(name="/t_fill", capacity=64)
        K.assert_called_once_with(name="/t_kill")
        assert bot._shm_producer is P.return_value
        assert bot._shm_kill is K.return_value
        assert len(bot._background_tasks) == 2  # fill + kill polling tasks
        for t in bot._background_tasks:  # don't leak pending sleep tasks
            t.cancel()

    @pytest.mark.asyncio
    async def test_failed_inits_leave_none(self):
        bot = SimpleNamespace(
            config=_cfg(), logger=logging.getLogger("t"),
            _background_tasks=set(), _on_task_done=lambda t: None,
            _on_shm_fills=lambda f: None, _on_kill_switch=lambda t, r: None,
        )
        with patch("src.communication.shm_signal_producer.ShmSignalProducer") as P, \
             patch("src.communication.shm_market_data_writer.ShmMarketDataWriter") as M, \
             patch("src.communication.shm_fill_consumer.ShmFillConsumer") as C, \
             patch("src.communication.shm_kill_switch_consumer.ShmKillSwitchConsumer") as K:
            P.return_value.init.return_value = False
            M.return_value.init.return_value = False
            C.return_value.init.return_value = False
            K.return_value.init.return_value = False
            AISignalBot._start_shm_channel(bot)
        assert bot._shm_producer is None and bot._shm_market is None
        assert bot._shm_fills is None and bot._shm_kill is None
        assert not bot._background_tasks

    def test_on_shm_fills_persists_mapped_trade(self):
        bot = SimpleNamespace(
            config=_cfg(), logger=logging.getLogger("t"),
            _symbol_names=["BTC/USDT", "ETH/USDT"],
            db=MagicMock(), trade_logger=MagicMock(),
        )
        fills = [(1_700_000_000_000_000_000, 0, 1, 0.25, 64000.0, 1.5, 0)]
        AISignalBot._on_shm_fills(bot, fills)
        trade = bot.db.save_trade.call_args[0][0]
        assert trade["symbol"] == "BTC/USDT"
        assert trade["side"] == "BUY"
        assert trade["quantity"] == 0.25
        assert trade["entry_price"] == 64000.0
        assert trade["status"] == "FILLED"
        bot.trade_logger.log.assert_called_once()

    def test_on_shm_fills_unknown_symbol_id_uses_fallback(self):
        bot = SimpleNamespace(
            config=_cfg(), logger=logging.getLogger("t"),
            _symbol_names=["BTC/USDT"], db=MagicMock(), trade_logger=MagicMock(),
        )
        AISignalBot._on_shm_fills(bot, [(1, 9, 2, 1.0, 100.0, 0.0, 0)])
        trade = bot.db.save_trade.call_args[0][0]
        assert trade["symbol"] == "#9" and trade["side"] == "SELL"

    def test_write_shm_market_writes_known_symbols(self):
        writer = MagicMock()
        bot = SimpleNamespace(
            _shm_market=writer, _symbol_map={"BTC/USDT": 0, "ETH/USDT": 1},
            config=_cfg(),
            exchange=SimpleNamespace(
                latest_prices={"binance": {"BTC/USDT": 64000.0}},
                latest_candles={"BTC/USDT": {"volume": 12.5}},
                accounts={},
            ),
        )
        AISignalBot._write_shm_market(bot)
        writer.write_price.assert_called_once_with(0, 64000.0, 64000.0, 64000.0, 12.5)

    @pytest.mark.asyncio
    async def test_finalize_pushes_signal_to_shm(self):
        producer = MagicMock()
        bot = SimpleNamespace(
            logger=logging.getLogger("t"),
            db=SimpleNamespace(save_signal=MagicMock(return_value=7)),
            signal_publisher=SimpleNamespace(
                broadcast_signal=MagicMock(return_value=asyncio.Future())),
            _shm_producer=producer, _symbol_map={"BTC/USDT": 0},
            _hft_kill_active=False,
            config=_cfg(paper_trading=True),
            exchange=SimpleNamespace(is_trading_active=False),
            trade_logger=MagicMock(), signal_logger=MagicMock(),
        )
        bot.signal_publisher.broadcast_signal.return_value.set_result(None)
        sig = SimpleNamespace()
        sig_dict = {"symbol": "BTC/USDT", "direction": "LONG", "entry_price": 64000,
                    "stop_loss": 63000, "take_profit": 66000, "confidence": 80,
                    "timestamp": 1_700_000_000}
        with patch("run.generate_llm_explanation", return_value=asyncio.Future()) as gl:
            gl.return_value.set_result("expl")
            await AISignalBot._finalize_and_execute(bot, "BTC/USDT", sig, sig_dict, [], 10000)
        producer.push_signal_dict.assert_called_once()
        pushed = producer.push_signal_dict.call_args[0][0]
        assert pushed["symbol"] == "BTC/USDT"

    @pytest.mark.asyncio
    async def test_finalize_skips_shm_push_when_kill_active(self):
        """S132: kill-switch latch gates signal pushes to the dead hft bot."""
        producer = MagicMock()
        bot = SimpleNamespace(
            logger=logging.getLogger("t"),
            db=SimpleNamespace(save_signal=MagicMock(return_value=7)),
            signal_publisher=SimpleNamespace(
                broadcast_signal=MagicMock(return_value=asyncio.Future())),
            _shm_producer=producer, _symbol_map={"BTC/USDT": 0},
            _hft_kill_active=True,
            config=_cfg(paper_trading=True),
            exchange=SimpleNamespace(is_trading_active=False),
            trade_logger=MagicMock(), signal_logger=MagicMock(),
        )
        bot.signal_publisher.broadcast_signal.return_value.set_result(None)
        sig_dict = {"symbol": "BTC/USDT", "direction": "LONG", "entry_price": 64000,
                    "stop_loss": 63000, "take_profit": 66000, "confidence": 80,
                    "timestamp": 1_700_000_000}
        with patch("run.generate_llm_explanation", return_value=asyncio.Future()) as gl:
            gl.return_value.set_result("expl")
            await AISignalBot._finalize_and_execute(
                bot, "BTC/USDT", SimpleNamespace(), sig_dict, [], 10000)
        producer.push_signal_dict.assert_not_called()

    def test_on_kill_switch_latches_and_records_metric(self):
        metrics = MagicMock()
        bot = SimpleNamespace(
            logger=logging.getLogger("t"),
            signal_publisher=SimpleNamespace(metrics=metrics),
            _hft_kill_active=False,
        )
        AISignalBot._on_kill_switch(bot, 1_700_000_000_000_000_000, 1)
        assert bot._hft_kill_active is True
        metrics.record_kill_switch.assert_called_once_with("daily_loss")

    def test_on_kill_switch_works_without_metrics(self):
        bot = SimpleNamespace(
            logger=logging.getLogger("t"),
            signal_publisher=SimpleNamespace(metrics=None),
            _hft_kill_active=False,
        )
        AISignalBot._on_kill_switch(bot, 0, 0)
        assert bot._hft_kill_active is True


class TestAlerting:
    @pytest.mark.asyncio
    async def test_start_registers_four_rules_and_task(self):
        captured = {}
        monitor_calls = []

        class _Alerts:
            def __init__(self, **kw): self.rules = {}
            def add_rule(self, rule): self.rules[rule.name] = rule
            def start_monitoring(self, **kw):
                monitor_calls.append(kw)
                return asyncio.sleep(0)

        bot = SimpleNamespace(
            config=_cfg(), logger=logging.getLogger("t"),
            exchange=SimpleNamespace(accounts={}),
            tracker=SimpleNamespace(uptime_seconds=lambda: 0, orders_sent=0),
            db=MagicMock(),
            _background_tasks=set(), _on_task_done=lambda t: None,
            _shm_producer=None, _day_start_balance=None,
        )
        with patch("src.monitoring.alerting.AlertSystem", _Alerts):
            AISignalBot._start_alerting(bot)
        assert set(bot._alert_system.rules) == {
            "daily_loss", "no_fills", "shm_disconnected", "db_down",
            "hft_kill_switch"}
        assert monitor_calls == [{"check_interval": 15.0}]
        assert len(bot._background_tasks) == 1
        for t in bot._background_tasks:  # don't leak pending sleep tasks
            t.cancel()

    @pytest.mark.asyncio
    async def test_db_down_rule_fires_on_probe_failure(self):
        captured = {}

        class _Alerts:
            def __init__(self, **kw): self.rules = {}
            def add_rule(self, rule):
                captured[rule.name] = rule
                self.rules[rule.name] = rule
            def start_monitoring(self, **kw): return asyncio.sleep(0)

        bot = SimpleNamespace(
            config=_cfg(), logger=logging.getLogger("t"),
            exchange=SimpleNamespace(accounts={}),
            tracker=SimpleNamespace(uptime_seconds=lambda: 0, orders_sent=0),
            db=MagicMock(),
            _background_tasks=set(), _on_task_done=lambda t: None,
            _shm_producer=None, _day_start_balance=None,
        )
        bot.db._get_conn.side_effect = RuntimeError("disk gone")
        with patch("src.monitoring.alerting.AlertSystem", _Alerts):
            AISignalBot._start_alerting(bot)
        assert captured["db_down"].check_fn() is True
        for t in bot._background_tasks:
            t.cancel()

    @pytest.mark.asyncio
    async def test_daily_loss_rule_fires_on_drawdown(self):
        captured = {}

        class _Alerts:
            def __init__(self, **kw): self.rules = {}
            def add_rule(self, rule):
                captured[rule.name] = rule
                self.rules[rule.name] = rule
            def start_monitoring(self, **kw): return asyncio.sleep(0)

        bot = SimpleNamespace(
            config=_cfg(max_drawdown_pct=8.0), logger=logging.getLogger("t"),
            exchange=SimpleNamespace(accounts={"binance": {"balance": 9000.0}}),
            tracker=SimpleNamespace(uptime_seconds=lambda: 0, orders_sent=0),
            db=MagicMock(), _background_tasks=set(), _on_task_done=lambda t: None,
            _shm_producer=None, _day_start_balance=10000.0,
        )
        with patch("src.monitoring.alerting.AlertSystem", _Alerts):
            AISignalBot._start_alerting(bot)
        assert captured["daily_loss"].check_fn() is True  # 10% drop ≥ 8%
        for t in bot._background_tasks:
            t.cancel()


class TestWsClientFunding:
    def test_sync_state_stores_funding(self):
        client = ExchangeClient(url="ws://x")
        client._process_message({
            "type": "sync_state", "candles": [], "prices": {"binance": {"BTC/USDT": 1}},
            "accounts": {}, "funding_rates": {"binance": 0.0004},
            "candles_to_funding": 42, "trading_active": True,
        })
        assert client.funding_rates == {"binance": 0.0004}
        assert client.candles_to_funding == 42

    def test_candles_msg_updates_funding_when_present(self):
        client = ExchangeClient(url="ws://x")
        client._process_message({
            "type": "candles", "candles": [], "prices": {}, "accounts": {},
            "funding_rates": {"okx": -0.0001},
        })
        assert client.funding_rates == {"okx": -0.0001}


class TestAnalysisEndpointsE2E:
    """Real WS round-trips through SignalPublisher → analysis_requests."""

    async def _roundtrip(self, port, request):
        """Send a request, read until the matching *_result frame (the
        connect-time circuit_breaker_status broadcast arrives first)."""
        pub = SignalPublisher(host="127.0.0.1", port=port)
        await pub.start()
        try:
            ws = await websockets.connect(f"ws://127.0.0.1:{port}", ping_interval=None)
            await ws.send(json.dumps({"type": "subscribe"}))
            await ws.send(json.dumps(request))
            for _ in range(5):
                data = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                if data.get("type", "").endswith("_result"):
                    break
            await ws.close()
            return data
        finally:
            await pub.stop()

    @pytest.mark.asyncio
    async def test_cvar_roundtrip(self):
        res = await self._roundtrip(18881, {
            "type": "cvar_analysis",
            "returns": [0.01, -0.02, 0.005, -0.01, 0.03, -0.015, 0.02, -0.025, 0.01, -0.005, 0.008],
        })
        assert res["type"] == "cvar_result"
        assert "var" in res and "cvar" in res

    @pytest.mark.asyncio
    async def test_hawkes_roundtrip(self):
        res = await self._roundtrip(18882, {
            "type": "hawkes_fit",
            "events": [1.0, 1.2, 1.4, 5.0, 5.3, 9.0, 9.1, 9.4, 20.0, 20.2],
        })
        assert res["type"] == "hawkes_result"
        assert "params" in res and "intensity_path" in res

    @pytest.mark.asyncio
    async def test_stress_roundtrip(self):
        res = await self._roundtrip(18883, {
            "type": "stress_test",
            "positions": [{"symbol": "BTC/USDT", "qty": 1.0, "price": 64000}],
        })
        assert res["type"] == "stress_test_result"
        assert len(res["results"]) == 3

    @pytest.mark.asyncio
    async def test_funding_arb_uses_publisher_data_source(self):
        pub = SignalPublisher(host="127.0.0.1", port=18884)
        pub.data_source = SimpleNamespace(
            funding_rates={"binance": 0.0005},
            latest_prices={"binance": {"BTC/USDT": 64000.0}},
        )
        await pub.start()
        try:
            ws = await websockets.connect("ws://127.0.0.1:18884", ping_interval=None)
            await ws.send(json.dumps({"type": "subscribe"}))
            await ws.send(json.dumps({"type": "funding_arb_scan", "symbols": ["BTC/USDT"]}))
            for _ in range(5):
                data = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                if data.get("type") == "funding_arb_result":
                    break
            await ws.close()
            assert data["type"] == "funding_arb_result"
            assert len(data["opportunities"]) >= 1
        finally:
            await pub.stop()
