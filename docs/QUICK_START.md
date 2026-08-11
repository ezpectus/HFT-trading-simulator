# Quick Start Guide

Get up and running with the HFT Trading System in 5 minutes.

## Prerequisites

- Docker and Docker Compose (recommended)
- Or Python 3.10+, Node.js 18+, C++ compiler (for native deployment)
- 8GB RAM minimum
- 20GB free disk space

## Quick Start (Docker)

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/hft-trade-bot.git
cd hft-trade-bot
```

### 2. Start the System

```bash
docker-compose up -d
```

This will start all 4 components:
- Exchange Simulator (port 8765)
- AI Signal Bot (port 8766)
- HFT Trade Bot (port 9091)
- Web UI (port 3000)

### 3. Access the Web UI

Open your browser and navigate to:
```
http://localhost:3000
```

### 4. Place Your First Order

1. Select "BTC/USDT" from the symbol list
2. Choose "Market" as order type
3. Select "Buy"
4. Enter quantity: 0.1
5. Click "Place Order"

Your order will execute immediately at the current market price.

### 5. View Your Position

Your position will appear in the "Positions" panel showing:
- Entry price
- Current price
- Unrealized PnL
- Quantity

### 6. Close Your Position

Click the "Close" button on your position to close it at the current market price.

## Quick Start (Native)

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/your-org/hft-trade-bot.git
cd hft-trade-bot

# Python dependencies
pip install -r exchange_simulator/requirements.txt
pip install -r ai-signal-bot/requirements.txt

# Node.js dependencies
cd web-ui
npm install
cd ..

# C++ build
cd hft-trade-bot
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
cd ../..
```

### 2. Start Components

```bash
# Terminal 1: Exchange Simulator
cd exchange_simulator
python -m exchange_simulator --no-visualizer

# Terminal 2: AI Signal Bot
cd ai-signal-bot
python run.py

# Terminal 3: HFT Trade Bot
cd hft-trade-bot
./build/hft_trade_bot config/config.yaml

# Terminal 4: Web UI
cd web-ui
npm run preview
```

### 3. Access the Web UI

Open your browser and navigate to:
```
http://localhost:3000
```

## Key Features to Try

### 50+ Trading Pairs

Browse the symbol list to see all 50+ cryptocurrency pairs available:
- Major cryptocurrencies (BTC, ETH, SOL, BNB)
- Altcoins (ADA, AVAX, DOT, LINK, MATIC)
- DeFi tokens (UNI, AAVE, COMP, CRV)
- And many more

### Advanced Order Types

Try the advanced order types in the order form:
- **Stop-Limit**: Trigger at a price, execute at another
- **Trailing Stop**: Automatically adjusts stop price
- **OCO**: Linked orders (TP + SL)
- **Iceberg**: Hide order quantity

### Exchange UI Clones

Switch between exchange-themed UIs:
- Press `1` for Binance theme
- Press `2` for Bybit theme
- Press `3` for Coinbase theme

### Audit Logging

View comprehensive audit logs of all trading activities:
- Navigate to "Audit Logs" panel
- Filter by event type, exchange, symbol
- Export to JSON or CSV

### Symbol Search

Use the search bar to quickly find symbols:
- Type symbol name (e.g., "BTC")
- Filter by category
- See search results instantly

## Common Commands

### Docker Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# Restart a service
docker-compose restart exchange-simulator

# Check status
docker-compose ps
```

### Health Checks

```bash
# Exchange Simulator
curl http://localhost:8765/health

# AI Signal Bot
curl http://localhost:8766/health

# HFT Trade Bot
curl http://localhost:9091/health

# Web UI
curl http://localhost:3000
```

## Troubleshooting

### Services Won't Start

**Check Docker:**
```bash
docker --version
docker-compose --version
```

**Check Ports:**
```bash
# Check if ports are in use
netstat -an | grep 8765
netstat -an | grep 8766
netstat -an | grep 3000
```

**View Logs:**
```bash
docker-compose logs exchange-simulator
docker-compose logs ai-signal-bot
docker-compose logs hft-trade-bot
docker-compose logs web-ui
```

### Web UI Not Loading

**Check Backend Services:**
```bash
curl http://localhost:8765/health
curl http://localhost:8766/health
```

**Check Browser Console:**
- Open DevTools (F12)
- Check for errors in Console tab
- Check Network tab for failed requests

### Orders Not Executing

**Check Trading Status:**
- Verify trading is enabled
- Check if paper trading mode is on
- Review order details in audit logs

**Check Account Balance:**
- Verify sufficient balance
- Check margin requirements
- Review position limits

## Next Steps

### Learn More

- [User Training Guide](USER_TRAINING.md) - Comprehensive user guide
- [Developer Training Guide](DEVELOPER_TRAINING.md) - Developer guide
- [Architecture Documentation](ARCHITECTURE.md) - System architecture
- [Configuration Reference](CONFIGURATION_REFERENCE.md) - Configuration options

### Practice

1. **Paper Trading**: Practice with paper trading mode
2. **Different Order Types**: Try all order types
3. **Different Strategies**: Test different trading strategies
4. **Exchange UIs**: Try all three exchange UI clones

### Customize

1. **Configuration**: Modify configuration files
2. **Strategies**: Add custom trading strategies
3. **UI Panels**: Customize dashboard panels
4. **Alerts**: Set up monitoring alerts

## Support

- **Documentation**: Check the `docs/` directory
- **GitHub Issues**: Report bugs and feature requests
- **Community**: Join discussions in GitHub Discussions

## System Requirements

### Minimum Requirements

- **CPU**: 4 cores
- **RAM**: 8GB
- **Disk**: 20GB
- **OS**: Linux (Ubuntu 20.04+) or Windows 10+

### Recommended Requirements

- **CPU**: 8 cores
- **RAM**: 16GB
- **Disk**: 50GB SSD
- **OS**: Linux (Ubuntu 22.04+)

## Security Notes

- **Paper Trading Mode**: System defaults to paper trading mode for safety
- **API Keys**: Never commit API keys to repository
- **Firewall**: Configure firewall rules for production
- **TLS/SSL**: Use HTTPS for production deployments

## Performance Tips

- **Docker**: Use Docker for better performance isolation
- **Symbols**: Reduce active symbols if experiencing lag
- **Panels**: Close unused panels to improve performance
- **Browser**: Use Chrome or Firefox for best performance

## Uninstalling

### Docker

```bash
# Stop and remove containers
docker-compose down

# Remove volumes
docker-compose down -v

# Remove images
docker rmi hft-exchange-simulator hft-ai-signal-bot hft-hft-trade-bot hft-web-ui
```

### Native

```bash
# Stop processes
pkill -f exchange_simulator
pkill -f ai_signal_bot
pkill -f hft_trade_bot
pkill -f vite

# Remove dependencies (optional)
pip uninstall -r exchange_simulator/requirements.txt
pip uninstall -r ai-signal-bot/requirements.txt
```

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Acknowledgments

- TradingView for lightweight-charts library
- Binance, Bybit, Coinbase for exchange inspiration
- Open source community for various libraries and tools
