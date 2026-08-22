# Reliability & Healthcheck Plan

> Фаза: РЕЛАЙАБИЛИТИ (после рефакторинга)
> Цель: привести систему к стандартам production — healthchecks, probes, метрики, алерты, graceful shutdown, retry/backoff.
> Полный аудит кода: `.cascade/CODE_AUDIT.md`

---

## АУДИТ ТЕКУЩЕГО СОСТОЯНИЯ (verified Aug 22)

### Что уже есть

| Компонент | Файл | Статус |
|-----------|------|--------|
| Exchange Simulator health | `exchange_simulator/health.py` (FastAPI :8775) | ⚠️ НАПИСАН, НО НЕ ЗАПУСКАЕТСЯ |
| Exchange Simulator metrics | `exchange_simulator/metrics.py` (Prometheus :8000) | ⚠️ НАПИСАН, НО НЕ ЗАПУСКАЕТСЯ |
| AI Bot HealthServer | `ai-signal-bot/src/monitoring/health_server.py` (:8080) | ✅ Запускается с `--metrics` |
| AI Bot MetricsExporter | `ai-signal-bot/src/monitoring/metrics.py` (:9090) | ✅ Запускается с `--metrics` |
| AI Bot HealthAggregator | `ai-signal-bot/src/communication/health_check.py` (:9092) | ❌ НИКТО НЕ ИМПОРТИРУЕТ |
| AI Bot observability v2 | `ai-signal-bot/src/observability/` (health_checks, logging, tracing) | ❌ НИКТО НЕ ИМПОРТИРУЕТ |
| HFT Bot HealthServer | `hft-trade-bot/src/monitoring/health_server.h` (:9091) | ✅ Запускается через `init_monitoring` |
| Prometheus config | `monitoring/prometheus.yml` | ✅ Есть |
| Alert rules | `monitoring/alerts/alerts.yml` | ✅ Есть |
| Alertmanager | `monitoring/alertmanager/config.yml` | ⚠️ Placeholder'ы (YOUR/SLACK/WEBHOOK) |
| docker-compose healthchecks | `docker-compose.yml` | ⚠️ TCP-проверки вместо HTTP |

### Проблемы (gap analysis)

1. **Exchange Simulator не отдаёт health/metrics** — `health.py` и `metrics.py` существуют, но `__main__.py` их не запускает. Prometheus не может скрейпить `exchange-simulator:8775`.
2. **docker-compose healthcheck'и — TCP, не HTTP** — проверяют порт 8765/8766 (WebSocket), а не `/health`. TCP-проверка не показывает, что сервис реально работает (только что порт открыт).
3. **HealthAggregator мёртвый** — написан, но никто не запускает. Нет единой точки агрегации здоровья.
4. **observability/ мёртвый** — health_checks v2 (live/ready), tracing (OpenTelemetry), logging — написаны, но не подключены.
5. **Нет /live и /ready у Exchange Simulator** — только у AI Bot (в HealthServer).
6. **Нет health в Web UI** — фронтенд не имеет `/health` endpoint.
7. **Alertmanager с placeholder'ами** — не сконфигурирован для реальных каналов.
8. **Helm probes — TCP вместо HTTP** — `livenessProbe`/`readinessProbe` в `helm/templates/ai-signal-bot.yaml` используют `tcpSocket` на WS-порт, а не `httpGet` на `/health`.
9. **Нет graceful shutdown** — в `run.py` есть `finally` блок, но нет SIGTERM-обработки с drain'ом.
10. **Нет retry/backoff для WS-клиентов** — `_listen_loop` реконнектит, но без экспоненциального backoff.

---

## ПЛАН РАБОТ

### Task 1: Exchange Simulator — включить health + metrics серверы
**Файлы:** `exchange_simulator/__main__.py`, `exchange_simulator/health.py`, `exchange_simulator/metrics.py`
- В `run_websocket_server()` запускать `health.py` (FastAPI :8775) и `metrics.py` (:8000) как фоновые задачи
- Добавить `/live` и `/ready` в `health.py` (сейчас только `/health`)
- Проверить, что порты не конфликтуют с WebSocket (8765)

### Task 2: docker-compose — HTTP healthchecks вместо TCP
**Файлы:** `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.staging.yml`
- exchange-simulator: `wget http://localhost:8775/health` вместо TCP 8765
- ai-signal-bot: `wget http://localhost:9090/health` (metrics server уже отдаёт /health) вместо TCP 8766
- hft-trade-bot: уже HTTP `/health` на 9091 ✅ (оставить)
- web-ui: добавить `/health` endpoint (см. Task 6), затем `wget http://localhost:3000/health`

### Task 3: Helm — HTTP probes вместо TCP
**Файлы:** `helm/templates/ai-signal-bot.yaml`, `helm/templates/exchange-simulator.yaml`
- ai-signal-bot: `livenessProbe`/`readinessProbe` → `httpGet: /health` на metrics-порт (9090)
- exchange-simulator: `httpGet: /health` на 8775
- hft-trade-bot: уже HTTP ✅ (оставить)

### Task 4: Подключить HealthAggregator
**Файлы:** `ai-signal-bot/run.py`, `ai-signal-bot/src/communication/health_check.py`
- В `AISignalBot.run()` запускать `HealthAggregator` (порт 9092) как фоновую задачу
- Он агрегирует: ai-signal-bot (:9090/health), exchange-simulator (:8775/health), hft-trade-bot (:9091/health)
- Единая точка: `http://localhost:9092/health`

### Task 5: Подключить observability v2
**Файлы:** `ai-signal-bot/run.py`, `ai-signal-bot/src/observability/health_checks.py`, `tracing.py`, `logging.py`
- `HealthChecker` (live/ready/status) — заменить или дополнить `HealthServer`
- `setup_tracing()` — включить OpenTelemetry (Jaeger) с флагом `--tracing`
- `setup_logging()` — JSON-логирование (structlog) с флагом `--json-logs`

### Task 6: Web UI — /health endpoint
**Файлы:** `web-ui/` (Vite dev server / express static)
- Добавить `/health` → `{"status": "ok"}`
- В docker-compose healthcheck для web-ui использовать его

### Task 7: Alertmanager — реальная конфигурация
**Файлы:** `monitoring/alertmanager/config.yml`
- Убрать placeholder'ы (YOUR/SLACK/WEBHOOK)
- Сделать конфиг через env-переменные (SMTP, Slack webhook)
- Добавить `templates/` для кастомного форматирования

### Task 8: Graceful shutdown
**Файлы:** `ai-signal-bot/run.py`, `exchange_simulator/__main__.py`
- Обработка SIGTERM/SIGINT: остановить приём новых сигналов → закрыть позиции (опционально) → закрыть WS → сохранить состояние → exit 0
- В `run.py` уже есть `finally` — добавить явный сигнальный хендлер

### Task 9: Retry/backoff для WebSocket клиентов
**Файлы:** `ai-signal-bot/src/communication/ws_client.py`
- Экспоненциальный backoff: 1s → 2s → 4s → 8s → max 60s
- Jitter (случайная задержка) для избежания thundering herd
- Счётчик реконнектов → метрика `trading_ws_reconnects_total`

### Task 10: Метрики — покрыть пробелы
**Файлы:** `ai-signal-bot/src/monitoring/metrics.py`, `exchange_simulator/metrics.py`
- Добавить: `trading_ws_reconnects_total`, `trading_signals_rejected_total` (по причинам), `trading_db_errors_total`
- Убедиться, что имена метрик совпадают с alert rules в `monitoring/alerts/alerts.yml` (сейчас там `ai_signal_bot_*` и `exchange_simulator_*`, а в коде `trading_*` — НЕСОВПАДЕНИЕ!)

### Task 11: Проверить alert rules vs фактические метрики
**Файлы:** `monitoring/alerts/alerts.yml`, `monitoring/prometheus.yml`
- Alert rules ссылаются на `ai_signal_bot_signal_generation_latency_seconds`, `exchange_simulator_order_latency_seconds` и т.д.
- В коде метрики называются `trading_signal_latency_seconds`, `trading_order_latency_seconds`
- **НЕСОВПАДЕНИЕ ИМЁН** — алерты никогда не сработают! Нужно унифицировать.

---

## ПОРЯДОК ВЫПОЛНЕНИЯ

1. **Task 1** — Exchange Simulator health/metrics (базово, без него всё остальное бессмысленно)
2. **Task 11** — Унификация имён метрик (алерты начнут работать)
3. **Task 2 + 3** — docker-compose + helm probes
4. **Task 4 + 5** — Подключить HealthAggregator + observability
5. **Task 6** — Web UI health
6. **Task 8 + 9** — Graceful shutdown + retry/backoff
7. **Task 7** — Alertmanager
8. **Task 10** — Дополнительные метрики

---

## КРИТЕРИИ ГОТОВНОСТИ

- [ ] `curl localhost:8775/health` → 200 (exchange simulator)
- [ ] `curl localhost:9090/health` → 200 (ai-signal-bot)
- [ ] `curl localhost:9091/health` → 200 (hft-trade-bot)
- [ ] `curl localhost:9092/health` → агрегированный статус всех 3 сервисов
- [ ] `curl localhost:3000/health` → 200 (web-ui)
- [ ] Prometheus скрейпит все 4 таргета (UP)
- [ ] Alert rules совпадают с фактическими именами метрик
- [ ] docker-compose healthchecks — HTTP, не TCP
- [ ] Helm probes — httpGet, не tcpSocket
- [ ] SIGTERM → graceful shutdown (exit 0, состояние сохранено)
- [ ] WS reconnect с экспоненциальным backoff

---

## ПОЛНЫЕ НАХОДКИ АУДИТА (дополнение к плану)

### Дублирование (одно и то же написано 2-3 раза)

| Что | Где | Строк | Статус |
|-----|-----|-------|--------|
| PortfolioOptimizer | `risk/portfolio_optimizer.py` + `strategies/portfolio_optimizer.py` + `portfolio/` пакет | ~1000 | ❌ 3 копии, все только для тестов |
| VaR/CVaR | `risk/var.py`+`cvar.py` vs `risk/var_stress_test.py` | ~600 | ❌ 2 реализации |
| StressTest | `risk/stress_test.py` vs `risk/var_stress_test.py` | ~400 | ❌ 2 реализации |
| Backtester | `backtesting/backtester.py` vs `backtesting/backtest_engine.py` | ~800 | ❌ 2 реализации |
| CircuitBreaker | `communication/` + `strategies/` + `utils/helpers.py` | ~300 | ❌ 3 копии |
| Metrics | `communication/metrics_server.py` vs `monitoring/metrics.py` | ~500 | ❌ 2 реализации |
| Health | `communication/health_check.py` + `monitoring/health_server.py` + `observability/health_checks.py` | ~500 | ❌ 3 реализации |
| compute_returns | 22 копии в research/ | ~130 | ❌ (Day 2 плана) |
| quantize | `info_bottleneck.py` + `transfer_entropy.py` | ~30 | ❌ (Day 3 плана) |

### Мёртвый код (написан, никто не использует)

| Модуль | Строк | Использование |
|--------|-------|---------------|
| `src/ml/` (10 файлов) | ~1000 | 0 импортов, 0 тестов |
| `fix_client.py` | 329 | только тест |
| `ws_connection_pool.py` | ~150 | только тест |
| `networking/socket_transport.py` | ~150 | никто |
| SHM модули (4 файла) | ~600 | никто вне communication/ |
| `marketplace.py`, `cross_exchange_arb.py`, `funding_arb_detector.py` | ~800 | только тесты |
| `portfolio/`, `pricing/`, `notification/`, `data_collection/` | ~1300 | только тесты |

**Итого мёртвого кода: ~4300 строк. С дублированием: ~7000-8000 строк (30% кода).**

### Чего нет (что в нормальных системах есть)

1. **Кеширование индикаторов** — EMA/RSI/ADX/ATR пересчитываются с нуля каждые 60s для 50 символов × 5 стратегий
2. **Rate limiting** — RateLimiter написан в `utils/helpers.py`, но не подключён к broadcast_signal
3. **Idempotency ордеров** — `submit_order` без `client_order_id` → повтор = двойной ордер
4. **Retry/backoff для ордеров** — есть только для WS connect
5. **Graceful shutdown** — нет SIGTERM-обработки (только KeyboardInterrupt)
6. **Tracing** — `setup_tracing()` написан, нигде не вызывается
7. **Schema validation** — WS сообщения не валидируются
8. **Баг в `scripts/run_bot.py`** — `SignalPublisher(ws_port=...)` — параметра `ws_port` НЕ СУЩЕСТВУЕТ, скрипт упадёт. Правильно: `SignalPublisher(host=..., port=...)`

---

## ПРИМЕРЫ КОДА: КАК НЕ НАДО vs КАК НАДО

### Пример 1: Дублирование drawdown-логики (backtester.py)

**КАК НЕ НАДО** — одна и та же логика в двух методах:

```python
# _process_risk_update (строки 118-120)
equity = balance
equity_curve.append(equity)
peak_equity = max(peak_equity, equity)
drawdown = (peak_equity - equity) / peak_equity * 100 if peak_equity > 0 else 0
result.max_drawdown_pct = max(result.max_drawdown_pct, drawdown)

# _track_equity_and_drawdown (строки 147-149) — ТО ЖЕ САМОЕ
equity = self._track_equity(current_position, balance, current_price)
equity_curve.append(equity)
peak_equity = max(peak_equity, equity)
drawdown = (peak_equity - equity) / peak_equity * 100 if peak_equity > 0 else 0
result.max_drawdown_pct = max(result.max_drawdown_pct, drawdown)
```

**КАК НАДО** — один метод, вызывается из двух мест:

```python
def _update_equity_and_drawdown(self, equity_curve, balance, peak_equity, result,
                                current_position=None, current_price=0.0) -> float:
    """Append equity, update peak and max drawdown. Returns new peak_equity."""
    equity = self._track_equity(current_position, balance, current_price)
    equity_curve.append(equity)
    peak_equity = max(peak_equity, equity)
    if peak_equity > 0:
        drawdown = (peak_equity - equity) / peak_equity * 100
        result.max_drawdown_pct = max(result.max_drawdown_pct, drawdown)
    return peak_equity
```

**Разница:** 15 строк дублирования → 1 метод. Если баг в расчёте drawdown — чинишь в одном месте, а не в двух.

---

### Пример 2: Дублирование position sizing (backtester.py + run.py)

**КАК НЕ НАДО** — одинаковый расчёт размера позиции в двух файлах:

```python
# backtester.py _open_position (строки 366-378)
risk_amount = balance * self.risk_per_trade_pct / 100
risk_per_unit = abs(fill_price - signal.stop_loss)
if risk_per_unit <= 0:
    return None
quantity = risk_amount / risk_per_unit
max_notional = balance * self.max_position_pct / 100
max_qty = max_notional / fill_price if fill_price > 0 else 0
quantity = min(quantity, max_qty)

# run.py _execute_paper_order (строки 268-277) — ТОТ ЖЕ РАСЧЁТ
risk_amount = balance * self.config.max_risk_pct / 100
risk_per_unit = abs(signal.entry_price - signal.stop_loss)
if risk_per_unit <= 0:
    return
quantity = risk_amount / risk_per_unit
max_notional = balance * self.config.max_position_size_pct / 100
max_qty = max_notional / signal.entry_price if signal.entry_price > 0 else 0
quantity = min(quantity, max_qty)
```

**КАК НАДО** — общая функция в `src/utils/position_sizing.py`:

```python
def calculate_position_size(balance: float, entry_price: float, stop_loss: float,
                            risk_pct: float, max_position_pct: float) -> float:
    """Risk-based position sizing: risk_pct of balance / distance to SL, capped by max_position_pct."""
    risk_amount = balance * risk_pct / 100
    risk_per_unit = abs(entry_price - stop_loss)
    if risk_per_unit <= 0:
        return 0.0
    quantity = risk_amount / risk_per_unit
    max_qty = balance * max_position_pct / 100 / entry_price if entry_price > 0 else 0
    return min(quantity, max_qty)
```

**Разница:** один источник правды. Меняешь формулу риска — меняется везде. Плюс тест на функцию один, а не два.

---

### Пример 3: Мёртвый параметр (scripts/run_bot.py)

**КАК НЕ НАДО** — вызов с несуществующим параметром:

```python
# scripts/run_bot.py строка 31 — УПАДЁТ с TypeError
publisher = SignalPublisher(ws_port=config.get("websocket_port", 8766))

# Реальная сигнатура (signal_publisher.py строка 58):
def __init__(self, host: str = "0.0.0.0", port: int = 8766):
```

**КАК НАДО**:

```python
publisher = SignalPublisher(host="0.0.0.0", port=int(config.get("websocket_port", 8766)))
```

**Разница:** скрипт реально работает. ИИ написал `ws_port=` потому что "звучит логично", но не проверил сигнатуру. Это классический AI slop — код, который никто не запускал.

---

### Пример 4: Fail-open вместо fail-fast (utils/helpers.py)

**КАК НЕ НАДО** — молча возвращает пустой конфиг при ошибке:

```python
def load_config(config_path: str = "config/settings.yaml") -> dict:
    try:
        import yaml
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}          # ← бот стартует с ПУСТЫМ конфигом
    except (OSError, ValueError, TypeError) as e:
        logging.error(f"Failed to load config {config_path}: {e}")
        return {}          # ← и торгует с дефолтами молча
```

**КАК НАДО** — упасть сразу, чем торговать с неправильными параметрами:

```python
def load_config(config_path: str = "config/settings.yaml") -> dict:
    """Load YAML config. Raises on missing/invalid file — fail fast."""
    import yaml
    with open(config_path) as f:
        config = yaml.safe_load(f)
    if not config:
        raise ValueError(f"Config {config_path} is empty")
    return config
```

**Разница:** пустой конфиг = бот торгует с дефолтными рисками (2% вместо настроенных 5%) — тихая катастрофа. Fail-fast: бот не стартует, ты сразу видишь ошибку.

---

### Пример 5: Имена метрик не совпадают с алертами

**КАК НЕ НАДО** — алерт смотрит на `ai_signal_bot_*`, код пишет `trading_*`:

```yaml
# monitoring/alerts/alerts.yml — ищет ЭТО:
expr: ai_signal_bot_signal_generation_latency_seconds > 0.1
```

```python
# monitoring/metrics.py — а код пишет ЭТО:
self.signal_latency = Histogram(
    "trading_signal_latency_seconds", ...)  # ← никогда не сработает алерт!
```

**КАК НАДО** — одно имя везде:

```python
# monitoring/metrics.py — имя совпадает с алертом
self.signal_latency = Histogram(
    "ai_signal_bot_signal_generation_latency_seconds", ...)
```

**Разница:** алерты молча не работают. Prometheus не ругается на несуществующие метрики в rules — он просто ждёт данные, которых нет. Обнаружить можно только через `promtool check rules` + сравнение с фактическими метриками.

---

### Пример 6: Мёртвый код — 3 реализации одного класса

**КАК НЕ НАДО** — три Health-класса, работает один:

```python
# communication/health_check.py — HealthAggregator (никто не вызывает)
# monitoring/health_server.py — HealthServer (работает, run.py --metrics)
# observability/health_checks.py — HealthChecker (никто не вызывает)
```

**КАК НАДО** — один класс, остальные удалить или re-export:

```python
# monitoring/health_server.py — единственный источник
class HealthServer:
    """HTTP health check server — /health, /ready, /live."""
    ...

# communication/__init__.py — re-export для совместимости
from src.monitoring.health_server import HealthServer
```

**Разница:** 3 класса = 3 места для багов, 3 места для правок. Один класс + re-export = одна реализация, старые импорты продолжают работать.

---

### Пример 7: Нет idempotency у ордеров

**КАК НЕ НАДО** — повторная отправка = двойной ордер:

```python
# ws_client.py submit_order — нет client_order_id
order_msg = {
    "type": "order",
    "exchange": exchange,
    "symbol": symbol,
    "side": side,
    "quantity": quantity,
    "order_type": "MARKET",
    ...
}
# Сеть моргнула → клиент повторил → БИРЖА ИСПОЛНИЛА ДВАЖДЫ
```

**КАК НАДО** — idempotency key:

```python
import uuid

order_msg = {
    "type": "order",
    "client_order_id": str(uuid.uuid4()),  # ← ключ идемпотентности
    "exchange": exchange,
    "symbol": symbol,
    "side": side,
    "quantity": quantity,
    "order_type": "MARKET",
    ...
}
# Биржа: если client_order_id уже видели → вернуть прежний результат, НЕ исполнять повторно
```

**Разница:** в трейдинге повторный ордер = потеря денег. Idempotency key — стандарт в биржах (Binance, Coinbase). Без него retry опасен.

---

### Пример 8: Нет кеширования индикаторов

**КАК НЕ НАДО** — пересчёт с нуля каждые 60s:

```python
# strategies.py analyze() — вызывается для 50 символов × 5 стратегий каждые 60s
closes = [c["close"] for c in candles]      # 200 свечей
ema_f = ema(closes, self.ema_fast)          # полный пересчёт O(N)
ema_s = ema(closes, self.ema_slow)          # ещё раз O(N)
adx_vals = adx(candles, 14)                 # ещё раз O(N)
atr_vals = atr(candles, 14)                 # ещё раз O(N)
# Итого: 50 × 5 × 4 индикатора × 200 свечей = 200 000 операций каждые 60s
```

**КАК НАДО** — инкрементальное обновление O(1):

```python
class IndicatorCache:
    """Incremental indicator updates — O(1) per new candle."""

    def __init__(self, period: int):
        self.period = period
        self._ema: float | None = None
        self._alpha = 2 / (period + 1)

    def update(self, price: float) -> float:
        """EMA update: EMA_new = α·price + (1-α)·EMA_old — 1 умножение, 1 сложение."""
        if self._ema is None:
            self._ema = price
        else:
            self._ema = self._alpha * price + (1 - self._alpha) * self._ema
        return self._ema
```

**Разница:** 200 000 операций → 50 × 5 × 4 = 1000 операций (в 200 раз меньше). EMA/RSI/ADX/ATR — все имеют O(1) инкрементальные формулы (Wilder's smoothing).

---

### Пример 9: Нет graceful shutdown

**КАК НЕ НАДО** — только KeyboardInterrupt:

```python
# run.py — Ctrl+C работает, но SIGTERM (docker stop, k8s) — НЕТ
try:
    while self._running:
        await asyncio.sleep(self.config.signal_interval)
        await self._generate_signals()
except KeyboardInterrupt:
    self.logger.info("Stopping...")
finally:
    self._running = False
    # ... cleanup
```

**КАК НАДО** — обработка SIGTERM:

```python
import signal

def _install_signal_handlers(self) -> None:
    """Handle SIGTERM/SIGINT for graceful shutdown (docker stop, k8s)."""
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, self._request_shutdown)

def _request_shutdown(self) -> None:
    """Request graceful shutdown — stop accepting new signals, drain, exit."""
    self.logger.info("Shutdown requested — draining...")
    self._running = False
```

**Разница:** `docker stop` шлёт SIGTERM. Без обработчика контейнер убивается через 10s принудительно (SIGKILL) — позиции не закрыты, состояние не сохранено. С обработчиком — чистый drain.

---

### Пример 10: Дублирование стратегий в signal_publisher

**КАК НЕ НАДО** — своя сборка стратегий в publisher:

```python
# signal_publisher.py _build_strategies (строки 364-391)
# Дублирует bot_helpers.build_strategies() с другими параметрами по умолчанию!
if strategy_name in ("trend", "all", "ensemble"):
    strategies["Trend Following"] = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=25)
if strategy_name in ("mean_reversion", "all", "ensemble"):
    strategies["Mean Reversion"] = MeanReversionStrategy(rsi_oversold=30, rsi_overbought=70, bb_period=20, bb_std=2.0)
```

**КАК НАДО** — переиспользовать:

```python
# signal_publisher.py — импорт из bot_helpers
from src.utils.bot_helpers import build_strategies

# ... в _run_backtest:
strategies = {s.name: s for s in build_strategies(config)}
```

**Разница:** две сборки стратегий = два набора параметров = бэктест в UI показывает другие результаты, чем live-бот. Один источник = консистентность.

---

## ДОПОЛНЕНИЕ АУДИТА — GREP НАХОДКИ (26 пунктов)

> Полный документ: `docs/AUDIT_FINDINGS.md`

### Reliability-критичные находки

| # | Проблема | Файл | Влияние |
|---|----------|------|---------|
| 009 | `except Exception: pass` | `db.py:33` | Ошибки checkpoint WAL молча глотаются. БД может остаться в inconsistent state |
| 021 | `Exception` в кортеже исключений | `feature_store.py:94` | `except (OSError, ConnectionError, RuntimeError, Exception)` — Exception делает остальные избыточными. Ловит ВСЁ включая KeyboardInterrupt |
| 022 | f-string в logger (~80+ calls) | `src/` повсеместно | f-string вычисляется даже если log level отключён. В prod с INFO логированием все DEBUG f-strings всё равно форматируются |
| 023 | `os.system` | `monitor.py:21` | Shell injection potential (хотя здесь безопасно — static string) |
| 025 | `open()` без `encoding=` (7 файлов) | `fix_client.py`, `llm_engine/engine.py`, `ml/automl.py`, `ml/model_registry.py`, `strategies/marketplace.py` | На Windows с cp1251 чтение UTF-8 файлов → UnicodeDecodeError. Критично для JSON с non-ASCII |
| 013 | Hardcoded `localhost:8765` | `ws_client.py`, `exchange_factory.py`, `price_monitor.py` | В Docker/K8s localhost ≠ exchange-simulator. Должно быть через config/env |

### Reliability-проверенные паттерны (ЧИСТО)

| Паттерн | Кол-во | Статус |
|---------|--------|--------|
| `SIGTERM`/`signal.signal` | 0 | ❌ Нет (см. Task 8) |
| `graceful shutdown` | 0 | ❌ Нет (см. Task 8) |
| `backpressure` | 0 | ❌ Нет |
| `idempotent` (production) | 0 | ❌ Нет (см. CODE_AUDIT §4.4) |
| `retry`/`backoff` | 0 | ❌ Нет для ордеров (см. Task 9) |
| `deadlock`/`lock_timeout` | 0 | ❌ Нет |
| `sharding`/`partition` | 0 | ❌ Нет (см. CODE_AUDIT §4.2) |
| `WAL` mode | ✅ | `db.py:23` — `PRAGMA journal_mode=WAL` |
| `CancelledError` handling | ✅ | 10 файлов — правильно обрабатывают |
| `CircuitBreaker` | ✅ | `communication/circuit_breaker.py` — работает |
| `RateLimiter` | ⚠️ | `utils/helpers.py` — написан, не подключён к broadcast |
| `health_check` | ⚠️ | Частично (см. Tasks 1-6) |
| `connection_pool` | ✅ | `price_feed_apis.py` — aiohttp TCPConnector |
| `KeyboardInterrupt` | ✅ | 10 файлов — есть, но без SIGTERM |

### Дополнительные reliability-находки (расширенный grep)

| # | Проблема | Файл | Severity | Влияние |
|---|----------|------|----------|---------|
| R1 | Race condition: `_clients` set без lock | `signal_publisher.py` | Medium | `RuntimeError: Set changed size during iteration` при concurrent broadcast + connect/disconnect |
| R2 | Нет DB `busy_timeout` | `db.py:22` | Medium | `database is locked` при concurrent writes (WAL mode, но 5s default timeout) |
| R3 | Нет DB connection pooling | `db.py` | Medium | Каждый метод открывает/закрывает соединение. При масштабировании — overhead |
| R4 | Нет socket buffer tuning | `hft-trade-bot/src/` | Low | WS client использует OS defaults (64-128KB). При bursts возможны dropped packets |
| R5 | SQL injection | `db.py` | ✅ Чисто | Все запросы parameterized (`?` placeholders) |
| R6 | Unbounded structures | `src/` | ✅ Чисто | Все истории используют `deque(maxlen=...)` |
| R7 | C++ concurrency | `hft-trade-bot/src/` | ✅ Правильно | atomics, mutexes, SPSC queue, spinlocks, CAS, cache-line alignment |
| R8 | Resource leak: aiohttp session per alert | `alerting.py:168,190,205` | Medium | Каждая отправка алерта создаёт новую ClientSession. При частых алертах — overhead |
| R9 | Docker healthchecks TCP вместо HTTP | `docker-compose*.yml` | Medium | TCP проверяет только порт, не готовность сервиса. exchange-simulator и ai-signal-bot |
| R10 | Helm probes отсутствуют | `helm/templates/*.yaml` | High | K8s сервисы без liveness/readiness probes. Pod не рестартует при hang |
| R11 | Нет top-level ErrorBoundary | `web-ui/src/App.jsx` | Low | При падении корневого компонента — белый экран |
| R12 | Magic numbers в publisher | `signal_publisher.py` | Low | `maxlen=100`, `sleep(5)`, `Random(42)` — не из config |
| R13 | Missing DB indexes (timestamp, composite) | `db.py:78-80` | Medium | `get_stats` full-scan на `trades WHERE status='CLOSED' AND pnl > 0`. equity_curve без индекса |
| R14 | C++ `catch (...)` без логирования | `kill_switch.h:64` | Low | Kill switch — safety-critical. Silent failure = kill switch не работает, бот торгует дальше |
| R15 | No CORS configuration | `signal_publisher.py`, `exchange_simulator/` | Low | WebSocket не требует CORS, но HTTP endpoints (metrics, health) заблокированы для браузера |
| R16 | No PropTypes/TypeScript в web-ui | `web-ui/src/` | Low | Нет runtime prop validation. Wrong prop type = silent failure или crash |
| R17 | Env secrets handling | `ai-signal-bot/` | ✅ Clean | All via `os.getenv()` / `os.environ.get()`, no hardcoded secrets |
| R18 | Docker-compose secrets | `docker-compose*.yml` | ✅ Clean | No secrets in compose files, all via env vars / `.env` |
| R19 | No log rotation | весь проект | Medium | Log files grow unbounded → disk full → bot crashes |
| R20 | Float precision in financial calc | `src/` повсеместно | Medium | IEEE 754 float errors accumulate in P&L over thousands of trades |
| R21 | No WS message validation | `communication/` | Medium | Raw JSON accepted, no pydantic/schema validation. Malformed msg → KeyError |
| R22 | No DB retention/cleanup | `db.py` | Medium | signals/trades/equity_curve grow forever. ~2.6M rows/year |
| R23 | No auth on health/metrics | `monitoring/` | Low | Endpoints open. OK in Docker/K8s with netpol, risky if exposed |
| R24 | Dependency pinning | `requirements.txt` | ✅ Good | All pinned with `==`. Optional deps (scipy, LightGBM) not listed |
| R25 | Rust `unwrap()`/`expect()` panic | `hft-executor/lib.rs:80,156,159` | Medium | `expect()` panics process if runtime fails. `unwrap_or_default()` sends empty string on serialization error |
| R26 | Rust FFI: no idempotency | `hft-executor/lib.rs:151` | Medium | Local seq, not `client_order_id`. Reconnect = exchange can't deduplicate |
| R27 | Rust: no fill tracking | `hft-executor/lib.rs:178` | Low | Fills only counted, not stored. `avg_latency_ns` always 0 |
| R28 | Rust: string matching for fills | `hft-executor/lib.rs:209` | Low | `text.contains("fill")` instead of JSON parsing. Fragile |
| R29 | exchange_simulator exceptions | `exchange_simulator/` | ✅ Clean | Only `except ImportError` for optional deps. No broad catches |
| R30 | C++ raw pointers | `hft-trade-bot/src/` | ✅ Clean | All smart pointers (`unique_ptr`, `make_unique`). No manual new/delete |
| R31 | No network timeout in config | `config/settings.yaml` | Medium | All timeouts hardcoded in source. Changing timeout = code change + redeploy |
| R32 | Prometheus HFT metrics path | `prometheus.yml:28` | Low | Scrapes `/metrics` but C++ bot may only expose `/health`. Possible 404 |
| R33 | No HFT-specific alert rules | `alerts.yml` | Low | No alerts for HFT executor, signal publisher, DB locked, circuit breaker changes |
| R34 | CI/CD pipeline | `.github/workflows/ci.yml` | ✅ Excellent | 18 jobs: lint, test, build, docker, security, e2e, coverage, test-count floor |
| R35 | CI: npm audit non-blocking | `ci.yml:332` | Low | `|| true` means high-severity vulns don't fail CI |
| R36 | No config schema validation | `config/settings.yaml` | Medium | No pydantic/schema. Wrong type in YAML → runtime TypeError |
| R37 | Dockerfile security | `Dockerfile*` | ✅ Good | Multi-stage, non-root, --no-install-recommends, .dockerignore. Tag pins not digests |
| R38 | Dockerfile healthcheck TCP | `ai-signal-bot/Dockerfile:42` | Medium | TCP socket check, not HTTP /health. Same as docker-compose issue |
| R39 | Terraform encryption | `terraform/` | Low | No encrypt/KMS/SSE config. Skeleton/stub .tf files only |
| R40 | Dead code: tracing.py | `observability/tracing.py` | Low | 111 lines, fully implemented, never imported. 0 grep matches for setup_tracing |
| R41 | Test coverage gaps | `tests/` | Medium | No tests for signal_publisher, ws_client, db.py, alerting, llm_engine, notifier, observability |
| R42 | No signal handling / graceful shutdown | весь проект | **High** | No SIGTERM/SIGINT handler. Ctrl+C = immediate kill, no DB close, no WS notify, no session cleanup |
| R43 | No WS keepalive (ping/pong) | `signal_publisher.py`, `ws_client.py` | Medium | Silent disconnects undetected. Firewalls drop idle connections after 60s |
| R44 | No reconnection backoff with jitter | `ws_client.py` | Medium | No backoff in Python. Rust has backoff but no jitter → thundering herd on mass reconnect |
| R45 | 3x CircuitBreaker duplication | `communication/`, `strategies/`, `utils/helpers.py` | Medium | 3 different implementations, different APIs. #3 in helpers.py never imported |
| R46 | RateLimiter — dead code | `utils/helpers.py:179` | Low | Implemented, exported, tested — but never used in production. No rate limiting on orders/API/signals |
| R47 | No asyncio task management | `src/` | Medium | No TaskGroup, no task cancellation on shutdown, background tasks fire-and-forget. Crashes go unnoticed |
| R48 | Health check no dependency depth | `health_check.py` | Medium | Checks HTTP 200 only, not DB/exchange/queue/client count. "Healthy" while DB locked |
| R49 | Health aggregator session leak | `health_check.py:53` | Medium | New aiohttp ClientSession per check call. 3 services × every interval = 3 sessions |
| R50 | No retry on transient failures | `src/` | Medium | No retry on exchange 429/5xx, DB locked, LLM rate limit. Circuit breaker blocks but doesn't retry |
| R51 | Health aggregator 0.0.0.0 bind | `health_check.py:116` | Low | Binds all interfaces. `# nosec: B104` acknowledges. OK in Docker, risky in direct deploy |
| R52 | Code reduction potential | `src/` | Info | ~510 lines removable: 3× CircuitBreaker→1, dead tracing.py, dead RateLimiter, compute_returns dup |
| R53 | F-string logging — not structured | весь `src/` | Low | 30+ f-string log calls. Flat strings, unparseable by Loki/ELK/Datadog |
| R54 | SHM no cleanup on crash | `shm_signal_producer.py` | Medium | SIGKILL/OOM = SHM segment not unlinked. Restart fails (segment exists) |
| R55 | SHM polling at 1ms | `shm_fill_consumer.py:62` | Low | 1000 polls/sec, 5-10% CPU wasted when no fills. Use eventfd or 10ms interval |
| R56 | Dual metrics systems | `metrics_server.py` + `metrics.py` | Medium | Custom text format + prometheus_client. Overlapping metric names, dashboards confused |
| R57 | No asyncio.Lock on shared state | `signal_publisher.py` | Medium | `_clients` set mutated from multiple coroutines without lock. `await` during iteration → RuntimeError |
| R58 | Helm: no PodDisruptionBudget | `helm/templates/` | Medium | Node drain can evict all pods → downtime. Single-replica StatefulSet has no protection |
| R59 | Helm: no NetworkPolicy | `helm/templates/` | Medium | All pods can reach all pods. DB should only accept from app pods |
| R60 | Helm: hardcoded PG password | `values.yaml:17` | Medium | Default "change-me-in-production". No validation it was changed. `helm install` without override = known password |
| R61 | Docker Compose: no resource limits | `docker-compose.yml` | Medium | No memory/CPU limits. Memory leak = host crash. Helm has limits, compose doesn't |
| R62 | WS input: no schema validation | `signal_publisher.py:141` | Medium | `json.loads` accepts anything. No type check, no size limit. Malicious client can crash bot |
| R63 | DB migrations: no runner | `database/migrations/` | Medium | 4 SQL files exist but no code to apply them. No version tracking. SQLite and PG schemas diverged |
| R64 | Alertmanager hardcoded credentials | `alertmanager/config.yml:12,56,62` | Medium | SMTP password, Slack/Discord webhooks are placeholders. Critical alerts silently fail |
| R65 | shared_config.yaml hardcoded localhost | `shared_config.yaml:108,112` | Medium | Won't work in Docker/K8s. Services communicate via names, not localhost |
| R66 | C++ memory ordering | `hft-trade-bot/src/` | ✅ Correct | Relaxed for stats, release for signaling, CAS for min/max. Balance relaxed OK (single-threaded exec) |
| R67 | Grafana dashboards | `grafana/dashboards/` | ✅ Good | 5 dashboards + provider config. Well-configured |
| R68 | Alertmanager: no silence/maintenance | `alertmanager/config.yml` | Low | No auto-silence during deploy. All alerts fire on restart |
| R69 | CMake build | `CMakeLists.txt` | ✅ Excellent | C++20, ccache, PCH, PGO, mimalloc/jemalloc, ASan/UBSan, 30+ tests, cross-platform |
| R70 | Cargo.toml release profile | `Cargo.toml` | ✅ Good | opt-level=3, lto, codegen-units=1, panic=abort (correct for FFI), strip |
| R71 | Pre-commit hooks | `.pre-commit-config.yaml` | ✅ Good | ruff, eslint, detect-private-key, check-yaml, large-files |
| R72 | Makefile: no C++ test target | `Makefile:23` | Low | `make test` runs Python + JS but not C++ CTest. 30+ C++ tests skipped |
| R73 | Rust panic=abort + unwrap | `Cargo.toml:25` + `lib.rs` | Low | Correct for FFI, but unwrap() = immediate abort. SystemTime error kills C++ host |
| R74 | exchange_simulator config_validator | `config_validator.py` | ✅ Good | Validates structure, ranges, cross-refs. Returns (errors, warnings). Exits on error |
| R75 | exchange_simulator global singletons | `audit_logger.py`, `health.py`, `metrics.py`, `tracing.py` | Low | 4 global mutable singletons. Same pattern as ai-signal-bot. Safe in asyncio |
| R76 | C++ signal handling | `bot_setup.cpp:11-13` | ✅ Good | `atomic<bool> g_running`, signal_handler sets false, main loop checks is_running() |
| R77 | deploy.sh: no health check failure exit | `deploy.sh:176-218` | Medium | 30 retries but never exits on failure. Reports "completed successfully" even if all down |
| R78 | deploy.sh: rollback rm -rf before cp | `deploy.sh:266-267` | Low | rm -rf data before cp backup. If cp fails, data lost. No atomic swap |
| R79 | deploy.sh: no backup retention | `deploy.sh:32-62` | Low | Backups never cleaned. 100 deploys = 100 copies. No rotation policy |
| R80 | ESLint: PropTypes + unused-vars disabled | `eslint.config.js:23,27` | Low | No prop type checking, dead vars accumulate. TS in devDeps but unused |
| R81 | Vite: no CSP headers | `vite.config.js` | Low | No Content-Security-Policy. XSS easier if served directly |
| R82 | hft-trade-bot config: hardcoded localhost | `config.yaml:76,165` | Medium | ws://localhost:8765/8766. Won't work in Docker/K8s |
| R83 | FIX session: seq num persistence | `fix_session.h:251-268` | ✅ Good | Seq nums saved/loaded from file. Mutex-protected. Minor: no atomic write |
| R84 | ErrorBoundary: no top-level | `App.jsx` | Medium | Per-panel boundaries but App itself unprotected. Crash = white screen |
| R85 | Code reduction: exchange_simulator | `exchange_simulator/` | Low | ~200 lines removable. Total reduction ~710 lines (510 + 200) |
| R86 | config.prod.yaml | `config.prod.yaml` | ✅ Excellent | All secrets from env, stricter risk, kill switch with auto-cancel/close, thread pinning, rate limits per exchange |
| R87 | settings.testnet.yaml | `settings.testnet.yaml` | ✅ Good | Env vars for API keys, 3 symbols only, clear testnet docs |
| R88 | Dependabot config | `dependabot.yml` | ✅ Excellent | 7 configs (pip×2, npm, GH Actions, Docker×4). Weekly, grouped, labeled |
| R89 | SECURITY.md | `SECURITY.md` | ✅ Good | Vuln reporting process, 48h SLA, scope definition. Inaccurate WS validation claim |
| R90 | Docker Compose staging | `staging.yml` | ✅ Good | All 6 services have limits, JSON logging, restart backoff, health checks |
| R91 | C++ kill switch | `kill_switch.h`, `bot_setup.cpp:217` | ✅ Excellent | Dual trigger (SHM+file), 5 reasons, auto-cancel+close, SHM fallback, poll interval |
| R92 | SECURITY.md: inaccurate WS claim | `SECURITY.md:35` | Low | Claims WS validated but §8.71 showed no schema validation |
| R93 | Health checks v2: deep probes | `health_checks.py` | ✅ Excellent | Liveness + readiness + status. Per-component. HTTP 503 when unhealthy. Specific exceptions |
| R94 | Notifier: Telegram/Discord | `notifier.py` | ✅ Good | Env vars, session closed, task cancelled, chat ID validation. No retry on send failure |
| R95 | Rust FFI: null pointer safety | `lib.rs:233-297` | ✅ Good | All FFI functions check null. Box::from_raw in destroy. 22 FFI tests |
| R96 | Rust tests: comprehensive | `lib.rs:299-524` | ✅ Good | 22 tests: order, batch, stats, FFI null safety, serialization round-trip |
| R97 | dpdk_transport.py: source missing | `networking/dpdk_transport.py` | Medium | Only .pyc exists. Can't lint, audit, or modify. Version-specific. git clean = gone |
| R98 | Health checks: not wired into bot | `health_checks.py` | Medium | HealthChecker exists but not used in run.py. Bot uses shallow health_check.py instead |
| R99 | C++ order_executor: detached thread | `order_executor.h:57-63` | Medium | Detached reconnect thread captures `this`. Destroy while sleeping = use-after-free |
| R100 | C++ order_executor: snprintf truncation | `order_executor.h:108-128` | Low | snprintf truncates silently. Long exchange_id/symbol = malformed JSON sent |
| R101 | C++ position_manager_v2 | `position_manager_v2.h:140-150` | ✅ Good | O(1) atomic counter, spinlock, stale entry cleanup, relaxed ordering correct |
| R102 | web-ui useWebSocket | `useWebSocket.ts` | ✅ Excellent | Ping/pong, backoff, ring buffer, batching, sync-on-reconnect, outgoing queue, clean cleanup |
| R103 | web-ui useTradingStore | `useTradingStore.js` | ✅ Good | Clean zustand store, batch setters, no prop drilling, no mutation issues |
| R104 | Dockerfile.prod (both) | `Dockerfile.prod` ×2 | ✅ Good | Multi-stage, non-root, no-cache pip, TCP healthcheck, PYTHONUNBUFFERED |
| R105 | .env.prod.example: placeholder passwords | `.env.prod.example:24-25` | Low | `change_me_to_a_secure_password` — no validation that password was actually changed |
| R106 | .env.prod.example: localhost WS URLs | `.env.prod.example:39-40` | Low | Vite build-time args default to localhost. Docker build without override = broken WS |
| R107 | C++ smart_order_router_v2 | `smart_order_router_v2.h` | ✅ Excellent | 5 strategies, anti-toxic backoff, depth check, stack-allocated, IExchange interface |
| R108 | C++ health_server: accept() blocks | `health_server.h:95-96` | Medium | accept() blocks indefinitely. stop() can't join thread until next connection arrives |
| R109 | C++ health_server: raw POSIX HTTP | `health_server.h` | ✅ Good | Cross-platform, SO_REUSEADDR, HTTP 503 when unhealthy, RAII destructor calls stop() |
| R110 | Makefile.prod: migration runner | `Makefile.prod:48-60` | ✅ Good | Runs SQL files via asyncpg. But no _migrations tracking, not idempotent, not automatic |
| R111 | Makefile.prod: health+backup+deploy | `Makefile.prod:80-101` | ✅ Good | prod-health checks 6 endpoints, prod-db-backup pg_dump, prod-deploy pipeline |
| R112 | docker-compose.hub.yml | `docker-compose.hub.yml` | ✅ Good | Pre-built Docker Hub images, health checks, depends_on healthy, networks, restart |
| R113 | build-all.bat | `build-all.bat` | ✅ Good | 6-component Windows build, multiple modes, error tracking, per-component status |
| R114 | CI workflow | `ci.yml` | ✅ Excellent | Python+C+++JS+Rust lint+test, Bandit, CodeQL, npm audit, Docker build, concurrency control |
| R115 | C++ low_latency.h | `low_latency.h` | ✅ Excellent | Spinlock+SPSC+ObjectPool+Histogram+ThreadPin+CircuitBreaker+Retry. Correct memory ordering, cache-line aligned |
| R116 | GitHub deploy.yml | `deploy.yml` | ✅ Excellent | Netlify+Docker push+SSH deploy+health check+Discord/Telegram notify. Semver tags, GHA cache |
| R117 | docker-compose dev: no limits | `docker-compose.yml` | Low | No resource limits. OK for dev, already noted §8.68 |
| R118 | docker-compose dev: Grafana admin/admin | `docker-compose.yml:187` | Low | Default creds. Fine for local dev, risky if exposed |
| R119 | docker-compose dev: VITE_WS localhost | `docker-compose.yml:118` | ✅ Correct | Comment explains browser-side resolution. Correct for dev |
| R120 | CONTRIBUTING.md | `CONTRIBUTING.md` | ✅ Good | 616 lines. Prerequisites, Win/Linux/macOS setup, build, test, code style, PR process |
| R121 | Helm _helpers.tpl | `_helpers.tpl` | ✅ Good | Standard labels + selector labels per K8s conventions |
| R122 | C++ CircuitBreaker: relaxed ordering race | `low_latency.h:366` | Low | record_success + record_failure can race on error_count_. Acceptable for safety-net CB |
| R123 | C++ ObjectPool: O(n) acquire | `low_latency.h:153` | Low | Linear scan. Fine for small pools. Free-list would be O(1) but adds complexity |
| R124 | deploy.yml: health check no exit | `deploy.yml:143` | Low | WARNING logged but pipeline succeeds. Notify sends SUCCESS even when services down |
| R125 | C++ aligned_types.h | `aligned_types.h` | ✅ Excellent | Cache-line aligned (alignas(64)), static_assert, FastSignal no heap (char[32] not string) |
| R126 | C++ IExchange interface | `IExchange.h` | ✅ Good | Pure virtual, DIP/SOLID, SmartOrderRouter depends on interface not concrete |
| R127 | C++ bot_context: God struct | `bot_context.h:67-111` | Medium | 25+ members, all components coupled. Hard to test individually |
| R128 | C++ bot_context: SPSCQueue + mutex | `bot_context.h:99-100` | Low | SPSC is single-producer but mutex suggests multi-thread. Race or unnecessary mutex |
| R129 | GitHub codeql.yml | `codeql.yml` | ✅ Excellent | 3 languages, weekly scan, paths-ignore, least-privilege, fail-fast false |
| R130 | docker-compose.prod.yml | `docker-compose.prod.yml` | ✅ Excellent | Mandatory secrets (:?), resource limits, network segmentation, SHM IPC, pinned images |
| R131 | docker-compose.prod: backend internal | `docker-compose.prod.yml:273` | ✅ Good | backend network internal: true — DBs not accessible from host |
| R132 | docker-compose.prod: VITE_WS fallback | `docker-compose.prod.yml:237` | Low | Defaults to localhost without :? check. Forgetting to set = broken WS in prod |
| R133 | C++ bot_loop.h | `bot_loop.h` | ✅ Good | Clean function separation, BotContext& by ref, no globals |
| R134 | C++ risk_manager.h: dual V1+V2 | `risk_manager.h` | ✅ Good | V1 no-mutex hot path with [[unlikely]], V2 mutex-protected 8 checks, CAS rate limiter |
| R135 | C++ risk_manager: check_order mutex | `risk_manager.h:101` | Medium | Mutex on every order submission serializes all orders. Use shared_mutex for read-heavy |
| R136 | C++ risk_manager: daily_pnl += race | `risk_manager.h:201` | Low | atomic<double> += is not atomic (load+store). Use fetch_add. on_fill uses fetch_sub correctly |
| R137 | C++ pre_trade_risk: token bucket | `pre_trade_risk.h` | ✅ Excellent | Lock-free CAS token bucket, O(1) check, const char* reasons, blacklist+whitelist |
| R138 | C++ pre_trade_risk: blacklist not thread-safe | `pre_trade_risk.h:189` | Medium | insert/erase on unordered_set while check() reads concurrently = data race UB |
| R139 | C++ portfolio_risk.h | `portfolio_risk.h` | ✅ Good | VaR/CVaR/drawdown/stress, fixed-size arrays, no heap alloc in hot path |
| R140 | C++ simd_indicators.h | `simd_indicators.h` | ✅ Excellent | AVX2 EMA/RSI with _mm256_fmadd_pd, scalar fallback, compile-time guard |
| R141 | C++ signal_receiver.h | `signal_receiver.h` | ✅ Good | WebSocket++ client, callback-based, symbol ID mapping, nlohmann/json parsing |
| R142 | Terraform: hardcoded RDS password | `dev/main.tf:31` | Medium | default = "ChangeMeInProduction123!" — RDS gets weak password if not overridden |
| R143 | Terraform: S3 backend encryption+locking | `dev/main.tf:13` | ✅ Good | encrypt=true, dynamodb_table for locking. State protection done right |
| R144 | Terraform: modular structure | `dev/main.tf` | ✅ Good | VPC+EKS+RDS+ElastiCache+S3 modules, environment-specific, outputs |
| R145 | verify.bat | `verify.bat` | ✅ Good | 5-component Windows test runner, error tracking, graceful CMake skip |
| R146 | C++ duplicate risk system | `risk_manager.h` vs `pre_trade_risk.h` | Medium | Two systems doing same 8 checks. Consolidate to PreTradeRisk (lock-free) |
| R147 | C++ risk_manager: reset_daily incomplete | `risk_manager.h:214` | Low | Resets daily_pnl but not peak_equity_ → drawdown compares against yesterday's peak |
| R148 | C++ signal_engine_v2 | `signal_engine_v2.h` | ✅ Excellent | 6-indicator composite, no heap alloc, branchless, alignas(64), cooldown |
| R149 | C++ signal_engine_v3 | `signal_engine_v3.h` | ✅ Excellent | HMM regime detection, Viterbi, online Baum-Welch, O(1) per-tick, gates V2 signals |
| R150 | C++ market_making_v2 | `market_making_v2.h` | ✅ Excellent | Avellaneda-Stoikov, reservation price, inventory skew, adverse selection, EWMA vol |
| R151 | C++ shm_ring_buffer | `shm_ring_buffer.h` | ✅ Excellent | Cross-process SPSC, mmap+MAP_SHARED, cache-line aligned, magic validation, RAII |
| R152 | C++ shm_heartbeat | `shm_heartbeat.h` | ✅ Good | Seq-guarded lock-free heartbeat, alignas(64), bidirectional, cross-platform |
| R153 | ai-signal-bot migrate.py | `scripts/migrate.py` | ✅ Excellent | Idempotent: schema_migrations table, skip applied, record new. Makefile.prod should use this |
| R154 | migrate.py: narrow exception | `scripts/migrate.py:80` | Low | Doesn't catch asyncpg.PostgresError. SQL errors crash with traceback |
| R155 | Helm Chart.yaml | `Chart.yaml` | ✅ Good | Standard v2 chart, appVersion matches Docker Hub tags, keywords, maintainer |
| R156 | C++ 3 signal engines (v1/v2/v3) | `signal_engine*.h` | Medium | 3 versions in BotContext. V2 may be dead code (only through V3). ~200 lines reducible |
| R157 | C++ shm: no cleanup on crash | `shm_ring_buffer.h:168` | Info | shm_unlink not called on crash. Stale segment persists. Already noted R92 |
| R158 | C++ shm: stale data on restart | `shm_ring_buffer.h:134` | Low | Magic/capacity validation passes but head/tail may be inconsistent after crash |
| R159 | C++ adaptive_order_selector_v2 | `adaptive_order_selector_v2.h` | ✅ Excellent | Dynamic IOC/FOK/GTD/PostOnly, confidence/spread/toxicity/OBI, const char* reason, noexcept |
| R160 | C++ mean_reversion_v2 | `mean_reversion_v2.h` | ✅ Excellent | OU + KalmanFilter1D, z-score, vol-scaled entry/exit, half-life holding, no heap |
| R161 | C++ statistical_arb_v2 | `statistical_arb_v2.h` | ✅ Excellent | Engle-Granger cointegration, Kalman hedge ratio, z-score entry/exit/stop, no heap |
| R162 | C++ momentum_breakout_v2 | `momentum_breakout_v2.h` | ✅ Good | EMA stack 9/21/50/200, volume confirm, ATR breakout, ADX-gated, no heap |
| R163 | C++ inline_indicators | `inline_indicators.h` | ✅ Excellent | O(1) EMA/RSI/ADX/VWAP/ATR, StringHash transparent (no string alloc), [[unlikely]] |
| R164 | C++ system_monitor | `system_monitor.h` | ✅ Excellent | 11 atomic counters, fetch_add(relaxed), snapshot, fill/rejection rate, MemoryTracker |
| R165 | C++ system_monitor: snprintf done right | `system_monitor.h:110-127` | ✅ Good | min(n, sizeof-1) truncation guard + n<=0 check. Contrast with order_executor §8.118 |
| R166 | C++ types.h | `types.h` | ✅ Good | Candle/OrderBook/Order/Position, empty checks, optional<double> price, PnL with fees |
| R167 | C++ types.h: string_to_side no validation | `types.h:21-23` | Low | Any non-"BUY" string → SELL. "buy", "HOLD", garbage → SELL silently |
| R168 | web-ui: setInterval cleanup | `components/*.jsx` | ✅ Good | All 6 setInterval calls have clearInterval cleanup in useEffect return |
| R169 | web-ui: 50+ components code reduction | `components/` | Medium | Many math viz panels may be unused. ~1000+ lines reducible if 10-15 dead |
| R170 | C++ system_monitor: snapshot not atomic | `system_monitor.h:76-93` | Low | 11 separate relaxed loads. Inconsistent snapshot. Acceptable for monitoring |
| R171 | C++ strategies: 5 strategy files | `strategies/*.h` | ✅ Good | mean_reversion, stat_arb, momentum, market_making, pressure_model — all no heap, research-grade |
| R172 | C++ pressure_model | `pressure_model.h` | ✅ Excellent | Multi-level OBI, toxicity, trade flow, spread regime, single-pass, no heap, [[unlikely]] |
| R173 | C++ obi_utils | `obi_utils.h` | ✅ Good | Extracted from signal_engine_v2, single-pass compute_obi_all, noexcept, 1e-12 guard |
| R174 | C++ signal.h: NEUTRAL→BUY | `signal.h:28` | Low | side() returns BUY for NEUTRAL. Comment says check is_actionable() but no enforcement |
| R175 | Helm values.yaml: hardcoded passwords | `values.yaml:17,132` | Medium | postgres password "change-me-in-production", grafana adminPassword "" → admin/admin |
| R176 | Helm values.yaml: resource limits | `values.yaml` | ✅ Good | All 7 services have requests+limits. Better than docker-compose dev |
| R177 | Helm values.yaml: VITE_WS localhost | `values.yaml:104-105` | Medium | localhost WS URLs in K8s config. Browser can't reach localhost in cluster |
| R178 | web-ui ExchangeContext | `ExchangeContext.jsx` | ✅ Good | 3 exchange themes/layouts, CSS vars, useCallback, throws outside provider |
| R179 | web-ui usePerformance | `usePerformance.js` | ✅ Excellent | debounce/throttle/batch/worker/intersection — all with cleanup, no leaks |
| R180 | C++ signal.h: rr_ratio guard | `signal.h:31-42` | ✅ Good | risk > 0 check before division, returns 0.0 on invalid SL/TP |
| R181 | Helm values.yaml: ingress disabled | `values.yaml:143` | ✅ Good | Ingress+TLS disabled by default. Must explicitly enable for public exposure |
| R182 | C++ signal.h: string direction | `signal.h:11` | Info | std::string direction (heap) vs FastSignal char[32]. OK for receive side, not hot path |
| R183 | C++ signal.h: side() silent default | `signal.h:28` | Low | Same pattern as string_to_side — NEUTRAL silently becomes BUY order |
| R184 | C++ ExchangeBase | `ExchangeBase.h` | ✅ Excellent | EWMA latency CAS loop, toxic backoff, atomic counters, clean base class |
| R185 | C++ BinanceAdapter | `BinanceAdapter.h` | ✅ Good | HMAC-SHA256, CAS rate limit, Spinlock, listenKey ping, symbol_lower |
| R186 | C++ BinanceAdapter: nested Spinlock | `BinanceAdapter.h:74-79` | Medium | price_lock_ → depth_lock_ nesting. Consistent ordering but fragile |
| R187 | C++ BinanceAdapter: can_send_order TOCTOU | `BinanceAdapter.h:135` | Low | fetch_add always increments even on reject. Over-count persists in window |
| R188 | C++ OKXAdapter | `OKXAdapter.h` | ✅ Good | OKX inst_id conversion, passphrase auth, public+private WS, Spinlock |
| R189 | C++ BybitAdapter | `BybitAdapter.h` | ✅ Good | Bybit v5 API, HMAC-SHA256, Spinlock, 1 bps maker / 6 bps taker |
| R190 | C++ 3 exchange adapters: code duplication | `*Adapter.h` | Medium | 470 lines, ~200 duplicated. Move maps+locks+methods to ExchangeBase |
| R191 | C++ binance_config.h | `binance_config.h` | ✅ Excellent | constexpr endpoints/limits/channels/types, string_view, compile-time |
| R192 | web-ui App.jsx: lazy loading | `App.jsx` | ✅ Good | 14 React.lazy + Suspense, PanelFallback, memo(TabButton) |
| R193 | web-ui App.jsx: Zustand store sync | `App.jsx:92-134` | ✅ Good | WS → hook → useEffect → store. Unidirectional, useRef for prev state |
| R194 | web-ui App.jsx: 565 lines God component | `App.jsx` | Medium | 6 useEffects, 14 tabs, keyboard, mobile, detached panels. Extract hooks |
| R195 | shared_config.yaml: localhost | `shared_config.yaml:108,112` | Medium | localhost WS host in shared config. Won't work in K8s/Docker prod |
| R196 | shared_config.yaml: 50 symbols + 3 exchanges | `shared_config.yaml` | ✅ Good | 50 pairs, 3 exchanges, risk params match component configs, clean |
| R197 | C++ ExchangeBase: hardcoded toxic threshold | `ExchangeBase.h:49` | Low | toxic_count < 5 hardcoded. No per-exchange/per-env configuration |
| R198 | Alertmanager: hardcoded SMTP password | `alertmanager/config.yml:12` | Medium | smtp_auth_password 'your-password' in git. Slack/Discord webhooks too |
| R199 | Alertmanager: inhibition rules | `config.yml:84-98` | ✅ Good | Critical suppresses warning+info for same component. Prevents alert storms |
| R200 | Alertmanager: no silence rules | `config.yml` | Info | No maintenance windows. Manual silences only. Add scheduled silences in CI/CD |
| R201 | web-ui useTradingStore | `useTradingStore.js` | ✅ Good | 3 batch setters, actions as nullable refs, clean Zustand pattern |
| R202 | web-ui useUIStore: 50 symbols duplicated | `useUIStore.js:7-18` | Low | 50 symbols in JS + shared_config.yaml. Out of sync risk |
| R203 | web-ui useToastStore: setTimeout no cleanup | `useToastStore.js:21` | Low | setTimeout not tracked. HMR dev warning. Harmless in prod |
| R204 | web-ui usePanelContext | `usePanelContext.js` | ✅ Good | Bridge Zustand→registry, useMemo, backward compat with 200+ panels |
| R205 | signal_publisher: 6 catch-all Exception | `signal_publisher.py` | Low | Broadcast pattern acceptable. Narrow to ConnectionClosed where possible |
| R206 | web-ui 4 Zustand stores | `stores/*.js` | ✅ Good | Trading/UI/Toast/PanelContext. 296 lines, no circular deps |
| R207 | web-ui useUIStore: getFilteredSymbols not memoized | `useUIStore.js:45` | Low | Re-filters on every call. New array → unnecessary re-renders |
| R208 | Alertmanager: SMTP/Slack/Discord placeholders | `config.yml:12,56,62` | Medium | Placeholders will be replaced with real secrets and committed |
| R209 | ai-signal-bot health_check: aiohttp session per call | `health_check.py:53` | Medium | New ClientSession per health check. Should reuse session (already noted R27) |
| R210 | ai-signal-bot alerting: aiohttp session per alert | `alerting.py:168,190,205` | Medium | 3 new ClientSession per alert send. Should reuse session (already noted R27) |
| R211 | monitoring alerts.yml: 12 Prometheus rules | `alerts.yml` | ✅ Excellent | 12 rules, 4 groups, severity+service labels, for durations, annotations |
| R212 | monitoring alerts.yml: no HFT-specific alerts | `alerts.yml` | Medium | No order latency, SHM overflow, fill rate, slippage, position limit, drawdown alerts |
| R213 | monitoring ebpf_monitor.py | `ebpf_monitor.py` | ✅ Good | eBPF syscall+network tracing, BCC fallback, SIGINT/SIGTERM, narrow exceptions |
| R214 | ebpf_monitor: only syscall BPF loaded | `ebpf_monitor.py:128` | Low | NETWORK_BPF defined but never loaded. Dead code |
| R215 | ebpf_monitor: no Prometheus export | `ebpf_monitor.py:183` | Low | JSON to stdout only. No /metrics endpoint, not in Grafana |
| R216 | web-ui performanceMonitor.js | `performanceMonitor.js` | ✅ Good | Web Vitals (LCP/FID/CLS/TTFB/FCP), budgets, ratings, alert callbacks, custom metrics |
| R217 | web-ui performanceMonitor: metricsHistory unbounded | `performanceMonitor.js:28` | Low | Arrays grow without bound. Cap at 100 entries |
| R218 | web-ui performanceMonitor: console.log in prod | `performanceMonitor.js:178+` | Low | 6 console.log calls. Use import.meta.env.DEV guard or Vite esbuild.drop |
| R219 | monitoring Grafana: 5 dashboards | `grafana/dashboards/` | ✅ Good | 5 pre-built JSON dashboards. Ready after deployment |
| R220 | web-ui performanceMonitor: alertCallbacks unbounded | `performanceMonitor.js:37` | Low | No offAlert(). Callbacks fire after unmount. Return unsubscribe fn |
| R221 | monitoring alerts.yml: no alert for SHM overflow | `alerts.yml` | Medium | SHM ring buffer overflow = silent data loss. Should alert on head==tail wrap |
| R222 | monitoring alerts.yml: no drawdown alert | `alerts.yml` | Medium | Daily drawdown approaching limit (e.g., >6% of 8%) should warn before circuit breaker |
| R223 | web-ui backtestEngine.js | `backtestEngine.js` | ✅ Good | 8 conditions, 4 actions, 14 metrics, fee model, input validation, precomputed indicators |
| R224 | web-ui backtestEngine: EMA/RSI duplicated | `backtestEngine.js:66-101` | Low | Identical to indicators.js calcEMA/calcRSI. Import instead. ~40 lines reduction |
| R225 | web-ui backtestEngine: no borrow fee | `backtestEngine.js:265` | Low | Short selling only charges trading fee, no daily borrow fee. Overestimates short P&L |
| R226 | web-ui backtestEngine: no slippage | `backtestEngine.js:281` | Low | Entry/exit use candle.close. No slippage model. Overestimates fill quality |
| R227 | web-ui indicators.js | `indicators.js` | ✅ Excellent | 12 indicators, JSDoc, NaN handling, zero-division guards, Wilder's smoothing correct |
| R228 | web-ui indicators: O(n²) SMA/Bollinger | `indicators.js:71-78` | Low | O(n×period) instead of O(n) rolling sum. 500 candles × 20 period = 10k ops |
| R229 | web-ui auditExport.js | `auditExport.js` | ✅ Good | JSON/CSV export, proper URL.revokeObjectURL cleanup, quote escaping, no leaks |
| R230 | web-ui mockData.js | `mockData.js` | ✅ Good | GBM with jumps, Box-Muller with 1e-10 guard, 10 news headlines, 6 strategies |
| R231 | web-ui mockData: only 5 of 50 symbols | `mockData.js:14` | Low | 5 mock symbols vs 50 in useUIStore. Mock mode doesn't represent full universe |
| R232 | web-ui indicators.js: 579 lines | `indicators.js` | Medium | 12 indicators in one file. Split by category or keep as utility |
| R233 | web-ui vite.config.js | `vite.config.js` | ✅ Excellent | PWA autoUpdate, 5 manual vendor chunks, 0.0.0.0 host, es2020, cssCodeSplit |
| R234 | web-ui vite.config: no esbuild.drop | `vite.config.js:48` | Low | No console.log stripping in prod. 6 console.log in performanceMonitor |
| R235 | hft-trade-bot config.yaml: 50 symbols 3x | `config.yaml:20-70` | Medium | 50 symbols in config.yaml + shared_config.yaml + useUIStore.js. 3 copies |
| R236 | hft-trade-bot config.yaml: localhost WS | `config.yaml:76,165` | Medium | ws://localhost:8765 and :8766. Won't work in K8s/Docker prod |
| R237 | hft-trade-bot config.yaml | `config.yaml` | ✅ Good | 166 lines, 12 sections, each param commented with recommended range |
| R238 | web-ui PanelContainer.jsx | `PanelContainer.jsx` | ✅ Good | localStorage persistence, hover preload, error boundaries, a11y, fallback context |
| R239 | web-ui registry.js: 200+ lazy panels | `registry.js` | ✅ Good | 200+ React.lazy, 7 categories, props builders, preloadCategory. 684 lines |
| R240 | web-ui registry.js: 200+ math panels | `registry.js` | Medium | Research-grade math (SchrodingerBridge, FokkerPlanck, etc). Feature flag or remove |
| R241 | web-ui e2e tests | `e2e/mock-mode.spec.js` | ✅ Good | 10 Playwright tests, 5 suites, gotoWithRetry, dismissOnboarding, resilient |
| R242 | web-ui e2e: no WS interaction tests | `e2e/` | Low | No WebSocket, real-time, order flow, signal display tests. Static UI only |
| R243 | web-ui useExchangeData.js | `useExchangeData.js` | ✅ Good | 7 msg types, candle Map dedup, 500 cap, orderbook deltas, fills cap, reconnect sync |
| R244 | web-ui useExchangeData: candle sort every update | `useExchangeData.js:55` | Low | Full Array.from + sort on every candle update. 500 elements × every second |
| R245 | web-ui useMockData.js | `useMockData.js` | ✅ Good | Mock mode via env/localStorage, setInterval 2s, refs for state, cleanup, same interface |
| R246 | web-ui useDetachablePanels.js | `useDetachablePanels.js` | ✅ Good | BroadcastChannel, createElement DOM (no XSS), popup management, blocked detection |
| R247 | web-ui useDetachablePanels: no channel cleanup | `useDetachablePanels.js:21` | Low | BroadcastChannel never closed. Harmless in prod but resource leak |
| R248 | ai-signal-bot db.py | `db.py` | ✅ Good | WAL mode, Windows-safe close, 3 tables, 3 indexes, parameterized queries, COALESCE |
| R249 | ai-signal-bot db.py: new connection per op | `db.py:21-25` | Medium | Every method opens/closes connection. PRAGMA WAL on every conn. No retry on locked |
| R250 | ai-signal-bot db.py: no data retention | `db.py` | Low | No retention policy. Tables grow without bound over months |
| R251 | ai-signal-bot db.py: no equity_curve index | `db.py:70-76` | Low | No index on equity_curve.timestamp. Range queries will full-scan |
| R252 | ai-signal-bot db.py: no migration system | `db.py:36-81` | Medium | _init_db() uses CREATE TABLE IF NOT EXISTS. No ALTER TABLE for schema changes |
| R253 | web-ui useWebSocket.ts | `useWebSocket.ts` | ✅ Excellent | Ring buffer 5k, exp backoff 30s cap, ping/pong latency, batch merge, outgoing queue, sync on reconnect, permessage-deflate, full cleanup |
| R254 | web-ui useWebSocket: no max reconnect limit | `useWebSocket.ts:214` | Low | Backoff capped at 30s but no max count. Reconnects indefinitely if server down |
| R255 | web-ui useWebSocket: console.error in prod | `useWebSocket.ts:200` | Low | console.error not stripped. Add esbuild.drop in vite.config |
| R256 | exchange_simulator config_validator.py | `config_validator.py` | Excellent | 5 required sections, 8 timeframes, 9 validators, cross-ref check, error/warning split |
| R257 | exchange_simulator liquidation_engine_v2.py | `liquidation_engine_v2.py` | Excellent | 4 liq types, cascade 10 depth, partial liq, insurance fund, ADL, bounded deques, seeded RNG |
| R258 | liquidation_engine_v2: ADL is a stub | `liquidation_engine_v2.py:211` | Low | ADL logs and resets fund but doesn't reduce counterparty positions. Acceptable for sim |
| R259 | liquidation_engine_v2: fixed seed RNG | `liquidation_engine_v2.py:73` | Low | seed=42 makes cascades deterministic. Make configurable for realistic simulation |
| R260 | liquidation_engine_v2: f-string logging | `liquidation_engine_v2.py:176` | Low | f-string formatted even when log level above WARNING. Use % formatting |
| R261 | exchange_simulator liquidation_engine_v2: no thread safety | `liquidation_engine_v2.py` | Low | No locks. insurance_fund, events, _cascade_depth are mutable. Add Lock or document single-thread |
| R262 | exchange_simulator arbitrage.py | `arbitrage.py` | Excellent | 14-field dataclass, fee/slippage model, TTL expiry, stats tracking, cross-exchange scan |
| R263 | exchange_simulator arbitrage: unbounded _closed_history | `arbitrage.py:84` | Low | _closed_history is plain list, no cap. Use deque(maxlen=1000) |
| R264 | exchange_simulator funding_rate.py | `funding_rate.py` | Excellent | 8h intervals, premium+base+noise, ±0.75% clamp, bounded deque, correct payment calc |
| R265 | exchange_simulator funding_rate: f-string logging | `funding_rate.py:86` | Low | f-string formatted even when log level above INFO. Use % formatting |
| R266 | exchange_simulator latency_simulation.py | `latency_simulation.py` | Excellent | 4 exchange profiles, Gaussian jitter, Poisson spikes, exp backoff reconnect, async delay |
| R267 | exchange_simulator market_microstructure.py | `market_microstructure.py` | Excellent | Student-t, Merton jumps, Heston SV, Markov 4-regime, U-shaped intraday. Most sophisticated |
| R268 | exchange_simulator spread_analytics.py | `spread_analytics.py` | Good | Rolling deque(maxlen=1000), p50/p90/p99, BUY/SELL slippage, zero-price guards |
| R269 | exchange_simulator order_book_realism.py | `order_book_realism.py` | Excellent | 4 order types, FIFO queue, iceberg reveal, spoofing, adverse selection, power-law decay |
| R270 | exchange_simulator order_book_realism: recent_fills unbounded | `order_book_realism.py:116` | Low | recent_fills is plain list, no cap. Use deque(maxlen=1000) |
| R271 | exchange_simulator options_simulator.py | `options_simulator.py` | Excellent | Black-Scholes, 5 Greeks, Newton-Raphson IV, put-call parity, option chain |
| R272 | exchange_simulator data_export.py | `data_export.py` | Good | CSV/Parquet, 3 export types, os.makedirs safe, UTC timestamps |
| R273 | exchange_simulator __main__.py | `__main__.py` | Clean | 15-line runpy entry point, sys.path manipulation, clean |
| R274 | exchange_simulator: all modules seed=42 | `5 modules` | Low | All 5 RNG modules hardcode seed=42. Simulation is deterministic. Make configurable |
