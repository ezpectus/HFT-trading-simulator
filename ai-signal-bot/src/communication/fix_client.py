"""
Python FIX 4.4 client — session management, market data, execution reports.

Uses a simple socket-based FIX transport with callback-based message handling.
Supports logon/logout, heartbeat, resend requests, and application messages.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

logger = logging.getLogger(__name__)

SOH = '\x01'


def _fix_timestamp() -> str:
    """Generate FIX-format timestamp (tag 52) with millisecond precision."""
    now = datetime.now(UTC)
    return now.strftime("%Y%m%d-%H:%M:%S.") + f"{now.microsecond // 1000:03d}"


@dataclass
class FixField:
    tag: int
    value: str


@dataclass
class FixMessage:
    """Parsed FIX message."""
    fields: dict[int, str] = field(default_factory=dict)

    def get(self, tag: int) -> str | None:
        return self.fields.get(tag)

    def get_int(self, tag: int) -> int:
        v = self.get(tag)
        return int(v) if v else 0

    def get_float(self, tag: int) -> float:
        v = self.get(tag)
        return float(v) if v else 0.0

    @property
    def msg_type(self) -> str:
        return self.get(35) or ''

    @property
    def seq_num(self) -> int:
        return self.get_int(34)

    @property
    def is_logon(self) -> bool:
        return self.msg_type == 'A'

    @property
    def is_logout(self) -> bool:
        return self.msg_type == '5'

    @property
    def is_heartbeat(self) -> bool:
        return self.msg_type == '0'

    @property
    def is_execution_report(self) -> bool:
        return self.msg_type == '8'

    @property
    def is_market_data(self) -> bool:
        return self.msg_type == 'W'

    @staticmethod
    def parse(raw: bytes) -> FixMessage:
        """Parse raw FIX message bytes into FixMessage."""
        msg = FixMessage()
        text = raw.decode('ascii', errors='replace')
        parts = text.split(SOH)
        for part in parts:
            if not part:
                continue
            eq = part.find('=')
            if eq < 0:
                continue
            try:
                tag = int(part[:eq])
            except ValueError:
                continue
            value = part[eq + 1:]
            msg.fields[tag] = value
        return msg

    @staticmethod
    def build(fields: list[tuple[int, str]], begin_string: str = "FIX.4.4") -> bytes:
        """Build a FIX message from field list. Computes body length and checksum."""
        # Build body (everything after 9=BodyLength, before 10=CheckSum)
        body_parts = []
        for tag, value in fields:
            body_parts.append(f"{tag}={value}{SOH}")
        body = ''.join(body_parts)

        # Build header
        header = f"8={begin_string}{SOH}9={len(body)}{SOH}"

        # Calculate checksum
        full = header + body
        checksum = sum(full.encode('ascii')) % 256

        # Append checksum
        return f"{full}10={checksum:03d}{SOH}".encode('ascii')


class FixSession:
    """FIX 4.4 session with persistent sequence numbers."""

    def __init__(
        self,
        sender_comp_id: str,
        target_comp_id: str,
        seq_file: str = os.path.join(tempfile.gettempdir(), "fix_seq.txt"),
        heart_bt_int: int = 30,
    ):
        self.sender_comp_id = sender_comp_id
        self.target_comp_id = target_comp_id
        self.seq_file = seq_file
        self.heart_bt_int = heart_bt_int
        self.outgoing_seq = 1
        self.incoming_seq = 1
        self.state = "DISCONNECTED"
        self._reader_task: asyncio.Task | None = None
        self._heartbeat_task: asyncio.Task | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._load_seq_nums()

        # Callbacks
        self.on_execution_report: Callable[[FixMessage], Awaitable[None]] | None = None
        self.on_market_data: Callable[[FixMessage], Awaitable[None]] | None = None
        self.on_logon: Callable[[], Awaitable[None]] | None = None
        self.on_logout: Callable[[], Awaitable[None]] | None = None

    def _load_seq_nums(self):
        if os.path.exists(self.seq_file):
            try:
                with open(self.seq_file) as f:
                    parts = f.read().strip().split()
                    if len(parts) >= 2:
                        self.outgoing_seq = int(parts[0])
                        self.incoming_seq = int(parts[1])
            except Exception as e:
                logger.warning(f"Failed to load seq nums from {self.seq_file}: {e}")

    def _save_seq_nums(self):
        try:
            with open(self.seq_file, 'w') as f:
                f.write(f"{self.outgoing_seq} {self.incoming_seq}")
        except Exception as e:
            logger.warning(f"Failed to save FIX seq nums: {e}")

    def _build_msg(self, msg_type: str, extra_fields: list[tuple[int, str]] | None = None) -> bytes:
        fields = [
            (35, msg_type),
            (49, self.sender_comp_id),
            (56, self.target_comp_id),
            (34, str(self.outgoing_seq)),
            (52, _fix_timestamp()),
        ] + (extra_fields or [])
        msg = FixMessage.build(fields)
        self.outgoing_seq += 1
        self._save_seq_nums()
        return msg

    async def connect(self, host: str, port: int):
        """Establish TCP connection."""
        self._reader, self._writer = await asyncio.open_connection(host, port)
        self.state = "CONNECTING"
        logger.info(f"FIX session connecting to {host}:{port}")

    async def logon(self, username: str = "", password: str = "", reset_seq: bool = False) -> bool:
        """Send Logon (35=A)."""
        if reset_seq:
            self.outgoing_seq = 1
            self.incoming_seq = 1

        extra = [
            (98, "0"),  # EncryptMethod: None
            (108, str(self.heart_bt_int)),
        ]
        if reset_seq:
            extra.append((141, "Y"))
        if username:
            extra.append((553, username))
        if password:
            extra.append((554, password))

        msg = self._build_msg("A", extra)
        if self._writer:
            self._writer.write(msg)
            await self._writer.drain()
            logger.info("FIX logon sent")
            return True
        return False

    async def logout(self, text: str = ""):
        """Send Logout (35=5)."""
        extra = []
        if text:
            extra.append((58, text))
        msg = self._build_msg("5", extra)
        if self._writer:
            self._writer.write(msg)
            await self._writer.drain()
        self.state = "LOGGING_OUT"
        logger.info("FIX logout sent")

    async def send_heartbeat(self, test_req_id: str = ""):
        """Send Heartbeat (35=0)."""
        extra = []
        if test_req_id:
            extra.append((112, test_req_id))
        msg = self._build_msg("0", extra)
        if self._writer:
            self._writer.write(msg)
            await self._writer.drain()

    async def send_new_order(
        self,
        cl_ord_id: str,
        symbol: str,
        side: str,  # '1'=Buy, '2'=Sell
        qty: float,
        ord_type: str,  # '1'=Market, '2'=Limit
        price: float = 0.0,
        tif: str = '0',  # '0'=Day, '3'=IOC, '4'=FOK
        stop_px: float = 0.0,
    ) -> bool:
        """Send NewOrderSingle (35=D)."""
        extra = [
            (11, cl_ord_id),
            (55, symbol),
            (54, side),
            (38, f"{qty:.8f}"),
            (40, ord_type),
            (21, "1"),  # HandlInst: Automated
            (59, tif),
        ]
        if ord_type == '2':
            extra.append((44, f"{price:.8f}"))
        if stop_px > 0:
            extra.append((99, f"{stop_px:.8f}"))

        msg = self._build_msg("D", extra)
        if self._writer:
            self._writer.write(msg)
            await self._writer.drain()
            logger.info(f"FIX NewOrderSingle sent: {cl_ord_id} {symbol} {side} {qty}")
            return True
        return False

    async def send_cancel(
        self,
        orig_cl_ord_id: str,
        cl_ord_id: str,
        symbol: str,
        side: str,
    ) -> bool:
        """Send OrderCancel (35=F)."""
        extra = [
            (41, orig_cl_ord_id),
            (11, cl_ord_id),
            (55, symbol),
            (54, side),
            (38, "0"),
        ]
        msg = self._build_msg("F", extra)
        if self._writer:
            self._writer.write(msg)
            await self._writer.drain()
            logger.info(f"FIX OrderCancel sent: {cl_ord_id} for {orig_cl_ord_id}")
            return True
        return False

    async def _read_loop(self):
        """Read incoming FIX messages from the socket."""
        buf = bytearray()
        while self.state != "DISCONNECTED":
            try:
                data = await self._reader.read(4096)
                if not data:
                    logger.warning("FIX connection closed by peer")
                    self.state = "DISCONNECTED"
                    break
                buf.extend(data)

                # Parse complete messages (terminated by "10=XXX\x01")
                while True:
                    # Find checksum tag — must be preceded by SOH to avoid false matches in field values
                    cs_idx = buf.find(b"\x0110=")
                    if cs_idx < 0:
                        break
                    cs_idx += 1  # Point to the start of "10="
                    # Find SOH after checksum
                    soh_idx = buf.find(SOH.encode('ascii'), cs_idx + 3)
                    if soh_idx < 0:
                        break

                    raw_msg = bytes(buf[:soh_idx + 1])
                    del buf[:soh_idx + 1]

                    msg = FixMessage.parse(raw_msg)

                    # Verify checksum
                    cs_pos = raw_msg.rfind(b"10=")
                    calc_cs = sum(raw_msg[:cs_pos]) % 256
                    try:
                        expected_cs = int(raw_msg[cs_pos+3:cs_pos+6].decode('ascii', errors='replace').strip())
                    except ValueError:
                        logger.warning("FIX checksum parse error — skipping message")
                        continue
                    if calc_cs != expected_cs:
                        logger.warning(f"FIX checksum mismatch: calc={calc_cs} expected={expected_cs}")
                        continue

                    await self._handle_message(msg)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"FIX read loop error: {e}")
                self.state = "DISCONNECTED"
                break

    async def _handle_message(self, msg: FixMessage):
        """Handle incoming FIX message."""
        incoming_seq = msg.seq_num

        # Check for gap
        if incoming_seq > self.incoming_seq:
            logger.warning(f"FIX sequence gap: expected={self.incoming_seq} got={incoming_seq}")
            # Send ResendRequest
            resend = self._build_msg("2", [
                (7, str(self.incoming_seq)),
                (16, str(incoming_seq - 1)),
            ])
            if self._writer:
                self._writer.write(resend)
                await self._writer.drain()

        self.incoming_seq = incoming_seq + 1
        self._save_seq_nums()

        if msg.is_logon:
            self.state = "LOGGED_IN"
            logger.info("FIX session logged in")
            if self.on_logon:
                await self.on_logon()
            self._start_heartbeat()

        elif msg.is_logout:
            self.state = "DISCONNECTED"
            logger.info("FIX session logged out")
            if self.on_logout:
                await self.on_logout()
            self._stop_heartbeat()

        elif msg.is_heartbeat:
            pass  # Just update last activity

        elif msg.is_execution_report:
            if self.on_execution_report:
                await self.on_execution_report(msg)

        elif msg.is_market_data:
            if self.on_market_data:
                await self.on_market_data(msg)

        else:
            logger.debug(f"FIX message type {msg.msg_type}: {msg.fields}")

    def _start_heartbeat(self):
        if self._heartbeat_task and not self._heartbeat_task.done():
            return
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    def _stop_heartbeat(self):
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()

    async def _heartbeat_loop(self):
        while self.state == "LOGGED_IN":
            await asyncio.sleep(self.heart_bt_int)
            if self.state == "LOGGED_IN":
                await self.send_heartbeat()

    async def start(self, host: str, port: int, username: str = "", password: str = ""):
        """Connect and logon."""
        await self.connect(host, port)
        self._reader_task = asyncio.create_task(self._read_loop())
        await self.logon(username, password)

    async def stop(self):
        """Logout and disconnect."""
        if self.state == "LOGGED_IN":
            await self.logout()
            await asyncio.sleep(1)  # Wait for logout response
        self._stop_heartbeat()
        if self._reader_task:
            self._reader_task.cancel()
        if self._writer:
            self._writer.close()
            try:
                await self._writer.wait_closed()
            except Exception as e:
                logger.debug(f"Writer close error: {e}")
        self.state = "DISCONNECTED"
        self._save_seq_nums()
