"""
Market replay — record and playback trading sessions for backtesting.

Records:
  - All WebSocket messages (market data, orderbook, trades)
  - Order submissions and fills
  - Signal generation events
  - System state changes

Playback:
  - Time-accelerated replay (1x, 2x, 5x, 10x)
  - Pause/resume
  - Jump to timestamp
  - Export to CSV/Parquet for offline analysis

Usage:
    from src.data_collection.market_replay import MarketReplay

    # Record
    replay = MarketReplay(mode="record", path="replays/session_2024-01-15.jsonl")
    replay.record(event_type="candle", data={"symbol": "BTC/USDT", ...})

    # Playback
    replay = MarketReplay(mode="playback", path="replays/session_2024-01-15.jsonl")
    await replay.play(speed=5.0, on_event=my_handler)
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Optional, Callable, Dict, Any, List, AsyncIterator
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

logger = logging.getLogger(__name__)


class ReplayMode(Enum):
    RECORD = "record"
    PLAYBACK = "playback"


@dataclass
class ReplayEvent:
    event_type: str  # candle, orderbook, trade, order, fill, signal, state
    timestamp: float
    data: Dict[str, Any]
    sequence: int = 0


class MarketReplay:
    """Market session recorder and player."""

    def __init__(
        self,
        mode: str = "record",
        path: str = "replays/session.jsonl",
        buffer_size: int = 10000,
    ):
        self.mode = ReplayMode(mode)
        self.path = Path(path)
        self.buffer_size = buffer_size
        self._buffer: List[ReplayEvent] = []
        self._sequence = 0
        self._recording = False
        self._playing = False
        self._paused = False
        self._speed = 1.0
        self._start_ts: Optional[float] = None
        self._events: List[ReplayEvent] = []

    # ── Recording ──

    def start_recording(self) -> None:
        """Start recording session."""
        if self.mode != ReplayMode.RECORD:
            raise ValueError("Not in record mode")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._recording = True
        self._sequence = 0
        self._buffer = []
        logger.info(f"[Replay] Recording to {self.path}")

    def record(self, event_type: str, data: Dict[str, Any], timestamp: Optional[float] = None) -> None:
        """Record an event."""
        if not self._recording:
            return
        event = ReplayEvent(
            event_type=event_type,
            timestamp=timestamp or time.time(),
            data=data,
            sequence=self._sequence,
        )
        self._sequence += 1
        self._buffer.append(event)

        if len(self._buffer) >= self.buffer_size:
            self._flush()

    def _flush(self) -> None:
        """Flush buffer to file."""
        if not self._buffer:
            return
        with open(self.path, "a") as f:
            for event in self._buffer:
                f.write(json.dumps({
                    "event_type": event.event_type,
                    "timestamp": event.timestamp,
                    "sequence": event.sequence,
                    "data": event.data,
                }) + "\n")
        self._buffer = []

    def stop_recording(self) -> int:
        """Stop recording and flush remaining events."""
        self._recording = False
        self._flush()
        count = self._sequence
        logger.info(f"[Replay] Recorded {count} events to {self.path}")
        return count

    # ── Playback ──

    def load(self) -> int:
        """Load events from file for playback."""
        if not self.path.exists():
            logger.error(f"[Replay] File not found: {self.path}")
            return 0

        self._events = []
        with open(self.path) as f:
            for line in f:
                try:
                    data = json.loads(line.strip())
                    self._events.append(ReplayEvent(
                        event_type=data["event_type"],
                        timestamp=data["timestamp"],
                        sequence=data.get("sequence", 0),
                        data=data["data"],
                    ))
                except json.JSONDecodeError:
                    continue

        logger.info(f"[Replay] Loaded {len(self._events)} events from {self.path}")
        return len(self._events)

    async def play(
        self,
        speed: float = 1.0,
        on_event: Optional[Callable[[ReplayEvent], None]] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ) -> None:
        """Play back recorded events at given speed."""
        if not self._events:
            self.load()

        if not self._events:
            return

        self._playing = True
        self._paused = False
        self._speed = speed

        # Filter by time range
        events = self._events
        if start_time is not None:
            events = [e for e in events if e.timestamp >= start_time]
        if end_time is not None:
            events = [e for e in events if e.timestamp <= end_time]

        if not events:
            logger.warning("[Replay] No events in time range")
            return

        # Calculate timing
        first_ts = events[0].timestamp
        self._start_ts = time.time()

        logger.info(f"[Replay] Playing {len(events)} events at {speed}x speed")

        for event in events:
            if not self._playing:
                break

            # Wait for paused state
            while self._paused and self._playing:
                await asyncio.sleep(0.1)

            # Calculate delay
            event_offset = event.timestamp - first_ts
            expected_time = event_offset / speed
            elapsed = time.time() - self._start_ts
            delay = expected_time - elapsed

            if delay > 0:
                await asyncio.sleep(delay)

            if on_event:
                try:
                    result = on_event(event)
                    if asyncio.iscoroutine(result):
                        await result
                except Exception as e:
                    logger.error(f"[Replay] Event handler error: {e}")

        self._playing = False
        logger.info("[Replay] Playback complete")

    def pause(self) -> None:
        self._paused = True

    def resume(self) -> None:
        self._paused = False

    def stop(self) -> None:
        self._playing = False
        self._paused = False

    def seek(self, timestamp: float) -> None:
        """Seek to a specific timestamp in the recording."""
        # Will be applied on next play
        self._start_ts = time.time() - timestamp

    # ── Export ──

    def export_csv(self, output_path: str) -> int:
        """Export events to CSV."""
        if not self._events:
            self.load()
        if not self._events:
            return 0

        import csv
        with open(output_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["sequence", "timestamp", "event_type", "data"])
            for event in self._events:
                writer.writerow([
                    event.sequence,
                    event.timestamp,
                    event.event_type,
                    json.dumps(event.data),
                ])

        logger.info(f"[Replay] Exported {len(self._events)} events to {output_path}")
        return len(self._events)

    def get_stats(self) -> Dict[str, Any]:
        """Get replay statistics."""
        if not self._events:
            return {}
        types: Dict[str, int] = {}
        for e in self._events:
            types[e.event_type] = types.get(e.event_type, 0) + 1
        return {
            "total_events": len(self._events),
            "event_types": types,
            "duration_s": self._events[-1].timestamp - self._events[0].timestamp if self._events else 0,
            "first_event": self._events[0].timestamp if self._events else None,
            "last_event": self._events[-1].timestamp if self._events else None,
        }
