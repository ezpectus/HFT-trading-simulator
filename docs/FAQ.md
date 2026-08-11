# Frequently Asked Questions (FAQ)

Common questions and answers about the HFT Trading System.

## General Questions

### What is the HFT Trading System?

The HFT Trading System is an educational platform for learning high-frequency trading concepts. It includes a simulated cryptocurrency exchange, AI-powered signal generation, a high-frequency trading execution engine, and a web-based trading dashboard.

### Is this system suitable for real trading?

No, this is an educational platform designed for learning. It uses simulated exchanges and paper trading mode by default. It is not connected to real cryptocurrency exchanges and should not be used for real trading.

### What are the system requirements?

**Minimum:**
- CPU: 4 cores
- RAM: 8GB
- Disk: 20GB
- OS: Linux (Ubuntu 20.04+) or Windows 10+

**Recommended:**
- CPU: 8 cores
- RAM: 16GB
- Disk: 50GB SSD
- OS: Linux (Ubuntu 22.04+)

### Is the system free to use?

Yes, the system is open source and free to use under the MIT License.

## Installation and Setup

### How do I install the system?

The easiest way is using Docker:
```bash
git clone https://github.com/your-org/hft-trade-bot.git
cd hft-trade-bot
docker-compose up -d
```

See the [Quick Start Guide](QUICK_START.md) for detailed instructions.

### Can I run the system without Docker?

Yes, you can run the system natively. See the [Quick Start Guide](QUICK_START.md) for native deployment instructions.

### The system won't start. What should I do?

1. Check Docker is running: `docker --version`
2. Check ports are not in use: `netstat -an | grep 8765`
3. View logs: `docker-compose logs`
4. See the [Troubleshooting](#troubleshooting) section below

### How do I update the system?

```bash
git pull origin main
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Trading and Orders

### How do I place an order?

1. Select a symbol from the symbol list
2. Choose order type (Market, Limit, etc.)
3. Select Buy or Sell
4. Enter quantity
5. Click "Place Order"

See the [User Training Guide](USER_TRAINING.md) for detailed instructions.

### What is the difference between Market and Limit orders?

- **Market Order**: Executes immediately at the current market price
- **Limit Order**: Executes only at a specified price or better

### What are advanced order types?

The system supports four advanced order types:
- **Stop-Limit**: Triggers at a stop price, executes as a limit order
- **Trailing Stop**: Automatically adjusts stop price as price moves favorably
- **OCO (One-Cancels-the-Other)**: Two linked orders; when one fills, the other cancels
- **Iceberg**: Hides full order quantity, showing only a small portion

See [Advanced Order Types](ADVANCED_ORDER_TYPES.md) for details.

### How do I set Stop Loss and Take Profit?

1. Place an order or open a position
2. In the order form, expand "Advanced Options"
3. Enter Stop Loss price
4. Enter Take Profit price
5. Place the order

### Why isn't my limit order filling?

Limit orders only fill when the market price reaches your specified price or better. If the price hasn't reached your limit price, the order will remain pending.

### How do I close a position?

Click the "Close" button on the position in the Positions panel. You can close at market price or set a limit close price.

## Exchange UI Clones

### What are exchange UI clones?

The system includes three exchange-themed UI clones that replicate the look and feel of popular cryptocurrency exchanges: Binance, Bybit, and Coinbase.

### How do I switch between exchange UIs?

- Click the exchange selector in the top navigation
- Or use keyboard shortcuts: `1` for Binance, `2` for Bybit, `3` for Coinbase

### Do exchange UI clones have different functionality?

No, all exchange UI clones have the same underlying functionality. They differ only in theme and layout. Choose the one you prefer.

### Can I customize the exchange UI?

You can switch between the three provided themes. Customizing themes requires modifying the React components.

## Symbols and Markets

### How many symbols are available?

The system supports 50+ cryptocurrency pairs including BTC, ETH, SOL, BNB, ADA, AVAX, DOT, LINK, and many more.

### How do I search for a symbol?

Use the search bar in the symbol list. Type the symbol name (e.g., "BTC") to filter the list.

### Can I add custom symbols?

Yes, you can add symbols to the configuration files. See the [Configuration Reference](CONFIGURATION_REFERENCE.md) for details.

### Why are some symbols not updating?

Check if the symbol is in the configuration and if the price feed is enabled. See the [Troubleshooting](#troubleshooting) section.

## Audit Logging

### What is audit logging?

Audit logging records all trading activities including order lifecycle, position changes, account changes, and system events.

### How do I view audit logs?

Navigate to the "Audit Logs" panel in the Web UI. Logs are displayed in reverse chronological order.

### Can I export audit logs?

Yes, you can export audit logs to JSON or CSV format. Click the "Export" button and select your preferred format.

### How do I filter audit logs?

You can filter audit logs by:
- Event type (order, position, account, system)
- Exchange (Binance, Bybit, OKX)
- Symbol
- Time range

### Where are audit logs stored?

Audit logs are stored in `exchange_simulator/logs/audit.log` and can be configured in the settings.

## Risk Management

### What is paper trading mode?

Paper trading mode allows you to practice trading without risking real money. It's enabled by default.

### How do I enable real trading?

Real trading is not supported. This is an educational platform. All trading is simulated.

### What are risk limits?

Risk limits are safeguards to prevent excessive losses:
- Daily loss limit: Stop trading if daily loss exceeds threshold
- Maximum drawdown: Stop trading if total drawdown exceeds threshold
- Maximum position size: Limit size of individual positions

### How do I set risk limits?

Risk limits are configured in the configuration files. See the [Configuration Reference](CONFIGURATION_REFERENCE.md) for details.

### What is the Kelly Criterion?

The Kelly Criterion is a formula for optimal position sizing based on win rate and risk/reward ratio. It's available as a position sizing option.

## Performance and Technical

### The system is slow. What can I do?

- Reduce the number of active symbols
- Close unused panels in the Web UI
- Check system resources (CPU, RAM)
- Use Docker for better performance isolation

### How do I check system health?

Use the health check endpoints:
```bash
curl http://localhost:8765/health  # Exchange Simulator
curl http://localhost:8766/health  # AI Signal Bot
curl http://localhost:9091/health  # HFT Trade Bot
```

### What ports does the system use?

- Exchange Simulator: 8765 (WebSocket), 8775 (Metrics)
- AI Signal Bot: 8766 (WebSocket), 9090 (Metrics)
- HFT Trade Bot: 9091 (Metrics)
- Web UI: 3000

### How do I view logs?

**Docker:**
```bash
docker-compose logs -f
```

**Native:**
- Exchange Simulator: `exchange_simulator/logs/exchange_simulator.log`
- AI Signal Bot: `ai-signal-bot/logs/ai_signal_bot.log`
- HFT Trade Bot: `hft-trade-bot/logs/hft_trade_bot.log`

## Troubleshooting

### Services won't start

1. Check Docker is running
2. Check ports are not in use
3. View logs: `docker-compose logs`
4. Check configuration files

### Web UI not loading

1. Check backend services are running
2. Check browser console for errors
3. Verify WebSocket connections
4. Try refreshing the page

### Orders not executing

1. Verify trading is enabled
2. Check if paper trading mode is on
3. Review order details in audit logs
4. Check account balance

### WebSocket disconnected

1. Check internet connection
2. Refresh the page
3. Check if backend services are running
4. Review browser console for errors

### High memory usage

1. Reduce number of active symbols
2. Close unused panels
3. Check for memory leaks
4. Increase system RAM

### Configuration not loading

1. Verify configuration file syntax
2. Check file permissions
3. Review configuration logs
4. Validate with configuration test script

## Development

### How do I contribute?

See the [Developer Training Guide](DEVELOPER_TRAINING.md) for contribution guidelines.

### How do I add a new order type?

1. Define the order model in `exchange_simulator/models.py`
2. Add to OrderType enum
3. Update order submission logic
4. Write tests
5. Update documentation

### How do I add a new trading strategy?

1. Create strategy file in appropriate component
2. Implement strategy logic
3. Register in configuration
4. Write tests
5. Update documentation

### How do I add a new UI panel?

1. Create React component in `web-ui/src/panels/`
2. Register in `web-ui/src/panels/registry.js`
3. Add to navigation
4. Write tests
5. Update documentation

### How do I run tests?

**Python:**
```bash
pytest exchange_simulator/tests/
```

**C++:**
```bash
cd hft-trade-bot/build
ctest
```

**JavaScript:**
```bash
cd web-ui
npm test
```

## Security

### Is the system secure?

The system is designed for educational use. For production deployment, follow security best practices:
- Use TLS/SSL for all connections
- Implement authentication
- Use environment variables for secrets
- Configure firewall rules
- Regular security audits

### Should I commit API keys?

No, never commit API keys or secrets to the repository. Use environment variables or secret management.

### How do I enable authentication?

Authentication is not implemented by default. You can add authentication using:
- Basic auth in reverse proxy (nginx)
- OAuth2 providers
- Custom authentication middleware

## Monitoring

### How do I monitor the system?

See the [Monitoring Setup Guide](MONITORING_SETUP.md) for detailed instructions on setting up Prometheus and Grafana.

### What metrics are available?

The system exposes metrics for:
- Order submission and execution
- WebSocket connections
- Price updates
- Signal generation
- Position management
- System resources

### How do I set up alerts?

Configure alerts in Prometheus Alertmanager. See the [Monitoring Setup Guide](MONITORING_SETUP.md) for details.

## Backup and Recovery

### How do I backup the system?

```bash
# Backup configurations
tar -czf backup/config_$(date +%Y%m%d).tar.gz *.yaml

# Backup databases
cp -r exchange_simulator/data backup/data_$(date +%Y%m%d)

# Backup audit logs
cp -r exchange_simulator/logs/audit backup/audit_$(date +%Y%m%d)
```

### How do I restore from backup?

See the [Rollback Procedures](ROLLBACK_PROCEDURES.md) for detailed instructions.

## Advanced Topics

### Can I use real price feeds?

The system supports real-time price feed integration. See the configuration for enabling price feeds from external APIs.

### Can I connect to real exchanges?

No, the system uses simulated exchanges. Connecting to real exchanges would require significant development and is not supported.

### Can I backtest strategies?

Yes, the system includes backtesting capabilities. See the [User Training Guide](USER_TRAINING.md) for details.

### Can I use the system for algorithmic trading?

Yes, you can develop and test algorithmic trading strategies. However, all trading is simulated.

## Support and Community

### Where can I get help?

- Documentation: Check the `docs/` directory
- GitHub Issues: Report bugs and feature requests
- GitHub Discussions: Ask questions and share ideas

### How do I report a bug?

Create a GitHub issue with:
- Description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- System information (OS, version, etc.)

### How do I request a feature?

Create a GitHub issue with:
- Feature description
- Use case
- Proposed implementation
- Priority

## Miscellaneous

### Is the system suitable for production?

The system is designed for educational purposes. For production use, significant modifications would be required including:
- Real exchange connections
- Production-grade security
- Regulatory compliance
- Professional support

### Can I use the system commercially?

Yes, under the MIT License. However, it's recommended to use it for educational purposes only.

### What programming languages are used?

- Python: Exchange Simulator, AI Signal Bot
- C++20: HFT Trade Bot
- JavaScript/React: Web UI

### What is the development roadmap?

See the [Comprehensive Development Plan](COMPREHENSIVE_DEVELOPMENT_PLAN.md) for the development roadmap.

## Still Have Questions?

If you can't find the answer here, check:
- [User Training Guide](USER_TRAINING.md)
- [Developer Training Guide](DEVELOPER_TRAINING.md)
- [Configuration Reference](CONFIGURATION_REFERENCE.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Architecture Documentation](ARCHITECTURE.md)

Or create a GitHub issue with your question.
