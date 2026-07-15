"""Price & Signal Monitor — live crypto prices + strategy signals.

Connects to the Exchange Simulator WebSocket (port 8765) and displays
real-time prices, order book spreads, and funding rates in a terminal.

Usage:
    python price_monitor.py
    python price_monitor.py --exchange binance --symbol BTCUSDT
"""
import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime

import websockets

WS_URL = "ws://localhost:8765"

COLORS = {
    "RED": "\033[91m",
    "GREEN": "\033[92m",
    "YELLOW": "\033[93m",
    "CYAN": "\033[96m",
    "BOLD": "\033[1m",
    "DIM": "\033[2m",
    "RESET": "\033[0m",
}


def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")


def colorize(text, color):
    if not sys.stdout.isatty():
        return text
    return f"{COLORS.get(color, '')}{text}{COLORS['RESET']}"


def format_price(price):
    if price is None:
        return "N/A"
    if price >= 1000:
        return f"${price:,.2f}"
    elif price >= 1:
        return f"${price:.4f}"
    else:
        return f"${price:.6f}"


def format_pct(pct):
    if pct is None:
        return "N/A"
    color = "GREEN" if pct >= 0 else "RED"
    sign = "+" if pct >= 0 else ""
    return colorize(f"{sign}{pct:.2f}%", color)


async def monitor(exchange_filter=None, symbol_filter=None):
    print(colorize(f"\n{'=' * 70}", "CYAN"))
    print(colorize("  PRICE & SIGNAL MONITOR", "BOLD"))
    print(f"  Connecting to {WS_URL} ...")
    print(colorize(f"{'=' * 70}\n", "CYAN"))

    prices = {}
    orderbooks = {}
    funding_rates = {}
    candles_count = 0
    connected = False
    reconnect_delay = 2

    while True:
        try:
            async with websockets.connect(WS_URL) as ws:
                connected = True
                reconnect_delay = 2
                print(colorize("  [CONNECTED] Listening for market data...\n", "GREEN"))

                subscribe_msg = json.dumps({"type": "subscribe", "protocol_version": 2})
                await ws.send(subscribe_msg)

                while True:
                    raw = await ws.recv()
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    msg_type = data.get("type", "")

                    if msg_type in ("snapshot", "candles", "sync_state"):
                        if data.get("prices"):
                            prices = data["prices"]
                        if data.get("orderbooks"):
                            orderbooks = data["orderbooks"]
                        if data.get("fundingRates"):
                            funding_rates = data["fundingRates"]
                        if data.get("candles"):
                            candles_count += len(data["candles"])

                    elif msg_type == "price_update":
                        sym = data.get("symbol", "")
                        prices[sym] = data.get("price", 0)

                    elif msg_type == "funding":
                        exchange = data.get("exchange", "")
                        funding_rates[exchange] = data.get("rate", 0)

                    # Render dashboard
                    clear_screen()
                    print(colorize("=" * 70, "CYAN"))
                    print(colorize("  PRICE & SIGNAL MONITOR", "BOLD"))
                    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  "
                          f"{colorize('[LIVE]', 'GREEN')}  Candles: {candles_count}")
                    print(colorize("=" * 70, "CYAN"))
                    print()

                    # Prices table
                    print(colorize("  PRICES", "BOLD"))
                    print(f"  {'Symbol':<16} {'Price':>14} {'Change':>10}")
                    print(colorize("  " + "-" * 44, "DIM"))

                    for sym_key, price in sorted(prices.items()):
                        if exchange_filter and exchange_filter.lower() not in sym_key.lower():
                            continue
                        if symbol_filter and symbol_filter.upper() not in sym_key.upper():
                            continue

                        parts = sym_key.split("|")
                        exchange = parts[0] if len(parts) > 1 else ""
                        symbol = parts[1] if len(parts) > 1 else sym_key

                        # Calculate change from orderbook if available
                        change_pct = None
                        ob_key = sym_key
                        if ob_key in orderbooks:
                            ob = orderbooks[ob_key]
                            bid = ob.get("bids", [{}])[0].get("price", 0) if ob.get("bids") else 0
                            ask = ob.get("asks", [{}])[0].get("price", 0) if ob.get("asks") else 0
                            if bid and ask and price:
                                mid = (bid + ask) / 2
                                if mid > 0:
                                    change_pct = (price - mid) / mid * 100

                        ex_tag = colorize(f"[{exchange[:4]}]", "DIM") if exchange else ""
                        print(f"  {ex_tag} {symbol:<12} {format_price(price):>14} {format_pct(change_pct):>10}")

                    # Spread info
                    if orderbooks:
                        print()
                        print(colorize("  ORDER BOOK SPREADS", "BOLD"))
                        print(f"  {'Symbol':<16} {'Bid':>14} {'Ask':>14} {'Spread':>10}")
                        print(colorize("  " + "-" * 58, "DIM"))

                        for ob_key, ob in sorted(orderbooks.items()):
                            if exchange_filter and exchange_filter.lower() not in ob_key.lower():
                                continue
                            if symbol_filter and symbol_filter.upper() not in ob_key.upper():
                                continue

                            parts = ob_key.split("|")
                            exchange = parts[0] if len(parts) > 1 else ""
                            symbol = parts[1] if len(parts) > 1 else ob_key

                            bids = ob.get("bids", [])
                            asks = ob.get("asks", [])
                            bid = bids[0].get("price", 0) if bids else 0
                            ask = asks[0].get("price", 0) if asks else 0
                            spread = ask - bid if bid and ask else 0
                            spread_bps = (spread / ask * 10000) if ask else 0

                            ex_tag = colorize(f"[{exchange[:4]}]", "DIM") if exchange else ""
                            spread_color = "GREEN" if spread_bps < 5 else ("YELLOW" if spread_bps < 20 else "RED")
                            print(f"  {ex_tag} {symbol:<12} {format_price(bid):>14} "
                                  f"{format_price(ask):>14} {colorize(f'{spread_bps:.1f}bps', spread_color):>10}")

                    # Funding rates
                    if funding_rates:
                        print()
                        print(colorize("  FUNDING RATES", "BOLD"))
                        for ex, rate in sorted(funding_rates.items()):
                            rate_color = "GREEN" if rate >= 0 else "RED"
                            rate_str = colorize(f"{rate*100:.4f}%", rate_color)
                            print(f"  {ex:<16} {rate_str}")

                    print()
                    print(colorize("-" * 70, "CYAN"))
                    print(colorize("  (Press Ctrl+C to stop)", "DIM"))

        except websockets.exceptions.ConnectionClosed:
            if connected:
                print(colorize("\n  [DISCONNECTED] Reconnecting...", "YELLOW"))
                connected = False
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, 30)
        except KeyboardInterrupt:
            print(colorize("\n  Stopped.", "GREEN"))
            break
        except Exception as e:
            print(colorize(f"\n  [ERROR] {e}", "RED"))
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, 30)


def main():
    parser = argparse.ArgumentParser(description="Price & Signal Monitor")
    parser.add_argument("--exchange", "-e", default=None, help="Filter by exchange (e.g. binance)")
    parser.add_argument("--symbol", "-s", default=None, help="Filter by symbol (e.g. BTCUSDT)")
    args = parser.parse_args()

    try:
        asyncio.run(monitor(args.exchange, args.symbol))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
