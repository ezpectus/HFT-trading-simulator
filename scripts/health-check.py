#!/usr/bin/env python3
"""Project Health Dashboard — quick metrics without running tests.

Shows: file counts, line counts, large files, test coverage gaps,
lint error count, TODO/FIXME count, duplicate function detection.

Usage:
    python scripts/health-check.py
    python scripts/health-check.py --verbose
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

COMPONENTS_PY = ["exchange_simulator", "ai-signal-bot"]
COMPONENT_JS = "web-ui"
COMPONENT_CPP = "hft-trade-bot"
COMPONENT_RUST = "hft-executor"

LARGE_FILE_THRESHOLD = 500  # lines


def count_lines(path: Path) -> int:
    try:
        return sum(1 for _ in open(path, encoding="utf-8", errors="ignore"))
    except Exception:
        return 0


def count_python_files() -> tuple[int, int]:
    files = 0
    lines = 0
    for comp in COMPONENTS_PY:
        for p in (PROJECT_ROOT / comp).rglob("*.py"):
            if any(part in {"__pycache__", ".git", "node_modules", ".venv", "venv"} for part in p.parts):
                continue
            files += 1
            lines += count_lines(p)
    return files, lines


def count_js_files() -> tuple[int, int]:
    files = 0
    lines = 0
    js_root = PROJECT_ROOT / COMPONENT_JS / "src"
    if not js_root.exists():
        return 0, 0
    for ext in ("*.js", "*.jsx", "*.ts", "*.tsx"):
        for p in js_root.rglob(ext):
            if "node_modules" in p.parts:
                continue
            files += 1
            lines += count_lines(p)
    return files, lines


def count_cpp_files() -> tuple[int, int]:
    files = 0
    lines = 0
    cpp_root = PROJECT_ROOT / COMPONENT_CPP
    if not cpp_root.exists():
        return 0, 0
    for ext in ("*.h", "*.cpp", "*.hpp", "*.cc"):
        for p in cpp_root.rglob(ext):
            if any(part in {"build", ".git"} for part in p.parts):
                continue
            files += 1
            lines += count_lines(p)
    return files, lines


def count_rust_files() -> tuple[int, int]:
    files = 0
    lines = 0
    rs_root = PROJECT_ROOT / COMPONENT_RUST
    if not rs_root.exists():
        return 0, 0
    for p in rs_root.rglob("*.rs"):
        if "target" in p.parts:
            continue
        files += 1
        lines += count_lines(p)
    return files, lines


def count_test_files() -> dict[str, int]:
    counts = {}
    for comp in COMPONENTS_PY:
        test_dir = PROJECT_ROOT / comp / "tests"
        py_tests = 0
        if test_dir.exists():
            py_tests = sum(1 for _ in test_dir.rglob("test_*.py"))
        root_tests = sum(1 for _ in (PROJECT_ROOT / comp).glob("test_*.py"))
        counts[f"pytest: {comp}"] = py_tests + root_tests
    js_test_dir = PROJECT_ROOT / COMPONENT_JS / "src" / "test"
    if js_test_dir.exists():
        counts["vitest: web-ui"] = sum(
            1 for _ in js_test_dir.rglob("*.test.*")
        )
    else:
        counts["vitest: web-ui"] = 0
    return counts


def find_large_files() -> list[tuple[str, int]]:
    large = []
    for comp in COMPONENTS_PY:
        for p in (PROJECT_ROOT / comp).rglob("*.py"):
            if any(part in {"__pycache__", ".git", "node_modules", ".venv"} for part in p.parts):
                continue
            if p.name.startswith("test_"):
                continue
            lines = count_lines(p)
            if lines > LARGE_FILE_THRESHOLD:
                rel = str(p.relative_to(PROJECT_ROOT))
                large.append((rel, lines))
    js_src = PROJECT_ROOT / COMPONENT_JS / "src"
    if js_src.exists():
        for ext in ("*.js", "*.jsx"):
            for p in js_src.rglob(ext):
                if "node_modules" in p.parts or ".test." in p.name:
                    continue
                lines = count_lines(p)
                if lines > LARGE_FILE_THRESHOLD:
                    rel = str(p.relative_to(PROJECT_ROOT))
                    large.append((rel, lines))
    large.sort(key=lambda x: x[1], reverse=True)
    return large


def find_coverage_gaps() -> list[str]:
    gaps = []
    for comp in COMPONENTS_PY:
        src_dir = PROJECT_ROOT / comp / "src"
        if not src_dir.exists():
            continue
        for p in src_dir.rglob("*.py"):
            if p.name in {"__init__.py", "conftest.py", "__main__.py"}:
                continue
            if any(part in {"__pycache__", "migrations", "config"} for part in p.parts):
                continue
            stem = p.stem
            candidates = [
                PROJECT_ROOT / comp / "tests" / "unit" / f"test_{stem}.py",
                PROJECT_ROOT / comp / "tests" / f"test_{stem}.py",
                PROJECT_ROOT / comp / "tests" / "integration" / f"test_{stem}.py",
                PROJECT_ROOT / comp / f"test_{stem}.py",
            ]
            if not any(c.exists() for c in candidates):
                rel = str(p.relative_to(PROJECT_ROOT))
                gaps.append(rel)
    return gaps


def count_todos() -> dict[str, int]:
    counts = {"TODO": 0, "FIXME": 0, "HACK": 0, "XXX": 0}
    patterns = {k: re.compile(rf"\b{k}\b") for k in counts}
    for comp in COMPONENTS_PY:
        for p in (PROJECT_ROOT / comp).rglob("*.py"):
            if "__pycache__" in p.parts:
                continue
            try:
                content = p.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for key, pat in patterns.items():
                counts[key] += len(pat.findall(content))
    return counts


def find_duplicate_functions() -> list[tuple[str, int]]:
    """Find function names defined in multiple files."""
    func_files: dict[str, list[str]] = {}
    func_pattern = re.compile(r"^\s*def\s+(\w+)\s*\(")
    for comp in COMPONENTS_PY:
        for p in (PROJECT_ROOT / comp / "src").rglob("*.py"):
            if "__pycache__" in p.parts:
                continue
            try:
                for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
                    m = func_pattern.match(line)
                    if m:
                        name = m.group(1)
                        if not name.startswith("_"):
                            func_files.setdefault(name, []).append(str(p.relative_to(PROJECT_ROOT)))
            except Exception:
                continue
    duplicates = [(name, len(files)) for name, files in func_files.items() if len(files) > 1]
    duplicates.sort(key=lambda x: x[1], reverse=True)
    return duplicates[:20]


def count_git_stats() -> dict[str, int]:
    import subprocess
    stats = {}
    try:
        result = subprocess.run(
            ["git", "rev-list", "--count", "HEAD"],
            cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=10,
        )
        stats["commits"] = int(result.stdout.strip()) if result.returncode == 0 else 0
    except Exception:
        stats["commits"] = 0
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=10,
        )
        stats["uncommitted"] = len([line for line in result.stdout.strip().splitlines() if line]) if result.returncode == 0 else 0
    except Exception:
        stats["uncommitted"] = 0
    return stats


def print_section(title: str) -> None:
    print()
    print(f"  ── {title} {'─' * max(1, 50 - len(title))}")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Project Health Dashboard")
    parser.add_argument("--verbose", action="store_true", help="Show all details")
    args = parser.parse_args()

    print()
    print("=" * 70)
    print("  PROJECT HEALTH DASHBOARD")
    print("  HFT Trading System Lite")
    print("=" * 70)

    # ─── File counts ───
    print_section("FILE COUNTS")
    py_files, py_lines = count_python_files()
    js_files, js_lines = count_js_files()
    cpp_files, cpp_lines = count_cpp_files()
    rs_files, rs_lines = count_rust_files()

    print(f"  Python:   {py_files:>5} files, {py_lines:>8} lines")
    print(f"  JS/TS:    {js_files:>5} files, {js_lines:>8} lines")
    print(f"  C++:      {cpp_files:>5} files, {cpp_lines:>8} lines")
    print(f"  Rust:     {rs_files:>5} files, {rs_lines:>8} lines")
    total_files = py_files + js_files + cpp_files + rs_files
    total_lines = py_lines + js_lines + cpp_lines + rs_lines
    print("  ─────────────────────────────")
    print(f"  Total:    {total_files:>5} files, {total_lines:>8} lines")

    # ─── Test files ───
    print_section("TEST FILES")
    test_counts = count_test_files()
    for name, count in test_counts.items():
        print(f"  {name:<30} {count:>5} test files")
    total_tests = sum(test_counts.values())
    print(f"  {'Total':<30} {total_tests:>5} test files")

    # ─── Large files ───
    print_section(f"LARGE FILES (>{LARGE_FILE_THRESHOLD} lines)")
    large = find_large_files()
    if not large:
        print("  None — all files within limit.")
    else:
        for path, lines in large[:15]:
            flag = "⚠️" if lines > 700 else "  "
            print(f"  {flag} {lines:>5} lines  {path}")
        if len(large) > 15:
            print(f"  ... and {len(large) - 15} more")

    # ─── Coverage gaps ───
    print_section("COVERAGE GAPS (source files without tests)")
    gaps = find_coverage_gaps()
    if not gaps:
        print("  None — all source files have tests!")
    else:
        print(f"  {len(gaps)} source files without tests:")
        if args.verbose:
            for g in gaps:
                print(f"    - {g}")
        else:
            for g in gaps[:10]:
                print(f"    - {g}")
            if len(gaps) > 10:
                print(f"    ... and {len(gaps) - 10} more (use --verbose to see all)")

    # ─── TODOs ───
    print_section("TODO / FIXME / HACK")
    todos = count_todos()
    for key, count in todos.items():
        flag = "⚠️" if count > 20 else "  "
        print(f"  {flag} {key:<10} {count:>5}")

    # ─── Duplicate functions ───
    print_section("DUPLICATE FUNCTIONS (top 20)")
    dups = find_duplicate_functions()
    if not dups:
        print("  None — no duplicate function names found.")
    else:
        for name, count in dups:
            print(f"    {name:<40} {count:>3} copies")

    # ─── Git stats ───
    print_section("GIT")
    git_stats = count_git_stats()
    print(f"  Total commits:    {git_stats['commits']}")
    print(f"  Uncommitted files: {git_stats['uncommitted']}")

    # ─── Summary ───
    print()
    print("=" * 70)
    health_score = 100
    issues = []
    if len(large) > 0:
        health_score -= min(20, len(large) * 2)
        issues.append(f"{len(large)} large files")
    if len(gaps) > 0:
        health_score -= min(30, len(gaps) * 3)
        issues.append(f"{len(gaps)} coverage gaps")
    if todos["TODO"] > 20:
        health_score -= 10
        issues.append(f"{todos['TODO']} TODOs")
    if todos["FIXME"] > 5:
        health_score -= 10
        issues.append(f"{todos['FIXME']} FIXMEs")
    if len(dups) > 10:
        health_score -= 10
        issues.append(f"{len(dups)} duplicate functions")

    if health_score >= 90:
        grade = "🟢 EXCELLENT"
    elif health_score >= 70:
        grade = "🟡 GOOD"
    elif health_score >= 50:
        grade = "🟠 FAIR"
    else:
        grade = "🔴 POOR"

    print(f"  HEALTH SCORE: {health_score}/100 — {grade}")
    if issues:
        print(f"  Issues: {', '.join(issues)}")
    else:
        print("  No major issues detected.")
    print("=" * 70)
    print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
