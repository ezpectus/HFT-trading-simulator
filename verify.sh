#!/bin/bash
# ============================================================
#  HFT Trading System — Verification Script (Linux/macOS)
#  Runs Python tests, C++ build + tests, and JS tests
#  Usage: ./verify.sh
# ============================================================

set -e
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
EXIT_CODE=0

echo "============================================"
echo "  HFT Trading System — Verification"
echo "============================================"
echo ""

# ── 1. Python: Exchange Simulator ─────────────────────────
echo "[1/5] Python tests — Exchange Simulator..."
cd "$PROJECT_ROOT/exchange-simulator"
python3 -m pytest tests/ -v --tb=short || EXIT_CODE=1
echo ""
cd "$PROJECT_ROOT"

# ── 2. Python: AI Signal Bot ──────────────────────────────
echo "[2/5] Python tests — AI Signal Bot..."
cd "$PROJECT_ROOT/ai-signal-bot"
python3 -m pytest tests/ -v --tb=short || EXIT_CODE=1
echo ""
cd "$PROJECT_ROOT"

# ── 3. C++: Build + Tests ─────────────────────────────────
echo "[3/5] C++ build + tests — HFT Trade Bot..."
cd "$PROJECT_ROOT/hft-trade-bot"
if command -v cmake &>/dev/null; then
    mkdir -p build && cd build
    cmake .. -DCMAKE_BUILD_TYPE=Debug -DWEBSOCKETPP_INCLUDE_DIR="$PROJECT_ROOT/websocketpp" || EXIT_CODE=1
    if [ "$EXIT_CODE" -eq 0 ]; then
        cmake --build . --config Debug -j || EXIT_CODE=1
    fi
    if [ "$EXIT_CODE" -eq 0 ]; then
        ctest --output-on-failure -C Debug || EXIT_CODE=1
    fi
    cd ..
else
    echo "[SKIP] CMake not found — skipping C++ tests"
fi
echo ""
cd "$PROJECT_ROOT"

# ── 4. JS: Lint + Tests + Build ───────────────────────────
echo "[4/5] JS lint + tests + build — Web UI..."
cd "$PROJECT_ROOT/web-ui"
if command -v npm &>/dev/null; then
    if [ ! -d node_modules ]; then
        echo "[INFO] Installing npm dependencies..."
        npm install
    fi
    echo "--- ESLint ---"
    npm run lint || echo "[WARN] ESLint found issues (non-blocking)"
    echo "--- Vitest ---"
    npx vitest run || EXIT_CODE=1
    echo "--- Vite Build ---"
    npm run build || EXIT_CODE=1
else
    echo "[SKIP] npm not found — skipping JS tests"
fi
echo ""
cd "$PROJECT_ROOT"

# ── 5. Summary ────────────────────────────────────────────
echo "============================================"
if [ "$EXIT_CODE" -eq 0 ]; then
    echo "  ALL CHECKS PASSED"
else
    echo "  SOME CHECKS FAILED — see output above"
fi
echo "============================================"
exit $EXIT_CODE
