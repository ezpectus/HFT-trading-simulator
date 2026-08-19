# Cascade Workspace — HFT Trading System

Эта папка — рабочее пространство Cascade AI для проекта HFT Trading System.

## Структура

```
.cascade/
├── README.md              — этот файл
├── prompts.md             — готовые промпты для копирования в сессию
├── tasks/                 — 50 role-based промптов (1 промпт = 1 специалист)
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
├── workflows/             — воркфлоу для AI
│   ├── orchestration.md         — МАСТЕР-ОРКЕСТРАЦИЯ: 50 ролей, как выбирать
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
| `orchestration.md` | **МАСТЕР**: 50 ролей, мульти-роль сценарии, направления расширения |
| `ai-monster-workflow.md` | Полный автономный workflow — закон для AI |
| `deep-scan.md` | Промпт: глубокий скан всего кода, 6 подходов, 20-50 багов |
| `project-analysis.md` | Промпт: анализ структуры проекта, пробелы, готовность |
| `update-docs.md` | Промпт: обновление документации, план до 100% |
| `fix-bugs.md` | Workflow: фикс багов из MASTER_DEVELOPMENT_PLAN.md |
