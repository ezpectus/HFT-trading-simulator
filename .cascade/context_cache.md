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

## КЛЮЧЕВЫЕ НАХОДКИ ДЛЯ РЕФАКТОРИНГА

- `compute_returns` — идентичная функция в 20+ модулях research/
- `quantize` — дубликат в info_bottleneck.py и transfer_entropy.py
- `research/__init__.py` — 307 строк ручных экспортов + __all__
- 32 research модуля — нужно проверить какие реально используются
- `backtester.py` — 506 строк
- `signal_publisher.py` — 453 строки
- `strategies.py` — 472 строки (несколько классов в одном файле)

## SLOP FIXES (бэклог — после рефакторинга)

1. 🔴 `lstm_model.py` — переписать на PyTorch или удалить
2. 🔴 `transformer_model.py` — переписать на PyTorch или удалить
3. 🔴 `rl_agent.py` — удалить, использовать `rl_trader.py`
4. 🟠 `dpdk_transport.py` — удалить или переименовать
5. 🟠 `fpga_orderbook.vhd` — удалить или пометить TODO
6. 🟡 `hft-executor/src/lib.rs` — дописать WebSocket send
7. 🟡 README — убрать лишние бейджи

## ПОСЛЕДНИЙ КОММИТ

**3c6919b** — refactor: split hawkes.py into hawkes_model.py, hawkes_funcs.py, and facade. 38 тестов проходят.
