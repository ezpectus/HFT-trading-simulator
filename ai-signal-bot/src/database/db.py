"""Database layer — SQLite storage for signals, trades, and equity curve.

Uses sqlite3 (standard library) with WAL mode for concurrent access.
"""
import os
import sqlite3
import time


class Database:
    """SQLite database for trading data."""

    def __init__(self, path: str = "data/trading.db"):
        self.path = path
        dir_path = os.path.dirname(path)
        if dir_path:
            os.makedirs(dir_path, exist_ok=True)
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        conn = self._conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                direction TEXT NOT NULL,
                confidence REAL NOT NULL,
                strategy TEXT NOT NULL,
                entry_price REAL NOT NULL,
                stop_loss REAL NOT NULL,
                take_profit REAL NOT NULL,
                rr_ratio REAL,
                reason TEXT,
                status TEXT DEFAULT 'PENDING',
                validated INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                exchange TEXT NOT NULL,
                side TEXT NOT NULL,
                quantity REAL NOT NULL,
                entry_price REAL NOT NULL,
                exit_price REAL,
                pnl REAL,
                fee REAL,
                status TEXT DEFAULT 'OPEN',
                signal_id INTEGER
            );

            CREATE TABLE IF NOT EXISTS equity_curve (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                balance REAL NOT NULL,
                equity REAL NOT NULL,
                open_positions INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
            CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
            CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
        """)
        conn.commit()
        conn.close()

    def save_signal(self, signal_dict: dict, validated: bool = True) -> int:
        conn = self._conn()
        cursor = conn.execute(
            """INSERT INTO signals
               (timestamp, symbol, direction, confidence, strategy,
                entry_price, stop_loss, take_profit, rr_ratio, reason, validated)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                signal_dict.get("timestamp", int(time.time())),
                signal_dict["symbol"],
                signal_dict["direction"],
                signal_dict["confidence"],
                signal_dict["strategy"],
                signal_dict["entry_price"],
                signal_dict["stop_loss"],
                signal_dict["take_profit"],
                signal_dict.get("rr_ratio", 0),
                signal_dict.get("reason", ""),
                1 if validated else 0,
            ),
        )
        signal_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return signal_id

    def save_trade(self, trade_dict: dict) -> int:
        conn = self._conn()
        cursor = conn.execute(
            """INSERT INTO trades
               (timestamp, symbol, exchange, side, quantity,
                entry_price, exit_price, pnl, fee, status, signal_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                trade_dict.get("timestamp", int(time.time())),
                trade_dict["symbol"],
                trade_dict["exchange"],
                trade_dict["side"],
                trade_dict["quantity"],
                trade_dict["entry_price"],
                trade_dict.get("exit_price"),
                trade_dict.get("pnl"),
                trade_dict.get("fee", 0),
                trade_dict.get("status", "OPEN"),
                trade_dict.get("signal_id"),
            ),
        )
        trade_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return trade_id

    def close_trade(self, trade_id: int, exit_price: float, pnl: float, fee: float = 0) -> None:
        conn = self._conn()
        conn.execute(
            "UPDATE trades SET exit_price=?, pnl=?, fee=?, status='CLOSED' WHERE id=?",
            (exit_price, pnl, fee, trade_id),
        )
        conn.commit()
        conn.close()

    def save_equity(self, balance: float, equity: float, open_positions: int) -> None:
        conn = self._conn()
        conn.execute(
            "INSERT INTO equity_curve (timestamp, balance, equity, open_positions) VALUES (?, ?, ?, ?)",
            (int(time.time()), balance, equity, open_positions),
        )
        conn.commit()
        conn.close()

    def get_stats(self) -> dict:
        conn = self._conn()
        total_signals = conn.execute("SELECT COUNT(*) FROM signals").fetchone()[0]
        total_trades = conn.execute("SELECT COUNT(*) FROM trades WHERE status='CLOSED'").fetchone()[0]
        winning = conn.execute("SELECT COUNT(*) FROM trades WHERE status='CLOSED' AND pnl > 0").fetchone()[0]
        total_pnl = conn.execute("SELECT COALESCE(SUM(pnl), 0) FROM trades WHERE status='CLOSED'").fetchone()[0]
        total_fees = conn.execute("SELECT COALESCE(SUM(fee), 0) FROM trades").fetchone()[0]
        conn.close()

        return {
            "total_signals": total_signals,
            "total_trades": total_trades,
            "winning_trades": winning,
            "win_rate": (winning / total_trades * 100) if total_trades > 0 else 0,
            "total_pnl": total_pnl,
            "total_fees": total_fees,
        }

    def get_recent_signals(self, limit: int = 20) -> list[dict]:
        conn = self._conn()
        rows = conn.execute(
            "SELECT * FROM signals ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_recent_trades(self, limit: int = 20) -> list[dict]:
        conn = self._conn()
        rows = conn.execute(
            "SELECT * FROM trades ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
