"""Price & Signal Monitor — live crypto price + strategy signal feed.

Connects to the Exchange Simulator WebSocket (port 8765) for live prices
and the AI Signal Bot WebSocket (port 8766) for trading signals.
Displays a compact real-time dashboard in the terminal.

Usage:
    python price_monitor.py
"""
import asyncio
import json
import os
import sys
from datetime import datetime
from collections import defaultdict

import websockets

EXCHANGE_WS = "ws://localhost:8765"
SIGNAL_WS = "ws://localhost:8766"

def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")

class PriceMonitor:
    def __init__(self):
        self.prices = defaultdict(dict)  # {exchange: {symbol: price}}
        self.candles = defaultdict(lambda: defaultdict(list))  # {exchange: {symbol: [candles]}}
        self.signals = []
        self.fills = []
        self.exchange_connected = False
        self.signal_connected = False
        self.messages_received = 0

    def handle_exchange_message(self, data):
        self.messages_received += 1
        msg_type = data.get("type", "")

        if msg_type == "price_update":
            exchange = data.get("exchange", "")
            prices = data.get("prices", {})
            for symbol, price in prices.items():
                self.prices[exchange][symbol] = price

        elif msg_type == "candle":
            exchange = data.get("exchange", "")
            symbol = data.get("symbol", "")
            candle = {
                "open": data.get("open", 0),
                "high": data.get("high", 0),
                "low": data.get("low", 0),
                "close": data.get("close", 0),
                "volume": data.get("volume", 0),
                "timestamp": data.get("timestamp", 0),
            }
            self.candles[exchange][symbol].append(candle)
            if len(self.candles[exchange][symbol]) > 60:
                self.candles[exchange][symbol] = self.candles[exchange][symbol][-60:]

        elif msg_type == "fill":
            self.fills.append(data)
            if len(self.fills) > 20:
                self.fills = self.fills[-20:]

    def handle_signal_message(self, data):
        if data.get("type") == "signal":
            self.signals.append(data)
            if len(self.signals) > 20:
                self.signals = self.signals[-20:]

    def render(self):
        clear_screen()
        now = datetime.now().strftime('%H:%M:%S')

        print(f"\n{'=' * 70}")
        print(f"  CRYPTO PRICE & SIGNAL MONITOR  {now}")
        print(f"{'=' * 70}\n")

        # Connection status
        ex_color = '\033[92m' if self.exchange_connected else '\033[91m'
        sig_color = '\033[92m' if self.signal_connected else '\033[93m'
        reset = '\033[0m'
        print(f"  Exchange WS:  {ex_color}{'CONNECTED' if self.exchange_connected else 'DISCONNECTED'}{reset}  {EXCHANGE_WS}")
        print(f"  Signal WS:    {sig_color}{'CONNECTED' if self.signal_connected else 'WAITING...'}{reset}  {SIGNAL_WS}")
        print(f"  Messages:     {self.messages_received}")
        print()

        # Prices table
        print(f"  {'─' * 66}")
        print(f"  LIVE PRICES")
        print(f"  {'─' * 66}")
        print(f"  {'Exchange':12s} {'Symbol':12s} {'Price':>14s} {'24h High':>14s} {'24h Low':>14s}")
        print(f"  {'─' * 66}")

        any_prices = False
        for exchange, symbols in sorted(self.prices.items()):
            for symbol, price in sorted(symbols.items()):
                any_prices = True
                # Get 24h high/low from candle cache
                candles = self.candles[exchange][symbol]
                if candles:
                    high_24h = max(c["high"] for c in candles[-24:])
                    low_24h = min(c["low"] for c in candles[-24:])
                else:
                    high_24h = low_24h = price

                # Color: green if price near low, red if near high
                if high_24h > low_24h:
                    pos = (price - low_24h) / (high_24h - low_24h)
                else:
                    pos = 0.5

                if pos < 0.3:
                    price_color = '\033[92m'  # green
                elif pos > 0.7:
                    price_color = '\033[91m'  # red
                else:
                    price_color = '\033[93m'  # yellow

                print(f"  {exchange:12s} {symbol:12s} {price_color}${price:>12.2f}{reset} ${high_24h:>12.2f} ${low_24h:>12.2f}")

        if not any_prices:
            print(f"  Waiting for price data...")
        print()

        # Signals feed
        print(f"  {'─' * 66}")
        print(f"  TRADING SIGNALS (last {len(self.signals)})")
        print(f"  {'─' * 66}")

        if self.signals:
            print(f"  {'Time':10s} {'Direction':10s} {'Symbol':12s} {'Conf':>6s} {'Entry':>12s} {'SL':>12s} {'TP':>12s} {'R:R':>6s}")
            print(f"  {'─' * 66}")
            for sig in self.signals[-10:]:
                ts = datetime.now().strftime('%H:%M:%S')
                direction = sig.get('direction', '???')
                symbol = sig.get('symbol', '???')
                conf = sig.get('confidence', 0)
                entry = sig.get('entry_price', 0)
                sl = sig.get('stop_loss', 0)
                tp = sig.get('take_profit', 0)
                rr = sig.get('rr_ratio', 0)

                if direction == 'LONG':
                    dir_color = '\033[92m'
                    arrow = '▲'
                elif direction == 'SHORT':
                    dir_color = '\033[91m'
                    arrow = '▼'
                else:
                    dir_color = '\033[90m'
                    arrow = '─'

                print(f"  {ts:10s} {dir_color}{arrow} {direction:5s}{reset} {symbol:12s} "
                      f"{conf:5.1f}% ${entry:>10.2f} ${sl:>10.2f} ${tp:>10.2f} {rr:5.2f}")
        else:
            print(f"  No signals yet. Waiting for AI Signal Bot...")
        print()

        # Recent fills
        if self.fills:
            print(f"  {'─' * 66}")
            print(f"  RECENT FILLS (last {len(self.fills)})")
            print(f"  {'─' * 66}")
            for fill in self.fills[-5:]:
                side = fill.get('side', '???')
                symbol = fill.get('symbol', '???')
                qty = fill.get('filled_quantity', 0)
                price = fill.get('filled_price', 0)
                exchange = fill.get('exchange', '')
                side_color = '\033[92m' if side == 'BUY' else '\033[91m'
                print(f"  {side_color}{side:4s}{reset} {qty:.4f} {symbol:10s} @ ${price:.2f} ({exchange})")
            print()

        print(f"{'=' * 70}")

async def exchange_listener(monitor):
    reconnect_delay = 2
    while True:
        try:
            async with websockets.connect(EXCHANGE_WS) as ws:
                monitor.exchange_connected = True
                reconnect_delay = 2
                async for message in ws:
                    try:
                        data = json.loads(message)
                        monitor.handle_exchange_message(data)
                    except json.JSONDecodeError:
                        pass
        except Exception:
            monitor.exchange_connected = False
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, 30)

async def signal_listener(monitor):
    reconnect_delay = 2
    while True:
        try:
            async with websockets.connect(SIGNAL_WS) as ws:
                monitor.signal_connected = True
                reconnect_delay = 2
                async for message in ws:
                    try:
                        data = json.loads(message)
                        monitor.handle_signal_message(data)
                    except json.JSONDecodeError:
                        pass
        except Exception:
            monitor.signal_connected = False
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, 30)

async def render_loop(monitor):
    while True:
        monitor.render()
        await asyncio.sleep(1)

async def main():
    monitor = PriceMonitor()
    await asyncio.gather(
        exchange_listener(monitor),
        signal_listener(monitor),
        render_loop(monitor),
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nPrice monitor stopped.")
