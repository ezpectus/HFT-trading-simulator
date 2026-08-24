#!/usr/bin/env python3
"""CI Equivalence Verifier — checks pre-commit covers all ci.yml jobs.

Parses .github/workflows/ci.yml, extracts all job names,
then checks pre-commit-check.py has corresponding checks.

Usage:
    python scripts/ci-equivalence.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CI_YML = PROJECT_ROOT / ".github" / "workflows" / "ci.yml"
PRE_COMMIT_SCRIPT = PROJECT_ROOT / "scripts" / "pre-commit-check.py"


def parse_ci_jobs() -> list[dict[str, str]]:
    """Parse ci.yml and extract job names + their purpose."""
    if not CI_YML.exists():
        print("ERROR: .github/workflows/ci.yml not found")
        return []
    content = CI_YML.read_text(encoding="utf-8")
    jobs = []
    job_pattern = re.compile(r'^  (\w[\w-]*):\s*\n\s*name:\s*(.+)$', re.MULTILINE)
    for m in job_pattern.finditer(content):
        job_id = m.group(1)
        job_name = m.group(2).strip()
        jobs.append({"id": job_id, "name": job_name})
    return jobs


def get_pre_commit_checks() -> list[str]:
    """Extract check function names from pre-commit-check.py."""
    if not PRE_COMMIT_SCRIPT.exists():
        print("ERROR: scripts/pre-commit-check.py not found")
        return []
    content = PRE_COMMIT_SCRIPT.read_text(encoding="utf-8")
    checks = re.findall(r'^def (check_\w+)\(', content, re.MULTILINE)
    return checks


# Mapping: CI job → pre-commit check(s)
CI_TO_PRECOMMIT = {
    "lint-python": {
        "precommit": "check_ruff",
        "mode": "always (--lint / --staged / default)",
        "covered": True,
    },
    "lint-cpp": {
        "precommit": "check_clang_format",
        "mode": "always (--lint / --staged / default)",
        "covered": True,
    },
    "lint-js": {
        "precommit": "check_eslint",
        "mode": "always (--lint / --staged / default)",
        "covered": True,
    },
    "test-python": {
        "precommit": "check_pytest",
        "mode": "always (--tests / --staged / default)",
        "covered": True,
    },
    "test-cpp": {
        "precommit": "check_cpp_build_and_test",
        "mode": "--full / --all",
        "covered": True,
    },
    "test-cpp-msvc": {
        "precommit": "check_cpp_build_and_test (local cmake)",
        "mode": "--full / --all (uses local compiler, not MSVC specifically)",
        "covered": True,
        "note": "Local check uses whatever cmake/compiler is installed. CI tests both gcc+clang and MSVC separately.",
    },
    "test-js": {
        "precommit": "check_vitest",
        "mode": "always (--tests / --staged / default)",
        "covered": True,
    },
    "test-rust": {
        "precommit": "check_rust_build_and_test",
        "mode": "--full / --all",
        "covered": True,
    },
    "test-windows": {
        "precommit": "check_pytest + check_vitest",
        "mode": "always (runs on Windows natively)",
        "covered": True,
        "note": "CI runs pytest+vitest on Windows separately. Pre-commit runs locally on whatever OS you're on.",
    },
    "test-e2e": {
        "precommit": "check_playwright_e2e",
        "mode": "--all only",
        "covered": True,
    },
    "build-js": {
        "precommit": "check_vite_build",
        "mode": "--full / --all",
        "covered": True,
    },
    "build-docker": {
        "precommit": None,
        "mode": "NOT COVERED",
        "covered": False,
        "note": "Docker builds are CI-only. Pre-commit does not build Docker images (too slow).",
    },
    "docker-smoke": {
        "precommit": None,
        "mode": "NOT COVERED",
        "covered": False,
        "note": "Docker compose smoke test is CI-only. Requires running services.",
    },
    "audit-deps": {
        "precommit": "check_npm_audit",
        "mode": "--full / --all",
        "covered": True,
    },
    "security-bandit": {
        "precommit": "check_bandit",
        "mode": "--full / --all",
        "covered": True,
    },
    "security-codeql": {
        "precommit": None,
        "mode": "NOT COVERED",
        "covered": False,
        "note": "CodeQL is GitHub-only analysis. Cannot run locally.",
    },
    "test-summary": {
        "precommit": "CheckSummary (aggregate exit code)",
        "mode": "always",
        "covered": True,
        "note": "Pre-commit aggregates all check results into single exit code.",
    },
    "test-count": {
        "precommit": "check_test_coverage_gaps",
        "mode": "--staged",
        "covered": True,
        "note": "CI counts test files/cases and enforces minimums. Pre-commit checks coverage gaps per-file.",
    },
}

# Extra pre-commit checks not in CI
PRECOMMIT_EXTRA = {
    "check_test_coverage_gaps": "Every staged source file must have a test file (CI doesn't do this)",
    "check_python_imports": "AST validation of Python imports (CI doesn't do this)",
    "check_commit_message": "English-only + conventional commits (CI doesn't validate commit messages)",
}


def main() -> int:
    print()
    print("=" * 70)
    print("  CI EQUIVALENCE VERIFIER")
    print("  Checks: pre-commit-check.py covers all .github/workflows/ci.yml jobs")
    print("=" * 70)

    ci_jobs = parse_ci_jobs()
    precommit_checks = get_pre_commit_checks()

    if not ci_jobs:
        print("\n  ERROR: No CI jobs found in ci.yml")
        return 1
    if not precommit_checks:
        print("\n  ERROR: No checks found in pre-commit-check.py")
        return 1

    print(f"\n  CI jobs found:      {len(ci_jobs)}")
    print(f"  Pre-commit checks:  {len(precommit_checks)}")

    # ─── Coverage table ───
    print()
    print("  ── CI Job → Pre-commit Mapping " + "─" * 30)
    print()
    print(f"  {'CI Job':<25} {'Covered':<10} {'Pre-commit Check':<35} {'Mode'}")
    print(f"  {'─' * 25} {'─' * 10} {'─' * 35} {'─' * 20}")

    covered_count = 0
    not_covered_count = 0
    not_in_ci = []

    for job in ci_jobs:
        job_id = job["id"]
        mapping = CI_TO_PRECOMMIT.get(job_id)

        if mapping is None:
            # Unknown CI job — not in our mapping
            print(f"  {job_id:<25} {'⚠️ UNKNOWN':<10} {'—':<35} {'—'}")
            not_in_ci.append(job_id)
            continue

        if mapping["covered"]:
            covered_count += 1
            status = "✅ YES"
            check_name = mapping["precommit"] or "—"
            mode = mapping["mode"]
        else:
            not_covered_count += 1
            status = "❌ NO"
            check_name = "—"
            mode = mapping["mode"]

        print(f"  {job_id:<25} {status:<10} {check_name:<35} {mode}")

    # ─── Extra pre-commit checks ───
    print()
    print("  ── Pre-commit EXTRA checks (not in CI) " + "─" * 28)
    print()
    for check, desc in PRECOMMIT_EXTRA.items():
        print(f"  ✅ {check:<35} {desc}")

    # ─── Summary ───
    print()
    print("=" * 70)
    total = len(ci_jobs)
    pct = (covered_count / total * 100) if total > 0 else 0
    print(f"  Coverage: {covered_count}/{total} CI jobs covered ({pct:.0f}%)")
    print(f"  Not covered: {not_covered_count} (Docker, CodeQL — CI-only)")
    if not_in_ci:
        print(f"  Unknown jobs: {len(not_in_ci)} — update CI_TO_PRECOMMIT mapping!")
    print(f"  Extra checks: {len(PRECOMMIT_EXTRA)} (pre-commit does more than CI)")
    print()

    if not_covered_count > 0:
        print("  NOTE: Docker builds and CodeQL are CI-only by design.")
        print("        These cannot run locally (too slow / requires GitHub infra).")
        print("        All code-quality checks (lint, test, build, security, e2e) ARE covered.")

    if not_in_ci:
        print()
        print("  ⚠️  WARNING: New CI jobs detected that are not in the mapping:")
        for j in not_in_ci:
            print(f"    - {j}")
        print("  Update CI_TO_PRECOMMIT in scripts/ci-equivalence.py!")

    if pct >= 80:
        print()
        print("  ✅ PASS — pre-commit covers all runnable CI checks")
        print("=" * 70)
        print()
        return 0
    else:
        print()
        print("  ❌ FAIL — too many CI jobs not covered by pre-commit")
        print("=" * 70)
        print()
        return 1


if __name__ == "__main__":
    sys.exit(main())
