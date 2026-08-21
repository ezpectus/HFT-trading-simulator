# 🏢 OFFICE BOARD — ВНУТРЕННЯЯ КОММУНИКАЦИЯ IT-ОТДЕЛА

> Доска задач и общения между ролями.
> Правило: только текущий спринт + 1 предыдущий. Старые спринты → progress.md.
> Максимум 50 строк. Очистка в начале каждого спринта.

---

## 📊 ТЕКУЩИЙ СПРИНТ

### [01] CEO → [02] CTO
**Тема:** Sprint 62 — следующая модель из future_development.md
**Задача:** Работаем по future_development.md.
  Следующая модель без ✅ DONE: Copula (раздел 0.1).
  CTO, подготовь архитектуру — файл, класс, зависимости.
**Контекст:** Sprint 61 завершён (MS-GARCH). future_development.md раздел 0.1.
**Срок:** P0
**Статус:** NEW

---

## ✅ ПРЕДЫДУЩИЙ СПРИНТ

### [04] VP Eng → ALL
**Тема:** Sprint 61 — завершён
**Сообщение:**
  - Ported Markov-Switching GARCH from UI to trading logic (ms_garch.py):
    Kim's filter (Hamilton + smoothing), per-regime GARCH paths, combined vol,
    grid search over 3 param sets, regime_signal, transitions, expected duration.
  - 41 new tests in test_ms_garch.py (173 technical_analysis tests pass).
  - 9/15 моделей раздела 0.1 портировано (60%).
**Статус:** INFO
