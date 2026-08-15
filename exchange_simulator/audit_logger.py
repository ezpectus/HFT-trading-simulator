"""Audit Logger Service - Comprehensive logging for all system events.

This service provides centralized audit logging for:
- Order lifecycle events (submit, fill, cancel, reject)
- Position lifecycle events (open, close, modify)
- Account balance changes
- Configuration changes
- System events (start, stop, errors, warnings)
- User actions with session tracking
"""
import json
import logging
import time
import uuid
from collections import deque
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Callable

from exchange_simulator.models import AuditLog, AuditEventType

logger = logging.getLogger("exchange_simulator.audit")


class AuditLogger:
    """Centralized audit logging service with in-memory and file persistence."""
    
    def __init__(
        self,
        max_memory_entries: int = 10000,
        log_file_path: str | None = None,
        enable_file_logging: bool = True,
        enable_callbacks: bool = True,
    ):
        self.max_memory_entries = max_memory_entries
        self.log_file_path = Path(log_file_path) if log_file_path else Path("logs/audit.log")
        self.enable_file_logging = enable_file_logging
        self.enable_callbacks = enable_callbacks
        
        # Thread-safe in-memory storage (deque for efficient append/pop)
        self._logs: deque[AuditLog] = deque(maxlen=max_memory_entries)
        self._lock = Lock()
        
        # Callbacks for real-time event notification
        self._callbacks: list[Callable[[AuditLog], None]] = []
        
        # Ensure log directory exists
        if enable_file_logging:
            self.log_file_path.parent.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"AuditLogger initialized: max_entries={max_memory_entries}, file={log_file_path}")
    
    def log(
        self,
        event_type: AuditEventType,
        exchange: str = "",
        symbol: str = "",
        user_id: str = "system",
        session_id: str = "",
        order_id: str = "",
        position_id: str = "",
        old_value: float = 0.0,
        new_value: float = 0.0,
        reason: str = "",
        metadata: dict | None = None,
        ip_address: str = "",
        user_agent: str = "",
    ) -> AuditLog:
        """Create and store an audit log entry."""
        log_id = str(uuid.uuid4())
        
        audit_log = AuditLog(
            id=log_id,
            event_type=event_type,
            timestamp=int(time.time()),
            exchange=exchange,
            symbol=symbol,
            user_id=user_id,
            session_id=session_id,
            order_id=order_id,
            position_id=position_id,
            old_value=old_value,
            new_value=new_value,
            reason=reason,
            metadata=metadata or {},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        with self._lock:
            self._logs.append(audit_log)
        
        # Persist to file if enabled
        if self.enable_file_logging:
            self._write_to_file(audit_log)
        
        # Notify callbacks
        if self.enable_callbacks:
            self._notify_callbacks(audit_log)
        
        return audit_log
    
    def _write_to_file(self, audit_log: AuditLog) -> None:
        """Write audit log entry to file."""
        try:
            with open(self.log_file_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(audit_log.to_dict()) + "\n")
        except Exception as e:
            logger.error(f"Failed to write audit log to file: {e}")
    
    def _notify_callbacks(self, audit_log: AuditLog) -> None:
        """Notify all registered callbacks."""
        for callback in self._callbacks:
            try:
                callback(audit_log)
            except Exception as e:
                logger.error(f"Callback error: {e}")
    
    def register_callback(self, callback: Callable[[AuditLog], None]) -> None:
        """Register a callback for real-time audit log notifications."""
        self._callbacks.append(callback)
    
    def unregister_callback(self, callback: Callable[[AuditLog], None]) -> None:
        """Unregister a callback."""
        if callback in self._callbacks:
            self._callbacks.remove(callback)
    
    def get_logs(
        self,
        event_type: AuditEventType | None = None,
        exchange: str | None = None,
        symbol: str | None = None,
        user_id: str | None = None,
        session_id: str | None = None,
        order_id: str | None = None,
        position_id: str | None = None,
        start_time: int | None = None,
        end_time: int | None = None,
        limit: int = 1000,
    ) -> list[AuditLog]:
        """Retrieve audit logs with optional filtering."""
        with self._lock:
            logs = list(self._logs)
        
        # Apply filters
        if event_type:
            logs = [log for log in logs if log.event_type == event_type]
        if exchange:
            logs = [log for log in logs if log.exchange == exchange]
        if symbol:
            logs = [log for log in logs if log.symbol == symbol]
        if user_id:
            logs = [log for log in logs if log.user_id == user_id]
        if session_id:
            logs = [log for log in logs if log.session_id == session_id]
        if order_id:
            logs = [log for log in logs if log.order_id == order_id]
        if position_id:
            logs = [log for log in logs if log.position_id == position_id]
        if start_time:
            logs = [log for log in logs if log.timestamp >= start_time]
        if end_time:
            logs = [log for log in logs if log.timestamp <= end_time]
        
        # Return most recent first, limited
        logs.reverse()
        return logs[:limit]
    
    def get_logs_by_session(self, session_id: str, limit: int = 1000) -> list[AuditLog]:
        """Get all logs for a specific session."""
        return self.get_logs(session_id=session_id, limit=limit)
    
    def get_order_lifecycle(self, order_id: str) -> list[AuditLog]:
        """Get all audit logs for a specific order's lifecycle."""
        return self.get_logs(
            order_id=order_id,
            event_type=None,  # All event types
            limit=1000,
        )
    
    def get_position_lifecycle(self, position_id: str) -> list[AuditLog]:
        """Get all audit logs for a specific position's lifecycle."""
        return self.get_logs(
            position_id=position_id,
            event_type=None,
            limit=1000,
        )
    
    def export_to_json(
        self,
        output_path: str,
        event_type: AuditEventType | None = None,
        exchange: str | None = None,
        symbol: str | None = None,
        start_time: int | None = None,
        end_time: int | None = None,
    ) -> int:
        """Export audit logs to JSON file."""
        logs = self.get_logs(
            event_type=event_type,
            exchange=exchange,
            symbol=symbol,
            start_time=start_time,
            end_time=end_time,
            limit=100000,  # Large limit for export
        )
        
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump([log.to_dict() for log in logs], f, indent=2)
        
        logger.info(f"Exported {len(logs)} audit logs to {output_path}")
        return len(logs)
    
    def export_to_csv(
        self,
        output_path: str,
        event_type: AuditEventType | None = None,
        exchange: str | None = None,
        symbol: str | None = None,
        start_time: int | None = None,
        end_time: int | None = None,
    ) -> int:
        """Export audit logs to CSV file."""
        import csv
        
        logs = self.get_logs(
            event_type=event_type,
            exchange=exchange,
            symbol=symbol,
            start_time=start_time,
            end_time=end_time,
            limit=100000,
        )
        
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        if not logs:
            return 0
        
        fieldnames = list(logs[0].to_dict().keys())
        
        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for log in logs:
                writer.writerow(log.to_dict())
        
        logger.info(f"Exported {len(logs)} audit logs to {output_path}")
        return len(logs)
    
    def clear_old_logs(self, before_timestamp: int) -> int:
        """Remove logs older than specified timestamp from memory."""
        with self._lock:
            initial_count = len(self._logs)
            self._logs = deque(
                [log for log in self._logs if log.timestamp >= before_timestamp],
                maxlen=self.max_memory_entries,
            )
            removed = initial_count - len(self._logs)
        
        logger.info(f"Cleared {removed} old audit logs")
        return removed
    
    def get_statistics(self) -> dict:
        """Get audit log statistics."""
        with self._lock:
            logs = list(self._logs)
        
        if not logs:
            return {"total": 0}
        
        event_counts = {}
        for log in logs:
            event_type = log.event_type.value
            event_counts[event_type] = event_counts.get(event_type, 0) + 1
        
        return {
            "total": len(logs),
            "event_counts": event_counts,
            "oldest_timestamp": min(log.timestamp for log in logs),
            "newest_timestamp": max(log.timestamp for log in logs),
            "unique_users": len(set(log.user_id for log in logs)),
            "unique_sessions": len(set(log.session_id for log in logs)),
        }


# Global audit logger instance
_global_audit_logger: AuditLogger | None = None


def get_audit_logger() -> AuditLogger:
    """Get the global audit logger instance."""
    global _global_audit_logger
    if _global_audit_logger is None:
        _global_audit_logger = AuditLogger()
    return _global_audit_logger


def set_audit_logger(logger: AuditLogger) -> None:
    """Set the global audit logger instance."""
    global _global_audit_logger
    _global_audit_logger = logger
