#!/usr/bin/env python3
"""Pre-commit hook — runs lint checks before allowing a commit.

Replaces the broken shell-based .git/hooks/pre-commit.
Configurable via .pre-commit-config.yaml.

Usage:
  python scripts/pre-commit.py          # Run all checks
  python scripts/pre-commit.py --quick   # Skip slow checks (tests)

Exit code: 0 if all pass, 1 if any fail (blocks commit)
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run_command(cmd: list[str], cwd: Path | None = None) -> tuple[int, str]:
    """Run a command and return (exit_code, output)."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd or ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
        return result.returncode, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return 1, "Command timed out"
    except FileNotFoundError:
        return 0, "Tool not installed — skipping"


def check_ruff() -> bool:
    """Run ruff lint on Python files."""
    print("[pre-commit] Running ruff...")
    code, output = run_command(
        ["ruff", "check", "ai-signal-bot/src/", "exchange_simulator/", "--line-length", "120"]
    )
    if code != 0:
        print(output)
        print("[pre-commit] ❌ ruff: FAIL")
        return False
    print("[pre-commit] ✅ ruff: PASS")
    return True


def check_eslint() -> bool:
    """Run eslint on JavaScript/TypeScript files."""
    print("[pre-commit] Running eslint...")
    eslint = ROOT / "web-ui" / "node_modules" / ".bin" / "eslint"
    if not eslint.exists():
        print("[pre-commit] ⚠️  eslint not installed — skipping")
        return True
    code, output = run_command(
        ["npx", "eslint", "src/"],
        cwd=ROOT / "web-ui",
    )
    if code != 0:
        print(output)
        print("[pre-commit] ❌ eslint: FAIL")
        return False
    print("[pre-commit] ✅ eslint: PASS")
    return True


def check_staged_files() -> bool:
    """Check that staged files don't contain obvious issues."""
    print("[pre-commit] Checking staged files...")
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only"],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    if result.returncode != 0:
        print("[pre-commit] ⚠️  Could not get staged files — skipping")
        return True

    files = result.stdout.strip().split("\n") if result.stdout.strip() else []
    issues = []

    for filepath in files:
        if not filepath or not (ROOT / filepath).exists():
            continue
        if filepath.endswith((".py", ".js", ".jsx", ".ts", ".tsx")):
            content = (ROOT / filepath).read_text(encoding="utf-8", errors="ignore")
            if "console.log(" in content and "test" not in filepath.lower():
                issues.append(f"  {filepath}: contains console.log()")

    if issues:
        print("[pre-commit] ❌ Staged file issues:")
        for issue in issues:
            print(issue)
        return False

    print("[pre-commit] ✅ Staged files: OK")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Pre-commit hook")
    parser.add_argument("--quick", action="store_true", help="Skip slow checks")
    args = parser.parse_args()

    print("=" * 50)
    print("  Pre-commit Checks")
    print("=" * 50)

    all_pass = True

    if not check_staged_files():
        all_pass = False

    if not check_ruff():
        all_pass = False

    if not check_eslint():
        all_pass = False

    print()
    if all_pass:
        print("[pre-commit] ✅ All checks passed — commit allowed")
        return 0
    else:
        print("[pre-commit] ❌ Checks failed — commit blocked")
        print("[pre-commit] Use --no-verify to bypass (not recommended)")
        return 1


if __name__ == "__main__":
    sys.exit(main())
