---
description: Master orchestration workflow — 50 role-based prompts for AI as a quant trading company. Each prompt = 1 specialist. AI picks the right role for each task.
---

# Orchestration — 50 Roles for HFT Trading System

> Это главный воркфлоу оркестрации. AI выбирает нужную роль из 50 промптов под каждую задачу.
> Каждый промпт = 1 специалист в квант-трейдинг компании. Как Google, но для HFT.

---

## ⚠️ АБСОЛЮТНЫЕ ПРАВИЛА (ДЛЯ ВСЕХ РОЛЕЙ)

### СТАТИЧЕСКИЙ АНАЛИЗ — ТЕРМИНАЛ ЗАПРЕЩЁН (КРОМЕ GIT)

**ЗАПРЕЩЕНО:** pytest, python, npm, docker, curl, make, cmake, cargo, cat, grep, find, ls, ruff, mypy, flake8, uvicorn, node, pip install
**РАЗРЕШЕНО:** read_file, grep_search, find_by_name, code_search, list_dir, edit, multi_edit, write_to_file, run_command (ТОЛЬКО git)

### КАЧЕСТВО КОДА — НЕТ AI SLOP

- **Каждая функция ≤ 40 строк** — если больше, разбей
- **Каждый файл ≤ 500 строк** — если больше, раздели
- **Cyclomatic complexity ≤ 10** на функцию
- **0 дублирования** — copy-paste = преступление
- **Type hints ВСЕГДА** (Python) — без `Any` без обоснования
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

### ПЛАНИРОВАНИЕ ПЕРЕД КОДОМ

**ПРЕЖДЕ ЧЕМ ПИСАТЬ КОД — ОТВЕТЬ:**
1. **Что я делаю?** — одна функция, одна задача
2. **Зачем?** — какая проблема, какой user story
3. **Как?** — алгоритм в 3-5 шагов (псевдокод)
4. **Где?** — какой файл, какая функция
5. **Зависимости?** — что нужно прочитать сначала
6. **Тесты?** — какие тесты нужны, какие edge cases
7. **Документация?** — какие файлы обновить
8. **Риски?** — что может сломаться
9. **Альтернативы?** — можно ли проще
10. **Over-engineering?** — не усложняю ли

**ТОЛЬКО ПОСЛЕ ОТВЕТОВ — ПИШИ КОД.**

### ТЕСТИРОВАНИЕ

- **Каждая новая функция = новый тест**
- **Edge cases:** нули, None, пустые списки, отрицательные, overflow
- **Имена тестов:** `test_<function>_<scenario>_<expected>`
- **AAA:** Arrange, Act, Assert
- **Один тест = один assert** (в идеале)
- **No flaky tests** — детерминированные

### ДОКУМЕНТАЦИЯ

- **CHANGELOG.md** — после каждого изменения
- **MASTER_DEVELOPMENT_PLAN.md** — отметить выполненное
- **.cascade/progress.md** — прогресс
- **.cascade/bug_log.md** — баги
- **.cascade/file_tracker.md** — файлы
- **.cascade/notes.md** — контекст

### КОММИТ

```powershell
git add -A; git commit -m "<type>: <description>"; git push
```

**Типы:** fix, feat, perf, test, docs, refactor, security, quantum, broker, hft, ml, math, chore, style
**После КАЖДОГО изменения. Без исключений. Без разрешения.**

---

## ОРГАНИЗАЦИОННАЯ СТРУКТУРА — 50 РОЛЕЙ

### 🏢 Executive (5)

| # | Роль | Файл | Когда использовать |
|---|------|------|-------------------|
| 01 | CEO | `tasks/01-ceo.md` | Стратегическое направление, видение проекта |
| 02 | CTO | `tasks/02-cto.md` | Архитектурные решения, выбор технологий |
| 03 | Principal Engineer | `tasks/03-principal-engineer.md` | Ревью кода, качество, предотвращение AI slop |
| 04 | VP Engineering | `tasks/04-vp-engineering.md` | Планирование спринтов, приоритизация |
| 05 | Product Manager | `tasks/05-product-manager.md` | Roadmap, user stories, фичи |

### 📊 Quant Research (8)

| # | Роль | Файл | Когда использовать |
|---|------|------|-------------------|
| 06 | Quant Researcher | `tasks/06-quant-researcher.md` | Новые торговые модели, стратегии |
| 07 | Quant Developer | `tasks/07-quant-developer.md` | Реализация квант-моделей в коде |
| 08 | ML Researcher | `tasks/08-ml-researcher.md` | ML модели, обучение |
| 09 | ML Engineer | `tasks/09-ml-engineer.md` | ML pipeline, inference |
| 10 | Data Scientist | `tasks/10-data-scientist.md` | Анализ данных, фичи |
| 11 | Statistics Specialist | `tasks/11-statistics.md` | Статистические модели |
| 12 | Mathematics Specialist | `tasks/12-mathematics.md` | Математические модели |
| 13 | Innovation Researcher | `tasks/13-innovation.md` | Квантовые вычисления, новые технологии |

### 📈 Trading Systems (7)

| # | Роль | Файл | Когда использовать |
|---|------|------|-------------------|
| 14 | Trading Engineer | `tasks/14-trading-engineer.md` | Исполнение ордеров, smart router |
| 15 | HFT Engineer | `tasks/15-hft-engineer.md` | Low-latency C++ оптимизации |
| 16 | Risk Manager | `tasks/16-risk-manager.md` | Риск-модели, VaR, position sizing |
| 17 | Portfolio Manager | `tasks/17-portfolio-manager.md` | Оптимизация портфеля |
| 18 | Options Specialist | `tasks/18-options.md` | Опционы, Greeks, pricing |
| 19 | Microstructure Specialist | `tasks/19-microstructure.md` | Order book, spread analysis |
| 20 | Execution Strategist | `tasks/20-execution.md` | Алгоритмы исполнения (TWAP/VWAP) |

### 🏗 Infrastructure (6)

| # | Роль | Файл | Когда использовать |
|---|------|------|-------------------|
| 21 | DevOps Engineer | `tasks/21-devops.md` | CI/CD, Docker, deployment |
| 22 | SRE | `tasks/22-sre.md` | Мониторинг, алерты, надёжность |
| 23 | Security Engineer | `tasks/23-security.md` | Security аудит, уязвимости |
| 24 | Performance Engineer | `tasks/24-performance.md` | Профилирование, оптимизация |
| 25 | Database Engineer | `tasks/25-database.md` | Схема, запросы, миграции |
| 26 | Integration Engineer | `tasks/26-integration.md` | Интеграция компонентов |

### ✅ Quality (6)

| # | Роль | Файл | Когда использовать |
|---|------|------|-------------------|
| 27 | QA Engineer | `tasks/27-qa.md` | Дизайн тестов, test plans |
| 28 | Test Automation | `tasks/28-test-automation.md` | Автоматизированные тесты |
| 29 | Code Reviewer | `tasks/29-code-reviewer.md` | Ревью кода, качество |
| 30 | Static Analyst | `tasks/30-static-analyst.md` | Статический анализ кода |
| 31 | Bug Hunter | `tasks/31-bug-hunter.md` | Поиск багов |
| 32 | Bug Fixer | `tasks/32-bug-fixer.md` | Фикс багов с root cause |

### 🎨 Frontend (4)

| # | Роль | Файл | Когда использовать |
|---|------|------|-------------------|
| 33 | Frontend Engineer | `tasks/33-frontend.md` | React разработка |
| 34 | UI/UX Designer | `tasks/34-ui-ux.md` | UX, accessibility |
| 35 | Data Viz Engineer | `tasks/35-data-viz.md` | Графики, дашборды |
| 36 | PWA Specialist | `tasks/36-pwa.md` | PWA, offline, service workers |

### ⚙️ Backend (4)

| # | Роль | Файл | Когда использовать |
|---|------|------|-------------------|
| 37 | Backend Engineer | `tasks/37-backend.md` | API, WebSocket сервера |
| 38 | API Designer | `tasks/38-api-designer.md` | API контракты, документация |
| 39 | Python Developer | `tasks/39-python-dev.md` | Python паттерны, best practices |
| 40 | C++ Developer | `tasks/40-cpp-dev.md` | C++ паттерны, memory safety |

### 📝 Documentation (4)

| # | Роль | Файл | Когда использовать |
|---|------|------|-------------------|
| 41 | Technical Writer | `tasks/41-tech-writer.md` | Документация, точность |
| 42 | Architecture Doc | `tasks/42-arch-doc.md` | Архитектурная документация |
| 43 | Audit Specialist | `tasks/43-audit.md` | Документация vs код |
| 44 | Changelog Keeper | `tasks/44-changelog.md` | CHANGELOG management |

### 🚀 Planning & Future (6)

| # | Роль | Файл | Когда использовать |
|---|------|------|-------------------|
| 45 | Technical Planner | `tasks/45-tech-planner.md` | План развития, roadmap |
| 46 | Competitive Analyst | `tasks/46-competitive.md` | Сравнение с конкурентами |
| 47 | Refactoring Specialist | `tasks/47-refactoring.md` | Рефакторинг, cleanup |
| 48 | Migration Specialist | `tasks/48-migration.md` | Миграция кода, порты |
| 49 | Tech Debt Manager | `tasks/49-tech-debt.md` | Технический долг, приоритизация |
| 50 | Expansion Planner | `tasks/50-expansion.md` | Расширение во всех направлениях |

---

## КАК ИСПОЛЬЗОВАТЬ

### Для пользователя

1. **Выбери роль** — посмотри таблицу выше, выбери подходящего специалиста
2. **Открой файл** — `.cascade/tasks/NN-name.md`
3. **Скопируй промпт** — вставь в начало сессии
4. **AI работает** — как этот специалист, с правилами и чеклистами

### Для AI (само-оркестрация)

**ПРИ ПОЛУЧЕНИИ ЗАДАЧИ — ОПРЕДЕЛИ РОЛЬ:**

1. **Баг в коде?** → Bug Hunter (31) → Bug Fixer (32)
2. **Новая фича?** → Product Manager (05) → VP Eng (04) → соответствующий разработчик
3. **Архитектура?** → CTO (02) → Architecture Doc (42)
4. **Качество кода?** → Principal Engineer (03) → Code Reviewer (29)
5. **Тесты?** → QA Engineer (27) → Test Automation (28)
6. **Документация?** → Technical Writer (41) → Audit Specialist (43)
7. **Производительность?** → Performance Engineer (24) → HFT Engineer (15)
8. **Безопасность?** → Security Engineer (23)
9. **Новая модель?** → Quant Researcher (06) → Quant Developer (07)
10. **ML?** → ML Researcher (08) → ML Engineer (09)
11. **Риск?** → Risk Manager (16)
12. **Опционы?** → Options Specialist (18)
13. **UI?** → Frontend Engineer (33) → UI/UX (34)
14. **Деплой?** → DevOps (21) → SRE (22)
15. **Планирование?** → Technical Planner (45) → Expansion Planner (50)
16. **Рефакторинг?** → Refactoring Specialist (47)
17. **Тех долг?** → Tech Debt Manager (49)
18. **Конкуренты?** → Competitive Analyst (46)
19. **Инновации?** → Innovation Researcher (13)
20. **Интеграция?** → Integration Engineer (26)

### Мульти-роль сценарии

**Сценарий: "Найти и исправить баги"**
→ Bug Hunter (31) находит → Bug Fixer (32) фиксит → Code Reviewer (29) ревьюит → QA (27) пишет тесты → Tech Writer (41) документирует

**Сценарий: "Добавить новую модель"**
→ Quant Researcher (06) исследует → Quant Developer (07) реализует → QA (27) пишет тесты → Tech Writer (41) документирует → Audit (43) проверяет

**Сценарий: "Оптимизировать производительность"**
→ Performance Engineer (24) профилирует → HFT Engineer (15) оптимизирует → Code Reviewer (29) ревьюит → Tech Writer (41) документирует

**Сценарий: "Планирование будущего"**
→ CEO (01) видение → CTO (02) архитектура → Technical Planner (45) план → Expansion Planner (50) расширение → Product Manager (05) roadmap

---

## ПРИНЦИПЫ ОРКЕСТРАЦИИ

1. **Одна задача = одна роль** — не смешивай
2. **Планирование раньше кода** — всегда
3. **Качество раньше скорости** — нет AI slop
4. **Тесты раньше релиза** — всегда
5. **Документация раньше коммита** — всегда
6. **Коммит после каждого изменения** — всегда
7. **Честность в документации** — не ври
8. **Future-thinking** — не только что работает сейчас, но что будет легко поддерживать
9. **Principal engineer не должен плакать** — код должен быть чистым
10. **Каждая роль знает свои границы** — не лезь в чужую область

---

## БУДУЩЕЕ ПРОЕКТА — НАПРАВЛЕНИЯ РАСШИРЕНИЯ

### Trading & Quant
- Quantum models: QAOA, VQE, Quantum Monte Carlo, Quantum Neural Networks
- Advanced ML: Deep RL, Transformer for time series, GNN for market structure
- Alternative data: sentiment, on-chain, satellite, social media
- Market making 2.0: adversarial RL, multi-agent
- Cross-asset arbitrage: crypto ↔ traditional finance
- High-frequency statistical arbitrage
- Optimal execution: RL-based, adaptive

### Infrastructure
- Real broker integration: Binance, Bybit, OKX WebSocket APIs
- Hardware acceleration: FPGA, CUDA revival, ASIC
- Co-location: low-latency hosting, direct market access
- Tick data: real market data feeds, historical tick storage
- Time sync: PTP, GPS, hardware timestamping
- Observability: distributed tracing, real-time metrics

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

*50 ролей. Каждый — специалист. Каждый — с правилами. Никакого AI slop. Principal engineer спит спокойно.*
