#!/usr/bin/env bash
# ============================================================
#  run-all-tests.sh
#  Runs every CI test category locally.
#
#  Usage:
#    ./run-all-tests.sh          # tmux mode (6 panes)
#    ./run-all-tests.sh --no-tmux # sequential mode
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# ── Python Lint + Bandit ─────────────────────────────────────
run_python_lint() {
  info "=== Python Lint (ruff) + Security (bandit) ==="
  local rc=0

  info "[ruff: exchange_simulator]"
  (cd "$ROOT/exchange_simulator" && python -m ruff check .) || rc=1
  echo ""
  info "[ruff: ai-signal-bot]"
  (cd "$ROOT/ai-signal-bot" && python -m ruff check .) || rc=1
  echo ""

  if python -c "import bandit" 2>/dev/null; then
    info "[bandit: exchange_simulator]"
    (cd "$ROOT/exchange_simulator" && python -m bandit -r . -ll -ii -q) || true
    echo ""
    info "[bandit: ai-signal-bot]"
    (cd "$ROOT/ai-signal-bot" && python -m bandit -r . -ll -ii -q) || true
    echo ""
  else
    warn "bandit not installed, skipping security scan"
  fi

  if [ $rc -eq 0 ]; then pass "Python Lint+Security"; else fail "Python Lint+Security"; fi
  return $rc
}

# ── Python Tests ─────────────────────────────────────────────
run_python_tests() {
  info "=== Python Tests (pytest) ==="
  local rc=0

  info "[exchange_simulator]"
  (cd "$ROOT/exchange_simulator" && python -m pytest tests/ -v --tb=short) || rc=1
  echo ""

  info "[ai-signal-bot]"
  (cd "$ROOT/ai-signal-bot" && python -m pytest tests/ -v --tb=short) || rc=1
  echo ""

  if [ $rc -eq 0 ]; then pass "Python Tests"; else fail "Python Tests"; fi
  return $rc
}

# ── JS Lint + Audit ──────────────────────────────────────────
run_js_lint_audit() {
  info "=== JS Lint (eslint) + Audit (npm audit) ==="
  local rc=0

  info "[eslint]"
  (cd "$ROOT/web-ui" && npx eslint src/) || rc=1
  echo ""

  info "[npm audit]"
  (cd "$ROOT/web-ui" && npm audit --audit-level=high) || warn "npm audit found issues (may be dev-only)"
  echo ""

  if [ $rc -eq 0 ]; then pass "JS Lint+Audit"; else fail "JS Lint+Audit"; fi
  return $rc
}

# ── JS Tests + E2E ───────────────────────────────────────────
run_js_tests_e2e() {
  info "=== JS Tests (vitest) + E2E (playwright) ==="
  local rc=0

  info "[vitest]"
  (cd "$ROOT/web-ui" && npx vitest run --reporter=verbose) || rc=1
  echo ""

  if npx playwright --version &>/dev/null 2>&1; then
    info "[playwright E2E]"
    (cd "$ROOT/web-ui" && VITE_MOCK_MODE=true npx playwright test --reporter=line) || rc=1
    echo ""
  else
    warn "playwright not installed, skipping E2E"
  fi

  if [ $rc -eq 0 ]; then pass "JS Tests+E2E"; else fail "JS Tests+E2E"; fi
  return $rc
}

# ── JS Build ─────────────────────────────────────────────────
run_js_build() {
  info "=== JS Build (vite) + Bundle size ==="
  local rc=0

  (cd "$ROOT/web-ui" && npm run build) || rc=1
  echo ""

  if [ -d "$ROOT/web-ui/dist" ]; then
    local size_kb
    size_kb=$(du -sk "$ROOT/web-ui/dist" | cut -f1)
    info "Bundle size: ${size_kb} KB"
    if [ "$size_kb" -gt 5120 ]; then
      warn "Bundle size exceeds 5MB target"
    fi
  fi
  echo ""

  if [ $rc -eq 0 ]; then pass "JS Build"; else fail "JS Build"; fi
  return $rc
}

# ── Docker Build ─────────────────────────────────────────────
run_docker_build() {
  info "=== Docker Build (all services) ==="
  local rc=0

  if ! command -v docker &>/dev/null; then
    warn "docker not found, skipping Docker builds"
    return 0
  fi

  for svc in exchange_simulator ai-signal-bot hft-trade-bot web-ui; do
    info "[docker: $svc]"
    (cd "$ROOT/$svc" && docker build -t "$svc:ci" .) || rc=1
    echo ""
  done

  if [ $rc -eq 0 ]; then pass "Docker Build"; else fail "Docker Build"; fi
  return $rc
}

# ── C++ Build + Tests (Linux only) ───────────────────────────
run_cpp_tests() {
  info "=== C++ Build + Tests ==="
  local rc=0

  if ! command -v cmake &>/dev/null; then
    warn "cmake not found, skipping C++ tests"
    return 0
  fi

  info "[configure]"
  (cd "$ROOT/hft-trade-bot" && mkdir -p build && cd build && cmake .. -DCMAKE_BUILD_TYPE=Debug) || rc=1
  echo ""

  if [ $rc -eq 0 ]; then
    info "[build]"
    (cd "$ROOT/hft-trade-bot/build" && make -j"$(nproc 2>/dev/null || echo 4)") || rc=1
    echo ""
  fi

  if [ $rc -eq 0 ]; then
    info "[ctest]"
    (cd "$ROOT/hft-trade-bot/build" && ctest --output-on-failure) || rc=1
    echo ""
  fi

  if [ $rc -eq 0 ]; then pass "C++ Build+Tests"; else fail "C++ Build+Tests"; fi
  return $rc
}

# ── Summary ──────────────────────────────────────────────────
print_summary() {
  echo ""
  echo "  ================================================"
  echo "   CI Local Test Summary"
  echo "  ================================================"
  echo ""
  local any_failed=0
  for pair in "$@"; do
    local name="${pair%%:*}"
    local status="${pair##*:}"
    if [ "$status" = "0" ]; then
      pass "$name"
    else
      fail "$name"
      any_failed=1
    fi
  done
  echo ""
  return $any_failed
}

# ── Main ─────────────────────────────────────────────────────
main() {
  local USE_TMUX=true
  if [ "${1:-}" = "--no-tmux" ]; then
    USE_TMUX=false
  fi

  if $USE_TMUX && command -v tmux &>/dev/null; then
    info "Starting tmux session with 6 panes..."
    tmux new-session -d -s ci-tests "bash -c 'cd \"$ROOT/exchange_simulator\" && python -m ruff check . && cd \"$ROOT/ai-signal-bot\" && python -m ruff check . && python -m bandit -r . -ll -ii -q; echo; echo DONE; bash'"
    tmux split-window -t ci-tests -v "bash -c 'cd \"$ROOT/exchange_simulator\" && python -m pytest tests/ -v --tb=short; cd \"$ROOT/ai-signal-bot\" && python -m pytest tests/ -v --tb=short; echo; echo DONE; bash'"
    tmux split-window -t ci-tests -h "bash -c 'cd \"$ROOT/web-ui\" && npx eslint src/ && npm audit --audit-level=high; echo; echo DONE; bash'"
    tmux select-pane -t ci-tests -t 0
    tmux split-window -t ci-tests -h "bash -c 'cd \"$ROOT/web-ui\" && npx vitest run --reporter=verbose && VITE_MOCK_MODE=true npx playwright test --reporter=line; echo; echo DONE; bash'"
    tmux select-pane -t ci-tests -t 2
    tmux split-window -t ci-tests -v "bash -c 'cd \"$ROOT/web-ui\" && npm run build && du -sh dist; echo; echo DONE; bash'"
    tmux select-pane -t ci-tests -t 3
    tmux split-window -t ci-tests -v "bash -c 'for s in exchange_simulator ai-signal-bot hft-trade-bot web-ui; do cd \"$ROOT/$s\" && docker build -t $s:ci .; done; echo; echo DONE; bash'"
    tmux select-layout -t ci-tests tiled
    info "tmux session 'ci-tests' started. Attach with: tmux attach -t ci-tests"
    tmux attach -t ci-tests
  else
    info "Running all tests sequentially..."
    local results=()
    local rc=0

    run_python_lint || rc=$?; results+=("Python Lint+Security:$rc")
    echo ""
    run_python_tests || rc=$?; results+=("Python Tests:$rc")
    echo ""
    run_js_lint_audit || rc=$?; results+=("JS Lint+Audit:$rc")
    echo ""
    run_js_tests_e2e || rc=$?; results+=("JS Tests+E2E:$rc")
    echo ""
    run_js_build || rc=$?; results+=("JS Build:$rc")
    echo ""
    run_docker_build || rc=$?; results+=("Docker Build:$rc")
    echo ""

    if [ "$(uname -s)" = "Linux" ]; then
      run_cpp_tests || rc=$?; results+=("C++ Build+Tests:$rc")
      echo ""
    fi

    print_summary "${results[@]}"
    exit $?
  fi
}

main "$@"
