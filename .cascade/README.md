# Cascade Workspace — HFT Trading System

Эта папка — рабочее пространство Cascade AI для проекта HFT Trading System.

## Структура

```
.cascade/
├── README.md              — этот файл
├── prompts.md             — готовые промпты для копирования в сессию
├── tasks/                 — 100 role-based промптов (1 промпт = 1 специалист)
│   ├── 01-ceo.md                — CEO: стратегия, видение
│   ├── 02-cto.md                — CTO: архитектура, технологии
│   ├── 03-principal-engineer.md — Principal Eng: качество, anti-AI-slop
│   ├── 04-vp-engineering.md     — VP Eng: спринты, приоритеты
│   ├── 05-product-manager.md    — PM: roadmap, user stories
│   ├── 06-quant-researcher.md   — Quant Research: новые модели
│   ├── 07-quant-developer.md    — Quant Dev: реализация моделей
│   ├── 08-ml-researcher.md      — ML Research: ML модели
│   ├── 09-ml-engineer.md        — ML Eng: pipeline, inference
│   ├── 10-data-scientist.md     — Data Sci: фичи, анализ
│   ├── 11-statistics.md         — Stats: HMM, GARCH, Bayesian
│   ├── 12-mathematics.md        — Math: stochastic, topology
│   ├── 13-innovation.md         — Innovation: quantum, FPGA
│   ├── 14-trading-engineer.md   — Trading: ордера, smart router
│   ├── 15-hft-engineer.md       — HFT: low-latency C++
│   ├── 16-risk-manager.md       — Risk: VaR, Kelly, stress
│   ├── 17-portfolio-manager.md  — Portfolio: Markowitz, BL
│   ├── 18-options.md            — Options: Greeks, pricing
│   ├── 19-microstructure.md     — Microstructure: order book, VPIN
│   ├── 20-execution.md          — Execution: TWAP, VWAP, IS
│   ├── 21-devops.md             — DevOps: CI/CD, Docker
│   ├── 22-sre.md                — SRE: мониторинг, алерты
│   ├── 23-security.md           — Security: аудит, уязвимости
│   ├── 24-performance.md        — Performance: оптимизация
│   ├── 25-database.md           — Database: схема, запросы
│   ├── 26-integration.md        — Integration: компоненты, IPC
│   ├── 27-qa.md                 — QA: test plans, edge cases
│   ├── 28-test-automation.md    — Test Auto: автотесты
│   ├── 29-code-reviewer.md      — Code Review: ревью кода
│   ├── 30-static-analyst.md     — Static Analysis: паттерны
│   ├── 31-bug-hunter.md         — Bug Hunter: поиск багов
│   ├── 32-bug-fixer.md          — Bug Fixer: фикс с root cause
│   ├── 33-frontend.md           — Frontend: React разработка
│   ├── 34-ui-ux.md              — UI/UX: accessibility, design
│   ├── 35-data-viz.md           — Data Viz: графики, дашборды
│   ├── 36-pwa.md                — PWA: offline, service workers
│   ├── 37-backend.md            — Backend: API, WebSocket
│   ├── 38-api-designer.md       — API Design: контракты
│   ├── 39-python-dev.md         — Python: паттерны, best practices
│   ├── 40-cpp-dev.md            — C++: memory safety, C++20
│   ├── 41-tech-writer.md        — Tech Writer: документация
│   ├── 42-arch-doc.md           — Arch Doc: архитектурная док
│   ├── 43-audit.md              — Audit: документация vs код
│   ├── 44-changelog.md          — Changelog: CHANGELOG management
│   ├── 45-tech-planner.md       — Tech Planner: roadmap до 100%
│   ├── 46-competitive.md        — Competitive: сравнение с конкурентами
│   ├── 47-refactoring.md        — Refactoring: cleanup, code smells
│   ├── 48-migration.md          — Migration: порты, UI→trading
│   ├── 49-tech-debt.md          — Tech Debt: приоритизация долга
│   └── 50-expansion.md          — Expansion: расширение во всех направлениях
│   ├── 51-cro.md                — CRO: риск-стратегия
│   ├── 52-cdo.md                — CDO: стратегия данных
│   ├── 53-eng-manager.md        — Eng Manager: координация
│   ├── 54-release-manager.md    — Release Manager: релизы
│   ├── 55-distinguished-engineer.md — Distinguished Eng: сложнейшие проблемы
│   ├── 56-staff-engineer.md     — Staff Eng: cross-cutting concerns
│   ├── 57-head-of-research.md   — Head of Research: research roadmap
│   ├── 58-lead-trader.md        — Lead Trader: торговые стратегии
│   ├── 59-phd-mathematician.md  — PhD Math: stochastic calculus
│   ├── 60-numerical-analyst.md  — Numerical: finite differences, MC
│   ├── 61-optimization.md       — Optimization: convex/non-convex
│   ├── 62-probability.md        — Probability: martingales
│   ├── 63-game-theory.md        — Game Theory: auctions
│   ├── 64-information-theory.md — Info Theory: entropy, KL
│   ├── 65-topology-geometry.md  — Topology: persistent homology
│   ├── 66-differential-equations.md — DiffEq: ODE/PDE/SDE
│   ├── 67-market-maker.md       — Market Maker: MM стратегии
│   ├── 68-arbitrage.md          — Arbitrage: cross-exchange
│   ├── 69-statarb-researcher.md — StatArb: cointegration
│   ├── 70-latency-arbitrage.md  — Latency Arb: microsecond
│   ├── 71-volatility-trader.md  — Vol Trader: vol arbitrage
│   ├── 72-event-driven.md       — Event-Driven: news, on-chain
│   ├── 73-deep-learning.md      — Deep Learning: CNN, Transformer
│   ├── 74-reinforcement-learning.md — RL: PPO, SAC, DQN
│   ├── 75-nlp-sentiment.md      — NLP: FinBERT, sentiment
│   ├── 76-time-series.md        — Time Series: ARIMA, GARCH
│   ├── 77-mlops.md              — MLOps: versioning, drift
│   ├── 78-data-engineer.md      — Data Eng: pipelines, ETL
│   ├── 79-data-architect.md     — Data Architect: schema
│   ├── 80-realtime-data.md      — Real-time Data: streaming
│   ├── 81-feature-store.md      — Feature Store: features
│   ├── 82-network-engineer.md   — Network: TCP, kernel bypass
│   ├── 83-hardware-engineer.md  — Hardware: FPGA, CUDA
│   ├── 84-systems-programmer.md — Systems: kernel, drivers
│   ├── 85-cloud-architect.md    — Cloud: K8s, multi-region
│   ├── 86-capacity-planner.md   — Capacity: scaling
│   ├── 87-chaos-engineer.md     — Chaos: fault injection
│   ├── 88-perf-testing.md       — Perf Testing: benchmarks
│   ├── 89-security-testing.md   — Security Testing: pentest
│   ├── 90-property-testing.md   — Property Testing: Hypothesis
│   ├── 91-distributed-systems.md — Distributed: consensus
│   ├── 92-concurrent-programming.md — Concurrent: lock-free
│   ├── 93-caching.md            — Caching: Redis, LRU
│   ├── 94-microservices.md      — Microservices: decomposition
│   ├── 95-rd-lead.md            — R&D Lead: pipeline
│   ├── 96-academic-liaison.md   — Academic: papers
│   ├── 97-tech-scout.md         — Tech Scout: new tech
│   ├── 98-prototype-engineer.md — Prototype: rapid PoC
│   ├── 99-ux-researcher.md      — UX Research: usability
│   └── 100-compliance.md        — Compliance: regulatory
├── workflows/             — воркфлоу для AI
│   ├── orchestration.md         — МАСТЕР-ОРКЕСТРАЦИЯ: 100 ролей, как выбирать
│   ├── ai-monster-workflow.md   — полный автономный workflow (закон)
│   ├── deep-scan.md             — промпт для глубокого сканирования кода
│   ├── project-analysis.md      — промпт для анализа структуры проекта
│   ├── update-docs.md           — промпт для обновления документации
│   └── fix-bugs.md              — workflow для фикса багов
├── progress.md            — журнал выполненных задач и коммитов
├── notes.md               — заметки, контекст, полезные ссылки
├── bug_log.md             — лог найденных багов
├── file_tracker.md        — трекер просмотренных файлов
└── proposals/             — предложения по улучшению
```

## Как использовать

### Для пользователя
1. **Выбери роль** — открой `workflows/orchestration.md`, найди нужного специалиста
2. **Открой промпт** — `tasks/NN-name.md`
3. **Скопируй в сессию** — вставь содержимое в начало чата
4. **AI работает** — как этот специалист, с правилами и чеклистами

### Для AI (само-оркестрация)
1. Прочитай `workflows/orchestration.md` — определи роль под задачу
2. Следуй правилам роли — каждый промпт = 1 специалист
3. Соблюдай абсолютные правила: статический анализ, качество, тесты, коммит

## Абсолютные правила (для всех ролей)

- **СТАТИЧЕСКИЙ АНАЛИЗ** — терминал запрещён (кроме git commit/push)
- **КАЧЕСТВО КОДА** — нет AI slop (функция ≤40 строк, 0 дублирования, type hints)
- **ПЛАНИРОВАНИЕ** — 10 вопросов прежде чем писать код
- **ТЕСТЫ** — каждая функция = тест
- **ДОКУМЕНТАЦИЯ** — CHANGELOG, progress, bug_log после каждого изменения
- **АВТОКОММИТ** — после КАЖДОГО изменения. Без исключений.
- **ЧЕСТНОСТЬ** — не врать в документации

## Воркфлоу файлы

| Файл | Назначение |
|------|------------|
| `orchestration.md` | **МАСТЕР**: 100 ролей, мульти-роль сценарии, направления расширения |
| `ai-monster-workflow.md` | Полный автономный workflow — закон для AI |
| `deep-scan.md` | Промпт: глубокий скан всего кода, 6 подходов, 20-50 багов |
| `project-analysis.md` | Промпт: анализ структуры проекта, пробелы, готовность |
| `update-docs.md` | Промпт: обновление документации, план до 100% |
| `fix-bugs.md` | Workflow: фикс багов из MASTER_DEVELOPMENT_PLAN.md |
