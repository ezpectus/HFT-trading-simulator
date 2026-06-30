"""
Real exchange REST client — account/position info via REST API.

Supports Binance, OKX, and Bybit for:
- Account balance
- Open positions
- Order history
- PnL tracking
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import base64
import time
import logging
from typing import Optional, Dict, List
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class AccountBalance:
    exchange: str
    total_balance: float
    available_balance: float
    unrealized_pnl: float
    margin_used: float
    currency: str


@dataclass
class Position:
    exchange: str
    symbol: str
    side: str  # "LONG" or "SHORT"
    size: float
    entry_price: float
    mark_price: float
    unrealized_pnl: float
    leverage: int
    margin: float
    liq_price: float


class RealExchangeClient:
    """REST client for real exchange account/position info."""

    def __init__(self, exchange: str, api_key: str, api_secret: str,
                 passphrase: str = "", base_url: str = ""):
        self.exchange = exchange
        self.api_key = api_key
        self.api_secret = api_secret
        self.passphrase = passphrase

        if exchange == "binance":
            self.base_url = base_url or "https://fapi.binance.com"
        elif exchange == "okx":
            self.base_url = base_url or "https://www.okx.com"
        elif exchange == "bybit":
            self.base_url = base_url or "https://api.bybit.com"
        else:
            self.base_url = base_url

    def _sign_binance(self, query_string: str) -> str:
        return hmac.new(
            self.api_secret.encode(), query_string.encode(), hashlib.sha256
        ).hexdigest()

    def _sign_okx(self, timestamp: str, method: str, path: str, body: str = "") -> str:
        msg = f"{timestamp}{method.upper()}{path}{body}"
        mac = hmac.new(self.api_secret.encode(), msg.encode(), hashlib.sha256)
        return base64.b64encode(mac.digest()).decode()

    def _sign_bybit(self, timestamp: str, recv_window: int, param_str: str) -> str:
        msg = f"{timestamp}{self.api_key}{recv_window}{param_str}"
        return hmac.new(
            self.api_secret.encode(), msg.encode(), hashlib.sha256
        ).hexdigest()

    async def get_balance(self) -> Optional[AccountBalance]:
        """Get account balance."""
        if self.exchange == "binance":
            return await self._binance_balance()
        elif self.exchange == "okx":
            return await self._okx_balance()
        elif self.exchange == "bybit":
            return await self._bybit_balance()
        return None

    async def get_positions(self) -> List[Position]:
        """Get open positions."""
        if self.exchange == "binance":
            return await self._binance_positions()
        elif self.exchange == "okx":
            return await self._okx_positions()
        elif self.exchange == "bybit":
            return await self._bybit_positions()
        return []

    async def _binance_balance(self) -> Optional[AccountBalance]:
        import aiohttp
        ts = int(time.time() * 1000)
        params = f"timestamp={ts}&recvWindow=5000"
        sig = self._sign_binance(params)
        url = f"{self.base_url}/fapi/v2/balance?{params}&signature={sig}"
        headers = {"X-MBX-APIKEY": self.api_key}

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as resp:
                if resp.status != 200:
                    logger.error(f"Binance balance error: {resp.status}")
                    return None
                data = await resp.json()
                for asset in data:
                    if asset.get("asset") == "USDT":
                        return AccountBalance(
                            exchange="binance",
                            total_balance=float(asset.get("balance", 0)),
                            available_balance=float(asset.get("availableBalance", 0)),
                            unrealized_pnl=float(asset.get("crossUnPnl", 0)),
                            margin_used=float(asset.get("maintMargin", 0)),
                            currency="USDT",
                        )
        return None

    async def _binance_positions(self) -> List[Position]:
        import aiohttp
        ts = int(time.time() * 1000)
        params = f"timestamp={ts}&recvWindow=5000"
        sig = self._sign_binance(params)
        url = f"{self.base_url}/fapi/v2/positionRisk?{params}&signature={sig}"
        headers = {"X-MBX-APIKEY": self.api_key}

        positions = []
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                for p in data:
                    amt = float(p.get("positionAmt", 0))
                    if amt == 0:
                        continue
                    positions.append(Position(
                        exchange="binance",
                        symbol=p.get("symbol", ""),
                        side="LONG" if amt > 0 else "SHORT",
                        size=abs(amt),
                        entry_price=float(p.get("entryPrice", 0)),
                        mark_price=float(p.get("markPrice", 0)),
                        unrealized_pnl=float(p.get("unRealizedProfit", 0)),
                        leverage=int(float(p.get("leverage", 1))),
                        margin=float(p.get("initialMargin", 0)),
                        liq_price=float(p.get("liquidationPrice", 0)),
                    ))
        return positions

    async def _okx_balance(self) -> Optional[AccountBalance]:
        import aiohttp
        ts = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        path = "/api/v5/account/balance"
        sig = self._sign_okx(ts, "GET", path)
        headers = {
            "OK-ACCESS-KEY": self.api_key,
            "OK-ACCESS-SIGN": sig,
            "OK-ACCESS-TIMESTAMP": ts,
            "OK-ACCESS-PASSPHRASE": self.passphrase,
            "Content-Type": "application/json",
        }
        url = f"{self.base_url}{path}"

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
                if data.get("code") != "0":
                    return None
                for d in data.get("data", []):
                    for detail in d.get("details", []):
                        if detail.get("ccy") == "USDT":
                            return AccountBalance(
                                exchange="okx",
                                total_balance=float(detail.get("cashBal", 0)),
                                available_balance=float(detail.get("availBal", 0)),
                                unrealized_pnl=float(detail.get("upl", 0)),
                                margin_used=float(detail.get("margin", 0)),
                                currency="USDT",
                            )
        return None

    async def _okx_positions(self) -> List[Position]:
        import aiohttp
        ts = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        path = "/api/v5/account/positions"
        sig = self._sign_okx(ts, "GET", path)
        headers = {
            "OK-ACCESS-KEY": self.api_key,
            "OK-ACCESS-SIGN": sig,
            "OK-ACCESS-TIMESTAMP": ts,
            "OK-ACCESS-PASSPHRASE": self.passphrase,
        }
        url = f"{self.base_url}{path}"

        positions = []
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                for p in data.get("data", []):
                    pos = float(p.get("pos", 0))
                    if pos == 0:
                        continue
                    positions.append(Position(
                        exchange="okx",
                        symbol=p.get("instId", ""),
                        side="LONG" if pos > 0 else "SHORT",
                        size=abs(pos),
                        entry_price=float(p.get("avgPx", 0)),
                        mark_price=float(p.get("markPx", 0)),
                        unrealized_pnl=float(p.get("upl", 0)),
                        leverage=int(float(p.get("lever", 1))),
                        margin=float(p.get("margin", 0)),
                        liq_price=float(p.get("liqPx", 0)),
                    ))
        return positions

    async def _bybit_balance(self) -> Optional[AccountBalance]:
        import aiohttp
        ts = str(int(time.time() * 1000))
        recv_window = "5000"
        params = '{"accountType":"UNIFIED"}'
        param_str = f"accountType=UNIFIED"
        sig = self._sign_bybit(ts, int(recv_window), param_str)
        url = f"{self.base_url}/v5/account/wallet-balance?{param_str}"
        headers = {
            "X-BAPI-API-KEY": self.api_key,
            "X-BAPI-SIGN": sig,
            "X-BAPI-SIGN-TYPE": "2",
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": recv_window,
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
                result = data.get("result", {}).get("list", [])
                for account in result:
                    for coin in account.get("coin", []):
                        if coin.get("coin") == "USDT":
                            return AccountBalance(
                                exchange="bybit",
                                total_balance=float(coin.get("walletBalance", 0)),
                                available_balance=float(coin.get("availableToWithdraw", 0)),
                                unrealized_pnl=float(coin.get("unrealisedPnl", 0)),
                                margin_used=float(coin.get("totalPositionIM", 0)),
                                currency="USDT",
                            )
        return None

    async def _bybit_positions(self) -> List[Position]:
        import aiohttp
        ts = str(int(time.time() * 1000))
        recv_window = "5000"
        param_str = "category=linear&settleCoin=USDT"
        sig = self._sign_bybit(ts, int(recv_window), param_str)
        url = f"{self.base_url}/v5/position/list?{param_str}"
        headers = {
            "X-BAPI-API-KEY": self.api_key,
            "X-BAPI-SIGN": sig,
            "X-BAPI-SIGN-TYPE": "2",
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": recv_window,
        }

        positions = []
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                for p in data.get("result", {}).get("list", []):
                    size = float(p.get("size", 0))
                    if size == 0:
                        continue
                    positions.append(Position(
                        exchange="bybit",
                        symbol=p.get("symbol", ""),
                        side=p.get("side", ""),
                        size=size,
                        entry_price=float(p.get("avgPrice", 0)),
                        mark_price=float(p.get("markPrice", 0)),
                        unrealized_pnl=float(p.get("unrealisedPnl", 0)),
                        leverage=int(float(p.get("leverage", 1))),
                        margin=float(p.get("positionIM", 0)),
                        liq_price=float(p.get("liqPrice", 0)),
                    ))
        return positions
