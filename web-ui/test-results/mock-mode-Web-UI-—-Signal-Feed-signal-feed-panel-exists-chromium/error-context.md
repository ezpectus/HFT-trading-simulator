# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mock-mode.spec.js >> Web UI — Signal Feed >> signal feed panel exists
- Location: e2e\mock-mode.spec.js:86:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[class*="signal"], [class*="feed"]').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('[class*="signal"], [class*="feed"]').first()

```

```yaml
- application "HFT Trading System Dashboard":
  - alert:
    - img
    - text: DEMO MODE — Using simulated market data. No live connection required.
    - button "Dismiss demo mode banner":
      - img
  - button:
    - img
  - img
  - heading "Welcome to Trading Sim" [level=2]
  - paragraph: A full-featured HFT trading simulator with 3 exchanges, 3 symbols, live AI signals, and real-time order execution. Includes 191+ analytic panels and 75+ mathematical models.
  - button "Skip tutorial"
  - button "Next":
    - text: Next
    - img
  - region "Notifications"
  - banner:
    - link "Skip to main content":
      - /url: "#main-content"
    - text: Trading Sim
    - group "Exchange selector":
      - button "Select binance exchange" [pressed]: binance
      - button "Select bybit exchange": bybit
      - button "Select okx exchange": okx
    - group "Symbol selector":
      - button "Select BTC/USDT" [pressed]: BTC
      - button "Select ETH/USDT": ETH
      - button "Select SOL/USDT": SOL
    - group "Timeframe selector":
      - button "5m" [pressed]
      - button "15m"
      - button "1h"
      - button "4h"
    - group "Simulation speed":
      - button "Set speed to Pause":
        - img
        - text: Pause
      - button "Set speed to 1x" [pressed]:
        - img
        - text: 1x
      - button "Set speed to 2x":
        - img
        - text: 2x
      - button "Set speed to 5x":
        - img
        - text: 5x
    - button "Stop trading" [pressed]:
      - img
      - text: TRADING
    - button "Turn sound off" [pressed]:
      - img
    - button "Switch to light theme":
      - img
    - status:
      - img
      - text: Exchange
      - img
      - text: AI Signals
    - text: binance bybit okx
  - main:
    - button "Detach to separate window":
      - img
    - img
    - text: BTC/USDT · 0 candles
    - button "Markers":
      - img
      - text: Markers
    - img
    - button "EMA 9":
      - img
      - text: EMA 9
    - button "EMA 21":
      - img
      - text: EMA 21
    - button "EMA 50":
      - img
      - text: EMA 50
    - button "Bollinger":
      - img
      - text: Bollinger
    - button "VWAP":
      - img
      - text: VWAP
    - button "RSI 14":
      - img
      - text: RSI 14
    - table:
      - row:
        - cell
        - cell:
          - link "Charting by TradingView":
            - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=localhost/
            - img
        - cell
      - row:
        - cell
        - cell
        - cell
    - img
    - text: Place Order binance · BTC/USDT
    - button "BUY / LONG"
    - button "SELL / SHORT"
    - button "MARKET"
    - button "LIMIT"
    - text: Quantity
    - spinbutton: "0.01"
    - button "25%"
    - button "50%"
    - button "75%"
    - button "100%"
    - text: "Notional: $0.00 Fee (0.04%): $0.0000 Slippage (2bps): $0.0000 Total cost: $0.0000 Stop Loss"
    - spinbutton
    - text: Take Profit
    - spinbutton
    - text: "Leverage: 10x"
    - slider: "10"
    - button "Show Risk Calculator":
      - img
      - text: Show Risk Calculator
    - button "BUY 0.01 BTC/USDT"
    - button "Collapse sidebar":
      - img
    - button "Detach to separate window":
      - img
    - img
    - text: Order Book
    - button "Toggle depth heatmap":
      - img
    - text: 0.0 bps
    - img
    - text: Depth Imbalance 0.0% BAL 0.00 0.00 Cumulative Depth Profile Price Size Total $0.00 spread $0.00 197/197 panels
    - button "Panels":
      - img
      - text: Panels
    - button "Order Flow 12" [expanded]:
      - img
      - text: Order Flow 12
    - tabpanel:
      - img
      - text: Depth Chart No order book data
      - img
      - text: Order Flow Imbalance No order book data
      - img
      - text: Spoofing Detector No order book data
      - img
      - text: Order Book Heatmap Collecting data...
      - img
      - text: Liquidity Heatmap Collecting data...
      - img
      - text: Execution Timeline No fills yet
      - img
      - text: Trade Replay No events to replay
      - img
      - text: Order Flow Tape Waiting for prints...
      - img
      - text: Cumulative Volume Delta Not enough data
      - img
      - text: Dark Order Flow No anomalous volume detected Detects volume spikes >2.5σ. Hidden = small body + large volume (dark pool activity).
      - img
      - text: Order Flow Heatmap Need 10+ candles
      - img
      - text: Depth Replay Need 10+ candles
    - button "Technical Analysis 47" [expanded]:
      - img
      - text: Technical Analysis 47
    - tabpanel:
      - img
      - text: Volume Profile Not enough data
      - img
      - text: Market Profile (TPO) Not enough data
      - img
      - text: Market Regime Not enough data
      - img
      - text: Fibonacci Levels
      - button:
        - img
      - text: Not enough data
      - img
      - text: Fair Value Gaps Not enough data
      - img
      - text: "Pattern Scanner 0 found No patterns detected Scans last 3 candles for: Doji, Hammer, Shooting Star, Engulfing, Morning/Evening Star, Marubozu, 3 Soldiers/Crows. ★ = strength."
      - img
      - text: Candle Patterns Not enough data
      - img
      - text: Support / Resistance Not enough data
      - img
      - text: Custom Indicators
      - button "Add":
        - img
        - text: Add
      - text: No indicators added
      - img
      - text: Custom Indicator Formula
      - textbox "e.g. EMA(closes, 9) - EMA(closes, 21)": EMA(closes, 9) - EMA(closes, 21)
      - text: "Examples (click to use):"
      - button "EMA(closes, 9) - EMA(clos..."
      - button "RSI(closes, 14) - 50"
      - button "MACD(closes, 12, 26, 9)"
      - button "closes - SMA(closes, 50)"
      - button "BB(closes, 20, 2) - close..."
      - button "ATR(highs, lows, closes, ..."
      - img
      - text: "Functions: SMA(closes, period) EMA(closes, period) RSI(closes, period) ATR(highs, lows, closes, period) BB(closes, period, stdDev) MACD(closes, fast, slow, signal) MAX/MIN(arr, period) CROSS(a, b) Custom parser: supports +, -, *, /, parentheses, variables (closes, highs, lows, volumes, open) and indicator functions."
      - img
      - text: OBV Indicator Not enough data
      - img
      - text: MFI Indicator Not enough data
      - img
      - text: Williams %R Not enough data
      - img
      - text: Ichimoku Cloud Need 52+ candles
      - img
      - text: Renko Chart Not enough data
      - img
      - text: Stochastic Not enough data
      - img
      - text: ATR Not enough data
      - img
      - text: Parabolic SAR Not enough data
      - img
      - text: ADX / DI Need 28+ candles
      - img
      - text: CCI Need 20+ candles
      - img
      - text: Awesome Oscillator Need 34+ candles
      - img
      - text: VWAP MACD Need 35+ candles
      - img
      - text: Heikin-Ashi Not enough data
      - img
      - text: Multi-Timeframe Not enough data
      - img
      - text: Point & Figure Not enough data
      - img
      - text: Kagi Chart Not enough data
      - img
      - text: Three-Line Break Not enough data
      - img
      - text: Order Blocks No blocks detected
      - img
      - text: Session Volume Not enough data
      - img
      - text: Volatility Regime Need 30+ candles
      - img
      - text: Tick Chart Not enough data
      - img
      - text: Volume Clock Not enough volume data
      - img
      - text: Liquidation Map Not enough data
      - img
      - text: Funding Rate No funding data
      - img
      - text: Open Interest Not enough data
      - img
      - text: Cumulative Tick Not enough data
      - img
      - text: Inter-Exchange Spread Need 2+ exchanges
      - img
      - text: Footprint Chart Not enough data
      - img
      - text: Regime Switching Need 30+ candles
      - img
      - text: Smart Money Concepts Need 15+ candles
      - img
      - text: Liquidity Grabs Not enough data
      - img
      - text: Custom Indicator Plugin BTC/USDT
      - button "EMA Cross"
      - button "RSI Divergence"
      - button "Volume Z-Score"
      - button "Price Momentum"
      - button "Volatility Ratio"
      - textbox "Indicator name": My Indicator
      - textbox: "#a855f7"
      - checkbox "Overlay" [checked]
      - text: Overlay
      - img
      - 'textbox "Formula: e.g. ema(close, 9) - ema(close, 21)"': ema(close, 9) - ema(close, 21)
      - group: Available functions & variables
      - button "Run":
        - img
        - text: Run
      - button "Save":
        - img
        - text: Save
      - img
      - text: Volume Anomaly Need 20+ candles
      - img
      - text: MTF Confluence Need 30+ candles
      - img
      - text: Session VWAP Not enough data
      - img
      - text: Price Action Score Need 10+ candles Need at least 101 candles for BTC/USDT on binance
    - button "Risk & Analytics 94" [expanded]:
      - img
      - text: Risk & Analytics 94
    - tabpanel:
      - img
      - text: Session Stats
      - img
      - text: Duration 6s
      - img
      - text: Trades 0
      - img
      - text: Session PnL +$0.00
      - img
      - text: "Win Rate 0.0% (0W/0L) Fills received: 17"
      - button "Reset"
      - img
      - text: PnL Heatmap — Jul 2026 Mon Tue Wed Thu Fri Sat Sun 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 Month PnL +$0.00 Best Day — Worst Day —
      - img
      - text: Performance by Hour (UTC) No trade history yet
      - img
      - text: Trade Clustering
      - img
      - text: Overtrading Detected 17 trades in 5 min window Total Fills 17 Avg Interval 0s Max 5min 17 Trade Clusters (≥3 rapid fills) 17 fills 6.002000093460083s span BUY
      - img
      - text: Correlation Matrix
      - table:
        - rowgroup:
          - row "BTC ETH SOL":
            - columnheader
            - columnheader "BTC"
            - columnheader "ETH"
            - columnheader "SOL"
        - rowgroup:
          - row "BTC 1.00 0.00 0.00":
            - cell "BTC"
            - cell "1.00"
            - cell "0.00"
            - cell "0.00"
          - row "ETH 0.00 1.00 0.00":
            - cell "ETH"
            - cell "0.00"
            - cell "1.00"
            - cell "0.00"
          - row "SOL 0.00 0.00 1.00":
            - cell "SOL"
            - cell "0.00"
            - cell "0.00"
            - cell "1.00"
      - text: 1m returns, last 100 candles ■ pos■ neg
      - img
      - text: Position Correlation Error acc.positions.filter is not a function
      - button "Retry":
        - img
        - text: Retry
      - img
      - text: Volatility Surface Not enough data
      - img
      - text: Drawdown Analysis Max Drawdown $0.000.0% Current DD 0.00% Max DD Duration 0 fills Recoveries 0 Underwater % 0.0% Peak Equity $10,000.00 Current vs Peak At peak
      - img
      - text: Risk-Adjusted Returns
      - img
      - text: Sharpe 0.000 Return / total volatility
      - img
      - text: Sortino 0.000 Return / downside volatility
      - img
      - text: Calmar 0.000 Annual return / max drawdown Max DD 0.00% Ann. Return 0.0% Profit Factor 0.00 Expectancy $0.00 Gross Profit $0 Gross Loss $0
      - img
      - text: Risk Dashboard Need 10+ trades for risk metrics
      - img
      - text: PnL Attribution Error object is not iterable (cannot read property Symbol(Symbol.iterator))
      - button "Retry":
        - img
        - text: Retry
      - img
      - text: P&L Attribution Chart Need 3+ closed trades
      - img
      - text: Monte Carlo Simulation Need at least 5 trades (0 available)
      - img
      - text: Walk-Forward Analysis Need at least 10 trades (0 available)
      - img
      - text: Sentiment Indicator Not enough data
      - img
      - text: Fear & Greed Not enough data
      - img
      - text: Delta Divergence Not enough data
      - img
      - text: Risk of Ruin Calculator Win %
      - spinbutton: "45"
      - text: Risk %
      - spinbutton: "2"
      - text: R:R
      - spinbutton: "2"
      - text: "Risk of Ruin 0.00% MC: 0.0% Edge +35.00% Profit Factor 1.64 BE Win Rate 33.3% Current WR 45.0% Monte Carlo Drawdown (100 trades): Avg Max DD 15.2% Median 14.9% Worst 29.9% Sample equity curves:"
      - img
      - text: Survived Ruined Risk of Ruin = probability of losing 50% of account. Keep <1%. Lower risk% or improve edge.
      - img
      - text: Expected Value Calculator Win %
      - spinbutton
      - text: R:R
      - spinbutton
      - text: Risk %
      - spinbutton: "1"
      - text: "EV per Trade +0.350% ≈ $35.00 per $10K Profit Factor 1.64 BE Win Rate 33.3% Kelly % 17.5% P(5 loss) 5.03% Per Strategy EV: ml_ensemble 0t 0% +0.00% mean_reversion 0t 0% +0.00% stat_arb 0t 0% +0.00% market_making 0t 0% +0.00% sentiment 0t 0% +0.00% EV = (WR × R:R - LR) × risk%. Positive EV = profitable system. Kelly = optimal bet size."
      - img
      - text: Order Flow Absorption Not enough data
      - img
      - text: Composite Dashboard Need 20+ candles
      - img
      - text: Confidence Scorer Need 15+ candles
      - img
      - text: Regime Strategy Need 20+ candles
      - img
      - text: Cross-Market Need 2+ symbols
      - img
      - text: Performance Attribution No trade history
      - img
      - text: Tick Speed Need 15+ candles
      - img
      - text: Put/Call Ratio Need 5+ fills
      - img
      - text: Signal Matrix Need symbols with 20+ candles
      - img
      - text: Slippage Simulator Need 10+ candles and valid order size
      - img
      - text: GARCH Volatility Need 35+ candles
      - img
      - text: Cointegration Scanner Need 50+ candles for 2+ symbols
      - img
      - text: Markov Regime Predictor Need 40+ candles
      - img
      - text: Fractal Dimension Analyzer Need 35+ candles
      - img
      - text: Kalman Filter Price Need 20+ candles
      - img
      - text: Spectral Analysis Need 32+ candles Need at least 10 candles for BTC/USDT on binance Need at least 30 candles for BTC/USDT on binance Need at least 16 candles for BTC/USDT on binance Need at least 50 candles for BTC/USDT on binance Need at least 2 symbols with 30+ candles on binance Need at least 50 candles for BTC/USDT on binance Need at least 2 symbols with 51+ candles on binance Need at least 40 candles for BTC/USDT on binance Need at least 32 candles for BTC/USDT on binance Need at least 32 candles for BTC/USDT on binance Need at least 50 candles for BTC/USDT on binance Need at least 30 candles with significant moves for BTC/USDT on binance Need at least 40 candles for BTC/USDT on binance Need at least 40 candles for BTC/USDT on binance Need at least 55 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 50 candles for BTC/USDT on binance Need at least 40 candles for BTC/USDT on binance Need at least 91 candles for BTC/USDT on binance
      - img
      - text: Rough Volatility (rBergomi) Error Cannot access 'H' before initialization
      - button "Retry":
        - img
        - text: Retry
      - text: Need at least 101 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 81 candles for BTC/USDT on binance Need at least 30 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 129 candles for BTC/USDT on binance Need at least 102 candles for BTC/USDT on binance Need at least 51 candles for BTC/USDT on binance Need at least 201 candles for BTC/USDT on binance Need at least 51 candles for BTC/USDT on binance Need at least 65 candles for BTC/USDT on binance Need at least 30 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 61 candles for BTC/USDT on binance Need at least 61 candles for BTC/USDT on binance Need at least 121 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 201 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 151 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 151 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 81 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 121 candles for BTC/USDT on binance Need at least 121 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance Need at least 201 candles for BTC/USDT on binance Need at least 201 candles for BTC/USDT on binance Need at least 151 candles for BTC/USDT on binance Need at least 151 candles for BTC/USDT on binance Need at least 121 candles for BTC/USDT on binance Need at least 121 candles for BTC/USDT on binance Need at least 101 candles for BTC/USDT on binance
    - button "Portfolio & Optimization 26" [expanded]:
      - img
      - text: Portfolio & Optimization 26
    - tabpanel:
      - text: "Almgren-Chriss Optimal Execution — BTC/USDT Order Size:"
      - spinbutton "Order Size:": "100"
      - text: "T (days):"
      - spinbutton "T (days):": "1"
      - text: "Steps:"
      - spinbutton "Steps:": "20"
      - text: "λ (risk aversion):"
      - spinbutton "λ (risk aversion):": "0.000001"
      - text: "η (temp impact):"
      - spinbutton "η (temp impact):": "0.1"
      - text: "γ (perm impact):"
      - spinbutton "γ (perm impact):": "0.01"
      - text: Optimal Execution Trajectory
      - img: Time (days) Shares Almgren-Chriss TWAP (dashed)
      - text: Efficient Frontier (Cost vs Risk)
      - img: Risk (σ) Cost
      - text: ● Optimal (green) vs TWAP (gray) Execution Schedule (first 5 + last) t=0.050 5.00 100.0/day t=0.100 5.00 100.0/day t=0.150 5.00 100.0/day t=0.200 5.00 100.0/day t=0.250 5.00 100.0/day ... t=1.000 5.00 100.0/day E[cost] (AC) 1050.0000 σ[cost] (AC) 1.1979 E[cost] (TWAP) 1050.0000 Savings 0.0000 (0.0%) κ 0.0001
      - strong: "Model:"
      - text: σ=0.02000, η=0.1, γ=0.01, λ=1.00e-6 |
      - strong: "Impact:"
      - text: permanent=50.0000, temporary=1000.0000 |
      - strong: "Utility:"
      - text: "AC=1050.0000 vs TWAP=1050.0000 Optimal Stopping (Snell Envelope) — BTC/USDT Strike:"
      - spinbutton "Strike:": "100"
      - text: "T (days):"
      - spinbutton "T (days):": "30"
      - text: "r:"
      - spinbutton "r:": "0.05"
      - text: "σ (est: 0.300):"
      - 'spinbutton "σ (est: 0.300):"': "0.3"
      - text: "Steps:"
      - spinbutton "Steps:": "50"
      - text: "Paths:"
      - spinbutton "Paths:": "1000"
      - checkbox "Put"
      - text: Put Optimal Exercise Boundary (Binomial Tree)
      - img: Time steps Stock price Exercise boundary S₀ = $100.00 K = $100.00
      - text: Exercise Probability by Time (Longstaff-Schwartz MC)
      - img
      - text: Binomial Price $3.2377 LSM Price $3.1954 European $3.0702 Early Ex. Premium $0.1251 Intrinsic $0.0000
      - strong: "Model:"
      - text: Binomial (50 steps) vs LSM (1,000 paths) |
      - strong: "σ:"
      - text: "0.3000 (est: 0.3000) |"
      - strong: "moneyness:"
      - text: 1.0000 (ITM) Need at least 2 symbols with 51+ candles on binance Need at least 2 symbols with 51+ candles on binance Need at least 3 symbols with 51+ candles on binance Need at least 2 symbols with 101+ candles on binance Need at least 3 symbols with 101+ candles on binance Need at least 2 symbols with 100+ candles on binance Need at least 201 candles Need at least 101 candles for BTC/USDT on binance
      - img
      - text: Hedging Suggestions Error acc.positions is not iterable
      - button "Retry":
        - img
        - text: Retry
      - img
      - text: Risk Parity Calculator Capital ($)
      - spinbutton "Capital ($)": "10000"
      - text: Risk (%)
      - spinbutton "Risk (%)": "1"
      - text: Stop (%)
      - spinbutton "Stop (%)": "2"
      - table:
        - rowgroup:
          - row "Symbol Vol% Weight Capital Qty":
            - columnheader "Symbol"
            - columnheader "Vol%"
            - columnheader "Weight"
            - columnheader "Capital"
            - columnheader "Qty"
        - rowgroup:
          - row "BTC 1.00% 33.3% $3333 0.0000":
            - cell "BTC"
            - cell "1.00%"
            - cell "33.3%"
            - cell "$3333"
            - cell "0.0000"
          - row "ETH 1.00% 33.3% $3333 0.0000":
            - cell "ETH"
            - cell "1.00%"
            - cell "33.3%"
            - cell "$3333"
            - cell "0.0000"
          - row "SOL 1.00% 33.3% $3333 0.0000":
            - cell "SOL"
            - cell "1.00%"
            - cell "33.3%"
            - cell "$3333"
            - cell "0.0000"
      - img
      - text: Risk parity allocates more capital to less volatile assets. Position size = (risk × weight) / (stop% × price).
      - img
      - text: Portfolio Optimizer Not enough data (need 20+ candles per symbol)
      - img
      - text: Auto-Rebalance Error object is not iterable (cannot read property Symbol(Symbol.iterator))
      - button "Retry":
        - img
        - text: Retry
      - img
      - text: Multi-Account View Error (acc.positions || []).filter is not a function
      - button "Retry":
        - img
        - text: Retry
      - img
      - text: Smart Order Router No routing data available Finds best exchange to BUY (lowest price) and SELL (highest price). Flags arbitrage opportunities > 0.1%.
      - img
      - text: Kelly Criterion Calculator Need at least 5 trades for Kelly calculation
      - img
      - text: Greeks Calculator (Black-Scholes)
      - button "CALL"
      - button "PUT"
      - text: Spot Price
      - spinbutton "Spot Price": "65000"
      - text: Strike
      - spinbutton "Strike": "65000"
      - text: Days to Expiry
      - spinbutton "Days to Expiry": "30"
      - text: Volatility (%)
      - spinbutton "Volatility (%)": "50"
      - text: Risk-free Rate (%)
      - spinbutton "Risk-free Rate (%)": "5"
      - text: Price $3841.15 Delta 0.5400 Gamma 0.000043 Theta -65.9228/day Vega 73.9693/% Rho 25.6903/%
      - img
      - text: Black-Scholes model. Vega/Rho per 1% change. Theta per day.
      - img
      - text: Options Strategy P&L Simulator Spot Price
      - spinbutton "Spot Price": "65000"
      - text: Days to Expiry
      - spinbutton "Days to Expiry": "30"
      - text: Volatility (%)
      - spinbutton "Volatility (%)": "50"
      - text: Risk-free Rate (%)
      - spinbutton "Risk-free Rate (%)": "5"
      - button "Long Call"
      - button "Long Put"
      - button "Covered Call"
      - button "Protective Put"
      - button "Bull Call Spread"
      - button "Bear Put Spread"
      - button "Long Straddle"
      - button "Long Strangle"
      - button "Iron Condor"
      - button "Call Butterfly"
      - combobox:
        - option "Buy" [selected]
        - option "Sell"
      - combobox:
        - option "Call" [selected]
        - option "Put"
      - spinbutton: "0"
      - spinbutton: "1"
      - text: "@ 3841.15 +3841.15"
      - button:
        - img
      - combobox:
        - option "Buy"
        - option "Sell" [selected]
      - combobox:
        - option "Call" [selected]
        - option "Put"
      - spinbutton: "0"
      - spinbutton: "1"
      - text: "@ 3841.15 -3841.15"
      - button:
        - img
      - button "Add Leg":
        - img
        - text: Add Leg
      - text: Net Cost +0.00 Max Profit +0.00 Max Loss 0.00
      - img
      - text: 52000 78000 Price at Expiry →
      - img
      - text: Multi-Leg Options
      - button "Long Straddle"
      - button "Long Strangle"
      - button "Iron Condor"
      - button "Call Butterfly"
      - text: Spot
      - spinbutton "Spot": "65000"
      - text: Days
      - spinbutton "Days": "30"
      - text: Vol %
      - spinbutton "Vol %": "50"
      - img
      - text: Buy Call
      - spinbutton: "65000"
      - text: "@ $3726.98"
      - img
      - text: Buy Put
      - spinbutton: "60000"
      - text: "@ $3726.98"
      - img
      - text: "Net Cost $7453.97 Max Profit ∞ Max Loss -∞ Breakevens: $52,546.03 · $72,453.97"
      - img
      - text: Pair Trading Need 2+ symbols with data
      - img
      - text: Whale Alerts No whale activity detected
      - img
      - text: Position Size Optimizer Not enough data
      - img
      - text: Liquidation Cascade Not enough data
      - img
      - text: Trailing Stop Calculator Not enough data
      - img
      - text: Correlation Heatmap Need 2+ symbols with 10+ candles
    - button "Strategy & Automation 11" [expanded]:
      - img
      - text: Strategy & Automation 11
    - tabpanel:
      - text: Need at least 101 candles for BTC/USDT on binance
      - img
      - text: Strategy Backtest Engine (0 candles available) Balance
      - spinbutton: "10000"
      - text: Fee %
      - spinbutton: "0.075"
      - text: Size %
      - spinbutton: "10"
      - text: EMA Fast
      - spinbutton: "9"
      - text: EMA Slow
      - spinbutton: "21"
      - text: RSI Period
      - spinbutton: "14"
      - button "Run Backtest" [disabled]:
        - img
        - text: Run Backtest
      - text: Need at least 30 candles (have 0). Wait for data to load.
      - img
      - heading "No backtests to compare" [level=3]
      - paragraph: Run multiple backtests from the Strategy Backtest Engine to compare them here.
      - img
      - text: Execution Bot (TWAP/VWAP)
      - button "TWAP"
      - button "VWAP"
      - button "BUY"
      - button "SELL"
      - text: Total Qty
      - spinbutton "Total Qty": "1"
      - text: Slices
      - spinbutton "Slices": "10"
      - text: Interval(s)
      - spinbutton "Interval(s)": "5"
      - text: "Per slice: 0.1000 Duration: 50s"
      - button "Start":
        - img
        - text: Start
      - img
      - text: Watchlist
      - button "Symbol":
        - img
        - text: Symbol
      - button "Add symbol":
        - img
      - text: BTC no data
      - img
      - text: +0.00%
      - button:
        - img
      - text: ETH no data
      - img
      - text: +0.00%
      - button:
        - img
      - text: SOL no data
      - img
      - text: +0.00%
      - button:
        - img
      - img
      - text: Strategy Builder
      - textbox "Strategy name": My Strategy
      - button "Save":
        - img
        - text: Save
      - text: "#1 IF"
      - combobox:
        - option "Price above"
        - option "Price below"
        - option "RSI above"
        - option "RSI below" [selected]
        - option "EMA fast crosses above slow"
        - option "EMA fast crosses below slow"
        - option "Volume spike >"
        - option "5-candle change >"
      - button:
        - img
      - spinbutton: "30"
      - text: THEN
      - combobox:
        - option "BUY" [selected]
        - option "SELL"
        - option "CLOSE ALL"
        - option "ALERT"
      - spinbutton "Quantity": "0.1"
      - button "Add Rule":
        - img
        - text: Add Rule
      - img
      - text: Strategy Marketplace 3/3
      - img
      - textbox "Search strategies..."
      - button "Import":
        - img
        - text: Import
      - button "mean-reversion"
      - button "rsi"
      - button "beginner"
      - button "trend-following"
      - button "ema"
      - button "breakout"
      - button "volume"
      - button "intermediate"
      - button "Or paste JSON directly..."
      - img
      - text: RSI Oversold Bounce Buy when RSI < 30, sell when RSI > 70. Classic mean reversion. mean-reversion rsi beginner 2 rules
      - button "Export as JSON":
        - img
      - img
      - text: EMA Crossover Trend Follow trend via EMA fast/slow crossover. Buy on golden cross, sell on death cross. trend-following ema beginner 2 rules
      - button "Export as JSON":
        - img
      - img
      - text: Volume Spike Breakout Buy on volume spike > 3x average with 5-candle price change > 5%. breakout volume intermediate 2 rules
      - button "Export as JSON":
        - img
      - img
      - text: Strategy Competition Select Strategies
      - checkbox "Trend Following" [checked]
      - text: Trend Following
      - checkbox "Mean Reversion" [checked]
      - text: Mean Reversion
      - checkbox "RSI Divergence" [checked]
      - text: RSI Divergence
      - checkbox "EMA Crossover" [checked]
      - text: EMA Crossover
      - checkbox "Volume Breakout" [checked]
      - text: Volume Breakout
      - checkbox "Statistical Arbitrage" [checked]
      - text: Statistical Arbitrage
      - button "Run Tournament (6)":
        - img
        - text: Run Tournament (6)
      - img
      - text: Alert Webhooks
      - button:
        - img
      - text: No webhooks configured Discord/Telegram webhooks. Click test to verify. Persist in localStorage.
      - img
      - text: Trade Journal 0/0
      - img
      - textbox "Search symbol or note..."
      - button "All"
      - button "Wins"
      - button "Losses"
      - text: No trades match filters
      - img
      - text: MIT Order Simulator Need 15+ candles
    - button "Export & Tools 4" [expanded]:
      - img
      - text: Export & Tools 4
    - tabpanel:
      - img
      - text: Session Replay
      - textbox "Recording name (optional)"
      - button "Start Recording":
        - img
        - text: Start Recording
      - button "Import Recording":
        - img
        - text: Import Recording
      - img
      - text: Session Report Export PnL +$0.00 Trades 0
      - button "Print / Save as PDF":
        - img
        - text: Print / Save as PDF
      - button "Export HTML Report":
        - img
        - text: Export HTML Report
      - img
      - text: Session Export Fills 17 Candles 500 Signals 11 Accounts 3
      - button "Export Full Session (JSON)":
        - img
        - text: Export Full Session (JSON)
      - text: Includes accounts, fills, last 200 candles, signals
      - img
      - text: Trade Stats Export No trades to export
    - button "Config & Session 3" [expanded]:
      - img
      - text: Config & Session 3
    - tabpanel:
      - img
      - text: Price Alerts
      - button "Sound on":
        - img
      - button "Add":
        - img
        - text: Add
      - img
      - text: No alerts set
      - img
      - text: Replay Mode
      - button "Pause":
        - img
        - text: Pause
      - button "Simulator Config ▼":
        - img
        - text: Simulator Config ▼
    - tablist "Trading panels":
      - button "Account" [pressed]:
        - img
        - text: Account
      - button "Bots":
        - img
        - text: Bots
      - button "Signals":
        - img
        - text: Signals
      - button "Arb":
        - img
        - text: Arb
      - button "Prices":
        - img
        - text: Prices
      - button "Fills":
        - img
        - text: Fills
      - button "History":
        - img
        - text: History
      - button "Perf":
        - img
        - text: Perf
      - button "BT":
        - img
        - text: BT
    - img
    - text: Exchange Leaderboard
    - button "PnL":
      - img
      - text: PnL
    - text: 1 binance 0t +0%w +$0.00 2 bybit 0t +0%w +$0.00 3 okx 0t +0%w +$0.00 binance
    - img
    - text: "-- -- win Balance $10,000.00 Equity $10,001.09 Total PnL -- Fees -- Trades Positions 0 bybit"
    - img
    - text: "-- -- win Balance $10,000.00 Equity $10,000.00 Total PnL -- Fees -- Trades Positions 0 okx"
    - img
    - text: "-- -- win Balance $10,000.00 Equity $10,000.00 Total PnL -- Fees -- Trades Positions 0 Open Positions (1) L:0 S:1 Margin: $137.91 +$1.09 SHORT BTCUSDT binance 10x"
    - button "Close position":
      - img
    - text: "Qty: 0.0212 Entry: $65,051.33 PnL: $1.09 Margin: $137.91 SL: $-- TP: $-- Liq: $71,231.20"
  - contentinfo "System status bar":
    - text: 05:40:33 0 candles binance · BTC/USDT
    - img
    - text: "AI: 11 sigs"
    - img
    - text: 17 fills
    - img
    - text: "NEWS: x vol (c) Pos: 0 Trades: 0 Balance: $30000"
    - img
    - text: +1.09 EXCELLENT
    - img
    - text: EX 0ms
    - img
    - text: AI 0ms
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | 
  3   | test.describe('Web UI — Mock Mode', () => {
  4   |   test('loads page in mock mode and shows dashboard', async ({ page }) => {
  5   |     // Mock mode is enabled via VITE_MOCK_MODE=true in .env or env var
  6   |     await page.goto('/')
  7   |     
  8   |     // Header should be visible
  9   |     await expect(page.locator('header')).toBeVisible({ timeout: 10000 })
  10  |     
  11  |     // Title or logo should mention HFT or Trading
  12  |     const headerText = await page.locator('header').textContent()
  13  |     expect(headerText).toMatch(/HFT|Trading|Dashboard/i)
  14  |   })
  15  | 
  16  |   test('shows candle chart panel', async ({ page }) => {
  17  |     await page.goto('/')
  18  |     
  19  |     // Chart container should appear (either canvas or div with chart-related class)
  20  |     const chartArea = page.locator('[class*="chart"], [class*="candle"], canvas').first()
  21  |     await expect(chartArea).toBeVisible({ timeout: 15000 })
  22  |   })
  23  | 
  24  |   test('shows exchange selector', async ({ page }) => {
  25  |     await page.goto('/')
  26  |     
  27  |     // Exchange buttons or dropdown should be present
  28  |     const exchangeSelector = page.locator('button, select').filter({ hasText: /binance|bybit|okx/i }).first()
  29  |     await expect(exchangeSelector).toBeVisible({ timeout: 10000 })
  30  |   })
  31  | 
  32  |   test('shows symbol selector', async ({ page }) => {
  33  |     await page.goto('/')
  34  |     
  35  |     // Symbol buttons or dropdown should be present
  36  |     const symbolSelector = page.locator('button, select').filter({ hasText: /BTC|ETH|SOL/i }).first()
  37  |     await expect(symbolSelector).toBeVisible({ timeout: 10000 })
  38  |   })
  39  | })
  40  | 
  41  | test.describe('Web UI — Navigation', () => {
  42  |   test('can switch tabs', async ({ page }) => {
  43  |     await page.goto('/')
  44  |     
  45  |     // Find tab-like elements in header or nav
  46  |     const tabs = page.locator('[role="tab"], button[class*="tab"]').first()
  47  |     if (await tabs.isVisible({ timeout: 5000 }).catch(() => false)) {
  48  |       await tabs.click()
  49  |       // Page should not crash
  50  |       await expect(page.locator('body')).toBeVisible()
  51  |     }
  52  |   })
  53  | 
  54  |   test('can toggle sidebar', async ({ page }) => {
  55  |     await page.goto('/')
  56  |     
  57  |     // Just verify the page is still functional after load
  58  |     await expect(page.locator('body')).toBeVisible()
  59  |   })
  60  | })
  61  | 
  62  | test.describe('Web UI — Order Form', () => {
  63  |   test('order form is visible', async ({ page }) => {
  64  |     await page.goto('/')
  65  |     
  66  |     // Order form should have buy/sell buttons or quantity input
  67  |     const orderForm = page.locator('input[type="number"], button').filter({ hasText: /buy|sell|long|short/i }).first()
  68  |     await expect(orderForm).toBeVisible({ timeout: 10000 })
  69  |   })
  70  | 
  71  |   test('buy and sell buttons exist', async ({ page }) => {
  72  |     await page.goto('/')
  73  |     
  74  |     // Look for buy/long button
  75  |     const buyBtn = page.locator('button').filter({ hasText: /buy|long/i }).first()
  76  |     const sellBtn = page.locator('button').filter({ hasText: /sell|short/i }).first()
  77  |     
  78  |     // At least one should be visible
  79  |     const buyVisible = await buyBtn.isVisible({ timeout: 5000 }).catch(() => false)
  80  |     const sellVisible = await sellBtn.isVisible({ timeout: 5000 }).catch(() => false)
  81  |     expect(buyVisible || sellVisible).toBeTruthy()
  82  |   })
  83  | })
  84  | 
  85  | test.describe('Web UI — Signal Feed', () => {
  86  |   test('signal feed panel exists', async ({ page }) => {
  87  |     await page.goto('/')
  88  |     
  89  |     // Signal feed should be somewhere on the page
  90  |     const signalArea = page.locator('[class*="signal"], [class*="feed"]').first()
> 91  |     await expect(signalArea).toBeVisible({ timeout: 10000 })
      |                              ^ Error: expect(locator).toBeVisible() failed
  92  |   })
  93  | })
  94  | 
  95  | test.describe('Web UI — Responsive', () => {
  96  |   test('page renders on mobile viewport', async ({ page }) => {
  97  |     await page.setViewportSize({ width: 375, height: 667 })
  98  |     await page.goto('/')
  99  |     
  100 |     await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
  101 |     
  102 |     // No horizontal scroll
  103 |     const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  104 |     const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
  105 |     expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5) // 5px tolerance
  106 |   })
  107 | 
  108 |   test('page renders on tablet viewport', async ({ page }) => {
  109 |     await page.setViewportSize({ width: 768, height: 1024 })
  110 |     await page.goto('/')
  111 |     
  112 |     await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
  113 |   })
  114 | })
  115 | 
  116 | test.describe('Web UI — No Console Errors', () => {
  117 |   test('no critical console errors on load', async ({ page }) => {
  118 |     const errors = []
  119 |     page.on('console', (msg) => {
  120 |       if (msg.type() === 'error') {
  121 |         errors.push(msg.text())
  122 |       }
  123 |     })
  124 |     
  125 |     await page.goto('/')
  126 |     await page.waitForTimeout(3000)
  127 |     
  128 |     // Filter out expected errors (WebSocket connection failures in mock mode, etc.)
  129 |     const criticalErrors = errors.filter(e => 
  130 |       !e.includes('WebSocket') && 
  131 |       !e.includes('favicon') &&
  132 |       !e.includes('ERR_CONNECTION') &&
  133 |       !e.includes('network') &&
  134 |       !e.includes('React.jsx') &&
  135 |       !e.includes('Warning:')
  136 |     )
  137 |     
  138 |     expect(criticalErrors).toHaveLength(0)
  139 |   })
  140 | })
  141 | 
```