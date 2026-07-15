# Roadmap — Plan развития проекта

> **Обновлено:** 2026-07-16
> **Статус проекта:** C++20 HFT движок, Python AI (34+ стратегий), 191+ панелей, полный CI/CD

---

## Фаза 1: Production Hardening (1-2 недели)
**Цель: довести систему до production-ready состояния**

- [x] **Kubernetes Helm Chart** — деплой в k8s вместо docker-compose, autoscaling, rolling updates
- [x] **TimescaleDB integration** — хранение исторических данных вместо CSV, time-series оптимизация
- [x] **Distributed tracing** — Jaeger/Zipkin для трейсинга запросов через все 4 компонента
- [x] **Structured logging** — единый JSON логгинг (C++ spdlog есть, Python нужен structlog)
- [x] **Health checks v2** — liveness/readiness probes для k8s, глубокие проверки (WS, SHM, ордера)
- [x] **Secret management** — Vault или SOPS для API ключей вместо env vars

## Фаза 2: ML & AI Enhancement (2-3 недели)
**Цель: добавить deep learning и продвинутую ML-инференцию**

- [x] **ONNX Runtime в C++** — инференс ML моделей прямо в HFT боте, без Python round-trip
- [x] **LSTM/Transformer price prediction** — PyTorch модель для краткосрочного прогноза цен
- [x] **Reinforcement Learning trader** — PPO/DQN агент, обученный на симуляторе
- [x] **AutoML pipeline** — автоматический подбор гиперпараметров через Optuna
- [x] **Model registry** — версия моделей, A/B тестирование, rollback
- [x] **Feature store** — переиспользуемые фичи между стратегиями (Redis + Feast)

## Фаза 3: Advanced Trading Features (2-3 недели)
**Цель: расширить торговые возможности**

- [x] **Cross-exchange arbitrage engine** — реальное исполнение арбитража Binance/OKX/Bybit
- [x] **Portfolio optimizer** — Markowitz, Black-Litterman, risk parity с rebalancing
- [x] **VaR/CVaR stress testing** — Monte Carlo VaR, historical scenario replay (2008, COVID, FTX)
- [x] **Volatility surface modeling** — SVI/SABR модели для options pricing
- [x] **Strategy marketplace** — загрузка/шаринг стратегий в виде плагинов
- [x] **Market replay** — запись/воспроизведение сессии для бэктестинга

## Фаза 4: Platform & UX (2-3 недели)
**Цель: сделать платформу удобнее для пользователей**

- [x] **Strategy builder UI** — drag-and-drop конструктор стратегий из блоков
- [x] **Notifications hub** — alerts в Web UI при сигналах/ошибках
- [x] **Dark/light/auto theme** — auto-mode по системной теме

## Фаза 5: Performance & Scale (1-2 недели)
**Цель: выжать максимум из железа**

- [x] **Rust order executor** — альтернатива C++ с memory safety, comparable latency
- [x] **GPU acceleration** — CUDA/OpenCL для ML инференса и Monte Carlo
- [x] **DPDK / kernel bypass** — bypass TCP/IP для сетевого стека
- [x] **FPGA prototype** — исследование FPGA для order matching (образовательная цель)
- [x] **eBPF monitoring** — low-overhead профайлинг сетевого стека
- [x] **Memory-mapped persistence** — zero-copy логирование ордеров
- [x] **Hot-path optimization (10 rounds, 34 optimizations)** — Wilder's smoothing precomputed complement, single-pass OBI, transparent hash, unordered_set lookups, orjson everywhere, asyncio.gather, deque, dict/set O(1) lookups. 23 walkthrough examples in PERFORMANCE.md.

## Фаза 6: Research & Education (ongoing)
**Цель: усилить образовательную ценность проекта**

- [x] **Interactive tutorials** — встроенные туториалы с пошаговым обучением
- [x] **Strategy backtesting competitions** — leaderboard, автоматическая оценка
- [x] **Genetic algorithm strategy discovery** — автоматическая эволюция стратегий
- [x] **Market microstructure lab** — инструменты для исследования микроструктуры
- [x] **Brinson-Fachler performance attribution** — разложение P&L по факторам
- [x] **Options Greeks hedging simulator** — delta-neutral, gamma scalping
- [x] **Educational content** — статьи/видео по каждому компоненту системы

---

## Приоритеты

| Приоритет | Задача | Фаза | Почему |
|-----------|--------|------|--------|
| 🔴 High | TimescaleDB | 1 | CSV файлы — бутылочное горлышко |
| 🔴 High | ONNX в C++ | 2 | Убрать Python round-trip для ML |
| 🔴 High | Helm chart | 1 | Production деплой |
| 🟡 Medium | LSTM/Transformer | 2 | ML апгрейд |
| 🟡 Medium | VaR/CVaR | 3 | Risk management |
| 🟡 Medium | Mobile app | 4 | UX |
| 🟢 Low | FPGA/DPU | 5 | Исследование |
| 🟢 Low | Strategy marketplace | 3 | Сообщество |

---

## Что уже сделано (completed)

- ✅ C++20 Signal Engine V2 + V3 (HMM regime detection)
- ✅ Smart Order Router V2 (5 стратегий)
- ✅ Adaptive Order Selector V2
- ✅ Pressure Model (toxicity, microprice)
- ✅ FIX 4.4 Protocol
- ✅ SHM IPC (Python ↔ C++)
- ✅ 34+ AI стратегий (8-stage pipeline)
- ✅ LLM Engine (GPT + rule-based fallback)
- ✅ 191+ web UI панелей
- ✅ TypeScript migration (hooks + utils)
- ✅ i18n RU/EN
- ✅ Bandit + CodeQL security scans
- ✅ Automated GitHub Releases
- ✅ Staging environment (docker-compose.staging.yml)
- ✅ OpenAPI/Swagger WS documentation
- ✅ Architecture diagrams
- ✅ Coverage badges (Codecov)
- ✅ Options Strategy P&L Simulator
- ✅ Custom indicator plugin system
- ✅ Shareable backtest links
- ✅ Binance testnet integration
- ✅ Telegram/Discord bot
- ✅ Funding rate arbitrage detector
- ✅ Nightly walk-forward backtest CI
- ✅ Load testing (10k+ msg/sec)
- ✅ Chaos testing (reconnect verification)
- ✅ 10 rounds of hot-path optimizations (34 optimizations, 23 walkthrough examples)
- ✅ Future optimization ideas documented (SIMD, io_uring, thread pinning, SPSC ring buffer, JIT)
