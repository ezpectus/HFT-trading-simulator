# Промпты для Cascade AI — HFT Trading System

> 100 role-based промптов. Каждый промпт = 1 специалист в квант-трейдинг компании.
> Открой `workflows/orchestration.md` для полной карты ролей и мульти-роль сценариев.
> Открой нужный `tasks/NN-name.md` — скопируй в начало сессии.

---

## ⚠️ АБСОЛЮТНЫЕ ПРАВИЛА (ДЛЯ ВСЕХ 100 РОЛЕЙ)

### СТАТИЧЕСКИЙ АНАЛИЗ — ТЕРМИНАЛ ЗАПРЕЩЁН (КРОМЕ GIT)

**ЗАПРЕЩЕНО:** pytest, python, npm, docker, curl, make, cmake, cargo, cat, grep, find, ls, ruff, mypy, flake8, uvicorn, node, pip install
**РАЗРЕШЕНО:** read_file, grep_search, find_by_name, code_search, list_dir, edit, multi_edit, write_to_file, run_command (ТОЛЬКО git)

### КАЧЕСТВО КОДА — НЕТ AI SLOP

- Функция ≤ 40 строк, файл ≤ 500 строк, complexity ≤ 10
- 0 дублирования, 0 dead code, 0 magic numbers, 0 bare except
- Type hints ВСЕГДА (Python), 0 `Any` без обоснования
- 0 `print()` в production, 0 `global` mutable, 0 `from x import *`
- Docstring на каждой функции, говорящие имена

### ПЛАНИРОВАНИЕ ПЕРЕД КОДОМ — 10 ВОПРОСОВ

1. Что я делаю? 2. Зачем? 3. Как? 4. Где? 5. Зависимости?
6. Тесты? 7. Документация? 8. Риски? 9. Альтернативы? 10. Over-engineering?

### ТЕСТЫ — КАЖДАЯ ФУНКЦИЯ = ТЕСТ

- Edge cases: нули, None, пустые, отрицательные, overflow
- Имена: `test_<function>_<scenario>_<expected>`
- AAA: Arrange, Act, Assert

### КОММИТ ПОСЛЕ КАЖДОГО ИЗМЕНЕНИЯ

```powershell
git add -A; git commit -m "<type>: <description>"; git push
```

---

## 100 РОЛЕЙ — БЫСТРЫЙ ИНДЕКС

### 🏢 Executive (5)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 01 | CEO | `tasks/01-ceo.md` | Стратегия, видение |
| 02 | CTO | `tasks/02-cto.md` | Архитектура, технологии |
| 03 | Principal Engineer | `tasks/03-principal-engineer.md` | Качество, anti-AI-slop |
| 04 | VP Engineering | `tasks/04-vp-engineering.md` | Спринты, приоритеты |
| 05 | Product Manager | `tasks/05-product-manager.md` | Roadmap, user stories |

### 📊 Quant Research (8)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 06 | Quant Researcher | `tasks/06-quant-researcher.md` | Новые модели, стратегии |
| 07 | Quant Developer | `tasks/07-quant-developer.md` | Реализация моделей |
| 08 | ML Researcher | `tasks/08-ml-researcher.md` | ML модели, обучение |
| 09 | ML Engineer | `tasks/09-ml-engineer.md` | ML pipeline, inference |
| 10 | Data Scientist | `tasks/10-data-scientist.md` | Фичи, анализ данных |
| 11 | Statistics | `tasks/11-statistics.md` | HMM, GARCH, Bayesian |
| 12 | Mathematics | `tasks/12-mathematics.md` | Stochastic, topology |
| 13 | Innovation | `tasks/13-innovation.md` | Quantum, FPGA, new tech |

### 📈 Trading Systems (7)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 14 | Trading Engineer | `tasks/14-trading-engineer.md` | Ордера, smart router |
| 15 | HFT Engineer | `tasks/15-hft-engineer.md` | Low-latency C++ |
| 16 | Risk Manager | `tasks/16-risk-manager.md` | VaR, Kelly, stress |
| 17 | Portfolio Manager | `tasks/17-portfolio-manager.md` | Markowitz, BL |
| 18 | Options | `tasks/18-options.md` | Greeks, pricing |
| 19 | Microstructure | `tasks/19-microstructure.md` | Order book, VPIN |
| 20 | Execution | `tasks/20-execution.md` | TWAP, VWAP, IS |

### 🏗 Infrastructure (6)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 21 | DevOps | `tasks/21-devops.md` | CI/CD, Docker |
| 22 | SRE | `tasks/22-sre.md` | Мониторинг, алерты |
| 23 | Security | `tasks/23-security.md` | Аудит, уязвимости |
| 24 | Performance | `tasks/24-performance.md` | Оптимизация |
| 25 | Database | `tasks/25-database.md` | Схема, запросы |
| 26 | Integration | `tasks/26-integration.md` | Компоненты, IPC |

### ✅ Quality (6)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 27 | QA | `tasks/27-qa.md` | Test plans, edge cases |
| 28 | Test Automation | `tasks/28-test-automation.md` | Автотесты |
| 29 | Code Reviewer | `tasks/29-code-reviewer.md` | Ревью кода |
| 30 | Static Analyst | `tasks/30-static-analyst.md` | Паттерны проблем |
| 31 | Bug Hunter | `tasks/31-bug-hunter.md` | Поиск багов |
| 32 | Bug Fixer | `tasks/32-bug-fixer.md` | Фикс с root cause |

### 🎨 Frontend (4)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 33 | Frontend | `tasks/33-frontend.md` | React разработка |
| 34 | UI/UX | `tasks/34-ui-ux.md` | Accessibility, design |
| 35 | Data Viz | `tasks/35-data-viz.md` | Графики, дашборды |
| 36 | PWA | `tasks/36-pwa.md` | Offline, service workers |

### ⚙️ Backend (4)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 37 | Backend | `tasks/37-backend.md` | API, WebSocket |
| 38 | API Designer | `tasks/38-api-designer.md` | Контракты, документация |
| 39 | Python Dev | `tasks/39-python-dev.md` | Python паттерны |
| 40 | C++ Dev | `tasks/40-cpp-dev.md` | C++20, memory safety |

### 📝 Documentation (4)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 41 | Tech Writer | `tasks/41-tech-writer.md` | Документация |
| 42 | Arch Doc | `tasks/42-arch-doc.md` | Архитектурная док |
| 43 | Audit | `tasks/43-audit.md` | Документация vs код |
| 44 | Changelog | `tasks/44-changelog.md` | CHANGELOG management |

### 🚀 Planning & Future (6)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 45 | Tech Planner | `tasks/45-tech-planner.md` | Roadmap до 100% |
| 46 | Competitive | `tasks/46-competitive.md` | Сравнение с конкурентами |
| 47 | Refactoring | `tasks/47-refactoring.md` | Cleanup, code smells |
| 48 | Migration | `tasks/48-migration.md` | Порты, UI→trading |
| 49 | Tech Debt | `tasks/49-tech-debt.md` | Приоритизация долга |
| 50 | Expansion | `tasks/50-expansion.md` | Расширение во всех направлениях |

### 🏛 Executive+ (4)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 51 | CRO | `tasks/51-cro.md` | Риск-стратегия |
| 52 | CDO | `tasks/52-cdo.md` | Стратегия данных |
| 53 | Engineering Manager | `tasks/53-eng-manager.md` | Координация |
| 54 | Release Manager | `tasks/54-release-manager.md` | Релизы |

### 🎓 Senior/Principal (4)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 55 | Distinguished Engineer | `tasks/55-distinguished-engineer.md` | Сложнейшие проблемы |
| 56 | Staff Engineer | `tasks/56-staff-engineer.md` | Cross-cutting concerns |
| 57 | Head of Research | `tasks/57-head-of-research.md` | Research roadmap |
| 58 | Lead Trader | `tasks/58-lead-trader.md` | Торговые стратегии |

### 📐 Advanced Mathematics (8)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 59 | PhD Mathematician | `tasks/59-phd-mathematician.md` | Stochastic calculus |
| 60 | Numerical Analyst | `tasks/60-numerical-analyst.md` | Finite differences, MC |
| 61 | Optimization | `tasks/61-optimization.md` | Convex/non-convex |
| 62 | Probability Theory | `tasks/62-probability.md` | Martingales |
| 63 | Game Theory | `tasks/63-game-theory.md` | Auctions |
| 64 | Information Theory | `tasks/64-information-theory.md` | Entropy, KL |
| 65 | Topology/Geometry | `tasks/65-topology-geometry.md` | Persistent homology |
| 66 | Differential Equations | `tasks/66-differential-equations.md` | ODE/PDE/SDE |

### 💹 Advanced Trading (6)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 67 | Market Maker | `tasks/67-market-maker.md` | MM стратегии |
| 68 | Arbitrage | `tasks/68-arbitrage.md` | Cross-exchange |
| 69 | StatArb Researcher | `tasks/69-statarb-researcher.md` | Cointegration |
| 70 | Latency Arbitrage | `tasks/70-latency-arbitrage.md` | Microsecond |
| 71 | Volatility Trader | `tasks/71-volatility-trader.md` | Vol arbitrage |
| 72 | Event-Driven | `tasks/72-event-driven.md` | News, on-chain |

### 🧠 Advanced ML/AI (5)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 73 | Deep Learning | `tasks/73-deep-learning.md` | CNN, Transformer |
| 74 | Reinforcement Learning | `tasks/74-reinforcement-learning.md` | PPO, SAC, DQN |
| 75 | NLP/Sentiment | `tasks/75-nlp-sentiment.md` | FinBERT |
| 76 | Time Series | `tasks/76-time-series.md` | ARIMA, GARCH |
| 77 | MLOps | `tasks/77-mlops.md` | Versioning, drift |

### 🗄 Data Engineering (4)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 78 | Data Engineer | `tasks/78-data-engineer.md` | Pipelines, ETL |
| 79 | Data Architect | `tasks/79-data-architect.md` | Schema |
| 80 | Real-time Data | `tasks/80-realtime-data.md` | Streaming |
| 81 | Feature Store | `tasks/81-feature-store.md` | Features |

### 🖥 Advanced Infrastructure (5)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 82 | Network Engineer | `tasks/82-network-engineer.md` | TCP, kernel bypass |
| 83 | Hardware Engineer | `tasks/83-hardware-engineer.md` | FPGA, CUDA |
| 84 | Systems Programmer | `tasks/84-systems-programmer.md` | Kernel, drivers |
| 85 | Cloud Architect | `tasks/85-cloud-architect.md` | K8s, multi-region |
| 86 | Capacity Planner | `tasks/86-capacity-planner.md` | Scaling |

### 🛡 Advanced Quality (4)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 87 | Chaos Engineer | `tasks/87-chaos-engineer.md` | Fault injection |
| 88 | Perf Testing | `tasks/88-perf-testing.md` | Benchmarks |
| 89 | Security Testing | `tasks/89-security-testing.md` | Pentest |
| 90 | Property Testing | `tasks/90-property-testing.md` | Hypothesis |

### ⚡ Advanced Backend (4)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 91 | Distributed Systems | `tasks/91-distributed-systems.md` | Consensus |
| 92 | Concurrent Programming | `tasks/92-concurrent-programming.md` | Lock-free |
| 93 | Caching | `tasks/93-caching.md` | Redis, LRU |
| 94 | Microservices | `tasks/94-microservices.md` | Decomposition |

### 🔬 Research & Innovation (4)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 95 | R&D Lead | `tasks/95-rd-lead.md` | Pipeline |
| 96 | Academic Liaison | `tasks/96-academic-liaison.md` | Papers |
| 97 | Tech Scout | `tasks/97-tech-scout.md` | New tech |
| 98 | Prototype Engineer | `tasks/98-prototype-engineer.md` | Rapid PoC |

### 📋 Business/Product (2)
| # | Роль | Файл | Когда |
|---|------|------|-------|
| 99 | UX Researcher | `tasks/99-ux-researcher.md` | Usability |
| 100 | Compliance Officer | `tasks/100-compliance.md` | Regulatory |

---

## МУЛЬТИ-РОЛЬ СЦЕНАРИИ

| Сценарий | Роли |
|----------|------|
| Найти и исправить баги | Bug Hunter (31) → Bug Fixer (32) → Code Reviewer (29) → QA (27) → Tech Writer (41) |
| Добавить новую модель | Quant Researcher (06) → Quant Developer (07) → QA (27) → Tech Writer (41) → Audit (43) |
| Оптимизировать производительность | Performance (24) → HFT Engineer (15) → Code Reviewer (29) → Tech Writer (41) |
| Планирование будущего | CEO (01) → CTO (02) → Tech Planner (45) → Expansion (50) → PM (05) |
| Ревью качества | Principal Eng (03) → Code Reviewer (29) → Static Analyst (30) → Tech Debt (49) |
| Новая фича | PM (05) → VP Eng (04) → Backend (37) → Frontend (33) → QA (27) → Tech Writer (41) |
| Сложная математика | Head of Research (57) → PhD Math (59) → Numerical (60) → Quant Dev (07) → QA (27) |
| Market making | Lead Trader (58) → Market Maker (67) → Game Theory (63) → Risk (16) → HFT (15) |
| ML в production | ML Research (08) → Deep Learning (73) → MLOps (77) → Feature Store (81) → QA (27) |
| Distributed system | CTO (02) → Distributed (91) → Concurrent (92) → Microservices (94) → SRE (22) → Chaos (87) |
| Hardware accel | Innovation (13) → Hardware (83) → Systems (84) → HFT (15) → Performance (24) |
| Compliance | Compliance (100) → Security (23) → Audit (43) → Tech Writer (41) → Changelog (44) |

---

*100 ролей. Полная команда квант-трейдинг компании. Каждый — специалист. Каждый — с правилами. Никакого AI slop.*
