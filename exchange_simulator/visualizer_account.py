"""Account and order book rendering mixin for TabbedVisualizer.

Extracted from visualizer.py for file-size compliance.
Contains order book visualization, account tab, and equity sparkline.
"""


class AccountMixin:
    """Mixin providing account and order book rendering for TabbedVisualizer."""

    def _render_order_book(self, exchange, symbol: str) -> None:
        """Render order book depth visualization."""
        ob = exchange.get_order_book(symbol)
        if not ob.bids or not ob.asks:
            return

        print(f"  {self.BOLD}Order Book:{self.RESET}")
        print(f"    {'Price':>12}  {'Quantity':>12}  │  {'Price':>12}  {'Quantity':>12}")
        print(f"    {'─' * 12}  {'─' * 12}  │  {'─' * 12}  {'─' * 12}")

        rows = min(10, len(ob.bids), len(ob.asks))
        for i in range(rows):
            bid = ob.bids[i]
            ask = ob.asks[i]
            print(
                f"    {self.GREEN}{bid.price:>12.2f}{self.RESET}  "
                f"{self.GREEN}{bid.quantity:>12.4f}{self.RESET}  │  "
                f"{self.RED}{ask.price:>12.2f}{self.RESET}  "
                f"{self.RED}{ask.quantity:>12.4f}{self.RESET}"
            )

        spread = ob.spread
        spread_bps = (spread / ob.mid_price * 10000) if ob.mid_price > 0 else 0
        print()
        print(f"    {self.DIM}Spread: {spread:.2f} ({spread_bps:.1f} bps)  "
              f"Mid: {ob.mid_price:.2f}{self.RESET}")
        print()

    def _render_account_tab(self) -> None:
        """Render account overview: balance, positions, trades."""
        print(f"  {self.BOLD}Account Overview{self.RESET}\n")

        for ex_id, exchange in self.exchanges.items():
            status = exchange.get_account_status()
            balance = status["balance"]
            equity = status["equity"]
            pnl = status["total_pnl"]
            fees = status["total_fees"]
            trades = status["total_trades"]
            win_rate = status["win_rate"]
            positions = status["positions"]

            pnl_color = self.GREEN if pnl >= 0 else self.RED
            eq_color = self.CYAN

            print(f"  {self.BOLD}{self.BG_GRAY} {ex_id.upper()} {self.RESET}  "
                  f"Balance: {self.YELLOW}${balance:,.2f}{self.RESET}  "
                  f"Equity: {eq_color}${equity:,.2f}{self.RESET}  "
                  f"PnL: {pnl_color}${pnl:+,.2f}{self.RESET}  "
                  f"Fees: {self.DIM}${fees:.2f}{self.RESET}")
            print(f"  Trades: {trades}  Win Rate: {win_rate:.1f}%  "
                  f"Open Positions: {len(positions)}")

            eq_history = self._equity_history.get(ex_id, [])
            if len(eq_history) >= 5:
                self._render_equity_sparkline(eq_history, balance)

            print()

            self._render_positions(positions)
            self._render_recent_orders(exchange)

            print()
            print(f"  {'─' * 82}")
            print()

    def _render_positions(self, positions):
        """Render open positions table."""
        if not positions:
            print(f"    {self.DIM}No open positions{self.RESET}")
            return

        print(f"    {self.BOLD}Open Positions:{self.RESET}")
        print(f"    {'Symbol':<12} {'Side':<6} {'Qty':>10} {'Entry':>12} "
              f"{'SL':>12} {'TP':>12} {'uPnL':>12} {'uPnL%':>8}")
        print(f"    {'─' * 90}")

        for p in positions:
            side_color = self.GREEN if p["side"] == "BUY" else self.RED
            upnl = p["unrealized_pnl"]
            upnl_color = self.GREEN if upnl >= 0 else self.RED
            entry_notional = p["entry_price"] * p["quantity"]
            upnl_pct = (upnl / entry_notional * 100) if entry_notional > 0 else 0

            print(
                f"    {p['symbol']:<12} {side_color}{p['side']:<6}{self.RESET} "
                f"{p['quantity']:>10.4f} {p['entry_price']:>12.2f} "
                f"{p['stop_loss']:>12.2f} {p['take_profit']:>12.2f} "
                f"{upnl_color}{upnl:>+12.2f}{self.RESET} "
                f"{upnl_color}{upnl_pct:>+7.2f}%{self.RESET}"
            )

    def _render_recent_orders(self, exchange):
        """Render recent order history table."""
        orders = exchange.get_order_history(10)
        if not orders:
            return

        print()
        print(f"    {self.BOLD}Recent Orders:{self.RESET}")
        print(f"    {'Symbol':<12} {'Side':<6} {'Type':<8} {'Qty':>10} "
              f"{'Fill Price':>12} {'Fee':>8} {'Status':<10}")
        print(f"    {'─' * 80}")

        for o in reversed(orders):
            side_color = self.GREEN if o.side.value == "BUY" else self.RED
            status_color = self.GREEN if o.status.value == "FILLED" else self.RED
            print(
                f"    {o.symbol:<12} {side_color}{o.side.value:<6}{self.RESET} "
                f"{o.order_type.value:<8} {o.filled_quantity:>10.4f} "
                f"{o.filled_price:>12.2f} {o.fee:>8.4f} "
                f"{status_color}{o.status.value:<10}{self.RESET}"
            )

    def _render_equity_sparkline(self, history: list[float], initial_balance: float) -> None:
        """Render an ASCII equity curve sparkline."""
        n = len(history)
        if n < 2:
            return

        eq_min = min(history)
        eq_max = max(history)
        eq_range = eq_max - eq_min if eq_max > eq_min else 1

        spark_height = 5
        spark_width = min(n, 70)

        if n > spark_width:
            step = n / spark_width
            sampled = []
            for i in range(spark_width):
                idx = int(i * step)
                sampled.append(history[idx])
            sampled.append(history[-1])
            history = sampled
            n = len(history)

        trend = history[-1] - history[0]
        if trend > 0:
            line_color = self.GREEN
        elif trend < 0:
            line_color = self.RED
        else:
            line_color = self.YELLOW

        print(f"    {self.DIM}Equity Curve:{self.RESET}  "
              f"{line_color}${history[-1]:,.2f}{self.RESET}  "
              f"{self.DIM}({('▲' if trend > 0 else '▼' if trend < 0 else '─')} "
              f"{abs(trend):+.2f}){self.RESET}")

        for row in range(spark_height, 0, -1):
            row_val = eq_min + eq_range * row / spark_height
            line = f"    {self.DIM}{row_val:>10.2f} │{self.RESET}"

            for i in range(n):
                point_val = history[i]
                point_row = int((point_val - eq_min) / eq_range * spark_height) if eq_range > 0 else 0
                point_row = max(0, min(spark_height, point_row))

                if point_row == row and i == n - 1:
                    line += f"{line_color}◉{self.RESET}"
                elif point_row == row:
                    line += f"{line_color}●{self.RESET}"
                else:
                    line += " "

            print(line)

        print(f"    {'':>10} └{'─' * n}")
        print(f"    {self.DIM}Initial: ${initial_balance:,.2f}  "
              f"Min: ${eq_min:,.2f}  Max: ${eq_max:,.2f}  "
              f"Current: ${history[-1]:,.2f}{self.RESET}")
