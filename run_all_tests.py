#!/usr/bin/env python3
"""Universal test runner for the entire Trading System Lite project.

Runs tests across ALL components:
  - ai-signal-bot    (Python — pytest)
  - exchange_simulator (Python — pytest)
  - monitoring       (Python — pytest)
  - scripts          (Python — pytest)
  - hft-executor     (Rust — cargo test)
  - web-ui           (JS — vitest unit + playwright E2E)

Usage:
  python run_all_tests.py                  # run everything
  python run_all_tests.py --python          # only Python tests (all projects)
  python run_all_tests.py --rust            # only Rust tests
  python run_all_tests.py --js              # only JS tests (vitest + e2e)
  python run_all_tests.py --e2e             # only Playwright E2E
  python run_all_tests.py --project ai-signal-bot
  python run_all_tests.py --project exchange_simulator
  python run_all_tests.py --sub             # split into subcategories
  python run_all_tests.py --verbose
  python run_all_tests.py --json report.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

# ─── Project root ─────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).parent.resolve()


# ─── Data structures ──────────────────────────────────────────────────────────

@dataclass
class CategoryResult:
    name: str
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    warnings: int = 0
    duration_s: float = 0.0
    failed_tests: list[str] = field(default_factory=list)
    error_tests: list[str] = field(default_factory=list)
    raw_output: str = ""


# ─── Project definitions ──────────────────────────────────────────────────────

PYTHON_PROJECTS: dict[str, dict] = {
    "ai-signal-bot": {
        "root": "ai-signal-bot",
        "test_dirs": ["tests"],
        "subcategories": {
            "Root-level tests": ["tests/test_*.py"],
            "Unit — Backtesting":    ["tests/unit/test_backtest*.py", "tests/unit/test_walk_forward*.py",
                                       "tests/unit/test_order_book_replay*.py", "tests/unit/test_pnl_calculator*.py"],
            "Unit — Communication":  ["tests/unit/test_ws_*.py", "tests/unit/test_signal_publisher*.py",
                                       "tests/unit/test_fix_client*.py", "tests/unit/test_shm_*.py",
                                       "tests/unit/test_circuit_breaker*.py", "tests/unit/test_comm_circuit_breaker*.py",
                                       "tests/unit/test_health_check*.py", "tests/unit/test_health_server*.py",
                                       "tests/unit/test_metrics_server*.py", "tests/unit/test_dpdk_transport*.py"],
            "Unit — Database":       ["tests/unit/test_db*.py"],
            "Unit — ML / RL":        ["tests/unit/test_ml_*.py", "tests/unit/test_ml_features*.py",
                                       "tests/unit/test_ml_ensemble_funding*.py"],
            "Unit — Monitoring":     ["tests/unit/test_monitoring_*.py", "tests/unit/test_alerting*.py",
                                       "tests/unit/test_tracker*.py", "tests/unit/test_notifier*.py",
                                       "tests/unit/test_observability*.py"],
            "Unit — Portfolio":      ["tests/unit/test_portfolio_*.py", "tests/unit/test_markowitz*.py"],
            "Unit — Research":       ["tests/unit/test_research_modules*.py", "tests/unit/test_volatility_surface*.py"],
            "Unit — Risk":           ["tests/unit/test_risk*.py", "tests/unit/test_var*.py",
                                       "tests/unit/test_cvar*.py", "tests/unit/test_kelly*.py",
                                       "tests/unit/test_position_sizing*.py", "tests/unit/test_stress_test*.py"],
            "Unit — Strategies":     ["tests/unit/test_strategies*.py", "tests/unit/test_ensemble_voter*.py",
                                       "tests/unit/test_market_making*.py", "tests/unit/test_marketplace*.py",
                                       "tests/unit/test_sentiment*.py", "tests/unit/test_statistical_arbitrage*.py",
                                       "tests/unit/test_cross_exchange_arb*.py"],
            "Unit — Data Collection":["tests/unit/test_exchange_factory*.py", "tests/unit/test_real_account*.py",
                                       "tests/unit/test_real_exchange_client*.py", "tests/unit/test_real_market_data*.py"],
            "Unit — Indicators":     ["tests/unit/test_indicators*.py", "tests/unit/test_fft_analysis*.py"],
            "Unit — Utils/Bot":      ["tests/unit/test_bot_helpers*.py", "tests/unit/test_utils*.py"],
            "Integration tests":     ["tests/integration/test_*.py"],
        },
    },
    "exchange_simulator": {
        "root": "exchange_simulator",
        "test_dirs": ["tests"],
        "subcategories": {
            "Core":              ["tests/test_exchange*.py", "tests/test_simulator*.py",
                                   "tests/test_simulated_exchange*.py", "tests/test_models*.py",
                                   "tests/test_config_validator*.py", "tests/test_health*.py",
                                   "tests/test_security*.py", "tests/test_visualizer*.py"],
            "Market Simulation": ["tests/test_market_simulator*.py", "tests/test_market_microstructure*.py",
                                   "tests/test_price_feed_*.py", "tests/test_order_book_realism*.py",
                                   "tests/test_spread_analytics*.py"],
            "Order Types":       ["tests/test_advanced_order_types*.py", "tests/test_options_simulator*.py",
                                   "tests/test_options_pricing*.py"],
            "Funding & Liquidation": ["tests/test_funding_rate*.py", "tests/test_funding_liquidation*.py",
                                       "tests/test_liquidation_engine_v2*.py", "tests/test_liquidation_depth*.py",
                                       "tests/test_correlation_funding*.py"],
            "WebSocket":         ["tests/test_websocket_server*.py", "tests/test_websocket_orderbook*.py",
                                   "tests/test_chaos_reconnect*.py", "tests/test_chaos_enhanced*.py"],
            "Data & Audit":      ["tests/test_data_export*.py", "tests/test_audit_logger*.py",
                                   "tests/test_exchange_metrics*.py", "tests/test_latency_simulation*.py"],
            "Arbitrage":         ["tests/test_arbitrage*.py"],
            "Property & Load":   ["tests/test_property_based*.py", "tests/test_load_10k*.py",
                                   "tests/test_integration_dataflow*.py"],
        },
    },
    "monitoring": {
        "root": "monitoring",
        "test_dirs": ["tests"],
    },
    "scripts": {
        "root": ".",
        "test_dirs": [],
        "extra_files": ["scripts/test_config_consistency.py"],
    },
}

RUST_PROJECTS: dict[str, dict] = {
    "hft-executor": {
        "root": "hft-executor",
    },
}

JS_PROJECTS: dict[str, dict] = {
    "web-ui": {
        "root": "web-ui",
        "unit_cmd": ["npm", "run", "test:run"],
        "e2e_cmd":  ["npx", "playwright", "test", "--reporter=line"],
    },
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _glob_to_paths(base: Path, patterns: list[str]) -> list[str]:
    paths: list[str] = []
    for pattern in patterns:
        matched = sorted(base.glob(pattern))
        paths.extend(str(p.relative_to(base)).replace("\\", "/") for p in matched if p.exists())
    return paths


def _parse_pytest_output(output: str) -> tuple[int, int, int, int, int, list[str], list[str]]:
    passed = failed = errors = skipped = warnings = 0
    failed_names: list[str] = []
    error_names: list[str] = []

    # "22 failed, 1709 passed, 7 skipped, 2 warnings, 3 errors in 1196.21s"
    m = re.search(
        r"(\d+)\s+failed.*?(\d+)\s+passed(?:.*?(\d+)\s+skipped)?(?:.*?(\d+)\s+warnings)?(?:.*?(\d+)\s+errors)?",
        output,
    )
    if m:
        failed = int(m.group(1))
        passed = int(m.group(2))
        skipped = int(m.group(3) or 0)
        warnings = int(m.group(4) or 0)
        errors = int(m.group(5) or 0)
    else:
        m2 = re.search(
            r"(\d+)\s+passed(?:.*?(\d+)\s+skipped)?(?:.*?(\d+)\s+warnings)?(?:.*?(\d+)\s+errors)?",
            output,
        )
        if m2:
            passed = int(m2.group(1))
            skipped = int(m2.group(2) or 0)
            warnings = int(m2.group(3) or 0)
            errors = int(m2.group(4) or 0)

    for line in output.splitlines():
        line = line.strip()
        if line.startswith("FAILED "):
            failed_names.append(line.replace("FAILED ", ""))
        elif line.startswith("ERROR "):
            error_names.append(line.replace("ERROR ", ""))

    return passed, failed, errors, skipped, warnings, failed_names, error_names


def _parse_cargo_output(output: str) -> tuple[int, int, int, int, int, list[str], list[str]]:
    passed = failed = errors = skipped = warnings = 0
    failed_names: list[str] = []
    error_names: list[str] = []

    # "test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out"
    for m in re.finditer(r"test result: (ok|FAILED)\.\s+(\d+) passed;\s+(\d+) failed;\s+(\d+) ignored", output):
        if m.group(1) == "ok":
            passed += int(m.group(2))
        else:
            passed += int(m.group(2))
        failed += int(m.group(3))
        skipped += int(m.group(4))

    # Collect failures
    for line in output.splitlines():
        line = line.strip()
        if "test result: FAILED" in line:
            error_names.append("cargo test failed")

    # Warnings
    warnings = len(re.findall(r"^warning:", output, re.MULTILINE))

    return passed, failed, errors, skipped, warnings, failed_names, error_names


def _parse_vitest_output(output: str) -> tuple[int, int, int, int, int, list[str], list[str]]:
    passed = failed = errors = skipped = warnings = 0
    failed_names: list[str] = []
    error_names: list[str] = []

    # Vitest: "Tests  15 passed | 2 failed | 1 skipped"
    m = re.search(r"Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?(?:\s*\|\s*(\d+)\s+skipped)?", output)
    if m:
        passed = int(m.group(1))
        failed = int(m.group(2) or 0)
        skipped = int(m.group(3) or 0)

    # Collect failed test names
    for line in output.splitlines():
        line = line.strip()
        if "FAIL" in line and ("." in line or "/" in line):
            failed_names.append(line)

    return passed, failed, errors, skipped, warnings, failed_names, error_names


def _parse_playwright_output(output: str) -> tuple[int, int, int, int, int, list[str], list[str]]:
    passed = failed = errors = skipped = warnings = 0
    failed_names: list[str] = []
    error_names: list[str] = []

    # Playwright: "35 passed (5.2s)" or "  30 passed, 5 failed, 2 skipped (12.3s)"
    m = re.search(r"(\d+)\s+passed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?", output)
    if m:
        passed = int(m.group(1))
        failed = int(m.group(2) or 0)
        skipped = int(m.group(3) or 0)

    for line in output.splitlines():
        line = line.strip()
        if line.startswith("  ✘") or "failed" in line.lower() and ".spec" in line:
            failed_names.append(line)

    return passed, failed, errors, skipped, warnings, failed_names, error_names


# ─── Runners ──────────────────────────────────────────────────────────────────

def run_pytest(cwd: Path, paths: list[str], verbose: bool = False) -> CategoryResult:
    if not paths:
        return CategoryResult(name="empty")

    cmd = [sys.executable, "-m", "pytest", *paths, "--tb=line", "-q", "--no-header", "--color=no"]
    if verbose:
        cmd = [sys.executable, "-m", "pytest", *paths, "--tb=short", "-v", "--no-header", "--color=no"]

    start = time.time()
    try:
        result = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=3600)
    except subprocess.TimeoutExpired:
        return CategoryResult(name="timeout", errors=1, duration_s=3600.0,
                              error_tests=["Test execution timed out after 3600s"])
    duration = time.time() - start

    output = result.stdout
    if result.stderr:
        output += "\n" + result.stderr

    p, f, e, s, w, fn, en = _parse_pytest_output(output)
    return CategoryResult(
        name="", passed=p, failed=f, errors=e, skipped=s, warnings=w,
        duration_s=duration, failed_tests=fn, error_tests=en, raw_output=output,
    )


def run_cargo(cwd: Path) -> CategoryResult:
    cmd = ["cargo", "test", "--", "--nocapture"]
    env = os.environ.copy()

    start = time.time()
    try:
        result = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=600, env=env)
    except subprocess.TimeoutExpired:
        return CategoryResult(name="timeout", errors=1, duration_s=600.0,
                              error_tests=["Cargo test timed out"])
    except FileNotFoundError:
        return CategoryResult(name="cargo-not-found", errors=1, error_tests=["cargo not installed"])
    duration = time.time() - start

    output = result.stdout + "\n" + result.stderr
    p, f, e, s, w, fn, en = _parse_cargo_output(output)
    return CategoryResult(
        name="", passed=p, failed=f, errors=e, skipped=s, warnings=w,
        duration_s=duration, failed_tests=fn, error_tests=en, raw_output=output,
    )


def run_npm(cwd: Path, cmd: list[str], parser) -> CategoryResult:
    start = time.time()
    try:
        result = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        return CategoryResult(name="timeout", errors=1, duration_s=600.0,
                              error_tests=["Test execution timed out"])
    except FileNotFoundError:
        return CategoryResult(name="npm-not-found", errors=1, error_tests=["npm/npx not installed"])
    duration = time.time() - start

    output = result.stdout
    if result.stderr:
        output += "\n" + result.stderr

    p, f, e, s, w, fn, en = parser(output)
    return CategoryResult(
        name="", passed=p, failed=f, errors=e, skipped=s, warnings=w,
        duration_s=duration, failed_tests=fn, error_tests=en, raw_output=output,
    )


# ─── Category runners ─────────────────────────────────────────────────────────

def run_python_project(project_name: str, cfg: dict, verbose: bool, subcategories: bool) -> list[CategoryResult]:
    results: list[CategoryResult] = []
    base = PROJECT_ROOT / cfg["root"]

    if subcategories and "subcategories" in cfg:
        for sub_name, patterns in cfg["subcategories"].items():
            paths = _glob_to_paths(base, patterns)
            label = f"{project_name} — {sub_name}"
            print(f"\n{'─'*70}")
            print(f"  {label}  ({len(paths)} file(s))")
            print(f"{'─'*70}")
            if not paths:
                print("  ⚠ No test files found — skipping")
                results.append(CategoryResult(name=label))
                continue
            r = run_pytest(base, paths, verbose=verbose)
            r.name = label
            _print_result(r)
            results.append(r)
    else:
        paths: list[str] = []
        for d in cfg.get("test_dirs", []):
            paths.extend(_glob_to_paths(base, [f"{d}/test_*.py"]))
        for ef in cfg.get("extra_files", []):
            p = base / ef
            if p.exists():
                paths.append(ef)
        label = f"{project_name} — Python tests"
        print(f"\n{'─'*70}")
        print(f"  {label}  ({len(paths)} file(s))")
        print(f"{'─'*70}")
        if not paths:
            print("  ⚠ No test files found — skipping")
            results.append(CategoryResult(name=label))
            return results
        r = run_pytest(base, paths, verbose=verbose)
        r.name = label
        _print_result(r)
        results.append(r)

    return results


def run_rust_project(project_name: str, cfg: dict) -> CategoryResult:
    base = PROJECT_ROOT / cfg["root"]
    label = f"{project_name} — Cargo tests"
    print(f"\n{'─'*70}")
    print(f"  {label}")
    print(f"{'─'*70}")
    r = run_cargo(base)
    r.name = label
    _print_result(r)
    return r


def run_js_project(project_name: str, cfg: dict, run_e2e: bool) -> list[CategoryResult]:
    results: list[CategoryResult] = []
    base = PROJECT_ROOT / cfg["root"]

    # Unit tests (vitest)
    label = f"{project_name} — Vitest unit tests"
    print(f"\n{'─'*70}")
    print(f"  {label}")
    print(f"{'─'*70}")
    r = run_npm(base, cfg["unit_cmd"], _parse_vitest_output)
    r.name = label
    _print_result(r)
    results.append(r)

    # E2E tests (playwright)
    if run_e2e:
        label = f"{project_name} — Playwright E2E tests"
        print(f"\n{'─'*70}")
        print(f"  {label}")
        print(f"{'─'*70}")
        r = run_npm(base, cfg["e2e_cmd"], _parse_playwright_output)
        r.name = label
        _print_result(r)
        results.append(r)

    return results


# ─── Output ───────────────────────────────────────────────────────────────────

def _print_result(r: CategoryResult) -> None:
    status = "✅" if r.failed == 0 and r.errors == 0 else "❌"
    print(f"  {status} {r.passed} passed, {r.failed} failed, {r.errors} errors, {r.skipped} skipped"
          f" — {r.duration_s:.1f}s")
    if r.failed_tests:
        print(f"  FAILED:")
        for fn in r.failed_tests:
            print(f"    • {fn}")
    if r.error_tests:
        print(f"  ERRORS:")
        for en in r.error_tests:
            print(f"    • {en}")


def print_report(results: list[CategoryResult]) -> dict:
    total_p = sum(r.passed for r in results)
    total_f = sum(r.failed for r in results)
    total_e = sum(r.errors for r in results)
    total_s = sum(r.skipped for r in results)
    total_w = sum(r.warnings for r in results)
    total_d = sum(r.duration_s for r in results)
    total_all = total_p + total_f + total_e + total_s

    print(f"\n{'═'*70}")
    print(f"  FULL PROJECT TEST REPORT")
    print(f"{'═'*70}")
    print(f"{'Category':<45} {'Pass':>6} {'Fail':>6} {'Err':>6} {'Skip':>6} {'Time':>8}")
    print(f"{'─'*70}")

    for r in results:
        print(f"{r.name:<45} {r.passed:>6} {r.failed:>6} {r.errors:>6} {r.skipped:>6} {r.duration_s:>7.1f}s")

    print(f"{'─'*70}")
    print(f"{'TOTAL':<45} {total_p:>6} {total_f:>6} {total_e:>6} {total_s:>6} {total_d:>7.1f}s")
    print(f"{'═'*70}")

    if total_f == 0 and total_e == 0:
        print(f"\n  ✅ ALL TESTS PASSED — {total_p} tests in {total_d:.1f}s")
    else:
        print(f"\n  ❌ {total_f} failed, {total_e} errors out of {total_all} tests")
        all_failed: list[str] = []
        for r in results:
            all_failed.extend(r.failed_tests)
            all_failed.extend(r.error_tests)
        if all_failed:
            print(f"\n  Failed/Error tests:")
            for name in all_failed:
                print(f"    • {name}")

    print()
    return {
        "total": {
            "passed": total_p, "failed": total_f, "errors": total_e,
            "skipped": total_s, "warnings": total_w, "duration_s": round(total_d, 2),
        },
        "categories": [
            {
                "name": r.name, "passed": r.passed, "failed": r.failed,
                "errors": r.errors, "skipped": r.skipped, "warnings": r.warnings,
                "duration_s": round(r.duration_s, 2),
                "failed_tests": r.failed_tests, "error_tests": r.error_tests,
            }
            for r in results
        ],
    }


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Universal test runner for the entire Trading System Lite project.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_all_tests.py                    # run ALL tests (Python + Rust + JS)
  python run_all_tests.py --python           # only Python tests (all projects)
  python run_all_tests.py --rust             # only Rust (cargo test)
  python run_all_tests.py --js               # only JS (vitest + e2e)
  python run_all_tests.py --e2e              # only Playwright E2E
  python run_all_tests.py --project ai-signal-bot
  python run_all_tests.py --project exchange_simulator
  python run_all_tests.py --sub              # split into subcategories
  python run_all_tests.py --verbose
  python run_all_tests.py --json report.json
        """,
    )
    parser.add_argument("--python", action="store_true", help="Run only Python tests (all Python projects)")
    parser.add_argument("--rust", action="store_true", help="Run only Rust tests (cargo test)")
    parser.add_argument("--js", action="store_true", help="Run only JS tests (vitest + playwright)")
    parser.add_argument("--e2e", action="store_true", help="Run only Playwright E2E tests")
    parser.add_argument("--project", type=str, help="Run tests for a specific project")
    parser.add_argument("--sub", "--subcategories", action="store_true", help="Split into subcategories")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose test output")
    parser.add_argument("--json", type=str, help="Save report as JSON to given path")
    args = parser.parse_args(argv)

    print(f"\n{'═'*70}")
    print(f"  Trading System Lite — Universal Test Runner")
    print(f"  Project root: {PROJECT_ROOT}")
    print(f"{'═'*70}")

    results: list[CategoryResult] = []
    run_all_flag = not (args.python or args.rust or args.js or args.e2e or args.project)

    # Determine what to run
    do_python = run_all_flag or args.python
    do_rust = run_all_flag or args.rust
    do_js = run_all_flag or args.js
    do_e2e = run_all_flag or args.js or args.e2e

    py_projects = PYTHON_PROJECTS
    rust_projects = RUST_PROJECTS
    js_projects = JS_PROJECTS

    if args.project:
        do_python = do_rust = do_js = do_e2e = False
        if args.project in PYTHON_PROJECTS:
            do_python = True
            py_projects = {args.project: PYTHON_PROJECTS[args.project]}
        elif args.project in RUST_PROJECTS:
            do_rust = True
            rust_projects = {args.project: RUST_PROJECTS[args.project]}
        elif args.project in JS_PROJECTS:
            do_js = True
            do_e2e = args.e2e
            js_projects = {args.project: JS_PROJECTS[args.project]}
        else:
            print(f"  ❌ Unknown project: {args.project}")
            print(f"  Available: {', '.join(list(PYTHON_PROJECTS) + list(RUST_PROJECTS) + list(JS_PROJECTS))}")
            return 1

    # Run Python tests
    if do_python:
        print(f"\n{'━'*70}")
        print(f"  PYTHON TESTS (pytest)")
        print(f"{'━'*70}")
        for pname, pcfg in py_projects.items():
            results.extend(run_python_project(pname, pcfg, verbose=args.verbose, subcategories=args.sub))

    # Run Rust tests
    if do_rust:
        print(f"\n{'━'*70}")
        print(f"  RUST TESTS (cargo test)")
        print(f"{'━'*70}")
        for rname, rcfg in rust_projects.items():
            results.append(run_rust_project(rname, rcfg))

    # Run JS tests
    if do_js:
        print(f"\n{'━'*70}")
        print(f"  JAVASCRIPT TESTS (vitest + playwright)")
        print(f"{'━'*70}")
        for jname, jcfg in js_projects.items():
            results.extend(run_js_project(jname, jcfg, run_e2e=do_e2e))

    # Final report
    report = print_report(results)

    if args.json:
        json_path = Path(args.json)
        json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  📄 Report saved to: {json_path}")

    return 1 if (report["total"]["failed"] > 0 or report["total"]["errors"] > 0) else 0


if __name__ == "__main__":
    sys.exit(main())
