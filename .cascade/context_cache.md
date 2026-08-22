# Context Cache — компактный контекст для AI

> ОБНОВЛЯТЬ В КОНЦЕ КАЖДОГО ДНЯ.
> AI читает ЭТОТ файл для понимания текущего состояния.

---

## ПРОЕКТ

- **Тестов:** 2487 Python (0 failed, 17 skipped) + 21 Rust + 547 JS
- **Багов P0-P1:** 0
- **Портирование моделей:** ✅ ЗАВЕРШЕНО (52 модели, Sprint 1-105)
- **Текущая фаза:** РЕФАКТОРИНГ И УПРОЩЕНИЕ (22 авг – 1 сен 2026)
- **Главный драйвер:** docs/REFACTORING_PLAN_10DAYS.md
- **Следующая фаза:** RELIABILITY — .cascade/RELIABILITY_PLAN.md (11 задач)
- **AI SLOP:** 5 модулей (lstm, transformer, rl_agent, dpdk, fpga) — в бэклоге

## ПРОГРЕСС ПО РЕФАКТОРИНГУ (10-дневный план)

### Day 1 (Aug 22): Hawkes split ✅ DONE
- hawkes.py → hawkes_model.py + hawkes_funcs.py + hawkes.py (facade)
- 38 тестов проходят
- Коммит: 3c6919b

### Day 2 (Aug 23): compute_returns дедупликация — NEXT
- compute_returns дублирован в 20+ research модулях
- План: создать research/_common.py, заменить все копии

### Day 3 (Aug 24): quantize и другие хелперы — PENDING
### Day 4 (Aug 25): research/__init__.py упрощение — PENDING
### Day 5 (Aug 26): Аудит unused research модулей — PENDING
### Day 6 (Aug 27): backtester.py упрощение — PENDING
### Day 7 (Aug 28): strategies.py cleanup — PENDING
### Day 8 (Aug 29): communication layer аудит — PENDING
### Day 9 (Aug 30): ML module cleanup — PENDING
### Day 10 (Aug 31): Финальная проверка + документация — PENDING

## КЛЮЧЕВЫЕ НАХОДКИ ДЛЯ РЕФАКТОРИНГА (verified Aug 22)

- `compute_returns` — **22 идентичных копии** (verified grep) в research модулях
- `quantize` — **2 копии** (info_bottleneck.py, transfer_entropy.py) с разными сигнатурами
- `research/__init__.py` — 305 строк ручных экспортов + __all__
- **35 research модулей** — ВСЕ ACADEMIC (тесты есть, в production не используются)
- Research модули НЕ импортируют друг друга — zero inter-module dependencies
- **10 ML модулей** — ВСЕ dead code (нет импортов извне, нет тестов)
- `fix_client.py` (329 строк) — dead code, только test импортирует
- `ws_connection_pool.py` — dead code, только test импортирует
- `networking/socket_transport.py` — dead code, никто не импортирует
- SHM модули (4 файла) — не импортируются вне communication/
- `backtester.py` — 449 строк (было 506)
- `signal_publisher.py` — 380 строк (было 453)
- `strategies.py` — 413 строк (было 472)

## SLOP FIXES (бэклог — после рефакторинга)

1. 🔴 `lstm_model.py` — УЖЕ УДАЛЕН ✅
2. 🔴 `transformer_model.py` — УЖЕ УДАЛЕН ✅
3. 🔴 `rl_agent.py` — УЖЕ УДАЛЕН ✅
4. 🟠 `dpdk_transport.py` — УЖЕ УДАЛЕН ✅
5. 🟠 `fpga_orderbook.vhd` — удалить или пометить TODO
6. 🟡 `hft-executor/src/lib.rs` — дописать WebSocket send
7. 🟡 README — убрать лишние бейджи

## ПОСЛЕДНИЙ КОММИТ

**3c6919b** — refactor: split hawkes.py into hawkes_model.py, hawkes_funcs.py, and facade. 38 тестов проходят.
