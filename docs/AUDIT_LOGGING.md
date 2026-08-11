# Audit Logging

This document describes the comprehensive audit logging system implemented in the HFT Trading System.

## Overview

The audit logging system provides a complete, thread-safe audit trail of all system events including order lifecycle, position management, account changes, configuration updates, and system events. This is essential for debugging, compliance, and system monitoring.

## Features

- **Thread-Safe Storage**: Uses locks for concurrent access protection
- **In-Memory Cache**: Fast access with deque (max 10,000 entries)
- **File Persistence**: JSONL format for append-only writes
- **Real-Time Callbacks**: Event notification system for live updates
- **Comprehensive Filtering**: Filter by event type, exchange, symbol, user, time range
- **Export Options**: JSON and CSV export for analysis
- **Lifecycle Tracking**: Track complete order and position lifecycles
- **Statistics Generation**: Event counts, time ranges, distribution analysis

## Audit Event Types

The system logs the following event types:

### Order Events
- `ORDER_SUBMITTED` - Order placed and pending execution
- `ORDER_FILLED` - Order successfully executed
- `ORDER_CANCELLED` - Order cancelled by user or system
- `ORDER_REJECTED` - Order rejected (insufficient margin, invalid quantity, etc.)

### Position Events
- `POSITION_OPENED` - New position created
- `POSITION_CLOSED` - Position closed (manual, SL, TP, liquidation)
- `POSITION_MODIFIED` - Position parameters updated

### Account Events
- `ACCOUNT_BALANCE_CHANGE` - Balance changes (fees, PnL, deposits, withdrawals)

### System Events
- `CONFIG_CHANGE` - Configuration parameter changes
- `SYSTEM_START` - System/Exchange initialization
- `SYSTEM_STOP` - System/Exchange shutdown
- `ERROR` - System errors and exceptions
- `WARNING` - System warnings and alerts

## Audit Log Structure

Each audit log entry contains the following fields:

```python
@dataclass
class AuditLog:
    id: str                          # Unique log identifier (UUID)
    event_type: AuditEventType       # Type of event
    timestamp: int                   # Unix timestamp
    exchange: str                    # Exchange identifier
    symbol: str                     # Trading symbol
    user_id: str                    # User identifier
    session_id: str                  # Session identifier
    order_id: str                   # Associated order ID
    position_id: str                # Associated position ID
    old_value: float                # Previous value (for changes)
    new_value: float                # New value (for changes)
    reason: str                     # Event reason/description
    metadata: dict                  # Additional event-specific data
    ip_address: str                 # Client IP address
    user_agent: str                 # Client user agent
```

## Usage

### Basic Logging

```python
from exchange_simulator.audit_logger import get_audit_logger
from exchange_simulator.models import AuditEventType

audit_logger = get_audit_logger()

# Log an event
audit_logger.log(
    event_type=AuditEventType.ORDER_SUBMITTED,
    exchange="binance",
    symbol="BTC/USDT",
    order_id="order_001",
    metadata={
        "side": "BUY",
        "quantity": 0.1,
        "price": 50000.0,
    },
)
```

### Filtering Logs

```python
# Get all logs for a specific symbol
logs = audit_logger.get_logs(symbol="BTC/USDT")

# Get logs by event type
logs = audit_logger.get_logs(event_type=AuditEventType.ORDER_FILLED)

# Get logs by time range
import time
start_time = int(time.time()) - 86400  # Last 24 hours
logs = audit_logger.get_logs(start_time=start_time)

# Get logs for a specific order
logs = audit_logger.get_order_lifecycle(order_id="order_001")

# Get logs for a specific position
logs = audit_logger.get_position_lifecycle(position_id="BTC/USDT_1234567890")
```

### Exporting Logs

```python
# Export to JSON
count = audit_logger.export_to_json(
    output_path="logs/export_2024-01-15.json",
    event_type=AuditEventType.ORDER_FILLED,
    start_time=start_time,
)

# Export to CSV
count = audit_logger.export_to_csv(
    output_path="logs/export_2024-01-15.csv",
    exchange="binance",
)
```

### Statistics

```python
# Get audit log statistics
stats = audit_logger.get_statistics()
print(f"Total logs: {stats['total']}")
print(f"Event counts: {stats['event_counts']}")
print(f"By exchange: {stats['by_exchange']}")
print(f"Time range: {stats['time_range']}")
```

### Real-Time Callbacks

```python
def on_audit_log(audit_log):
    """Handle real-time audit log notifications."""
    print(f"New event: {audit_log.event_type} - {audit_log.symbol}")

# Register callback
audit_logger.register_callback(on_audit_log)

# Unregister callback
audit_logger.unregister_callback(on_audit_log)
```

## Configuration

### Initialization

```python
from exchange_simulator.audit_logger import AuditLogger

# Custom configuration
audit_logger = AuditLogger(
    max_memory_entries=10000,      # Max in-memory entries
    log_file_path="logs/audit.log",  # File path for persistence
    enable_file_logging=True,     # Enable file persistence
    enable_callbacks=True,         # Enable callback system
)

# Set as global instance
from exchange_simulator.audit_logger import set_audit_logger
set_audit_logger(audit_logger)
```

### Log Cleanup

```python
# Remove logs older than 30 days
import time
cutoff = int(time.time()) - (30 * 86400)
removed = audit_logger.clear_old_logs(before_timestamp=cutoff)
print(f"Removed {removed} old logs")
```

## Integration with Exchange

The audit logger is automatically integrated into the `SimulatedExchange` class:

```python
class SimulatedExchange:
    def __init__(self, ...):
        # ...
        self._audit_logger = get_audit_logger()
        
        # Log system start
        self._audit_logger.log(
            event_type=AuditEventType.SYSTEM_START,
            exchange=exchange_id,
            metadata={"name": name, "initial_balance": initial_balance},
        )
```

Automatic logging occurs at:
- Order submission
- Order fills
- Order rejections
- Position opens
- Position closes
- Account balance changes (fees, PnL)

## UI Integration

The web UI includes an `AuditLogViewer` component for visualizing audit logs:

```jsx
import AuditLogViewer from './components/AuditLogViewer'

function AuditPanel() {
  return (
    <AuditLogViewer
      auditLogs={auditLogs}
      onExport={(logs, format) => handleExport(logs, format)}
      onFilter={(filters) => handleFilter(filters)}
    />
  )
}
```

### UI Features

- **Real-time display**: Shows logs as they arrive
- **Expandable details**: Click to view full log metadata
- **Search**: Full-text search across all log fields
- **Filters**: Filter by event type, exchange, symbol, date range
- **Export**: Download logs as JSON or CSV
- **Color coding**: Event types have distinct colors
- **Icons**: Event type icons for quick identification

## Export Utilities

The web UI includes export utilities for client-side export:

```javascript
import { exportAuditLogsToJSON, exportAuditLogsToCSV } from './utils/auditExport'

// Export to JSON
exportAuditLogsToJSON(filteredLogs)

// Export to CSV
exportAuditLogsToCSV(filteredLogs)

// Get statistics
import { getAuditLogStatistics } from './utils/auditExport'
const stats = getAuditLogStatistics(auditLogs)
```

## Security Considerations

### Sensitive Data

- **User IDs**: Track which user performed actions
- **Session IDs**: Track session context
- **IP Addresses**: Track client IP (if available)
- **User Agents**: Track client information

### Access Control

Audit logs should be protected with appropriate access controls:
- Only authorized users can view audit logs
- Export functionality should be restricted
- Log files should have appropriate file permissions

### Data Retention

- **In-Memory**: Limited to 10,000 entries (configurable)
- **File**: Append-only, grows over time
- **Cleanup**: Implement periodic cleanup of old logs
- **Backup**: Regular backups of audit log files

## Performance Impact

### Memory Usage

- **Per Entry**: ~500 bytes (depends on metadata size)
- **10,000 Entries**: ~5 MB
- **Memory Limit**: Configurable via `max_memory_entries`

### File I/O

- **Append-Only**: Minimal disk I/O overhead
- **JSONL Format**: One JSON object per line
- **Async Writes**: Consider async writes for high-throughput scenarios

### Thread Safety

- **Lock Protection**: All operations protected by locks
- **Deque Storage**: O(1) append with auto-eviction
- **Callback System**: Lock-free notification

## Best Practices

### 1. Log Meaningful Events

```python
# Good: Include relevant metadata
audit_logger.log(
    event_type=AuditEventType.ORDER_FILLED,
    symbol="BTC/USDT",
    order_id="order_001",
    metadata={
        "side": "BUY",
        "quantity": 0.1,
        "price": 50000.0,
        "fee": 5.0,
        "slippage": 0.5,
    },
)

# Bad: Minimal information
audit_logger.log(
    event_type=AuditEventType.ORDER_FILLED,
    order_id="order_001",
)
```

### 2. Use Consistent IDs

```python
# Use consistent order IDs across systems
order_id = f"{exchange}_{symbol}_{timestamp}"

# Use position IDs that reference the opening time
position_id = f"{symbol}_{opened_at}"
```

### 3. Include Context

```python
# Always include exchange and symbol when applicable
audit_logger.log(
    event_type=AuditEventType.ORDER_SUBMITTED,
    exchange="binance",  # Always include
    symbol="BTC/USDT",   # Always include if applicable
    order_id="order_001",
)
```

### 4. Regular Cleanup

```python
# Implement periodic cleanup
import schedule
import time

def cleanup_old_logs():
    cutoff = int(time.time()) - (90 * 86400)  # 90 days
    audit_logger.clear_old_logs(before_timestamp=cutoff)

schedule.every(24).hours.do(cleanup_old_logs)
```

## Troubleshooting

### Logs Not Appearing

1. Check if audit logger is initialized
2. Verify file path is writable
3. Check for exceptions in callback handlers
4. Verify filter criteria are correct

### High Memory Usage

1. Reduce `max_memory_entries`
2. Implement more frequent cleanup
3. Check metadata size (large metadata increases memory usage)

### File Not Growing

1. Check if `enable_file_logging` is True
2. Verify log file path is writable
3. Check disk space availability

## References

- [Audit Logger Implementation](../exchange_simulator/audit_logger.py)
- [Audit Log Models](../exchange_simulator/models.py)
- [Audit Log Viewer UI](../web-ui/src/components/AuditLogViewer.jsx)
- [Export Utilities](../web-ui/src/utils/auditExport.js)
