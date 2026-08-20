# Quick Start Guide

**Last Updated:** August 20, 2026

Get the HFT Trading System running in under 10 minutes.

## Prerequisites

- Python 3.12+
- Node.js 18+ and npm
- Docker (optional, for containerized deployment)
- Git

## Option 1: Docker (Recommended)

```bash
git clone <repo-url>
cd trading-system-lite
docker-compose up -d
```

Services will start:
- Exchange Simulator: `ws://localhost:8765`
- AI Signal Bot: `ws://localhost:8766`
- Web UI: `http://localhost:3000`

## Option 2: Manual Setup

### 1. Install Dependencies

```bash
# Exchange Simulator
cd exchange_simulator
pip install -r requirements.txt -r requirements-dev.txt

# AI Signal Bot
cd ../ai-signal-bot
pip install -r requirements.txt -r requirements-dev.txt

# Web UI
cd ../web-ui
npm install
```

### 2. Start Exchange Simulator

```bash
cd exchange_simulator
python -m exchange_simulator
```

### 3. Start AI Signal Bot

```bash
cd ai-signal-bot
python run.py
```

### 4. Start Web UI

```bash
cd web-ui
npm run dev
```

### 5. Open Dashboard

Navigate to `http://localhost:3000`.

## Mock Mode

To run without backend services (UI only with simulated data):

```bash
cd web-ui
cp .env.mock .env
npm run dev
```

## Verify Installation

1. Open `http://localhost:3000` — you should see the trading dashboard
2. Check the connection banners (green = connected, red = disconnected)
3. Select an exchange (Binance/Bybit/OKX) and symbol (BTC/USDT)
4. View candles, order book, and signals in real-time

## Next Steps

- [Configuration Guide](./CONFIGURATION_GUIDE.md) — customize trading parameters
- [Trading Guide](./TRADING_GUIDE.md) — learn to use the trading interface
- [Development Guide](./DEVELOPMENT_GUIDE.md) — extend the system
