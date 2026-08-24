#!/usr/bin/env python3
"""Pre-commit verification — ALL CI checks before commit.

WHAT IT DOES (matches .github/workflows/ci.yml):
  1. Detects staged files via `git diff --cached --name-only`
  2. Lint: ruff (Python) + eslint (JS) + clang-format (C++) — only changed files
  3. Tests: pytest (Python) + vitest (JS) + ctest (C++) + cargo test (Rust) — only relevant
  4. Build: vite build (JS) + cmake build (C++) + cargo build (Rust)
  5. Security: bandit (Python) + npm audit (JS)
  6. E2E: Playwright (web-ui, mock mode)
  7. Coverage gap: every changed source file must have a test file
  8. Import validation: Python AST parse + module existence check
  9. Commit message: English only + conventional commits + max 72 chars

Usage:
    python scripts/pre-commit-check.py                    # Default: lint + tests (all languages)
    python scripts/pre-commit-check.py --staged --quick   # Hook: only staged files, fast
    python scripts/pre-commit-check.py --lint             # Lint only (ruff + eslint + clang-format)
    python scripts/pre-commit-check.py --tests            # Tests only (pytest + vitest + ctest + cargo)
    python scripts/pre-commit-check.py --full             # Full: lint + tests + build + security
    python scripts/pre-commit-check.py --all              # ALL CI: + e2e (slowest, ~10-15 min)
    python scripts/pre-commit-check.py --msg-file <path>  # Validate commit message

CI jobs covered (from .github/workflows/ci.yml):
    lint-python     → ruff (exchange_simulator + ai-signal-bot)
    lint-cpp        → clang-format (hft-trade-bot)
    lint-js         → eslint (web-ui)
    test-python     → pytest (exchange_simulator + ai-signal-bot)
    test-cpp        → cmake build + ctest (hft-trade-bot)
    test-js         → vitest (web-ui)
    test-rust       → cargo build + test (hft-executor)
    build-js        → vite build (web-ui)
    audit-deps      → npm audit (web-ui)
    security-bandit → bandit (exchange_simulator + ai-signal-bot)
    test-e2e        → playwright (web-ui, --all mode only)

Exit codes:
    0 — all checks passed, commit allowed
    1 — one or more checks failed, commit BLOCKED
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

COMPONENTS_PY = ["exchange_simulator", "ai-signal-bot"]
COMPONENT_JS = "web-ui"

CYRILLIC_RE = re.compile(r"[а-яА-ЯёЁ]")
CONVENTIONAL_RE = re.compile(
    r"^(feat|fix|perf|test|docs|refactor|style|security|chore|math|ml|hft|quantum|broker|ci|build)"
    r"(\(.+\))?:\s+.+",
    re.IGNORECASE,
)


@dataclass
class CheckResult:
    name: str
    passed: bool
    duration_s: float
    output: str = ""
    error: str = ""
    warnings: list[str] = field(default_factory=list)


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


# ─── Git helpers ───────────────────────────────────────────


def get_staged_files() -> list[str]:
    """Get list of staged file paths via git diff --cached."""
    try:
        proc = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if proc.returncode == 0:
            return [f.strip() for f in proc.stdout.splitlines() if f.strip()]
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return []


def get_staged_files_by_ext(files: list[str], extensions: set[str]) -> list[str]:
    """Filter staged files by extension."""
    return [f for f in files if Path(f).suffix.lstrip(".") in extensions]


# ─── Command runner ────────────────────────────────────────


def run_command(
    cmd: list[str],
    cwd: Path,
    timeout: int = 300,
    env: dict[str, str] | None = None,
) -> tuple[bool, str, str, float]:
    start = time.monotonic()
    try:
        # On Windows, .cmd files (npx, npm) need shell=True or full path resolution
        use_shell = False
        if sys.platform == "win32" and cmd and not Path(cmd[0]).exists():
            # Check if it's a known .cmd/.bat command
            base = cmd[0].lower()
            if base in {"npx", "npm", "cargo", "cmake", "ctest", "clang-format", "git"}:
                use_shell = True

        proc = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            shell=use_shell,
        )
        duration = time.monotonic() - start
        return proc.returncode == 0, proc.stdout, proc.stderr, duration
    except subprocess.TimeoutExpired:
        return False, "", f"Timeout after {timeout}s", time.monotonic() - start
    except FileNotFoundError:
        return False, "", f"Command not found: {cmd[0]}", 0.0


# ─── Lint checks ──────────────────────────────────────────


def check_ruff(component: str, files: list[str] | None = None) -> CheckResult:
    """Run ruff on a Python component. If files given, lint only those."""
    cwd = PROJECT_ROOT / component
    if files:
        rel_files = []
        for f in files:
            p = Path(f)
            if p.parts and p.parts[0] == component:
                rel_files.append(str(p.relative_to(component)))
        if not rel_files:
            return CheckResult(f"ruff: {component} (staged)", True, 0.0)
        cmd = [sys.executable, "-m", "ruff", "check"] + rel_files
    else:
        cmd = [sys.executable, "-m", "ruff", "check", "."]

    success, stdout, stderr, duration = run_command(cmd, cwd=cwd, timeout=60)
    return CheckResult(
        f"ruff: {component}" + (" (staged)" if files else ""),
        passed=success,
        duration_s=duration,
        output=(stdout + stderr) if not success else "",
    )


def check_eslint(files: list[str] | None = None) -> CheckResult:
    """Run eslint on web-ui. If files given, lint only those."""
    cwd = PROJECT_ROOT / COMPONENT_JS
    if files:
        rel_files = []
        for f in files:
            p = Path(f)
            if p.parts and p.parts[0] == COMPONENT_JS:
                rel_files.append(str(p.relative_to(COMPONENT_JS)))
        if not rel_files:
            return CheckResult("eslint: web-ui (staged)", True, 0.0)
        cmd = ["npx", "eslint", "--quiet"] + rel_files
    else:
        cmd = ["npx", "eslint", "src/", "--quiet"]

    success, stdout, stderr, duration = run_command(cmd, cwd=cwd, timeout=60)
    return CheckResult(
        "eslint: web-ui" + (" (staged)" if files else ""),
        passed=success,
        duration_s=duration,
        output=(stdout + stderr) if not success else "",
    )


# ─── Test checks ──────────────────────────────────────────


def find_test_files_for_py(source_file: str, component: str) -> list[str]:
    """Find test files that correspond to a changed Python source file.

    Strategy:
      - src/risk/var_calculator.py → tests/unit/test_var_calculator.py
      - src/risk/var_calculator.py → tests/test_var_calculator.py
      - src/strategies.py → tests/test_strategies.py
      - exchange_simulator/foo.py → tests/test_foo.py
    """
    p = Path(source_file)
    if p.parts and p.parts[0] == component:
        p = p.relative_to(component)

    stem = p.stem
    candidates = [
        PROJECT_ROOT / component / "tests" / "unit" / f"test_{stem}.py",
        PROJECT_ROOT / component / "tests" / f"test_{stem}.py",
        PROJECT_ROOT / component / "tests" / "integration" / f"test_{stem}.py",
    ]
    return [str(c) for c in candidates if c.exists()]


def find_test_files_for_js(source_file: str) -> list[str]:
    """Find test files for a changed JS/JSX file.

    Strategy:
      - src/components/risk/RiskDashboard.jsx → src/test/risk/RiskDashboard.test.jsx
      - src/utils/format.js → src/test/utils/format.test.js
    """
    p = Path(source_file)
    if p.parts and p.parts[0] == COMPONENT_JS:
        p = p.relative_to(COMPONENT_JS)

    if p.parts[0] == "src":
        test_path = Path("src") / "test" / Path(*p.parts[2:])
    else:
        test_path = Path("src") / "test" / p

    test_path = test_path.with_suffix("")
    candidates = [
        PROJECT_ROOT / COMPONENT_JS / f"{test_path}.test.jsx",
        PROJECT_ROOT / COMPONENT_JS / f"{test_path}.test.js",
        PROJECT_ROOT / COMPONENT_JS / str(Path("src") / "test" / f"{p.stem}.test.jsx"),
        PROJECT_ROOT / COMPONENT_JS / str(Path("src") / "test" / f"{p.stem}.test.js"),
    ]
    return [str(c) for c in candidates if c.exists()]


def check_pytest(component: str, quick: bool = False, files: list[str] | None = None) -> CheckResult:
    """Run pytest. If files given, run only tests for those source files."""
    cwd = PROJECT_ROOT / component
    args = [sys.executable, "-m", "pytest", "-q", "--tb=short", "--no-header"]
    if quick:
        args.extend(["-x", "--timeout=30"])

    if files:
        test_files: set[str] = set()
        for f in files:
            tests = find_test_files_for_py(f, component)
            test_files.update(tests)
        if not test_files:
            return CheckResult(
                f"pytest: {component} (staged — no tests found)",
                passed=True,
                duration_s=0.0,
                warnings=["No test files found for staged sources — see coverage check"],
            )
        args.extend(sorted(test_files))
        name = f"pytest: {component} ({len(test_files)} test files)"
    else:
        args.append("tests/")
        name = f"pytest: {component}"

    success, stdout, stderr, duration = run_command(args, cwd=cwd, timeout=300)
    return CheckResult(
        name,
        passed=success,
        duration_s=duration,
        output=(stdout + stderr) if not success else "",
    )


def check_vitest(quick: bool = False, files: list[str] | None = None) -> CheckResult:
    """Run vitest. If files given, run only tests for those source files."""
    cwd = PROJECT_ROOT / COMPONENT_JS
    node_options = os.environ.get("NODE_OPTIONS", "")
    env = {**os.environ, "NODE_OPTIONS": "--max-old-space-size=8192 " + node_options}

    cmd = ["npx", "vitest", "run", "--reporter=dot"]
    if quick:
        cmd.append("--no-coverage")

    if files:
        test_files: set[str] = set()
        for f in files:
            tests = find_test_files_for_js(f)
            test_files.update(tests)
        if not test_files:
            return CheckResult(
                "vitest: web-ui (staged — no tests found)",
                passed=True,
                duration_s=0.0,
                warnings=["No test files found for staged sources — see coverage check"],
            )
        cmd.extend(sorted(test_files))
        name = f"vitest: web-ui ({len(test_files)} test files)"
    else:
        name = "vitest: web-ui"

    success, stdout, stderr, duration = run_command(cmd, cwd=cwd, timeout=300, env=env)
    return CheckResult(
        name,
        passed=success,
        duration_s=duration,
        output=(stdout + stderr) if not success else "",
    )


def check_clang_format(files: list[str] | None = None) -> CheckResult:
    """Run clang-format dry-run on C++ files."""
    cwd = PROJECT_ROOT / "hft-trade-bot"
    if not cwd.exists():
        return CheckResult("clang-format: hft-trade-bot", True, 0.0, "hft-trade-bot not found")

    if files:
        cpp_files = [f for f in files if f.endswith((".h", ".cpp", ".hpp", ".cc"))]
        if not cpp_files:
            return CheckResult("clang-format: hft-trade-bot (staged)", True, 0.0)
        rel_files = [str(Path(f).relative_to("hft-trade-bot")) for f in cpp_files
                     if f.startswith("hft-trade-bot")]
        if not rel_files:
            return CheckResult("clang-format: hft-trade-bot (staged)", True, 0.0)
        cmd = ["clang-format", "--dry-run", "--Werror"] + rel_files
    else:
        cmd = [
            "bash", "-c",
            "find src tests -name '*.h' -o -name '*.cpp' | grep -v '/fix/' | xargs clang-format --dry-run --Werror",
        ]

    success, stdout, stderr, duration = run_command(cmd, cwd=cwd, timeout=60)
    return CheckResult(
        "clang-format: hft-trade-bot" + (" (staged)" if files else ""),
        passed=success,
        duration_s=duration,
        output=(stdout + stderr) if not success else "",
    )


def check_cpp_build_and_test(quick: bool = False) -> CheckResult:
    """Build hft-trade-bot with cmake and run ctest."""
    cwd = PROJECT_ROOT / "hft-trade-bot"
    if not cwd.exists():
        return CheckResult("cmake+ctest: hft-trade-bot", True, 0.0, "hft-trade-bot not found")

    build_dir = cwd / "build"

    # Configure
    success, stdout, stderr, duration = run_command(
        ["cmake", "..", "-DCMAKE_BUILD_TYPE=Debug"],
        cwd=build_dir if build_dir.exists() else cwd,
        timeout=120,
    )
    if not success:
        return CheckResult(
            "cmake+ctest: hft-trade-bot",
            passed=False,
            duration_s=duration,
            output=f"cmake configure failed:\n{stdout + stderr}",
        )

    # Build
    success, stdout, stderr, build_dur = run_command(
        ["cmake", "--build", ".", "--config", "Debug", "-j"],
        cwd=build_dir,
        timeout=300,
    )
    total_dur = duration + build_dur
    if not success:
        return CheckResult(
            "cmake+ctest: hft-trade-bot",
            passed=False,
            duration_s=total_dur,
            output=f"cmake build failed:\n{stdout + stderr}",
        )

    # Test
    success, stdout, stderr, test_dur = run_command(
        ["ctest", "--output-on-failure", "-C", "Debug"],
        cwd=build_dir,
        timeout=120,
    )
    total_dur += test_dur
    return CheckResult(
        "cmake+ctest: hft-trade-bot",
        passed=success,
        duration_s=total_dur,
        output=(stdout + stderr) if not success else "",
    )


def check_rust_build_and_test(quick: bool = False) -> CheckResult:
    """Build and test hft-executor with cargo."""
    cwd = PROJECT_ROOT / "hft-executor"
    if not cwd.exists():
        return CheckResult("cargo: hft-executor", True, 0.0, "hft-executor not found")

    # Build
    success, stdout, stderr, build_dur = run_command(
        ["cargo", "build", "--release"],
        cwd=cwd,
        timeout=180,
    )
    if not success:
        return CheckResult(
            "cargo: hft-executor",
            passed=False,
            duration_s=build_dur,
            output=f"cargo build failed:\n{stdout + stderr}",
        )

    # Test
    success, stdout, stderr, test_dur = run_command(
        ["cargo", "test", "--release"],
        cwd=cwd,
        timeout=120,
    )
    return CheckResult(
        "cargo: hft-executor",
        passed=success,
        duration_s=build_dur + test_dur,
        output=(stdout + stderr) if not success else "",
    )


def check_vite_build() -> CheckResult:
    """Run vite production build for web-ui."""
    cwd = PROJECT_ROOT / COMPONENT_JS
    success, stdout, stderr, duration = run_command(
        ["npx", "vite", "build"],
        cwd=cwd,
        timeout=120,
    )
    return CheckResult(
        "vite build: web-ui",
        passed=success,
        duration_s=duration,
        output=(stdout + stderr) if not success else "",
    )


def check_npm_audit() -> CheckResult:
    """Run npm audit for high/critical vulnerabilities."""
    cwd = PROJECT_ROOT / COMPONENT_JS
    success, stdout, stderr, duration = run_command(
        ["npm", "audit", "--audit-level=high"],
        cwd=cwd,
        timeout=30,
    )
    return CheckResult(
        "npm audit: web-ui",
        passed=success,
        duration_s=duration,
        output=(stdout + stderr) if not success else "",
    )


def check_bandit(component: str) -> CheckResult:
    """Run bandit security scan on a Python component."""
    cwd = PROJECT_ROOT / component
    success, stdout, stderr, duration = run_command(
        [sys.executable, "-m", "bandit", "-r", ".", "-ll", "-ii", "-q"],
        cwd=cwd,
        timeout=60,
    )
    return CheckResult(
        f"bandit: {component}",
        passed=success,
        duration_s=duration,
        output=(stdout + stderr) if not success else "",
    )


def check_playwright_e2e() -> CheckResult:
    """Run Playwright E2E tests for web-ui (mock mode)."""
    cwd = PROJECT_ROOT / COMPONENT_JS
    env = {**os.environ, "VITE_MOCK_MODE": "true"}
    success, stdout, stderr, duration = run_command(
        ["npx", "playwright", "test", "--reporter=line"],
        cwd=cwd,
        timeout=180,
        env=env,
    )
    return CheckResult(
        "playwright e2e: web-ui",
        passed=success,
        duration_s=duration,
        output=(stdout + stderr) if not success else "",
    )


def check_test_coverage_gaps(staged_files: list[str]) -> CheckResult:
    """Check that every staged source file has a corresponding test file.

    This is the KEY check that prevents AI agents from committing code without tests.
    Returns FAIL if any source file has no test file found.
    """
    missing: list[str] = []
    checked: list[str] = []

    for f in staged_files:
        p = Path(f)
        ext = p.suffix.lstrip(".")

        # Skip non-source files
        if ext not in {"py", "jsx", "js", "tsx", "ts"}:
            continue
        # Skip __init__.py, conftest.py, setup.py, manage.py
        if p.name in {"__init__.py", "conftest.py", "setup.py", "manage.py"}:
            continue
        # Skip files that ARE tests
        if p.name.startswith("test_") or ".test." in p.name:
            continue
        # Skip config/migration/docker files
        if "migrations" in p.parts or "config" in p.parts or "deploy" in p.parts:
            continue
        # Skip .cascade/ files
        if ".cascade" in p.parts:
            continue

        checked.append(f)

        if ext == "py":
            component = p.parts[0] if p.parts else ""
            if component in COMPONENTS_PY:
                tests = find_test_files_for_py(f, component)
                if not tests:
                    missing.append(f)
        elif ext in {"jsx", "js", "tsx", "ts"}:
            tests = find_test_files_for_js(f)
            if not tests:
                missing.append(f)

    if not checked:
        return CheckResult("coverage: test gap check", True, 0.0, "No source files staged")

    if missing:
        output = "Missing test files for:\n"
        for m in missing:
            output += f"  - {m}\n"
        output += "\nCreate test files before committing. See .cascade/prompts/orchestration-prompt.md § WD TESTS."
        return CheckResult(
            "coverage: test gap check",
            passed=False,
            duration_s=0.0,
            output=output,
        )

    return CheckResult(
        "coverage: test gap check",
        passed=True,
        duration_s=0.0,
        output=f"All {len(checked)} staged source files have test files",
    )


# ─── Import validation ────────────────────────────────────


def check_python_imports(staged_files: list[str]) -> CheckResult:
    """Validate that changed Python files don't have broken imports.

    Uses py_compile to check syntax + ast to extract import names,
    then verifies the target modules exist.
    """
    import ast

    broken: list[str] = []
    checked = 0

    for f in staged_files:
        p = Path(f)
        if p.suffix != ".py":
            continue
        full_path = PROJECT_ROOT / f
        if not full_path.exists():
            continue

        try:
            source = full_path.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=f)
        except SyntaxError as e:
            broken.append(f"  {f}: SyntaxError — {e}")
            continue
        except Exception as e:
            broken.append(f"  {f}: {type(e).__name__} — {e}")
            continue

        checked += 1

        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                # Check relative imports (from . import X, from ..foo import Y)
                if node.level > 0:
                    continue
                # Check absolute imports from src (our own modules)
                if node.module.startswith("src."):
                    parts = node.module.replace("src.", "").split(".")
                    for comp in COMPONENTS_PY:
                        candidate = PROJECT_ROOT / comp / "src" / Path(*parts)
                        if candidate.with_suffix(".py").exists():
                            break
                        if (candidate / "__init__.py").exists():
                            break
                    else:
                        broken.append(f"  {f}: broken import `from {node.module} import ...`")

    if not checked:
        return CheckResult("imports: Python validation", True, 0.0, "No Python files staged")

    if broken:
        return CheckResult(
            "imports: Python validation",
            passed=False,
            duration_s=0.0,
            output="\n".join(broken),
        )

    return CheckResult(
        "imports: Python validation",
        passed=True,
        duration_s=0.0,
        output=f"{checked} Python files checked — all imports valid",
    )


# ─── Commit message validation ────────────────────────────


def check_commit_message(msg: str) -> CheckResult:
    """Validate commit message: English only + conventional commits format."""
    issues: list[str] = []

    # Check for Cyrillic
    if CYRILLIC_RE.search(msg):
        issues.append("Contains Cyrillic characters — commit messages MUST be English only")

    # Check conventional commits format (first line)
    first_line = msg.strip().splitlines()[0] if msg.strip() else ""
    if first_line and not CONVENTIONAL_RE.match(first_line):
        issues.append(
            f'First line must match: <type>: <description>\n'
            f'  Got: "{first_line[:80]}"\n'
            f'  Types: feat, fix, perf, test, docs, refactor, style, security, chore, ci, build'
        )

    # Check length
    if len(first_line) > 72:
        issues.append(f"First line too long ({len(first_line)} chars, max 72)")

    if issues:
        return CheckResult("commit-msg: format", False, 0.0, "\n".join(issues))

    return CheckResult("commit-msg: format", True, 0.0, f'OK: "{first_line[:60]}"')


# ─── Output formatting ────────────────────────────────────


def format_duration(seconds: float) -> str:
    if seconds < 1:
        return f"{seconds * 1000:.0f}ms"
    if seconds < 60:
        return f"{seconds:.1f}s"
    return f"{int(seconds // 60)}m{int(seconds % 60)}s"


def print_results(summary: CheckSummary, staged_files: list[str] | None = None) -> None:
    print()
    print("=" * 70)
    print("  PRE-COMMIT VERIFICATION")
    if staged_files is not None:
        print(f"  Staged files: {len(staged_files)}")
    print("=" * 70)
    print()

    if staged_files is not None and staged_files:
        print("  Staged files:")
        for f in staged_files[:10]:
            print(f"    {f}")
        if len(staged_files) > 10:
            print(f"    ... and {len(staged_files) - 10} more")
        print()

    for r in summary.results:
        icon = "[PASS]" if r.passed else "[FAIL]"
        dur = format_duration(r.duration_s)
        print(f"  {icon} {r.name:<45} {dur:>8}")

        if r.output and not r.passed:
            lines = r.output.strip().split("\n")
            for line in lines[-20:]:
                print(f"         {line}")
            if len(lines) > 20:
                print(f"         ... ({len(lines)} lines total)")
            print()

        for w in r.warnings:
            print(f"         [WARN] {w}")
        if r.warnings:
            print()

    print()
    print("-" * 70)
    total = len(summary.results)
    print(f"  Results: {summary.passed} passed, {summary.failed} failed, {total} total")

    if summary.all_ok:
        print("  STATUS: ALL GREEN — commit allowed")
    else:
        print("  STATUS: FAILURES — commit BLOCKED")
        print()
        print("  Fix the failures above, then re-run:")
        print("    python scripts/pre-commit-check.py")
    print("=" * 70)
    print()


# ─── Main ─────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Pre-commit verification: ALL CI checks — lint + tests + build + security + e2e"
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument("--lint", action="store_true", help="Lint only (fast, all languages)")
    mode_group.add_argument("--tests", action="store_true", help="Tests only (all languages)")
    mode_group.add_argument("--quick", action="store_true", help="Quick: lint + fast tests (stop on first fail)")
    mode_group.add_argument("--staged", action="store_true", help="Only check staged files (for hook)")
    mode_group.add_argument("--full", action="store_true", help="Full project check (all files, all tests)")
    mode_group.add_argument("--all", action="store_true", help="ALL CI checks: lint+tests+build+security+e2e (slowest)")
    parser.add_argument("--msg-file", type=str, help="Validate commit message from file")
    args = parser.parse_args()

    # Commit message validation (separate mode)
    if args.msg_file:
        try:
            msg = Path(args.msg_file).read_text(encoding="utf-8")
        except Exception as e:
            print(f"ERROR reading commit message: {e}")
            return 1
        result = check_commit_message(msg)
        summary = CheckSummary()
        summary.add(result)
        print_results(summary)
        return 0 if summary.all_ok else 1

    # Determine staged files
    staged_files = get_staged_files() if (args.staged or args.quick) else []
    use_staged = bool(staged_files) and (args.staged or args.quick)

    py_files = get_staged_files_by_ext(staged_files, {"py"}) if use_staged else None
    js_files = get_staged_files_by_ext(staged_files, {"jsx", "js", "tsx", "ts"}) if use_staged else None
    cpp_files = get_staged_files_by_ext(staged_files, {"h", "cpp", "hpp", "cc"}) if use_staged else None
    rs_files = get_staged_files_by_ext(staged_files, {"rs"}) if use_staged else None

    # Determine which checks to run
    run_lint = not args.tests
    run_tests = not args.lint
    run_build = args.full or args.all
    run_security = args.full or args.all
    run_e2e = args.all

    # In staged mode, only run checks for languages that have staged files
    if use_staged:
        has_py = bool(py_files)
        has_js = bool(js_files)
        has_cpp = bool(cpp_files)
        has_rs = bool(rs_files)
    else:
        has_py = True
        has_js = True
        has_cpp = True
        has_rs = True

    summary = CheckSummary()

    # ─── Lint checks ───
    if run_lint:
        if has_py:
            for comp in COMPONENTS_PY:
                comp_py = [f for f in (py_files or []) if f.startswith(comp)] if py_files else None
                summary.add(check_ruff(comp, files=comp_py))
        if has_js:
            comp_js = [f for f in (js_files or []) if f.startswith(COMPONENT_JS)] if js_files else None
            summary.add(check_eslint(files=comp_js))
        if has_cpp:
            summary.add(check_clang_format(files=cpp_files))

    # ─── Test checks ───
    if run_tests:
        if has_py:
            for comp in COMPONENTS_PY:
                comp_py = [f for f in (py_files or []) if f.startswith(comp)] if py_files else None
                summary.add(check_pytest(comp, quick=args.quick, files=comp_py))
        if has_js:
            comp_js = [f for f in (js_files or []) if f.startswith(COMPONENT_JS)] if js_files else None
            summary.add(check_vitest(quick=args.quick, files=comp_js))
        if has_cpp and (run_build or args.full or args.all):
            summary.add(check_cpp_build_and_test(quick=args.quick))
        if has_rs and (run_build or args.full or args.all):
            summary.add(check_rust_build_and_test(quick=args.quick))

    # ─── Build checks ───
    if run_build and has_js:
        summary.add(check_vite_build())

    # ─── Security checks ───
    if run_security:
        if has_py:
            for comp in COMPONENTS_PY:
                summary.add(check_bandit(comp))
        if has_js:
            summary.add(check_npm_audit())

    # ─── E2E checks ───
    if run_e2e and has_js:
        summary.add(check_playwright_e2e())

    # ─── Coverage + import checks (staged mode only) ───
    if use_staged and staged_files:
        summary.add(check_test_coverage_gaps(staged_files))
        summary.add(check_python_imports(staged_files))

    print_results(summary, staged_files=staged_files if use_staged else None)
    return 0 if summary.all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
