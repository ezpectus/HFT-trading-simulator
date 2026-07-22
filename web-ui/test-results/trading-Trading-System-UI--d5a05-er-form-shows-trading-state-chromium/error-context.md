# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: trading.spec.js >> Trading System UI — Trading Flows >> order form shows trading state
- Location: e2e\trading.spec.js:61:3

# Error details

```
Error: expect(received).toMatch(expected)

Expected pattern: /Submit|Not connected|Trading Stopped/i
Received string:  "BUY 0.01 BTC/USDT"
```

# Page snapshot

```yaml
- application "HFT Trading System Dashboard" [ref=e2]:
  - generic [ref=e3]:
    - alert [ref=e4]:
      - img [ref=e5]
      - generic [ref=e7]: DEMO MODE
      - generic [ref=e8]: — Using simulated market data. No live connection required.
      - button "Dismiss demo mode banner" [ref=e9] [cursor=pointer]:
        - img [ref=e10]
    - generic [ref=e14]:
      - button [ref=e15] [cursor=pointer]:
        - img [ref=e16]
      - generic [ref=e19]:
        - img [ref=e21]
        - heading "Welcome to Trading Sim" [level=2] [ref=e23]
      - paragraph [ref=e24]: A full-featured HFT trading simulator with 3 exchanges, 3 symbols, live AI signals, and real-time order execution. Includes 191+ analytic panels and 75+ mathematical models.
      - generic [ref=e31]:
        - button "Skip tutorial" [ref=e32] [cursor=pointer]
        - button "Next" [ref=e34] [cursor=pointer]:
          - text: Next
          - img [ref=e35]
    - region "Notifications" [ref=e37]:
      - button "Clear all notifications" [ref=e38] [cursor=pointer]:
        - img [ref=e39]
        - text: Clear all
      - alert [ref=e42]:
        - img [ref=e43]
        - generic [ref=e46]: Exchange Simulator connected
        - button "Dismiss notification" [ref=e47] [cursor=pointer]:
          - img [ref=e48]
      - alert [ref=e53]:
        - img [ref=e54]
        - generic [ref=e57]: AI Signal Bot connected
        - button "Dismiss notification" [ref=e58] [cursor=pointer]:
          - img [ref=e59]
    - banner [ref=e64]:
      - link "Skip to main content" [ref=e65] [cursor=pointer]:
        - /url: "#main-content"
      - generic [ref=e66]:
        - generic "HFT Trading System" [ref=e67]:
          - img [ref=e68]
          - generic [ref=e70]: Trading Sim
        - group "Exchange selector" [ref=e71]:
          - button "Select binance exchange" [pressed] [ref=e72] [cursor=pointer]: binance
          - button "Select bybit exchange" [ref=e73] [cursor=pointer]: bybit
          - button "Select okx exchange" [ref=e74] [cursor=pointer]: okx
        - group "Symbol selector" [ref=e76]:
          - button "Select BTC/USDT" [pressed] [ref=e77] [cursor=pointer]: BTC
          - button "Select ETH/USDT" [ref=e78] [cursor=pointer]: ETH
          - button "Select SOL/USDT" [ref=e79] [cursor=pointer]: SOL
        - group "Timeframe selector" [ref=e80]:
          - button "5m" [pressed] [ref=e81] [cursor=pointer]
          - button "15m" [ref=e82] [cursor=pointer]
          - button "1h" [ref=e83] [cursor=pointer]
          - button "4h" [ref=e84] [cursor=pointer]
        - 'generic "Current price: $0.00, up 0.00 percent" [ref=e85]':
          - generic [ref=e86]: $0.00
          - generic [ref=e87]:
            - img [ref=e88]
            - text: +0.00%
        - group "Simulation speed" [ref=e91]:
          - button "Set speed to Pause" [ref=e92] [cursor=pointer]:
            - img [ref=e93]
            - text: Pause
          - button "Set speed to 1x" [pressed] [ref=e96] [cursor=pointer]:
            - img [ref=e97]
            - text: 1x
          - button "Set speed to 2x" [ref=e99] [cursor=pointer]:
            - img [ref=e100]
            - text: 2x
          - button "Set speed to 5x" [ref=e103] [cursor=pointer]:
            - img [ref=e104]
            - text: 5x
        - button "Stop trading" [pressed] [ref=e107] [cursor=pointer]:
          - img [ref=e108]
          - text: TRADING
        - button "Turn sound off" [pressed] [ref=e110] [cursor=pointer]:
          - img [ref=e111]
        - button "Switch to light theme" [ref=e115] [cursor=pointer]:
          - img [ref=e116]
        - status [ref=e122]:
          - generic "Exchange connected" [ref=e123]:
            - img [ref=e124]
            - generic [ref=e128]: Exchange
          - generic "AI Signals connected" [ref=e130]:
            - img [ref=e131]
            - generic [ref=e135]: AI Signals
      - generic [ref=e137]:
        - generic [ref=e139]: binance
        - generic [ref=e141]: bybit
        - generic [ref=e143]: okx
    - main [ref=e144]:
      - generic [ref=e145]:
        - generic [ref=e146]:
          - button "Detach to separate window" [ref=e147] [cursor=pointer]:
            - img [ref=e148]
          - generic [ref=e153]:
            - generic [ref=e154]:
              - img [ref=e155]
              - generic [ref=e159]: BTC/USDT
              - generic [ref=e160]: · 0 candles
              - button "Markers" [ref=e161] [cursor=pointer]:
                - img [ref=e162]
                - text: Markers
              - generic [ref=e165]:
                - img [ref=e166]
                - button "EMA 9" [ref=e168] [cursor=pointer]:
                  - img [ref=e169]
                  - text: EMA 9
                - button "EMA 21" [ref=e172] [cursor=pointer]:
                  - img [ref=e173]
                  - text: EMA 21
                - button "EMA 50" [ref=e176] [cursor=pointer]:
                  - img [ref=e177]
                  - text: EMA 50
                - button "Bollinger" [ref=e182] [cursor=pointer]:
                  - img [ref=e183]
                  - text: Bollinger
                - button "VWAP" [ref=e188] [cursor=pointer]:
                  - img [ref=e189]
                  - text: VWAP
                - button "RSI 14" [ref=e194] [cursor=pointer]:
                  - img [ref=e195]
                  - text: RSI 14
            - table [ref=e202]:
              - row [ref=e203]:
                - cell
                - cell [ref=e204]:
                  - link "Charting by TradingView" [ref=e208] [cursor=pointer]:
                    - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=localhost/
                    - img [ref=e209]
                - cell [ref=e213]
              - row [ref=e217]:
                - cell
                - cell [ref=e218]
                - cell [ref=e222]
        - generic [ref=e226]:
          - generic [ref=e227]:
            - img [ref=e228]
            - generic [ref=e232]: Place Order
            - generic [ref=e233]: binance · BTC/USDT
          - generic [ref=e234]:
            - generic [ref=e235]:
              - button "BUY / LONG" [ref=e236] [cursor=pointer]
              - button "SELL / SHORT" [ref=e237] [cursor=pointer]
            - generic [ref=e238]:
              - button "MARKET" [ref=e239] [cursor=pointer]
              - button "LIMIT" [ref=e240] [cursor=pointer]
            - generic [ref=e241]:
              - text: Quantity
              - spinbutton [ref=e242]: "0.01"
              - generic [ref=e243]:
                - button "25%" [ref=e244] [cursor=pointer]
                - button "50%" [ref=e245] [cursor=pointer]
                - button "75%" [ref=e246] [cursor=pointer]
                - button "100%" [ref=e247] [cursor=pointer]
            - generic [ref=e248]:
              - generic [ref=e249]: "Notional: $0.00"
              - generic [ref=e250]:
                - generic [ref=e251]: "Fee (0.04%):"
                - generic [ref=e252]: $0.0000
              - generic [ref=e253]:
                - generic [ref=e254]: "Slippage (2bps):"
                - generic [ref=e255]: $0.0000
              - generic [ref=e256]:
                - generic [ref=e257]: "Total cost:"
                - generic [ref=e258]: $0.0000
            - generic [ref=e259]:
              - generic [ref=e260]:
                - text: Stop Loss
                - spinbutton [ref=e261]
              - generic [ref=e262]:
                - text: Take Profit
                - spinbutton [ref=e263]
            - generic [ref=e264]:
              - generic [ref=e265]:
                - text: "Leverage:"
                - generic [ref=e266]: 10x
              - slider [ref=e267]: "10"
            - button "Show Risk Calculator" [ref=e268] [cursor=pointer]:
              - img [ref=e269]
              - text: Show Risk Calculator
            - button "BUY 0.01 BTC/USDT" [ref=e271] [cursor=pointer]
      - generic [ref=e272]:
        - button "Collapse sidebar" [ref=e273] [cursor=pointer]:
          - img [ref=e274]
        - generic [ref=e278]:
          - button "Detach to separate window" [ref=e279] [cursor=pointer]:
            - img [ref=e280]
          - generic [ref=e284]:
            - generic [ref=e285]:
              - img [ref=e286]
              - generic [ref=e289]: Order Book
              - button "Toggle depth heatmap" [ref=e290] [cursor=pointer]:
                - img [ref=e291]
              - generic [ref=e293]: 0.0 bps
            - generic [ref=e294]:
              - generic [ref=e295]:
                - generic [ref=e296]:
                  - img [ref=e297]
                  - text: Depth Imbalance
                - generic [ref=e299]: 0.0% BAL
              - generic [ref=e301]:
                - generic [ref=e302]: "0.00"
                - generic [ref=e303]: "0.00"
            - generic [ref=e304]:
              - generic [ref=e305]: Cumulative Depth Profile
              - generic "Cumulative depth profile chart" [ref=e306]
            - generic [ref=e308]:
              - generic [ref=e309]: Price
              - generic [ref=e310]: Size
              - generic [ref=e311]: Total
            - generic [ref=e312]:
              - generic [ref=e313]: $0.00
              - generic [ref=e314]: spread $0.00
        - generic [ref=e315]:
          - generic [ref=e316]:
            - generic [ref=e317]: 197/197 panels
            - button "Panels" [ref=e318] [cursor=pointer]:
              - img [ref=e319]
              - text: Panels
          - generic [ref=e322]:
            - button "Order Flow 12" [expanded] [ref=e323] [cursor=pointer]:
              - img [ref=e324]
              - generic [ref=e326]: Order Flow
              - generic [ref=e327]: "12"
            - tabpanel [ref=e328]:
              - generic [ref=e330]:
                - img [ref=e331]
                - text: Depth Chart…
              - generic [ref=e338]:
                - img [ref=e339]
                - text: Order Flow Imbalance…
              - generic [ref=e346]:
                - img [ref=e347]
                - text: Spoofing Detector…
              - generic [ref=e354]:
                - img [ref=e355]
                - text: Order Book Heatmap…
              - generic [ref=e362]:
                - img [ref=e363]
                - text: Liquidity Heatmap…
              - generic [ref=e370]:
                - img [ref=e371]
                - text: Execution Timeline…
              - generic [ref=e378]:
                - img [ref=e379]
                - text: Trade Replay…
              - generic [ref=e386]:
                - img [ref=e387]
                - text: Order Flow Tape…
              - generic [ref=e394]:
                - img [ref=e395]
                - text: Cumulative Volume Delta…
              - generic [ref=e402]:
                - img [ref=e403]
                - text: Dark Order Flow…
              - generic [ref=e410]:
                - img [ref=e411]
                - text: Order Flow Heatmap…
              - generic [ref=e418]:
                - img [ref=e419]
                - text: Market Depth Replay…
          - generic [ref=e425]:
            - button "Technical Analysis 47" [expanded] [ref=e426] [cursor=pointer]:
              - img [ref=e427]
              - generic [ref=e429]: Technical Analysis
              - generic [ref=e430]: "47"
            - tabpanel [ref=e431]:
              - generic [ref=e433]:
                - img [ref=e434]
                - text: Volume Profile…
              - generic [ref=e441]:
                - img [ref=e442]
                - text: Market Profile (TPO)…
              - generic [ref=e449]:
                - img [ref=e450]
                - text: Market Regime…
              - generic [ref=e457]:
                - img [ref=e458]
                - text: Fibonacci Levels…
              - generic [ref=e465]:
                - img [ref=e466]
                - text: Fair Value Gaps…
              - generic [ref=e473]:
                - img [ref=e474]
                - text: Pattern Scanner…
              - generic [ref=e481]:
                - img [ref=e482]
                - text: Candle Pattern Detector…
              - generic [ref=e489]:
                - img [ref=e490]
                - text: Support / Resistance…
              - generic [ref=e497]:
                - img [ref=e498]
                - text: Custom Indicator Builder…
              - generic [ref=e505]:
                - img [ref=e506]
                - text: Indicator Formula Parser…
              - generic [ref=e513]:
                - img [ref=e514]
                - text: On-Balance Volume (OBV)…
              - generic [ref=e521]:
                - img [ref=e522]
                - text: Money Flow Index (MFI)…
              - generic [ref=e529]:
                - img [ref=e530]
                - text: Williams %R…
              - generic [ref=e537]:
                - img [ref=e538]
                - text: Ichimoku Cloud…
              - generic [ref=e545]:
                - img [ref=e546]
                - text: Renko Chart…
              - generic [ref=e553]:
                - img [ref=e554]
                - text: Stochastic Oscillator…
              - generic [ref=e561]:
                - img [ref=e562]
                - text: Average True Range (ATR)…
              - generic [ref=e569]:
                - img [ref=e570]
                - text: Parabolic SAR…
              - generic [ref=e577]:
                - img [ref=e578]
                - text: ADX / DI (Trend Strength)…
              - generic [ref=e585]:
                - img [ref=e586]
                - text: Commodity Channel Index…
              - generic [ref=e593]:
                - img [ref=e594]
                - text: Awesome Oscillator…
              - generic [ref=e601]:
                - img [ref=e602]
                - text: Volume-Weighted MACD…
              - generic [ref=e609]:
                - img [ref=e610]
                - text: Heikin-Ashi Candles…
              - generic [ref=e617]:
                - img [ref=e618]
                - text: Multi-Timeframe Analysis…
              - generic [ref=e625]:
                - img [ref=e626]
                - text: Point & Figure Chart…
              - generic [ref=e633]:
                - img [ref=e634]
                - text: Kagi Chart…
              - generic [ref=e641]:
                - img [ref=e642]
                - text: Three-Line Break…
              - generic [ref=e649]:
                - img [ref=e650]
                - text: Order Block Detection…
              - generic [ref=e657]:
                - img [ref=e658]
                - text: Session Volume Profile…
              - generic [ref=e665]:
                - img [ref=e666]
                - text: Volatility Regime…
              - generic [ref=e673]:
                - img [ref=e674]
                - text: Tick Chart…
              - generic [ref=e681]:
                - img [ref=e682]
                - text: Volume Clock Chart…
              - generic [ref=e689]:
                - img [ref=e690]
                - text: Liquidation Map…
              - generic [ref=e697]:
                - img [ref=e698]
                - text: Funding Rate History…
              - generic [ref=e705]:
                - img [ref=e706]
                - text: Open Interest Tracker…
              - generic [ref=e713]:
                - img [ref=e714]
                - text: Cumulative Tick Index…
              - generic [ref=e721]:
                - img [ref=e722]
                - text: Inter-Exchange Spread…
              - generic [ref=e729]:
                - img [ref=e730]
                - text: Footprint Chart…
              - generic [ref=e737]:
                - img [ref=e738]
                - text: Regime Switching Detection…
              - generic [ref=e745]:
                - img [ref=e746]
                - text: Smart Money Concepts…
              - generic [ref=e753]:
                - img [ref=e754]
                - text: Liquidity Grab Detector…
              - generic [ref=e761]:
                - img [ref=e762]
                - text: Custom Indicator Plugin…
              - generic [ref=e769]:
                - img [ref=e770]
                - text: Volume Anomaly Detector…
              - generic [ref=e777]:
                - img [ref=e778]
                - text: Multi-Timeframe Confluence…
              - generic [ref=e785]:
                - img [ref=e786]
                - text: Session VWAP…
              - generic [ref=e793]:
                - img [ref=e794]
                - text: Price Action Score…
              - generic [ref=e801]:
                - img [ref=e802]
                - text: Cesaro/Fejer Kernel (Trend)…
          - generic [ref=e808]:
            - button "Risk & Analytics 94" [expanded] [ref=e809] [cursor=pointer]:
              - img [ref=e810]
              - generic [ref=e812]: Risk & Analytics
              - generic [ref=e813]: "94"
            - tabpanel [ref=e814]:
              - generic [ref=e816]:
                - img [ref=e817]
                - text: Session Stats…
              - generic [ref=e824]:
                - img [ref=e825]
                - text: PnL Heatmap Calendar…
              - generic [ref=e832]:
                - img [ref=e833]
                - text: Performance by Hour…
              - generic [ref=e840]:
                - img [ref=e841]
                - text: Trade Clustering…
              - generic [ref=e848]:
                - img [ref=e849]
                - text: Correlation Matrix…
              - generic [ref=e856]:
                - img [ref=e857]
                - text: Position Correlation…
              - generic [ref=e864]:
                - img [ref=e865]
                - text: Volatility Surface…
              - generic [ref=e872]:
                - img [ref=e873]
                - text: Drawdown Analysis…
              - generic [ref=e880]:
                - img [ref=e881]
                - text: Risk-Adjusted Returns…
              - generic [ref=e888]:
                - img [ref=e889]
                - text: Risk Dashboard (VaR/CVaR)…
              - generic [ref=e896]:
                - img [ref=e897]
                - text: PnL Attribution…
              - generic [ref=e904]:
                - img [ref=e905]
                - text: PnL Attribution Chart…
              - generic [ref=e912]:
                - img [ref=e913]
                - text: Monte Carlo Simulation…
              - generic [ref=e920]:
                - img [ref=e921]
                - text: Walk-Forward Analysis…
              - generic [ref=e928]:
                - img [ref=e929]
                - text: Sentiment Indicator…
              - generic [ref=e936]:
                - img [ref=e937]
                - text: Fear & Greed Index…
              - generic [ref=e944]:
                - img [ref=e945]
                - text: Delta Divergence Detector…
              - generic [ref=e952]:
                - img [ref=e953]
                - text: Risk of Ruin Calculator…
              - generic [ref=e960]:
                - img [ref=e961]
                - text: Expected Value Calculator…
              - generic [ref=e968]:
                - img [ref=e969]
                - text: Order Flow Absorption…
              - generic [ref=e976]:
                - img [ref=e977]
                - text: Composite Signal Dashboard…
              - generic [ref=e984]:
                - img [ref=e985]
                - text: Signal Confidence Scorer…
              - generic [ref=e992]:
                - img [ref=e993]
                - text: Regime Adaptive Strategy…
              - generic [ref=e1000]:
                - img [ref=e1001]
                - text: Cross-Market Divergence…
              - generic [ref=e1008]:
                - img [ref=e1009]
                - text: Performance Attribution…
              - generic [ref=e1016]:
                - img [ref=e1017]
                - text: Tick Speed Anomaly…
              - generic [ref=e1024]:
                - img [ref=e1025]
                - text: Put/Call Ratio (Sim)…
              - generic [ref=e1032]:
                - img [ref=e1033]
                - text: Signal Matrix Heatmap…
              - generic [ref=e1040]:
                - img [ref=e1041]
                - text: Slippage Simulator…
              - generic [ref=e1048]:
                - img [ref=e1049]
                - text: GARCH Volatility Forecaster…
              - generic [ref=e1056]:
                - img [ref=e1057]
                - text: Cointegration Scanner…
              - generic [ref=e1064]:
                - img [ref=e1065]
                - text: Markov Regime Predictor…
              - generic [ref=e1072]:
                - img [ref=e1073]
                - text: Hurst Exponent + Fractal Dim…
              - generic [ref=e1080]:
                - img [ref=e1081]
                - text: Kalman Filter Price…
              - generic [ref=e1088]:
                - img [ref=e1089]
                - text: Spectral Analysis (Welch PSD)…
              - generic [ref=e1096]:
                - img [ref=e1097]
                - text: Ehlers SuperSmoother (DSP)…
              - generic [ref=e1104]:
                - img [ref=e1105]
                - text: Bayesian Price Predictor…
              - generic [ref=e1112]:
                - img [ref=e1113]
                - text: Wavelet Decomposition (MRA)…
              - generic [ref=e1120]:
                - img [ref=e1121]
                - text: K-Means Market Clustering…
              - generic [ref=e1128]:
                - img [ref=e1129]
                - text: Copula Dependency Model…
              - generic [ref=e1136]:
                - img [ref=e1137]
                - text: Hidden Markov Model…
              - generic [ref=e1144]:
                - img [ref=e1145]
                - text: Principal Component Analysis…
              - generic [ref=e1152]:
                - img [ref=e1153]
                - text: Isolation Forest Anomaly…
              - generic [ref=e1160]:
                - img [ref=e1161]
                - text: Variational Mode Decomp…
              - generic [ref=e1168]:
                - img [ref=e1169]
                - text: Empirical Mode Decomp (HHT)…
              - generic [ref=e1176]:
                - img [ref=e1177]
                - text: SVM Signal Classifier…
              - generic [ref=e1184]:
                - img [ref=e1185]
                - text: Hawkes Process (Trade Clustering)…
              - generic [ref=e1192]:
                - img [ref=e1193]
                - text: Dynamic Time Warping…
              - generic [ref=e1200]:
                - img [ref=e1201]
                - text: LSTM Neural Network…
              - generic [ref=e1208]:
                - img [ref=e1209]
                - text: Gaussian Process Regression…
              - generic [ref=e1216]:
                - img [ref=e1217]
                - text: Markov-Switching GARCH…
              - generic [ref=e1224]:
                - img [ref=e1225]
                - text: Empirical Dynamic Modeling…
              - generic [ref=e1232]:
                - img [ref=e1233]
                - text: Autoencoder Anomaly…
              - generic [ref=e1240]:
                - img [ref=e1241]
                - text: Optimal Transport (Wasserstein)…
              - generic [ref=e1248]:
                - img [ref=e1249]
                - text: Rough Volatility (rBergomi)…
              - generic [ref=e1256]:
                - img [ref=e1257]
                - text: Transfer Entropy (Causality)…
              - generic [ref=e1264]:
                - img [ref=e1265]
                - text: Non-Stationary Spectral (STFT+CWT)…
              - generic [ref=e1272]:
                - img [ref=e1273]
                - text: Bayesian Structural Time Series…
              - generic [ref=e1280]:
                - img [ref=e1281]
                - text: Topological Data Analysis…
              - generic [ref=e1288]:
                - img [ref=e1289]
                - text: Stochastic Differential Equations…
              - generic [ref=e1296]:
                - img [ref=e1297]
                - text: Gaussian Mixture Model (EM)…
              - generic [ref=e1304]:
                - img [ref=e1305]
                - text: Wavelet Packet Decomposition…
              - generic [ref=e1312]:
                - img [ref=e1313]
                - text: Information Bottleneck…
              - generic [ref=e1320]:
                - img [ref=e1321]
                - text: Affine Arithmetic (Uncertainty)…
              - generic [ref=e1328]:
                - img [ref=e1329]
                - text: Renormalization Group (Multi-Scale)…
              - generic [ref=e1336]:
                - img [ref=e1337]
                - text: Free Energy Principle (Active Inference)…
              - generic [ref=e1344]:
                - img [ref=e1345]
                - text: Compressed Sensing (Sparse Recovery)…
              - generic [ref=e1352]:
                - img [ref=e1353]
                - text: Malliavin Calculus (Greeks)…
              - generic [ref=e1360]:
                - img [ref=e1361]
                - text: Hamiltonian Monte Carlo (Bayesian)…
              - generic [ref=e1368]:
                - img [ref=e1369]
                - text: RKHS (Kernel Methods)…
              - generic [ref=e1376]:
                - img [ref=e1377]
                - text: Variational Autoencoder (VAE)…
              - generic [ref=e1384]:
                - img [ref=e1385]
                - text: Schrödinger Bridge (Entropy OT)…
              - generic [ref=e1392]:
                - img [ref=e1393]
                - text: Lie Group Symmetries…
              - generic [ref=e1400]:
                - img [ref=e1401]
                - text: Kolmogorov-Sinai Entropy (Chaos)…
              - generic [ref=e1408]:
                - img [ref=e1409]
                - text: Persistent Homology Landscape…
              - generic [ref=e1416]:
                - img [ref=e1417]
                - text: Fokker-Planck Equation (Density)…
              - generic [ref=e1424]:
                - img [ref=e1425]
                - text: Hopf Bifurcation (Cycles)…
              - generic [ref=e1432]:
                - img [ref=e1433]
                - text: Cramér-Rao Lower Bound…
              - generic [ref=e1440]:
                - img [ref=e1441]
                - text: Koopman Operator Theory (EDMD)…
              - generic [ref=e1448]:
                - img [ref=e1449]
                - text: Stochastic Optimal Control (HJB)…
              - generic [ref=e1456]:
                - img [ref=e1457]
                - text: Rényi Entropy Dynamics…
              - generic [ref=e1464]:
                - img [ref=e1465]
                - text: Burgers Equation (Shock Formation)…
              - generic [ref=e1472]:
                - img [ref=e1473]
                - text: Sobolev Space Regularization…
              - generic [ref=e1480]:
                - img [ref=e1481]
                - text: Ito Calculus Generator…
              - generic [ref=e1488]:
                - img [ref=e1489]
                - text: Girsanov Theorem (Measure Change)…
              - generic [ref=e1496]:
                - img [ref=e1497]
                - text: Stone-Cech Compactification…
              - generic [ref=e1504]:
                - img [ref=e1505]
                - text: Malliavin-Stein Sensitivity…
              - generic [ref=e1512]:
                - img [ref=e1513]
                - text: Prokhorov Metric (Weak Conv.)…
              - generic [ref=e1520]:
                - img [ref=e1521]
                - text: Radon-Nikodym Derivative…
              - generic [ref=e1528]:
                - img [ref=e1529]
                - text: Hahn Decomposition (Signal/Noise)…
              - generic [ref=e1536]:
                - img [ref=e1537]
                - text: Cameron-Martin Formula…
              - generic [ref=e1544]:
                - img [ref=e1545]
                - text: Arzela-Ascoli (Equicontinuity)…
              - generic [ref=e1552]:
                - img [ref=e1553]
                - text: Riesz Representation…
              - generic [ref=e1560]:
                - img [ref=e1561]
                - text: Lax-Milgram (Variational PDE)…
          - generic [ref=e1567]:
            - button "Portfolio & Optimization 26" [expanded] [ref=e1568] [cursor=pointer]:
              - img [ref=e1569]
              - generic [ref=e1571]: Portfolio & Optimization
              - generic [ref=e1572]: "26"
            - tabpanel [ref=e1573]:
              - generic [ref=e1575]:
                - img [ref=e1576]
                - text: Almgren-Chriss Execution…
              - generic [ref=e1583]:
                - img [ref=e1584]
                - text: Optimal Stopping (Snell)…
              - generic [ref=e1591]:
                - img [ref=e1592]
                - text: Black-Litterman Allocation…
              - generic [ref=e1599]:
                - img [ref=e1600]
                - text: Kelly Criterion Sizing…
              - generic [ref=e1607]:
                - img [ref=e1608]
                - text: Graph Theory Network…
              - generic [ref=e1615]:
                - img [ref=e1616]
                - text: Conditional VaR (Expected Shortfall)…
              - generic [ref=e1623]:
                - img [ref=e1624]
                - text: Random Matrix Theory…
              - generic [ref=e1631]:
                - img [ref=e1632]
                - text: Tensor Decomposition (CP/ALS)…
              - generic [ref=e1639]:
                - img [ref=e1640]
                - text: Wasserstein Barycenters (OT Mean)…
              - generic [ref=e1647]:
                - img [ref=e1648]
                - text: Pontryagin Maximum Principle…
              - generic [ref=e1655]:
                - img [ref=e1656]
                - text: Hedging Suggestions…
              - generic [ref=e1663]:
                - img [ref=e1664]
                - text: Risk Parity Calculator…
              - generic [ref=e1671]:
                - img [ref=e1672]
                - text: Portfolio Optimizer…
              - generic [ref=e1679]:
                - img [ref=e1680]
                - text: Auto-Rebalance…
              - generic [ref=e1687]:
                - img [ref=e1688]
                - text: Multi-Account View…
              - generic [ref=e1695]:
                - img [ref=e1696]
                - text: Smart Order Router…
              - generic [ref=e1703]:
                - img [ref=e1704]
                - text: Kelly Criterion…
              - generic [ref=e1711]:
                - img [ref=e1712]
                - text: Greeks Calculator…
              - generic [ref=e1719]:
                - img [ref=e1720]
                - text: Options Strategy P&L…
              - generic [ref=e1727]:
                - img [ref=e1728]
                - text: Multi-Leg Options…
              - generic [ref=e1735]:
                - img [ref=e1736]
                - text: Pair Trading Signals…
              - generic [ref=e1743]:
                - img [ref=e1744]
                - text: Whale Alert Monitor…
              - generic [ref=e1751]:
                - img [ref=e1752]
                - text: Position Size Optimizer…
              - generic [ref=e1759]:
                - img [ref=e1760]
                - text: Liquidation Cascade Simulator…
              - generic [ref=e1767]:
                - img [ref=e1768]
                - text: Trailing Stop Calculator…
              - generic [ref=e1775]:
                - img [ref=e1776]
                - text: Correlation Heatmap…
          - generic [ref=e1782]:
            - button "Strategy & Automation 11" [expanded] [ref=e1783] [cursor=pointer]:
              - img [ref=e1784]
              - generic [ref=e1786]: Strategy & Automation
              - generic [ref=e1787]: "11"
            - tabpanel [ref=e1788]:
              - generic [ref=e1790]:
                - img [ref=e1791]
                - text: Banach Fixed-Point Iteration…
              - generic [ref=e1798]:
                - img [ref=e1799]
                - text: Strategy Backtest Engine…
              - generic [ref=e1806]:
                - img [ref=e1807]
                - text: Backtest Comparison…
              - generic [ref=e1814]:
                - img [ref=e1815]
                - text: Execution Bot (TWAP/VWAP)…
              - generic [ref=e1822]:
                - img [ref=e1823]
                - text: Watchlist…
              - generic [ref=e1830]:
                - img [ref=e1831]
                - text: Strategy Builder…
              - generic [ref=e1838]:
                - img [ref=e1839]
                - text: Strategy Marketplace…
              - generic [ref=e1846]:
                - img [ref=e1847]
                - text: Strategy Competition…
              - generic [ref=e1854]:
                - img [ref=e1855]
                - text: Alert Webhooks…
              - generic [ref=e1862]:
                - img [ref=e1863]
                - text: Trade Journal…
              - generic [ref=e1870]:
                - img [ref=e1871]
                - text: MIT Order Simulator…
          - generic [ref=e1877]:
            - button "Export & Tools 4" [expanded] [ref=e1878] [cursor=pointer]:
              - img [ref=e1879]
              - generic [ref=e1881]: Export & Tools
              - generic [ref=e1882]: "4"
            - tabpanel [ref=e1883]:
              - generic [ref=e1885]:
                - img [ref=e1886]
                - text: Session Replay…
              - generic [ref=e1893]:
                - img [ref=e1894]
                - text: Session Report (PDF)…
              - generic [ref=e1901]:
                - img [ref=e1902]
                - text: Session Export (JSON)…
              - generic [ref=e1909]:
                - img [ref=e1910]
                - text: Trade Stats Export (CSV)…
          - generic [ref=e1916]:
            - button "Config & Session 3" [expanded] [ref=e1917] [cursor=pointer]:
              - img [ref=e1918]
              - generic [ref=e1920]: Config & Session
              - generic [ref=e1921]: "3"
            - tabpanel [ref=e1922]:
              - generic [ref=e1924]:
                - img [ref=e1925]
                - text: Price Alerts…
              - generic [ref=e1932]:
                - img [ref=e1933]
                - text: Replay Controls…
              - generic [ref=e1940]:
                - img [ref=e1941]
                - text: Simulator Config…
        - generic:
          - tablist "Trading panels" [ref=e1947]:
            - button "Account" [pressed] [ref=e1948] [cursor=pointer]:
              - img [ref=e1949]
              - text: Account
            - button "Bots" [ref=e1951] [cursor=pointer]:
              - img [ref=e1952]
              - text: Bots
            - button "Signals" [ref=e1955] [cursor=pointer]:
              - img [ref=e1956]
              - text: Signals
            - button "Arb" [ref=e1962] [cursor=pointer]:
              - img [ref=e1963]
              - text: Arb
            - button "Prices" [ref=e1966] [cursor=pointer]:
              - img [ref=e1967]
              - text: Prices
            - button "Fills" [ref=e1970] [cursor=pointer]:
              - img [ref=e1971]
              - text: Fills
            - button "History" [ref=e1973] [cursor=pointer]:
              - img [ref=e1974]
              - text: History
            - button "Perf" [ref=e1978] [cursor=pointer]:
              - img [ref=e1979]
              - text: Perf
            - button "BT" [ref=e1981] [cursor=pointer]:
              - img [ref=e1982]
              - text: BT
          - generic:
            - generic [ref=e1984]:
              - generic [ref=e1985]:
                - generic [ref=e1986]:
                  - img [ref=e1987]
                  - text: Exchange Leaderboard
                  - button "PnL" [ref=e1993] [cursor=pointer]:
                    - img [ref=e1994]
                    - text: PnL
                - generic [ref=e1997]:
                  - generic [ref=e1998]:
                    - generic [ref=e1999]: "1"
                    - generic [ref=e2000]: binance
                    - generic [ref=e2001]: 0t
                    - generic [ref=e2002]: +0%w
                    - generic [ref=e2003]: +$0.00
                  - generic [ref=e2004]:
                    - generic [ref=e2005]: "2"
                    - generic [ref=e2006]: bybit
                    - generic [ref=e2007]: 0t
                    - generic [ref=e2008]: +0%w
                    - generic [ref=e2009]: +$0.00
                  - generic [ref=e2010]:
                    - generic [ref=e2011]: "3"
                    - generic [ref=e2012]: okx
                    - generic [ref=e2013]: 0t
                    - generic [ref=e2014]: +0%w
                    - generic [ref=e2015]: +$0.00
              - generic [ref=e2016]:
                - generic [ref=e2017]:
                  - generic [ref=e2018]: binance
                  - generic [ref=e2019]:
                    - generic [ref=e2020]:
                      - img [ref=e2021]
                      - text: "--"
                    - generic [ref=e2024]: "-- win"
                - generic [ref=e2025]:
                  - generic [ref=e2026]:
                    - generic [ref=e2027]: Balance
                    - generic [ref=e2028]: $10,000.00
                  - generic [ref=e2029]:
                    - generic [ref=e2030]: Equity
                    - generic [ref=e2031]: $10,034.25
                  - generic [ref=e2032]:
                    - generic [ref=e2033]: Total PnL
                    - generic [ref=e2034]: "--"
                  - generic [ref=e2035]:
                    - generic [ref=e2036]: Fees
                    - generic [ref=e2037]: "--"
                  - generic [ref=e2039]: Trades
                  - generic [ref=e2040]:
                    - generic [ref=e2041]: Positions
                    - generic [ref=e2042]: "0"
              - generic [ref=e2043]:
                - generic [ref=e2044]:
                  - generic [ref=e2045]: bybit
                  - generic [ref=e2046]:
                    - generic [ref=e2047]:
                      - img [ref=e2048]
                      - text: "--"
                    - generic [ref=e2051]: "-- win"
                - generic [ref=e2052]:
                  - generic [ref=e2053]:
                    - generic [ref=e2054]: Balance
                    - generic [ref=e2055]: $10,000.00
                  - generic [ref=e2056]:
                    - generic [ref=e2057]: Equity
                    - generic [ref=e2058]: $9,967.92
                  - generic [ref=e2059]:
                    - generic [ref=e2060]: Total PnL
                    - generic [ref=e2061]: "--"
                  - generic [ref=e2062]:
                    - generic [ref=e2063]: Fees
                    - generic [ref=e2064]: "--"
                  - generic [ref=e2066]: Trades
                  - generic [ref=e2067]:
                    - generic [ref=e2068]: Positions
                    - generic [ref=e2069]: "0"
              - generic [ref=e2070]:
                - generic [ref=e2071]:
                  - generic [ref=e2072]: okx
                  - generic [ref=e2073]:
                    - generic [ref=e2074]:
                      - img [ref=e2075]
                      - text: "--"
                    - generic [ref=e2078]: "-- win"
                - generic [ref=e2079]:
                  - generic [ref=e2080]:
                    - generic [ref=e2081]: Balance
                    - generic [ref=e2082]: $10,000.00
                  - generic [ref=e2083]:
                    - generic [ref=e2084]: Equity
                    - generic [ref=e2085]: $9,989.47
                  - generic [ref=e2086]:
                    - generic [ref=e2087]: Total PnL
                    - generic [ref=e2088]: "--"
                  - generic [ref=e2089]:
                    - generic [ref=e2090]: Fees
                    - generic [ref=e2091]: "--"
                  - generic [ref=e2093]: Trades
                  - generic [ref=e2094]:
                    - generic [ref=e2095]: Positions
                    - generic [ref=e2096]: "0"
            - generic [ref=e2097]:
              - img [ref=e2098]
              - paragraph [ref=e2102]: No open positions
              - paragraph [ref=e2103]: Active positions will appear here when orders are filled
    - contentinfo "System status bar" [ref=e2104]:
      - 'generic "Simulation time: 05:39:33" [ref=e2105]':
        - img [ref=e2106]
        - generic [ref=e2109]: 05:39:33
      - generic "0 candles generated" [ref=e2111]:
        - img [ref=e2112]
        - generic [ref=e2116]: 0 candles
      - 'generic "Selected market: binance BTC/USDT" [ref=e2118]':
        - generic [ref=e2119]: binance
        - generic [ref=e2120]: ·
        - generic [ref=e2121]: BTC/USDT
      - generic [ref=e2122]:
        - generic [ref=e2123]:
          - img [ref=e2124]
          - generic [ref=e2127]: "AI: 10 sigs"
        - generic [ref=e2128]:
          - img [ref=e2129]
          - generic [ref=e2131]: 0 fills
      - generic [ref=e2133]:
        - generic [ref=e2134]: "Pos: 0"
        - generic [ref=e2135]: "Trades: 0"
        - generic [ref=e2136]:
          - text: "Balance:"
          - generic [ref=e2137]: $30000
        - 'generic "binance: $25.82 (0 pos) bybit: $-9.80 (0 pos) okx: $-17.52 (0 pos)" [ref=e2138]':
          - img [ref=e2139]
          - generic [ref=e2141]: "-1.51"
      - generic [ref=e2143]:
        - 'generic "Connection quality: EXCELLENT" [ref=e2144]': EXCELLENT
        - generic [ref=e2145]:
          - img [ref=e2146]
          - generic [ref=e2150]: EX
          - generic [ref=e2151]: 0ms
        - generic [ref=e2152]:
          - img [ref=e2153]
          - generic [ref=e2157]: AI
          - generic [ref=e2158]: 0ms
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('Trading System UI — Trading Flows', () => {
  4  |   test('can switch exchanges via keyboard shortcuts', async ({ page }) => {
  5  |     await page.goto('/')
  6  |     // Press '2' to switch to bybit
  7  |     await page.keyboard.press('2')
  8  |     // Wait a moment for state update
  9  |     await page.waitForTimeout(200)
  10 |     // The exchange should be updated in the header
  11 |     const bybitButton = page.getByText('bybit', { exact: false }).first()
  12 |     await expect(bybitButton).toBeVisible()
  13 |   })
  14 | 
  15 |   test('can switch symbols via keyboard shortcuts', async ({ page }) => {
  16 |     await page.goto('/')
  17 |     // Press 'w' to switch to ETH/USDT
  18 |     await page.keyboard.press('w')
  19 |     await page.waitForTimeout(200)
  20 |     // ETH/USDT should be visible somewhere in the header
  21 |     await expect(page.getByText('ETH/USDT').first()).toBeVisible()
  22 |   })
  23 | 
  24 |   test('can switch tabs via keyboard shortcuts', async ({ page }) => {
  25 |     await page.goto('/')
  26 |     // Press 's' for signals tab
  27 |     await page.keyboard.press('s')
  28 |     await page.waitForTimeout(200)
  29 |     // The signals tab should be active
  30 |     const signalsTab = page.getByRole('tab', { name: /Signals/i })
  31 |     await expect(signalsTab).toHaveAttribute('aria-pressed', 'true')
  32 |   })
  33 | 
  34 |   test('can toggle sidebar with Shift+\\', async ({ page }) => {
  35 |     await page.goto('/')
  36 |     // Press Shift+\ to collapse sidebar
  37 |     await page.keyboard.press('Shift+\\')
  38 |     await page.waitForTimeout(300)
  39 |     // An expand button should appear
  40 |     const expandButton = page.getByRole('button', { name: /Expand sidebar/i })
  41 |     await expect(expandButton).toBeVisible()
  42 |     // Click to expand again
  43 |     await expandButton.click()
  44 |     await page.waitForTimeout(200)
  45 |     // Collapse button should reappear
  46 |     const collapseButton = page.getByRole('button', { name: /Collapse sidebar/i })
  47 |     await expect(collapseButton).toBeVisible()
  48 |   })
  49 | 
  50 |   test('can navigate through all tabs', async ({ page }) => {
  51 |     await page.goto('/')
  52 |     const tabs = ['Account', 'Bots', 'Signals', 'Arb', 'Fills', 'History', 'Perf', 'BT']
  53 |     for (const tabName of tabs) {
  54 |       const tab = page.getByRole('tab', { name: new RegExp(tabName, 'i') })
  55 |       await tab.click()
  56 |       await page.waitForTimeout(100)
  57 |       await expect(tab).toHaveAttribute('aria-pressed', 'true')
  58 |     }
  59 |   })
  60 | 
  61 |   test('order form shows trading state', async ({ page }) => {
  62 |     await page.goto('/')
  63 |     // The order form should be visible
  64 |     const orderForm = page.locator('.bg-bg-800').filter({ has: page.locator('input[type="number"]') }).first()
  65 |     await expect(orderForm).toBeVisible()
  66 |     // Should have a submit button
  67 |     const submitButton = orderForm.locator('button').last()
  68 |     await expect(submitButton).toBeVisible()
  69 |     // Button text should be either "Submit Order", "Not connected", or "Trading Stopped"
  70 |     const buttonText = await submitButton.textContent()
> 71 |     expect(buttonText).toMatch(/Submit|Not connected|Trading Stopped/i)
     |                        ^ Error: expect(received).toMatch(expected)
  72 |   })
  73 | 
  74 |   test('mock mode banner shows when in mock mode', async ({ page }) => {
  75 |     await page.goto('/')
  76 |     // In mock mode, the banner should be visible
  77 |     // In real mode, it won't be — this test just checks the page loads
  78 |     await expect(page.locator('header')).toBeVisible()
  79 |   })
  80 | 
  81 |   test('panel settings toggle works', async ({ page }) => {
  82 |     await page.goto('/')
  83 |     // Find the Panels settings button
  84 |     const panelsButton = page.getByText('Panels').first()
  85 |     await panelsButton.click()
  86 |     await page.waitForTimeout(200)
  87 |     // The toggle panel settings should appear
  88 |     await expect(page.getByText('Toggle Panels').first()).toBeVisible()
  89 |   })
  90 | })
  91 | 
```