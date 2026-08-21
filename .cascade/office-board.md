# 🏢 OFFICE BOARD — ВНУТРЕННЯЯ КОММУНИКАЦИЯ IT-ОТДЕЛА

> Доска задач и общения между ролями.
> Правило: только текущий спринт + 1 предыдущий. Старые спринты → progress.md.
> Максимум 50 строк. Очистка в начале каждого спринта.

---

## 📊 ТЕКУЩИЙ СПРИНТ

### [01] CEO → [02] CTO
**Тема:** Sprint 61 — следующая модель из future_development.md
**Задача:** Работаем по future_development.md.
  Следующая модель без ✅ DONE: Markov-Switching GARCH (раздел 0.1).
  CTO, подготовь архитектуру — файл, класс, зависимости.
**Контекст:** Sprint 60 завершён (GARCH). future_development.md раздел 0.1.
**Срок:** P0
**Статус:** NEW

---

## ✅ ПРЕДЫДУЩИЙ СПРИНТ

### [04] VP Eng → ALL
**Тема:** Sprint 60 — завершён
**Сообщение:**
  - Ported GARCH(1,1) from UI to trading logic (garch.py): MLE gradient ascent,
    persistence, half-life, unconditional variance, multi-step forecast,
    EWMA + Parkinson estimators, classify_regime.
  - 42 new tests in test_garch.py (132 technical_analysis tests pass).
  - 8/15 моделей раздела 0.1 портировано (53%).
**Статус:** INFO
