---
description: Master orchestration workflow — 100 role-based prompts for AI as a quant trading company. Each prompt = 1 specialist. AI picks the right role for each task. Canonical source: .cascade/prompts.md
---

# Orchestration — 100 Roles for HFT Trading System

> **Канонический источник: `.cascade/prompts.md` (972 строки)**
> Этот файл — воркфлоу оркестрации. AI выбирает нужную роль из 100 промптов под каждую задачу.
> Каждый промпт = 1 специалист в квант-трейдинг компании. 20 отделов. Один большой IT-офис.

---

## ⚠️ АБСОЛЮТНЫЕ ПРАВИЛА (ДЛЯ ВСЕХ 100 РОЛЕЙ)

### СТАТИЧЕСКИЙ АНАЛИЗ — ТЕРМИНАЛ ЗАПРЕЩЁН (КРОМЕ GIT)

**ЗАПРЕЩЕНО:** pytest, python, npm, docker, curl, make, cmake, cargo, cat, grep, find, ls, ruff, mypy, flake8, uvicorn, node, pip install
**РАЗРЕШЕНО:** read_file, grep_search, find_by_name, code_search, list_dir, edit, multi_edit, write_to_file, run_command (ТОЛЬКО git)

### КАЧЕСТВО КОДА — НЕТ AI SLOP

- **Функция ≤ 40 строк** — если больше, разбей
- **Файл ≤ 500 строк** — если больше, раздели
- **Cyclomatic complexity ≤ 10** на функцию
- **0 дублирования** — copy-paste = преступление
- **Type hints ВСЕГДА** (Python 3.12+) — без `Any` без обоснования
- **0 `print()` в production** — только logging
- **0 bare `except Exception`** — конкретные исключения
- **0 `global` mutable state** — передавай через параметры
- **0 `from x import *`** — явные импорты
- **0 hardcoded magic numbers** — константы с именем
- **0 функций без docstring** — что делает, параметры, returns
- **Имена ≤ 40 символов, говорящие** — `calc_weighted_avg` не `cwa`
- **One function = one responsibility** — SRP
- **No dead code** — если не используется, удали или пометь TODO
- **No commented-out code** — git помнит всё

**C++ ДОПОЛНЕНИЯ:** RAII, unique_ptr/shared_ptr, string_view/span, [[nodiscard]], noexcept, 0 C-style casts, 0 macro constants, 0 goto

**RUST ДОПОЛНЕНИЯ:** 0 unsafe без обоснования, Result<T,E> для fallible, Cow<T> для zero-copy, Clippy clean

### ПЛАНИРОВАНИЕ ПЕРЕД КОДОМ — 10 ВОПРОСОВ

1. **Что я делаю?** 2. **Зачем?** 3. **Как?** 4. **Где?** 5. **Зависимости?**
6. **Тесты?** 7. **Документация?** 8. **Риски?** 9. **Альтернативы?** 10. **Over-engineering?**

**ТОЛЬКО ПОСЛЕ ОТВЕТОВ — ПИШИ КОД.**

### ТЕСТИРОВАНИЕ

- **Каждая новая функция = новый тест**
- **Edge cases:** нули, None/nullptr, пустые списки, отрицательные, overflow, NaN, inf
- **Имена тестов:** `test_<function>_<scenario>_<expected>`
- **AAA:** Arrange, Act, Assert
- **0 flaky tests** — детерминированные, без sleep/random без seed

### ДОКУМЕНТАЦИЯ

- `CHANGELOG.md` — после каждого изменения
- `.cascade/progress.md` — прогресс
- `.cascade/bug_log.md` — баги
- `.cascade/file_tracker.md` — файлы
- `.cascade/notes.md` — контекст
- `docs/ARCHITECTURE.md` — если архитектура изменена
- `docs/MATH_MODELS.md` — если модель добавлена/изменена

### КОММИТ

```powershell
git add -A; git commit -m "<type>: <description>"; git push
```

**Типы:** fix, feat, perf, test, docs, refactor, security, quantum, broker, hft, ml, math, chore, style
**После КАЖДОГО изменения. Без исключений. Без разрешения.**

---

## ОРГАНИЗАЦИОННАЯ СТРУКТУРА — 20 ОТДЕЛОВ, 100 РОЛЕЙ

### 🏢 Отдел 1: Executive (01-05)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 01 | CEO | `tasks/01-ceo.md` | Стратегия, видение, финальные решения |
| 02 | CTO | `tasks/02-cto.md` | Архитектура, технологии, tech stack |
| 03 | Principal Engineer | `tasks/03-principal-engineer.md` | Качество, anti-AI-slop, code review |
| 04 | VP Engineering | `tasks/04-vp-engineering.md` | Спринты, приоритеты, ресурсы |
| 05 | Product Manager | `tasks/05-product-manager.md` | Roadmap, user stories, фичи |

### 📊 Отдел 2: Quant Research (06-13)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 06 | Quant Researcher | `tasks/06-quant-researcher.md` | Новые модели, стратегии |
| 07 | Quant Developer | `tasks/07-quant-developer.md` | Реализация моделей в коде |
| 08 | ML Researcher | `tasks/08-ml-researcher.md` | ML модели, обучение |
| 09 | ML Engineer | `tasks/09-ml-engineer.md` | ML pipeline, inference |
| 10 | Data Scientist | `tasks/10-data-scientist.md` | Фичи, анализ данных |
| 11 | Statistics | `tasks/11-statistics.md` | HMM, GARCH, Bayesian |
| 12 | Mathematics | `tasks/12-mathematics.md` | Stochastic, topology |
| 13 | Innovation | `tasks/13-innovation.md` | Quantum, FPGA, new tech |

### 📈 Отдел 3: Trading Systems (14-20)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 14 | Trading Engineer | `tasks/14-trading-engineer.md` | Ордера, smart router |
| 15 | HFT Engineer | `tasks/15-hft-engineer.md` | Low-latency C++ |
| 16 | Risk Manager | `tasks/16-risk-manager.md` | VaR, Kelly, stress |
| 17 | Portfolio Manager | `tasks/17-portfolio-manager.md` | Markowitz, BL |
| 18 | Options | `tasks/18-options.md` | Greeks, pricing |
| 19 | Microstructure | `tasks/19-microstructure.md` | Order book, VPIN |
| 20 | Execution | `tasks/20-execution.md` | TWAP, VWAP, IS |

### 🏗 Отдел 4: Infrastructure (21-26)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 21 | DevOps | `tasks/21-devops.md` | CI/CD, Docker |
| 22 | SRE | `tasks/22-sre.md` | Мониторинг, алерты |
| 23 | Security | `tasks/23-security.md` | Аудит, уязвимости |
| 24 | Performance | `tasks/24-performance.md` | Оптимизация |
| 25 | Database | `tasks/25-database.md` | Схема, запросы |
| 26 | Integration | `tasks/26-integration.md` | Компоненты, IPC |

### ✅ Отдел 5: Quality (27-32)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 27 | QA | `tasks/27-qa.md` | Test plans, edge cases |
| 28 | Test Automation | `tasks/28-test-automation.md` | Автотесты |
| 29 | Code Reviewer | `tasks/29-code-reviewer.md` | Ревью кода |
| 30 | Static Analyst | `tasks/30-static-analyst.md` | Паттерны проблем |
| 31 | Bug Hunter | `tasks/31-bug-hunter.md` | Поиск багов |
| 32 | Bug Fixer | `tasks/32-bug-fixer.md` | Фикс с root cause |

### 🎨 Отдел 6: Frontend (33-36)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 33 | Frontend | `tasks/33-frontend.md` | React разработка |
| 34 | UI/UX | `tasks/34-ui-ux.md` | Accessibility, design |
| 35 | Data Viz | `tasks/35-data-viz.md` | Графики, дашборды |
| 36 | PWA | `tasks/36-pwa.md` | Offline, service workers |

### ⚙️ Отдел 7: Backend (37-40)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 37 | Backend | `tasks/37-backend.md` | API, WebSocket |
| 38 | API Designer | `tasks/38-api-designer.md` | Контракты, документация |
| 39 | Python Dev | `tasks/39-python-dev.md` | Python паттерны |
| 40 | C++ Dev | `tasks/40-cpp-dev.md` | C++20, memory safety |

### 📝 Отдел 8: Documentation (41-44)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 41 | Tech Writer | `tasks/41-tech-writer.md` | Документация |
| 42 | Arch Doc | `tasks/42-arch-doc.md` | Архитектурная док |
| 43 | Audit | `tasks/43-audit.md` | Документация vs код |
| 44 | Changelog | `tasks/44-changelog.md` | CHANGELOG management |

### 🚀 Отдел 9: Planning & Future (45-50)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 45 | Tech Planner | `tasks/45-tech-planner.md` | Roadmap до 100% |
| 46 | Competitive | `tasks/46-competitive.md` | Сравнение с конкурентами |
| 47 | Refactoring | `tasks/47-refactoring.md` | Cleanup, code smells |
| 48 | Migration | `tasks/48-migration.md` | Порты, UI→trading |
| 49 | Tech Debt | `tasks/49-tech-debt.md` | Приоритизация долга |
| 50 | Expansion | `tasks/50-expansion.md` | Расширение |

### 🏛 Отдел 10: Executive+ (51-54)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 51 | CRO | `tasks/51-cro.md` | Риск-стратегия |
| 52 | CDO | `tasks/52-cdo.md` | Стратегия данных |
| 53 | Engineering Manager | `tasks/53-eng-manager.md` | Координация |
| 54 | Release Manager | `tasks/54-release-manager.md` | Релизы |

### 🎓 Отдел 11: Senior/Principal (55-58)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 55 | Distinguished Engineer | `tasks/55-distinguished-engineer.md` | Сложнейшие проблемы |
| 56 | Staff Engineer | `tasks/56-staff-engineer.md` | Cross-cutting concerns |
| 57 | Head of Research | `tasks/57-head-of-research.md` | Research roadmap |
| 58 | Lead Trader | `tasks/58-lead-trader.md` | Торговые стратегии |

### 📐 Отдел 12: Advanced Mathematics (59-66)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 59 | PhD Mathematician | `tasks/59-phd-mathematician.md` | Stochastic calculus |
| 60 | Numerical Analyst | `tasks/60-numerical-analyst.md` | Finite differences, MC |
| 61 | Optimization | `tasks/61-optimization.md` | Convex/non-convex |
| 62 | Probability Theory | `tasks/62-probability.md` | Martingales |
| 63 | Game Theory | `tasks/63-game-theory.md` | Auctions |
| 64 | Information Theory | `tasks/64-information-theory.md` | Entropy, KL |
| 65 | Topology/Geometry | `tasks/65-topology-geometry.md` | Persistent homology |
| 66 | Differential Equations | `tasks/66-differential-equations.md` | ODE/PDE/SDE |

### 💹 Отдел 13: Advanced Trading (67-72)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 67 | Market Maker | `tasks/67-market-maker.md` | MM стратегии |
| 68 | Arbitrage | `tasks/68-arbitrage.md` | Cross-exchange |
| 69 | StatArb Researcher | `tasks/69-statarb-researcher.md` | Cointegration |
| 70 | Latency Arbitrage | `tasks/70-latency-arbitrage.md` | Microsecond |
| 71 | Volatility Trader | `tasks/71-volatility-trader.md` | Vol arbitrage |
| 72 | Event-Driven | `tasks/72-event-driven.md` | News, on-chain |

### 🧠 Отдел 14: Advanced ML/AI (73-77)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 73 | Deep Learning | `tasks/73-deep-learning.md` | CNN, Transformer |
| 74 | Reinforcement Learning | `tasks/74-reinforcement-learning.md` | PPO, SAC, DQN |
| 75 | NLP/Sentiment | `tasks/75-nlp-sentiment.md` | FinBERT |
| 76 | Time Series | `tasks/76-time-series.md` | ARIMA, GARCH |
| 77 | MLOps | `tasks/77-mlops.md` | Versioning, drift |

### 🗄 Отдел 15: Data Engineering (78-81)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 78 | Data Engineer | `tasks/78-data-engineer.md` | Pipelines, ETL |
| 79 | Data Architect | `tasks/79-data-architect.md` | Schema |
| 80 | Real-time Data | `tasks/80-realtime-data.md` | Streaming |
| 81 | Feature Store | `tasks/81-feature-store.md` | Features |

### 🖥 Отдел 16: Advanced Infrastructure (82-86)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 82 | Network Engineer | `tasks/82-network-engineer.md` | TCP, kernel bypass |
| 83 | Hardware Engineer | `tasks/83-hardware-engineer.md` | FPGA, CUDA |
| 84 | Systems Programmer | `tasks/84-systems-programmer.md` | Kernel, drivers |
| 85 | Cloud Architect | `tasks/85-cloud-architect.md` | K8s, multi-region |
| 86 | Capacity Planner | `tasks/86-capacity-planner.md` | Scaling |

### 🛡 Отдел 17: Advanced Quality (87-90)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 87 | Chaos Engineer | `tasks/87-chaos-engineer.md` | Fault injection |
| 88 | Perf Testing | `tasks/88-perf-testing.md` | Benchmarks |
| 89 | Security Testing | `tasks/89-security-testing.md` | Pentest |
| 90 | Property Testing | `tasks/90-property-testing.md` | Hypothesis |

### ⚡ Отдел 18: Advanced Backend (91-94)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 91 | Distributed Systems | `tasks/91-distributed-systems.md` | Consensus |
| 92 | Concurrent Programming | `tasks/92-concurrent-programming.md` | Lock-free |
| 93 | Caching | `tasks/93-caching.md` | Redis, LRU |
| 94 | Microservices | `tasks/94-microservices.md` | Decomposition |

### 🔬 Отдел 19: Research & Innovation (95-98)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 95 | R&D Lead | `tasks/95-rd-lead.md` | Pipeline |
| 96 | Academic Liaison | `tasks/96-academic-liaison.md` | Papers |
| 97 | Tech Scout | `tasks/97-tech-scout.md` | New tech |
| 98 | Prototype Engineer | `tasks/98-prototype-engineer.md` | Rapid PoC |

### 📋 Отдел 20: Business/Product (99-100)

| # | Роль | Файл | Зона ответственности |
|---|------|------|----------------------|
| 99 | UX Researcher | `tasks/99-ux-researcher.md` | Usability |
| 100 | Compliance Officer | `tasks/100-compliance.md` | Regulatory |

---

## КАК ИСПОЛЬЗОВАТЬ

### Для пользователя

1. **Вставь суперпромпт** — скопируй быстрый старт из `.cascade/prompts.md`
2. **AI сам определит роль** — по ключевым словам задачи
3. **AI прочитает task-промпт** — `.cascade/tasks/NN-name.md`
4. **AI выполнит и делегирует** — с правилами, тестами, коммитом

### Для AI (само-оркестрация)

**ПРИ ПОЛУЧЕНИИ ЗАДАЧИ — АЛГОРИТМ ИЗ 5 ШАГОВ:**

1. **Прочитай контекст** — notes.md, progress.md, bug_log.md, file_tracker.md
2. **Определи тип задачи** — по ключевым словам (см. таблицу в prompts.md)
3. **Прочитай промпт роли** — `.cascade/tasks/NN-name.md` ЦЕЛИКОМ
4. **Выполни задачу** — 10 вопросов → код → тесты → docs → коммит
5. **Делегируй** — если нужно, передай следующей роли

### Мульти-роль сценарии — 20 сценариев

Полный список 20 сценариев командной работы — см. `.cascade/prompts.md` → раздел "МУЛЬТИ-РОЛЬ СЦЕНАРИИ".

Ключевые сценарии:
- **Баги:** Bug Hunter (31) → Bug Fixer (32) → Reviewer (29) → QA (27) → Writer (41)
- **Новая модель:** Quant (06) → Dev (07) → QA (27) → Writer (41) → Audit (43)
- **Performance:** Perf (24) → HFT (15) → Reviewer (29) → Writer (41)
- **ML в prod:** ML (08) → DL (73) → MLOps (77) → Feature (81) → QA (27)
- **Distributed:** CTO (02) → Dist (91) → Conc (92) → Micro (94) → SRE (22) → Chaos (87)
- **Compliance:** Comp (100) → Sec (23) → Audit (43) → Writer (41) → Changelog (44)
- **R&D:** R&D (95) → Academic (96) → Prototype (98) → Dev (07) → QA (27)
- **Security audit:** Sec (23) → Sec Test (89) → Fixer (32) → Comp (100) → Writer (41)
- **Release:** Release Mgr (54) → QA (27) → DevOps (21) → SRE (22) → Changelog (44)
- **Full audit:** CEO (01) → CTO (02) → Principal (03) → Static (30) → Debt (49) → Audit (43) → Writer (41)

---

## ПРИНЦИПЫ ОРКЕСТРАЦИИ — 20 ПРАВИЛ

1. **Одна задача = одна роль** — не смешивай
2. **Планирование раньше кода** — всегда 10 вопросов
3. **Качество раньше скорости** — нет AI slop
4. **Тесты раньше релиза** — всегда
5. **Документация раньше коммита** — всегда
6. **Коммит после каждого изменения** — всегда, без разрешения
7. **Честность в документации** — не ври
8. **Future-thinking** — что легко поддерживать
9. **Principal engineer не должен плакать** — код чистый
10. **Каждая роль знает свои границы** — не лезь в чужую область
11. **Минимальный diff** — меняй только что нужно
12. **Root cause, не симптом** — фикси причину
13. **No over-engineering** — простейшее решение
14. **No new dependencies** — без необходимости
15. **No breaking changes** — API совместимость
16. **Делегируй, не делай сам** — передай нужной роли
17. **Читай перед тем как писать** — изучи existing код
18. **Один коммит = одна логика** — не мешай изменения
19. **Проверяй после изменения** — read_file после edit
20. **Командная работа** — роли последовательно, каждая передаёт результат

---

## ДЕЛЕГИРОВАНИЕ — КТО КОМУ ПЕРЕДАЁТ

| От роли | К роли | Что передаёт |
|---------|--------|--------------|
| CEO (01) | CTO (02) | Стратегию → архитектуру |
| CTO (02) | VP Eng (04) | Архитектуру → спринты |
| PM (05) | VP Eng (04) | User stories → планирование |
| VP Eng (04) | Backend (37) / Frontend (33) | Задачи → реализация |
| Quant Researcher (06) | Quant Dev (07) | Модель → код |
| ML Research (08) | ML Engineer (09) | Модель → pipeline |
| Разработчик | QA (27) | Код → тесты |
| Bug Hunter (31) | Bug Fixer (32) | Баги → исправления |
| Bug Fixer (32) | Code Reviewer (29) | Фикс → ревью |
| Code Reviewer (29) | Tech Writer (41) | Изменения → docs |
| R&D Lead (95) | Prototype (98) | Идея → PoC |
| Prototype (98) | Quant Dev (07) | PoC → production |
| Academic (96) | R&D Lead (95) | Papers → pipeline |
| Tech Scout (97) | CTO (02) | Tech radar → решение |
| Performance (24) | HFT (15) | Bottleneck → оптимизация |
| Security (23) | Bug Fixer (32) | Уязвимости → фиксы |
| Compliance (100) | Security (23) | Регуляторы → безопасность |
| CRO (51) | Risk Manager (16) | Стратегия → расчёты |
| CDO (52) | Data Engineer (78) | Стратегия → pipeline |
| Release Mgr (54) | DevOps (21) | Релиз → деплой |

Полная таблица делегирования (30 связей) — см. `.cascade/prompts.md`.

---

## БУДУЩЕЕ ПРОЕКТА — НАПРАВЛЕНИЯ РАСШИРЕНИЯ

### Trading & Quant
- Quantum models: QAOA, VQE, Quantum Monte Carlo, Quantum Neural Networks
- Advanced ML: Deep RL, Transformer for time series, GNN for market structure
- Alternative data: sentiment, on-chain, satellite, social media
- Market making 2.0: adversarial RL, multi-agent
- Cross-asset arbitrage: crypto ↔ traditional finance
- Optimal execution: RL-based, adaptive

### Infrastructure
- Real broker integration: Binance, Bybit, OKX WebSocket APIs
- Hardware acceleration: FPGA, CUDA revival, ASIC
- Co-location: low-latency hosting, direct market access
- Tick data: real market data feeds, historical tick storage
- Time sync: PTP, GPS, hardware timestamping

### Platform
- Web UI 2.0: real-time 3D visualizations, VR trading floor
- Mobile app: React Native, push notifications
- API platform: REST + WebSocket for external clients
- Backtesting 2.0: walk-forward, Monte Carlo, regime-aware
- Risk system: real-time VaR, stress testing, scenario analysis

### Research
- Market microstructure: Kyle's Lambda, VPIN, order flow imbalance
- Volatility: rough volatility, jump-diffusion, stochastic vol models
- Machine learning: online learning, concept drift adaptation
- Network theory: market correlation networks, systemic risk
- Information theory: transfer entropy, mutual information
- Topological data analysis: persistent homology for market regimes

---

*100 ролей. 20 отделов. Один большой IT-офис квант-трейдинг компании. Канонический источник: .cascade/prompts.md. Каждый — специалист. Каждый — с правилами. Никакого AI slop. Principal engineer спит спокойно.*
