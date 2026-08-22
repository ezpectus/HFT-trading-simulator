# OFFICE BOARD — РЕФАКТОРИНГ И УПРОЩЕНИЕ

> Фаза 1 (Портирование моделей): ЗАВЕРШЕНО (52 модели, Sprint 1-105)
> Фаза 2 (Рефакторинг): АКТИВНА (22 авг – 1 сен 2026)
> План: docs/REFACTORING_PLAN_10DAYS.md
> Следующая фаза: RELIABILITY — .cascade/RELIABILITY_PLAN.md (11 задач, после рефакторинга)

---

## ТЕКУЩИЙ ДЕНЬ — Day 2 (Aug 23): compute_returns дедупликация

### [01] Refactoring Agent — extract compute_returns
**Задача:** Создать `src/research/_common.py` с `compute_returns(prices)`.
  Заменить все 20+ локальных копий на import из `_common.py`.
  Обновить `research/__init__.py` если нужно.
  Все тесты должны проходить.
**Статус:** NEW

### [02] Code Review Agent — /code-review
**Задача:** Проверить работу агента 01:
  - Все импорты корректны?
  - Нет циклических зависимостей?
  - __init__.py экспорты работают?
  - Тесты проходят?
**Статус:** NEW

---

## ВЫПОЛНЕННЫЕ ЗАДАЧИ

### Day 1 (Aug 22): Hawkes split ✅
- hawkes.py → hawkes_model.py + hawkes_funcs.py + hawkes.py (facade)
- 38 тестов проходят, коммит 3c6919b

### Day 1 (Aug 22): Полный grep аудит ✅
- 26 находок в `docs/AUDIT_FINDINGS.md`
- 3 High, 7 Medium, 12 Low, 4 Info/justified
- Обновлены: `.cascade/CODE_AUDIT.md` (§7), `.cascade/RELIABILITY_PLAN.md` (дополнение)

---

## СВОДКА АУДИТА (26 находок)

### High (3) — исправить в первую очередь
- **001-002:** Мёртвый `tracing.py` ×2 (398 строк) — удалить
- **009:** `db.py:33` — `except Exception: pass` — молчаливая ошибка БД

### Medium (7) — исправить после рефакторинга
- **003-004:** Мёртвые `metrics.py` ×2 (543 строки) — удалить
- **005-006:** Дубликаты скриптов `run_backtest.py`, `load_test_50_symbols.py`
- **007-008:** `except Exception` в `signal_publisher.py` (6), `real_account.py` (3) — сузить
- **021:** `feature_store.py:94` — `Exception` в кортеже делает остальные избыточными

### Low (12) — backlog
- **010-012:** `except Exception` в health_check, SHM, conftest (5 catches)
- **013:** Hardcoded `localhost:8765` (4 файла) — через config
- **018:** `pass` в production (4 файла)
- **019:** Root-level scripts — переместить в `scripts/`
- **022:** ~80+ f-string в logger — заменить на `%s`
- **023:** `os.system` в `monitor.py` — заменить на subprocess
- **025:** 7 `open()` без `encoding="utf-8"` — Windows codec issue
- **026:** 6 `console.log` в `performanceMonitor.js` — gate behind DEV

### Info/Justified (4) — не трогать
- `type: ignore` (1), `global` (29), `: Any` (11), `# noqa` (39), `0.0.0.0` (7)

### Clean (0 нарушений)
TODO/FIXME/HACK, `import *`, bare `except:`, `NotImplementedError`, `eval()`/`exec()`, `subprocess`, credentials, `pickle`, `yaml.load(`, `shell=True`, `assert` в production

---

## RELIABILITY GAP ANALYSIS

| Что нет | Влияние | План |
|---------|---------|------|
| SIGTERM handler | `docker stop` → kill -9 через 10s, состояние не сохранено | Task 8 |
| Sharding/Partitioning | SQLite equity_curve растёт бесконечно | CODE_AUDIT §4.2 |
| Backpressure | SignalPublisher шлёт всем без ограничений | CODE_AUDIT §4.3 |
| Idempotency ордеров | Retry = двойной ордер = потеря денег | CODE_AUDIT §4.4 |
| Retry/backoff для ордеров | Сеть моргнула → ордер потерян | Task 9 |
| Schema validation WS | Любой JSON принимается | CODE_AUDIT §4.9 |
| Health endpoints (exchange) | Prometheus не скрейпит | Task 1 |
| Metric name mismatch | Алерты никогда не сработают | Task 11 |
| Indicator caching | 200k операций каждые 60s вместо 1k | CODE_AUDIT §4.1 |
| Race condition `_clients` | RuntimeError при concurrent broadcast + connect | CODE_AUDIT §8.1 |
| DB busy_timeout | `database is locked` при concurrent writes | CODE_AUDIT §8.6 |
| DB connection pooling | Каждый метод открывает/закрывает conn | CODE_AUDIT §8.7 |
| Socket buffer tuning | OS defaults 64-128KB, bursts → drops | CODE_AUDIT §8.5 |
| Helm probes отсутствуют | K8s pod не рестартует при hang | CODE_AUDIT §8.14 |
| Docker healthchecks TCP | TCP проверяет порт, не готовность | CODE_AUDIT §8.9 |
| aiohttp session per alert | Каждая отправка алерта = новая сессия | CODE_AUDIT §8.8 |
| Top-level ErrorBoundary | Падение корневого компонента = белый экран | CODE_AUDIT §8.10 |
| Missing DB indexes | `get_stats` full-scan, equity_curve без индекса | CODE_AUDIT §8.16 |
| C++ `catch(...)` kill switch | Safety-critical silent failure | CODE_AUDIT §8.17 |
| No PropTypes/TypeScript | Нет runtime prop validation в web-ui | CODE_AUDIT §8.19 |
| No log rotation | Log files grow unbounded → disk full | CODE_AUDIT §8.22 |
| Float precision | IEEE 754 errors accumulate in P&L | CODE_AUDIT §8.23 |
| No WS message validation | Raw JSON accepted, no schema | CODE_AUDIT §8.24 |
| No DB retention/cleanup | Tables grow forever, ~2.6M rows/year | CODE_AUDIT §8.25 |
| No auth on health/metrics | Endpoints open if ports exposed | CODE_AUDIT §8.27 |
| Rust unwrap/expect panic | Process crash on runtime failure | CODE_AUDIT §8.29 |
| Rust no idempotency | Reconnect = exchange can't deduplicate orders | CODE_AUDIT §8.30 |
| Rust string matching for fills | Fragile, false positives | CODE_AUDIT §8.32 |
| No network timeout in config | Timeouts hardcoded, need redeploy to change | CODE_AUDIT §8.36 |
| No config schema validation | Wrong type in YAML → runtime TypeError | CODE_AUDIT §8.42 |
| No HFT alert rules | HFT errors, DB locks, CB changes not alerted | CODE_AUDIT §8.38 |
| CI: npm audit non-blocking | High-severity vulns don't fail CI | CODE_AUDIT §8.40 |
| Dockerfile healthcheck TCP | TCP not HTTP, same as compose | CODE_AUDIT §8.44 |
| Dead code: tracing.py | 111 lines, never imported | CODE_AUDIT §8.46 |
| Test coverage gaps | signal_publisher, db, alerting, llm — 0 tests | CODE_AUDIT §8.47 |
| **No graceful shutdown** | **Ctrl+C = kill, no DB close, no WS notify, orders lost** | **CODE_AUDIT §8.48** |
| No WS keepalive | Silent disconnects undetected | CODE_AUDIT §8.49 |
| No backoff with jitter | Thundering herd on mass reconnect | CODE_AUDIT §8.50 |
| 3x CircuitBreaker duplication | 3 different implementations, 1 unused | CODE_AUDIT §8.51 |
| RateLimiter dead code | Implemented, tested, never used in prod | CODE_AUDIT §8.52 |
| No asyncio task management | Background tasks fire-and-forget, crashes unnoticed | CODE_AUDIT §8.54 |
