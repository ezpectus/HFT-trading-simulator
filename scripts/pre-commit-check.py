#!/usr/bin/env python3
"""Pre-commit verification script — runs lint + tests before allowing commit.

Usage:
    python scripts/pre-commit-check.py           # Full check (lint + tests)
    python scripts/pre-commit-check.py --lint    # Lint only (fast, ~10s)
    python scripts/pre-commit-check.py --tests   # Tests only
    python scripts/pre-commit-check.py --quick   # Lint + quick tests (no C++/Rust)

Exit codes:
    0 — all checks passed, commit allowed
    1 — one or more checks failed, commit BLOCKED

Integrates as git hook:
    cp scripts/pre-commit-check.py .git/hooks/pre-commit
    # or create .git/hooks/pre-commit that calls: python scripts/pre-commit-check.py
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

COMPONENTS_PY = ["exchange_simulator", "ai-signal-bot"]
COMPONENT_JS = "web-ui"


@dataclass
class CheckResult:
    name: str
    passed: bool
    duration_s: float
    output: str = ""
    error: str = ""


@dataclass
class CheckSummary:
    results: list[CheckResult] = field(default_factory=list)

    def add(self, result: CheckResult) -> None:
        self.results.append(result)

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if not r.passed)

    @property
    def all_ok(self) -> bool:
        return self.failed == 0


def run_command(
    cmd: list[str],
    cwd: Path,
    timeout: int = 300,
) -> tuple[bool, str, str, float]:
    """Run a command and return (success, stdout, stderr, duration)."""
    start = time.monotonic()
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
        duration = time.monotonic() - start
        success = proc.returncode == 0
        return success, proc.stdout, proc.stderr, duration
    except subprocess.TimeoutExpired:
        duration = time.monotonic() - start
        return False, "", f"Timeout after {timeout}s", duration
    except FileNotFoundError:
        duration = time.monotonic() - start
        return False, "", f"Command not found: {cmd[0]}", duration


def check_ruff(component: str) -> CheckResult:
    """Run ruff lint on a Python component."""
    cwd = PROJECT_ROOT / component
    success, stdout, stderr, duration = run_command(
        [sys.executable, "-m", "ruff", "check", "."],
        cwd=cwd,
        timeout=60,
    )
    output = stdout + stderr if not success else ""
    return CheckResult(
        name=f"ruff: {component}",
        passed=success,
        duration_s=duration,
        output=output,
    )


def check_eslint() -> CheckResult:
    """Run eslint on web-ui."""
    cwd = PROJECT_ROOT / COMPONENT_JS
    success, stdout, stderr, duration = run_command(
        ["npx", "eslint", "src/", "--quiet"],
        cwd=cwd,
        timeout=60,
    )
    output = stdout + stderr if not success else ""
    return CheckResult(
        name="eslint: web-ui",
        passed=success,
        duration_s=duration,
        output=output,
    )


def check_pytest(component: str, quick: bool = False) -> CheckResult:
    """Run pytest on a Python component."""
    cwd = PROJECT_ROOT / component
    args = [sys.executable, "-m", "pytest", "tests/", "-q", "--tb=short", "--no-header"]
    if quick:
        args.extend(["-x", "--timeout=30"])
    success, stdout, stderr, duration = run_command(
        args,
        cwd=cwd,
        timeout=300,
    )
    output = stdout + stderr if not success else ""
    return CheckResult(
        name=f"pytest: {component}",
        passed=success,
        duration_s=duration,
        output=output,
    )


def check_vitest(quick: bool = False) -> CheckResult:
    """Run vitest on web-ui."""
    cwd = PROJECT_ROOT / COMPONENT_JS
    node_options = os.environ.get("NODE_OPTIONS", "")
    env = {**os.environ, "NODE_OPTIONS": "--max-old-space-size=8192 " + node_options}

    cmd = ["npx", "vitest", "run", "--reporter=dot"]
    if quick:
        cmd.append("--no-coverage")

    start = time.monotonic()
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=300,
            env=env,
        )
        duration = time.monotonic() - start
        success = proc.returncode == 0
        output = proc.stdout + proc.stderr if not success else ""
        return CheckResult(
            name="vitest: web-ui",
            passed=success,
            duration_s=duration,
            output=output,
        )
    except subprocess.TimeoutExpired:
        duration = time.monotonic() - start
        return CheckResult(
            name="vitest: web-ui",
            passed=False,
            duration_s=duration,
            error=f"Timeout after 300s",
        )
    except FileNotFoundError:
        return CheckResult(
            name="vitest: web-ui",
            passed=False,
            duration_s=0,
            error="npx not found",
        )


def format_duration(seconds: float) -> str:
    if seconds < 1:
        return f"{seconds * 1000:.0f}ms"
    if seconds < 60:
        return f"{seconds:.1f}s"
    return f"{int(seconds // 60)}m{int(seconds % 60)}s"


def print_results(summary: CheckSummary) -> None:
    """Print formatted results table."""
    print()
    print("=" * 60)
    print("  PRE-COMMIT VERIFICATION")
    print("=" * 60)
    print()

    for r in summary.results:
        status = "PASS" if r.passed else "FAIL"
        icon = "[PASS]" if r.passed else "[FAIL]"
        dur = format_duration(r.duration_s)
        print(f"  {icon} {r.name:<35} {dur:>8}")

        if not r.passed and r.output:
            lines = r.output.strip().split("\n")
            for line in lines[-15:]:
                print(f"         {line}")
            if len(lines) > 15:
                print(f"         ... ({len(lines)} lines total)")
            print()

    print()
    print("-" * 60)
    total = len(summary.results)
    print(f"  Results: {summary.passed} passed, {summary.failed} failed, {total} total")

    if summary.all_ok:
        print("  STATUS: ALL GREEN — commit allowed")
    else:
        print("  STATUS: FAILURES — commit BLOCKED")
        print()
        print("  Fix the failures above, then re-run:")
        print("    python scripts/pre-commit-check.py")
    print("=" * 60)
    print()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Pre-commit verification: lint + tests before commit"
    )
    parser.add_argument(
        "--lint",
        action="store_true",
        help="Run lint only (ruff + eslint, no tests)",
    )
    parser.add_argument(
        "--tests",
        action="store_true",
        help="Run tests only (pytest + vitest, no lint)",
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Quick mode: lint + fast tests (stop on first failure)",
    )
    args = parser.parse_args()

    summary = CheckSummary()

    # Lint checks
    if not args.tests:
        for comp in COMPONENTS_PY:
            summary.add(check_ruff(comp))
        summary.add(check_eslint())

    # Test checks
    if not args.lint:
        for comp in COMPONENTS_PY:
            summary.add(check_pytest(comp, quick=args.quick))
        summary.add(check_vitest(quick=args.quick))

    print_results(summary)
    return 0 if summary.all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
