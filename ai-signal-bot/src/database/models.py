"""Data models — dataclasses for all database entities.

Trade, Signal, Position, Candle, Backtest, RiskEvent.
Serialization: to_dict, to_json, from_db_row.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field


@dataclass
class Trade:
    id: int | None = None
    timestamp: float = 0.0
    symbol: str = ""
    exchange: str = ""
    side: str = ""               # "BUY" or "SELL"
    qty: float = 0.0
    price: float = 0.0
    fee: float = 0.0
    pnl: float = 0.0
    strategy: str = ""
    order_id: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_db_row(cls, row: tuple | dict) -> Trade:
        if isinstance(row, dict):
            return cls(
                id=row.get("id"), timestamp=row.get("timestamp", 0),
                symbol=row.get("symbol", ""), exchange=row.get("exchange", ""),
                side=row.get("side", ""), qty=row.get("qty", 0),
                price=row.get("price", 0), fee=row.get("fee", 0),
                pnl=row.get("pnl", 0), strategy=row.get("strategy", ""),
                order_id=row.get("order_id", ""),
            )
        # Assume tuple in column order
        return cls(
            id=row[0], timestamp=row[1], symbol=row[2], exchange=row[3],
            side=row[4], qty=row[5], price=row[6], fee=row[7],
            pnl=row[8], strategy=row[9], order_id=row[10],
        )


@dataclass
class SignalRecord:
    id: int | None = None
    timestamp: float = 0.0
    symbol: str = ""
    strategy: str = ""
    action: str = ""             # "LONG", "SHORT", "NEUTRAL"
    confidence: float = 0.0
    price: float = 0.0
    sl: float = 0.0
    tp: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_db_row(cls, row: tuple | dict) -> SignalRecord:
        if isinstance(row, dict):
            return cls(
                id=row.get("id"), timestamp=row.get("timestamp", 0),
                symbol=row.get("symbol", ""), strategy=row.get("strategy", ""),
                action=row.get("action", ""), confidence=row.get("confidence", 0),
                price=row.get("price", 0), sl=row.get("sl", 0), tp=row.get("tp", 0),
            )
        return cls(
            id=row[0], timestamp=row[1], symbol=row[2], strategy=row[3],
            action=row[4], confidence=row[5], price=row[6], sl=row[7], tp=row[8],
        )


@dataclass
class PositionRecord:
    id: int | None = None
    timestamp: float = 0.0
    symbol: str = ""
    exchange: str = ""
    side: str = ""               # "long" or "short"
    qty: float = 0.0
    entry_price: float = 0.0
    current_price: float = 0.0
    unrealized_pnl: float = 0.0
    margin: float = 0.0
    leverage: int = 1

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_db_row(cls, row: tuple | dict) -> PositionRecord:
        if isinstance(row, dict):
            return cls(
                id=row.get("id"), timestamp=row.get("timestamp", 0),
                symbol=row.get("symbol", ""), exchange=row.get("exchange", ""),
                side=row.get("side", ""), qty=row.get("qty", 0),
                entry_price=row.get("entry_price", 0),
                current_price=row.get("current_price", 0),
                unrealized_pnl=row.get("unrealized_pnl", 0),
                margin=row.get("margin", 0), leverage=row.get("leverage", 1),
            )
        return cls(
            id=row[0], timestamp=row[1], symbol=row[2], exchange=row[3],
            side=row[4], qty=row[5], entry_price=row[6], current_price=row[7],
            unrealized_pnl=row[8], margin=row[9], leverage=row[10],
        )


@dataclass
class CandleRecord:
    timestamp: float = 0.0
    symbol: str = ""
    exchange: str = ""
    timeframe: str = "1m"
    open: float = 0.0
    high: float = 0.0
    low: float = 0.0
    close: float = 0.0
    volume: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_db_row(cls, row: tuple | dict) -> CandleRecord:
        if isinstance(row, dict):
            return cls(
                timestamp=row.get("timestamp", 0), symbol=row.get("symbol", ""),
                exchange=row.get("exchange", ""), timeframe=row.get("timeframe", "1m"),
                open=row.get("open", 0), high=row.get("high", 0),
                low=row.get("low", 0), close=row.get("close", 0),
                volume=row.get("volume", 0),
            )
        return cls(
            timestamp=row[0], symbol=row[1], exchange=row[2], timeframe=row[3],
            open=row[4], high=row[5], low=row[6], close=row[7], volume=row[8],
        )


@dataclass
class BacktestRecord:
    id: int | None = None
    strategy: str = ""
    params: dict = field(default_factory=dict)
    start_time: float = 0.0
    end_time: float = 0.0
    results: dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), default=str)

    @classmethod
    def from_db_row(cls, row: tuple | dict) -> BacktestRecord:
        if isinstance(row, dict):
            params = row.get("params", "{}")
            results = row.get("results", "{}")
            if isinstance(params, str):
                params = json.loads(params)
            if isinstance(results, str):
                results = json.loads(results)
            return cls(
                id=row.get("id"), strategy=row.get("strategy", ""),
                params=params, start_time=row.get("start_time", 0),
                end_time=row.get("end_time", 0), results=results,
                created_at=row.get("created_at", time.time()),
            )
        return cls(
            id=row[0], strategy=row[1],
            params=json.loads(row[2]) if isinstance(row[2], str) else row[2],
            start_time=row[3], end_time=row[4],
            results=json.loads(row[5]) if isinstance(row[5], str) else row[5],
            created_at=row[6],
        )


@dataclass
class RiskEvent:
    id: int | None = None
    timestamp: float = 0.0
    type: str = ""               # "daily_loss", "margin_call", "kill_switch", etc.
    severity: str = ""           # "INFO", "WARNING", "CRITICAL"
    details: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), default=str)

    @classmethod
    def from_db_row(cls, row: tuple | dict) -> RiskEvent:
        if isinstance(row, dict):
            details = row.get("details", "{}")
            if isinstance(details, str):
                details = json.loads(details)
            return cls(
                id=row.get("id"), timestamp=row.get("timestamp", 0),
                type=row.get("type", ""), severity=row.get("severity", ""),
                details=details,
            )
        return cls(
            id=row[0], timestamp=row[1], type=row[2], severity=row[3],
            details=json.loads(row[4]) if isinstance(row[4], str) else row[4],
        )
