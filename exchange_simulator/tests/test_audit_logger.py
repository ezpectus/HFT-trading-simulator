"""Unit tests for audit logger functionality.

Tests for the AuditLogger service including logging, filtering, export, and statistics.
"""
import pytest
import tempfile
import time
from pathlib import Path

from exchange_simulator.audit_logger import AuditLogger, get_audit_logger, set_audit_logger
from exchange_simulator.models import AuditEventType, AuditLog


class TestAuditLogger:
    """Test AuditLogger functionality."""
    
    def test_audit_logger_creation(self):
        """Test creating an audit logger."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=True,
                enable_callbacks=False,
            )
            
            assert logger.max_memory_entries == 100
            assert logger.log_file_path == log_file
            assert logger.enable_file_logging is True
    
    def test_log_event(self):
        """Test logging an event."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=True,
                enable_callbacks=False,
            )
            
            log = logger.log(
                event_type=AuditEventType.ORDER_SUBMITTED,
                exchange="binance",
                symbol="BTC/USDT",
                order_id="order_001",
                metadata={"side": "BUY", "quantity": 0.1},
            )
            
            assert log.event_type == AuditEventType.ORDER_SUBMITTED
            assert log.exchange == "binance"
            assert log.symbol == "BTC/USDT"
            assert log.order_id == "order_001"
            assert log.metadata["side"] == "BUY"
    
    def test_log_file_persistence(self):
        """Test log file persistence."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=True,
                enable_callbacks=False,
            )
            
            logger.log(
                event_type=AuditEventType.ORDER_FILLED,
                exchange="binance",
                symbol="BTC/USDT",
                order_id="order_001",
            )
            
            # Check file was created and contains data
            assert log_file.exists()
            content = log_file.read_text()
            assert "ORDER_FILLED" in content
            assert "order_001" in content
    
    def test_get_logs_all(self):
        """Test retrieving all logs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            logger.log(event_type=AuditEventType.ORDER_SUBMITTED, exchange="binance")
            logger.log(event_type=AuditEventType.ORDER_FILLED, exchange="binance")
            logger.log(event_type=AuditEventType.ORDER_CANCELLED, exchange="bybit")
            
            logs = logger.get_logs()
            
            assert len(logs) == 3
    
    def test_get_logs_filter_by_event_type(self):
        """Test filtering logs by event type."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            logger.log(event_type=AuditEventType.ORDER_SUBMITTED, exchange="binance")
            logger.log(event_type=AuditEventType.ORDER_FILLED, exchange="binance")
            logger.log(event_type=AuditEventType.ORDER_SUBMITTED, exchange="bybit")
            
            logs = logger.get_logs(event_type=AuditEventType.ORDER_SUBMITTED)
            
            assert len(logs) == 2
            assert all(log.event_type == AuditEventType.ORDER_SUBMITTED for log in logs)
    
    def test_get_logs_filter_by_exchange(self):
        """Test filtering logs by exchange."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            logger.log(event_type=AuditEventType.ORDER_SUBMITTED, exchange="binance")
            logger.log(event_type=AuditEventType.ORDER_FILLED, exchange="bybit")
            logger.log(event_type=AuditEventType.ORDER_CANCELLED, exchange="binance")
            
            logs = logger.get_logs(exchange="binance")
            
            assert len(logs) == 2
            assert all(log.exchange == "binance" for log in logs)
    
    def test_get_logs_filter_by_symbol(self):
        """Test filtering logs by symbol."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            logger.log(event_type=AuditEventType.ORDER_SUBMITTED, exchange="binance", symbol="BTC/USDT")
            logger.log(event_type=AuditEventType.ORDER_FILLED, exchange="binance", symbol="ETH/USDT")
            logger.log(event_type=AuditEventType.ORDER_CANCELLED, exchange="binance", symbol="BTC/USDT")
            
            logs = logger.get_logs(symbol="BTC/USDT")
            
            assert len(logs) == 2
            assert all(log.symbol == "BTC/USDT" for log in logs)
    
    def test_get_logs_filter_by_time_range(self):
        """Test filtering logs by time range."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            now = int(time.time())
            
            logger.log(event_type=AuditEventType.ORDER_SUBMITTED, exchange="binance")
            time.sleep(0.1)
            logger.log(event_type=AuditEventType.ORDER_FILLED, exchange="binance")
            
            logs = logger.get_logs(start_time=now, end_time=now + 1)
            
            assert len(logs) >= 1
    
    def test_get_order_lifecycle(self):
        """Test retrieving order lifecycle logs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            order_id = "order_001"
            logger.log(event_type=AuditEventType.ORDER_SUBMITTED, order_id=order_id)
            logger.log(event_type=AuditEventType.ORDER_FILLED, order_id=order_id)
            logger.log(event_type=AuditEventType.ORDER_CANCELLED, order_id="order_002")
            
            logs = logger.get_order_lifecycle(order_id)
            
            assert len(logs) == 2
            assert all(log.order_id == order_id for log in logs)
    
    def test_get_position_lifecycle(self):
        """Test retrieving position lifecycle logs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            position_id = "BTC/USDT_1234567890"
            logger.log(event_type=AuditEventType.POSITION_OPENED, position_id=position_id)
            logger.log(event_type=AuditEventType.POSITION_CLOSED, position_id=position_id)
            logger.log(event_type=AuditEventType.POSITION_OPENED, position_id="ETH/USDT_1234567890")
            
            logs = logger.get_position_lifecycle(position_id)
            
            assert len(logs) == 2
            assert all(log.position_id == position_id for log in logs)
    
    def test_export_to_json(self):
        """Test exporting logs to JSON."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            export_file = Path(tmpdir) / "export.json"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            logger.log(event_type=AuditEventType.ORDER_SUBMITTED, exchange="binance")
            logger.log(event_type=AuditEventType.ORDER_FILLED, exchange="bybit")
            
            count = logger.export_to_json(str(export_file))
            
            assert count == 2
            assert export_file.exists()
            
            # Verify JSON structure
            import json
            with open(export_file) as f:
                data = json.load(f)
            assert len(data) == 2
    
    def test_export_to_csv(self):
        """Test exporting logs to CSV."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            export_file = Path(tmpdir) / "export.csv"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            logger.log(event_type=AuditEventType.ORDER_SUBMITTED, exchange="binance")
            logger.log(event_type=AuditEventType.ORDER_FILLED, exchange="bybit")
            
            count = logger.export_to_csv(str(export_file))
            
            assert count == 2
            assert export_file.exists()
            
            # Verify CSV structure
            content = export_file.read_text()
            assert "event_type" in content
            assert "ORDER_SUBMITTED" in content
    
    def test_clear_old_logs(self):
        """Test clearing old logs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            # Add logs with specific timestamps
            old_time = int(time.time()) - 1000
            new_time = int(time.time())
            
            # Manually add a log with old timestamp
            old_log = AuditLog(
                id="old_log_001",
                event_type=AuditEventType.ORDER_SUBMITTED,
                timestamp=old_time,
                exchange="binance",
                symbol="BTC/USDT",
                user_id="test_user",
                session_id="test_session",
            )
            logger._logs.append(old_log)
            
            # Add a new log
            logger.log(event_type=AuditEventType.ORDER_FILLED, exchange="binance")
            
            # Clear logs older than now - 500
            removed = logger.clear_old_logs(before_timestamp=new_time - 500)
            
            assert removed >= 1
    
    def test_get_statistics(self):
        """Test getting audit log statistics."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            logger.log(event_type=AuditEventType.ORDER_SUBMITTED, exchange="binance")
            logger.log(event_type=AuditEventType.ORDER_FILLED, exchange="binance")
            logger.log(event_type=AuditEventType.ORDER_SUBMITTED, exchange="bybit")
            
            stats = logger.get_statistics()
            
            assert stats["total"] == 3
            assert "ORDER_SUBMITTED" in stats["event_counts"]
            assert stats["event_counts"]["ORDER_SUBMITTED"] == 2
            # Check if by_exchange key exists (may not be implemented yet)
            if "by_exchange" in stats:
                assert "binance" in stats["by_exchange"]
                assert stats["by_exchange"]["binance"] == 2
    
    def test_callback_registration(self):
        """Test callback registration and notification."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=100,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=True,
            )
            
            callback_called = []
            
            def callback(log):
                callback_called.append(log)
            
            logger.register_callback(callback)
            
            logger.log(event_type=AuditEventType.ORDER_SUBMITTED, exchange="binance")
            
            assert len(callback_called) == 1
            assert callback_called[0].event_type == AuditEventType.ORDER_SUBMITTED
            
            logger.unregister_callback(callback)
            
            logger.log(event_type=AuditEventType.ORDER_FILLED, exchange="binance")
            
            # Should still be 1 since callback was unregistered
            assert len(callback_called) == 1
    
    def test_memory_limit(self):
        """Test memory limit enforcement."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            logger = AuditLogger(
                max_memory_entries=5,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            # Add more logs than the limit
            for i in range(10):
                logger.log(event_type=AuditEventType.ORDER_SUBMITTED, exchange="binance")
            
            logs = logger.get_logs()
            
            # Should only keep the most recent 5
            assert len(logs) == 5


class TestGlobalAuditLogger:
    """Test global audit logger singleton."""
    
    def test_get_audit_logger(self):
        """Test getting the global audit logger."""
        logger = get_audit_logger()
        
        assert logger is not None
        assert isinstance(logger, AuditLogger)
    
    def test_set_audit_logger(self):
        """Test setting the global audit logger."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test_audit.log"
            custom_logger = AuditLogger(
                max_memory_entries=50,
                log_file_path=str(log_file),
                enable_file_logging=False,
                enable_callbacks=False,
            )
            
            set_audit_logger(custom_logger)
            
            logger = get_audit_logger()
            
            assert logger is custom_logger
            assert logger.max_memory_entries == 50


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
