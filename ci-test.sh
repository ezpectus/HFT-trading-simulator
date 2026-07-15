#!/usr/bin/env bash
# ============================================================
#  CI/CD Test Script — Full Pipeline Compilation & Tests
#  Usage: ./ci-test.sh [all|quick|python|cpp|js|rust]
# ============================================================
set -euo pipefail
MODE="${1:-all}"
PASS=0
FAIL=0
SKIP=0
EXIT_CODE=0

# Resolve project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "============================================================"
echo "  HFT Trading System — CI/CD Test Pipeline"
echo "  Mode: $MODE"
echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo ""

run_test() {
    local label="$1"
    local cmd="$2"
    echo "  Running: $label"
    if eval "$cmd" > /tmp/ci_output.log 2>&1; then
        echo "  [PASS] $label"
        ((PASS++))
    else
        echo "  [FAIL] $label"
        tail -20 /tmp/ci_output.log 2>/dev/null | head -20
        ((FAIL++))
        EXIT_CODE=1
    fi
    echo ""
}

# ─── Python: Exchange Simulator ───
if [[ "$MODE" == "all" || "$MODE" == "quick" || "$MODE" == "python" ]]; then
    echo "[1/8] Python — Exchange Simulator tests"
    cd "$SCRIPT_DIR/exchange_simulator"
    run_test "Exchange Simulator pytest" \
        "python -m pytest tests/ -v --tb=short -q"
    cd "$SCRIPT_DIR"
fi

# ─── Python: AI Signal Bot ───
if [[ "$MODE" == "all" || "$MODE" == "quick" || "$MODE" == "python" ]]; then
    echo "[2/8] Python — AI Signal Bot tests"
    cd "$SCRIPT_DIR/ai-signal-bot"
    run_test "AI Signal Bot pytest" \
        "python -m pytest tests/ -v --tb=short -q"
    cd "$SCRIPT_DIR"
fi

# ─── Python: Import checks ───
if [[ "$MODE" == "all" || "$MODE" == "quick" || "$MODE" == "python" ]]; then
    echo "[3/8] Python — Module import checks"
    run_test "exchange_simulator import" \
        "python -c \"import sys; sys.path.insert(0, 'exchange_simulator'); import exchange_simulator; print('OK')\""
    run_test "ai-signal-bot core imports" \
        "python -c \"import sys; sys.path.insert(0, 'ai-signal-bot'); from src.strategies import EnsembleVoter; from src.communication import ws_client; from src.backtesting import backtester; from src.risk import risk_manager; print('OK')\""
    run_test "research modules import" \
        "python -c \"import sys; sys.path.insert(0, 'ai-signal-bot'); from src.research.genetic_strategy import GeneticStrategyDiscovery; from src.research.competition import StrategyCompetition; from src.research.microstructure_lab import MicrostructureLab; from src.research.attribution import BrinsonFachler; from src.research.greeks_hedging import GreeksHedgingSimulator; print('OK')\""
fi

# ─── C++: CMake Build ───
if [[ "$MODE" == "all" || "$MODE" == "quick" || "$MODE" == "cpp" ]]; then
    echo "[4/8] C++ — CMake build (HFT Trade Bot)"
    cd "$SCRIPT_DIR/hft-trade-bot"
    mkdir -p build
    cd build
    run_test "CMake configure" "cmake .. -DCMAKE_BUILD_TYPE=Release"
    run_test "C++ build" "cmake --build . --config Release -j$(nproc 2>/dev/null || echo 4)"
    cd "$SCRIPT_DIR"
fi

# ─── C++: Tests ───
if [[ "$MODE" == "all" || "$MODE" == "cpp" ]]; then
    echo "[5/8] C++ — CTest"
    cd "$SCRIPT_DIR/hft-trade-bot/build"
    run_test "C++ CTest" "ctest -C Release --output-on-failure"
    cd "$SCRIPT_DIR"
fi

# ─── Rust: Build + Test ───
if [[ "$MODE" == "all" || "$MODE" == "rust" ]]; then
    echo "[6/8] Rust — Cargo build (HFT Executor)"
    if command -v cargo &>/dev/null; then
        cd "$SCRIPT_DIR/hft-executor"
        run_test "Rust build" "cargo build --release"
        run_test "Rust tests" "cargo test --release"
        cd "$SCRIPT_DIR"
    else
        echo "  [SKIP] Rust not installed"
        ((SKIP++))
    fi
elif [[ "$MODE" == "quick" ]]; then
    echo "[6/8] Rust — Skipped (quick mode)"
    ((SKIP++))
fi

# ─── JS: Lint + Test ───
if [[ "$MODE" == "all" || "$MODE" == "quick" || "$MODE" == "js" ]]; then
    echo "[7/8] JS — Web UI lint + test"
    if command -v npx &>/dev/null; then
        cd "$SCRIPT_DIR/web-ui"
        run_test "ESLint" "npx eslint src/ --quiet"
        run_test "Vitest" "npx vitest run --reporter=verbose"
        cd "$SCRIPT_DIR"
    else
        echo "  [SKIP] Node.js not installed"
        ((SKIP++))
    fi
fi

# ─── JS: Build ───
if [[ "$MODE" == "all" || "$MODE" == "js" ]]; then
    echo "[8/8] JS — Web UI production build"
    if command -v npx &>/dev/null; then
        cd "$SCRIPT_DIR/web-ui"
        run_test "Vite build" "npx vite build"
        cd "$SCRIPT_DIR"
    else
        echo "  [SKIP] Node.js not installed"
        ((SKIP++))
    fi
fi

# ─── Summary ───
echo ""
echo "============================================================"
echo "  CI/CD SUMMARY"
echo "  Passed: $PASS  Failed: $FAIL  Skipped: $SKIP"
if [[ $EXIT_CODE -eq 0 ]]; then
    echo "  STATUS: ALL GREEN ✓"
else
    echo "  STATUS: FAILURES DETECTED ✗"
fi
echo "============================================================"
echo ""
exit $EXIT_CODE
