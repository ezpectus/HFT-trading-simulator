# Context Cache — компактный контекст для AI

> ОБНОВЛЯТЬ В КОНЦЕ КАЖДОГО СПРИНТА.
> AI читает ЭТОТ файл вместо future_development.md (858 строк) + progress.md (442 строки).
> 20 строк вместо 1300.

---

## ПРОЕКТ

- **Тестов:** 2487 Python (0 failed, 17 skipped) + 21 Rust + 547 JS
- **Багов P0-P1:** 0 (JS тесты не запускаются в IDE — нет npm)
- **9-Day Plan:** ✅ ЗАВЕРШЁН (Sprint 1-59)
- **Главный драйвер:** docs/future_development.md

## ПРОГРЕСС ПО future_development.md

### Раздел 0.1 (высокий приоритет): 8/15 (53%)
████████████░░░░░░░░░░ 53%

- ✅ Kalman Filter (Sprint 55)
- ✅ PCA (Sprint 56)
- ✅ K-Means (Sprint 57)
- ✅ GMM (Sprint 57)
- ✅ SVM (Sprint 58)
- ✅ DTW (Sprint 58)
- ✅ GARCH(1,1) (Sprint 60)
- ⬜ Markov-Switching GARCH — СЛЕДУЮЩАЯ
- ⬜ Copula
- ⬜ Wavelet
- ⬜ Monte Carlo
- ⬜ Hawkes Process
- ⬜ Almgren-Chriss
- ⬜ Optimal Stopping
- ⬜ Autoencoder

### Раздел 0.2 (средний приоритет): 1/12 (8%)
█░░░░░░░░░░░░░░░░░░░░ 8%

- ✅ DTW (Sprint 58, также в 0.1)
- ⬜ Bayesian Price Predictor
- ⬜ Bayesian Structural TS
- ⬜ HMC
- ⬜ Transfer Entropy
- ⬜ CCM (EDM)
- ⬜ Cramer-Rao Bound
- ⬜ Rough Volatility (rBergomi)
- ⬜ VMD
- ⬜ EMD/HHT
- ⬜ Compressed Sensing
- ⬜ RKHS

## СЛЕДУЮЩАЯ ЗАДАЧА

**Модель:** Markov-Switching GARCH
**UI файл:** web-ui/src/components/MarkovSwitchingGARCH.jsx
**Python файл:** ai-signal-bot/src/technical_analysis/ms_garch.py
**Паттерны:** garch.py (Sprint 60), gmm.py (Sprint 57)
**Спринт:** 61

## ПОСЛЕДНИЙ СПРИНТ

**Sprint 60:** Ported GARCH(1,1) from UI to trading logic (garch.py). 42 new tests. 8/15 моделей раздела 0.1 (53%).
