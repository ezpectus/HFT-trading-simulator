"""Tests for S116 auth wiring: SignalPublisher handshake, post-handshake
auth ping, HealthServer Bearer middleware, and config token resolution."""
import asyncio
import json

import pytest
import websockets

from src.communication.signal_publisher import SignalPublisher
from src.monitoring.health_server import HealthServer


class TestPublisherAuthHandshake:
    @pytest.mark.asyncio
    async def test_valid_token_gets_auth_ok(self):
        pub = SignalPublisher(host="127.0.0.1", port=18871, auth_token="secret-1")
        await pub.start()
        try:
            ws = await websockets.connect("ws://127.0.0.1:18871", ping_interval=None)
            await ws.send(json.dumps({"type": "auth", "token": "secret-1"}))
            data = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            assert data["type"] == "auth_ok"
            await ws.send(json.dumps({"type": "subscribe"}))
            await asyncio.sleep(0.3)
            assert pub.client_count == 1
            await ws.close()
        finally:
            await pub.stop()

    @pytest.mark.asyncio
    async def test_wrong_token_rejected(self):
        pub = SignalPublisher(host="127.0.0.1", port=18872, auth_token="secret-2")
        await pub.start()
        try:
            ws = await websockets.connect("ws://127.0.0.1:18872", ping_interval=None)
            await ws.send(json.dumps({"type": "auth", "token": "nope"}))
            data = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            assert data["type"] == "auth_failed"
            await asyncio.sleep(0.3)
            assert pub.client_count == 0
        finally:
            await pub.stop()

    @pytest.mark.asyncio
    async def test_non_auth_first_message_rejected(self):
        pub = SignalPublisher(host="127.0.0.1", port=18873, auth_token="secret-3")
        await pub.start()
        try:
            ws = await websockets.connect("ws://127.0.0.1:18873", ping_interval=None)
            await ws.send(json.dumps({"type": "subscribe"}))
            data = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            assert data["type"] == "auth_failed"
            await asyncio.sleep(0.3)
            assert pub.client_count == 0
        finally:
            await pub.stop()

    @pytest.mark.asyncio
    async def test_no_auth_server_replies_auth_ok_required_false(self):
        """A post-connect 'auth' ping on an auth-disabled server still gets a
        well-defined answer — the UI learns auth is off."""
        pub = SignalPublisher(host="127.0.0.1", port=18874)
        await pub.start()
        try:
            ws = await websockets.connect("ws://127.0.0.1:18874", ping_interval=None)
            await ws.send(json.dumps({"type": "auth", "token": "anything"}))
            for _ in range(5):  # skip history/cb-status frames
                data = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                if data["type"] == "auth_ok":
                    break
            assert data["type"] == "auth_ok"
            assert data["required"] is False
            await ws.close()
        finally:
            await pub.stop()


class TestHealthServerAuth:
    async def _start(self, token):
        server = HealthServer(port=0, host="127.0.0.1", auth_token=token)
        server.register_check("exchange", lambda: {"healthy": True})
        await server.start()
        port = server._site._server.sockets[0].getsockname()[1]
        return server, f"http://127.0.0.1:{port}"

    @pytest.mark.asyncio
    async def test_health_requires_bearer_when_token_set(self):
        aiohttp = pytest.importorskip("aiohttp")
        server, base = await self._start("tok-1")
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(f"{base}/health") as r:
                    assert r.status == 401
                async with s.get(f"{base}/health", headers={"Authorization": "Bearer tok-1"}) as r:
                    assert r.status == 200
        finally:
            await server.stop()

    @pytest.mark.asyncio
    async def test_probe_paths_stay_open(self):
        aiohttp = pytest.importorskip("aiohttp")
        server, base = await self._start("tok-2")
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(f"{base}/live") as r:
                    assert r.status == 200
                async with s.get(f"{base}/ready") as r:
                    assert r.status == 200
        finally:
            await server.stop()

    @pytest.mark.asyncio
    async def test_no_token_no_auth(self):
        aiohttp = pytest.importorskip("aiohttp")
        server, base = await self._start(None)
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(f"{base}/health") as r:
                    assert r.status == 200
        finally:
            await server.stop()


class TestConfigAuthToken:
    def test_env_overrides_yaml(self, monkeypatch):
        from config import SignalBotConfig
        cfg = SignalBotConfig(raw={"api": {"auth_token": "from-yaml"}})
        monkeypatch.setenv("AI_BOT_AUTH_TOKEN", "from-env")
        assert cfg.api_auth_token == "from-env"

    def test_yaml_fallback(self, monkeypatch):
        from config import SignalBotConfig
        monkeypatch.delenv("AI_BOT_AUTH_TOKEN", raising=False)
        cfg = SignalBotConfig(raw={"api": {"auth_token": "from-yaml"}})
        assert cfg.api_auth_token == "from-yaml"

    def test_empty_default(self, monkeypatch):
        from config import SignalBotConfig
        monkeypatch.delenv("AI_BOT_AUTH_TOKEN", raising=False)
        cfg = SignalBotConfig(raw={})
        assert cfg.api_auth_token == ""
