# Troubleshooting Guide

Common issues and solutions for the HFT Trading System.

## Table of Contents

1. [Connection Issues](#connection-issues)
2. [Performance Issues](#performance-issues)
3. [Order Issues](#order-issues)
4. [Data Issues](#data-issues)
5. [Build Issues](#build-issues)
6. [Docker Issues](#docker-issues)
7. [Memory Issues](#memory-issues)

---

## Connection Issues

### WebSocket Connection Refused

**Symptoms:**
- Unable to connect to WebSocket server
- Connection drops frequently
- No real-time data updates

**Solutions:**

1. **Check if server is running:**
   ```bash
   curl http://localhost:8765/health
   ```
   Expected response: `{"status": "healthy", ...}`

2. **Verify ports are not in use:**
   ```bash
   # Windows
   netstat -ano | findstr :8765
   
   # Linux/Mac
   lsof -i :8765
   ```

3. **Check firewall settings:**
   - Ensure ports 8765, 8766, 9091 are not blocked
   - Add firewall rules if necessary

4. **Verify WebSocket URL format:**
   - Correct: `ws://localhost:8765`
   - Incorrect: `http://localhost:8765`

5. **Enable WebSocket debugging in browser console:**
   ```javascript
   const ws = new WebSocket('ws://localhost:8765');
   ws.onopen = () => console.log('Connected');
   ws.onerror = (error) => console.error('Error:', error);
   ```

### Web UI Shows No Data

**Symptoms:**
- Web UI loads but shows no market data
- Order book is empty
- No price updates

**Solutions:**

1. **Check WebSocket status indicator:**
   - Green = connected
   - Red = disconnected
   - Yellow = connecting

2. **Try mock mode:**
   ```bash
   VITE_MOCK_MODE=true npm run dev
   ```

3. **Check browser console for errors:**
   - Open Developer Tools (F12)
   - Check Console tab for errors
   - Check Network tab for failed requests

4. **Verify exchange simulator is running:**
   ```bash
   python -m exchange_simulator --no-visualizer
   ```

5. **WebSocket uses exponential backoff for reconnection:**
   - Wait for automatic reconnection
   - Or refresh the page

---

## Performance Issues

### High Latency in Order Execution

**Symptoms:**
- Orders take >100ms to execute
- Slippage exceeds expected levels
- Signals delayed

**Solutions:**

1. **Check system resources:**
   ```bash
   # Windows
   taskmgr
   
   # Linux/Mac
   top -p $(pgrep exchange_simulator)
   ```

2. **Optimize database queries:**
   ```sql
   EXPLAIN ANALYZE SELECT * FROM trades WHERE symbol = 'BTC/USDT';
   ```

3. **Enable shared memory for HFT bot:**
   ```bash
   # Check shared memory size
   df -h /dev/shm
   ```

4. **Reduce WebSocket message size:**
   - Use MessagePack instead of JSON
   - Enable compression

5. **Check network latency:**
   ```bash
   ping localhost
   ```

### System Slow Under Load

**Symptoms:**
- UI becomes unresponsive
- High CPU usage
- Memory usage increases

**Solutions:**

1. **Reduce number of active symbols:**
   - Edit `shared_config.yaml`
   - Remove symbols you don't need

2. **Enable lazy loading:**
   - Only load data for visible symbols
   - Configure in `exchange_simulator/config.yaml`

3. **Increase system resources:**
   - Add more RAM
   - Use faster CPU

4. **Check for memory leaks:**
   ```bash
   # Monitor memory over time
   watch -n 1 'ps aux | grep exchange_simulator'
   ```

---

## Order Issues

### Order Rejected

**Symptoms:**
- Order submission fails
- Error message: "Order rejected"

**Common Causes:**

1. **Insufficient balance:**
   - Check account balance
   - Reduce order size

2. **Invalid symbol:**
   - Verify symbol exists in `shared_config.yaml`
   - Use correct format (e.g., BTC/USDT)

3. **Invalid order type:**
   - Check if order type is supported
   - Valid types: MARKET, LIMIT, STOP_LIMIT, TRAILING_STOP, OCO, ICEBERG

4. **Risk check failed:**
   - Position size exceeds limits
   - Leverage too high
   - Check risk settings in config

### Order Not Filling

**Symptoms:**
- Order remains open
- No execution despite price movement

**Solutions:**

1. **Check order price:**
   - Limit orders only fill at specified price or better
   - Adjust price closer to market

2. **Check order book:**
   - Verify there's liquidity at your price
   - Order may be too far from market

3. **Check time in force:**
   - GTC (Good Till Cancelled): remains until filled or cancelled
   - IOC (Immediate or Cancel): fills immediately or cancels
   - FOK (Fill or Kill): must fill completely or cancels

4. **Cancel and re-submit:**
   - Cancel the order
   - Submit with new price

---

## Data Issues

### Price Feed Not Updating

**Symptoms:**
- Prices frozen
- No new data

**Solutions:**

1. **Check price feed manager:**
   ```bash
   # Check logs
   tail -f logs/exchange_simulator_latest.log
   ```

2. **Verify API connectivity:**
   - Check if Binance/CoinGecko APIs are accessible
   - Test with curl:
     ```bash
     curl https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
     ```

3. **Check rate limits:**
   - API may be rate-limited
   - Implement caching (already configured)

4. **Fallback to simulation:**
   - If APIs fail, system falls back to simulation mode
   - Check logs for fallback messages

### Historical Data Missing

**Symptoms:**
- No historical candles
- Backtest fails

**Solutions:**

1. **Check database connection:**
   ```bash
   # Test PostgreSQL connection
   psql -h localhost -U hft_user -d hft_trading
   ```

2. **Verify candle data exists:**
   ```sql
   SELECT COUNT(*) FROM candles WHERE symbol = 'BTC/USDT';
   ```

3. **Check candle generation:**
   - Candles are generated from trade data
   - Ensure trades are being recorded

4. **Manually insert test data:**
   ```sql
   INSERT INTO candles (exchange, symbol, interval, open, high, low, close, volume, time)
   VALUES ('simulator', 'BTC/USDT', '1h', 65000, 65100, 64900, 65050, 100, NOW());
   ```

---

## Build Issues

### C++ Build Fails

**Symptoms:**
- CMake configuration fails
- Compilation errors
- Linker errors

**Solutions:**

1. **Install dependencies:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install cmake libboost-dev libboost-system-dev libssl-dev \
       libwebsocketpp-dev libspdlog-dev libfmt-dev nlohmann-json3-dev libyaml-cpp-dev
   
   # macOS
   brew install cmake boost fmt nlohmann-json yaml-cpp spdlog
   ```

2. **Check C++ compiler version:**
   ```bash
   g++ --version  # Should be 13+ or clang 17+
   ```

3. **Clean build directory:**
   ```bash
   cd hft-trade-bot
   rm -rf build
   mkdir build
   cd build
   cmake ..
   make
   ```

4. **Check CMake output for specific errors:**
   - Read error messages carefully
   - Fix missing dependencies

### JavaScript Build Fails

**Symptoms:**
- npm install fails
- Vite build fails
- Module not found errors

**Solutions:**

1. **Clear node_modules and reinstall:**
   ```bash
   cd web-ui
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check Node.js version:**
   ```bash
   node --version  # Should be 18+
   npm --version
   ```

3. **Clear npm cache:**
   ```bash
   npm cache clean --force
   ```

4. **Check for dependency conflicts:**
   ```bash
   npm ls
   ```

---

## Docker Issues

### Container Won't Start

**Symptoms:**
- Docker container exits immediately
- Container restarts in loop

**Solutions:**

1. **Check container logs:**
   ```bash
   docker logs exchange-simulator-prod
   ```

2. **Inspect container health:**
   ```bash
   docker inspect exchange-simulator-prod --format='{{.State.Health}}'
   ```

3. **Check resource limits:**
   ```bash
   docker stats exchange-simulator-prod
   ```

4. **Increase health check timeout:**
   ```yaml
   healthcheck:
     test: ["CMD", "curl", "-f", "http://localhost:8765/health"]
     interval: 30s
     timeout: 30s  # Increased from 10s
     retries: 5
   ```

### Docker Compose Fails

**Symptoms:**
- docker-compose up fails
- Service dependency errors

**Solutions:**

1. **Check docker-compose version:**
   ```bash
   docker-compose --version
   ```

2. **Verify YAML syntax:**
   ```bash
   docker-compose config
   ```

3. **Check for port conflicts:**
   ```bash
   netstat -ano | findstr :8765
   ```

4. **Rebuild containers:**
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up
   ```

---

## Memory Issues

### Out of Memory Errors

**Symptoms:**
- OOM (Out of Memory) errors
- Process killed by system
- System becomes unresponsive

**Solutions:**

1. **Check memory usage:**
   ```bash
   # Windows
   taskmgr
   
   # Linux/Mac
   free -h
   top
   ```

2. **Reduce memory footprint:**
   - Reduce number of symbols
   - Disable unused features
   - Clear caches periodically

3. **Increase swap space:**
   ```bash
   # Linux
   sudo swapon --show
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

4. **Configure Docker memory limits:**
   ```yaml
   deploy:
     resources:
       limits:
         memory: 4G
   ```

### Memory Leak Detected

**Symptoms:**
- Memory usage increases over time
- System slows down progressively

**Solutions:**

1. **Profile memory usage:**
   ```python
   import tracemalloc
   tracemalloc.start()
   # ... run code ...
   snapshot = tracemalloc.take_snapshot()
   top_stats = snapshot.statistics('lineno')
   ```

2. **Clear caches periodically:**
   ```python
   # Clear price cache every hour
   if time.time() - last_cache_clear > 3600:
       cache.clear()
   ```

3. **Use weak references:**
   ```python
   import weakref
   cache = weakref.WeakValueDictionary()
   ```

4. **Limit WebSocket message queue:**
   ```python
   MAX_QUEUE_SIZE = 1000
   if len(message_queue) > MAX_QUEUE_SIZE:
       message_queue.pop(0)
   ```

---

## Additional Resources

### Logs

- Exchange Simulator: `logs/exchange_simulator_latest.log`
- AI Signal Bot: `logs/ai_signal_bot_latest.log`
- HFT Trade Bot: `logs/hft_trade_bot_latest.log`

### Configuration Files

- Exchange Simulator: `exchange_simulator/config.yaml`
- AI Signal Bot: `ai-signal-bot/config/settings.yaml`
- HFT Trade Bot: `hft-trade-bot/config/config.yaml`
- Shared: `shared_config.yaml`

### Documentation

- [Architecture Guide](ARCHITECTURE.md)
- [Setup Guide](SETUP.md)
- [Performance Guide](PERFORMANCE.md)
- [WebSocket Protocol](WEBSOCKET_PROTOCOL.md)
- [REST API Reference](REST_API.md)

### Getting Help

If you can't resolve your issue:

1. Check the [FAQ](FAQ.md)
2. Review [GitHub Issues](https://github.com/your-repo/issues)
3. Create a new issue with:
   - Detailed description of the problem
   - Steps to reproduce
   - System information (OS, Python version, etc.)
   - Relevant logs
   - Error messages
