#!/usr/bin/env python3
"""Codemod: fix eslint no-unused-vars sites from an eslint report.

Rules per site (file, line, col, name, kind):
- import specifier -> remove specifier (whole line if last)
- object destructuring member -> remove member (with :alias/=default)
- `const name = expr;` single declarator, pure-ish -> delete statement
- `const [names] = useState/useRef/...` all flagged -> delete statement
- catch (_e) -> catch {
- array destructuring member / function arg -> rename to _name
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

REPORT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/eslint.txt")
ROOT = Path(__file__).resolve().parent.parent / "web-ui"

ERR_RE = re.compile(
    r"^\s+(\d+):(\d+)\s+error\s+'([^']+)' is (defined|assigned)")
FILE_RE = re.compile(r"^(F:\\.*\.(?:jsx?|tsx?))\s*$")
HOOK_RE = re.compile(
    r"^\s*const\s*\[([^\]]+)\]\s*=\s*(useState|useRef|useMemo|useCallback|useReducer|useContext)\s*\(")


def collect_sites() -> dict[str, list[dict]]:
    sites: dict[str, list[dict]] = defaultdict(list)
    current = None
    for raw in REPORT.read_text(encoding="utf-8", errors="replace").splitlines():
        fm = FILE_RE.match(raw)
        if fm:
            current = fm.group(1).strip()
            continue
        em = ERR_RE.match(raw)
        if em and current:
            sites[current].append({
                "line": int(em.group(1)),
                "col": int(em.group(2)),
                "name": em.group(3),
                "kind": em.group(4),
            })
    return sites


def strip_member(text: str, name: str) -> str:
    """Remove `name` (+ :alias / =default) from inside braces of text."""
    # name with optional alias/default, plus one adjacent comma
    pat_after = re.compile(r",\s*" + re.escape(name) + r"\s*(:[^,}]+)?(=[^,}]+)?")
    pat_before = re.compile(re.escape(name) + r"\s*(:[^,}]+)?(=[^,}]+)?\s*,")
    pat_solo = re.compile(re.escape(name) + r"\s*(:[^,}]+)?(=[^,}]+)?")
    for pat in (pat_after, pat_before):
        new = pat.sub("", text, count=1)
        if new != text:
            return new
    return pat_solo.sub("", text, count=1)


def inside(text: str, pos: int, open_ch: str, close_ch: str) -> bool:
    """Is pos inside the nearest balanced open_ch...close_ch on this line?"""
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == open_ch:
            if depth == 0:
                start = i
            depth += 1
        elif ch == close_ch and depth:
            depth -= 1
            if depth == 0 and start <= pos < i:
                return True
    return False


def process_file(path: Path, sites: list[dict]) -> int:
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    # group names by line for whole-statement decisions
    by_line: dict[int, list[dict]] = defaultdict(list)
    for s in sites:
        by_line[s["line"]].append(s)

    delete_lines: set[int] = set()
    edits: list[tuple[int, str, str]] = []  # line_idx, old, new

    for lineno, group in sorted(by_line.items()):
        idx = lineno - 1
        if idx >= len(lines):
            continue
        text = lines[idx]
        stripped = text.lstrip()

        # ---- import statement ----
        if stripped.startswith("import ") or (
            "from " in stripped and "{" in stripped and idx > 0
            and "import" in lines[idx - 1]
        ):
            names = {g["name"] for g in group}
            new = text
            for n in names:
                new = strip_member(new, n)
            # emptied braces -> drop the line entirely
            if re.search(r"{\s*}", new) or not re.search(r"{.*\w.*}", new):
                if "import" in new and "from" in new and re.search(r"{\s*}", new):
                    delete_lines.add(idx)
                    continue
            edits.append((idx, text, new))
            continue

        # ---- catch (e) -> catch { ----
        if re.search(r"catch\s*\(\s*[_\w]+\s*\)", text):
            new = re.sub(r"catch\s*\(\s*[_\w]+\s*\)", "catch {", text)
            edits.append((idx, text, new))
            continue

        # ---- const [a, b] = useHook(...) all flagged -> delete ----
        hm = HOOK_RE.match(stripped)
        if hm:
            bracket_names = {n.strip().split("=")[0].strip() for n in hm.group(1).split(",")}
            if all(g["name"] in bracket_names for g in group) and len(group) == len(bracket_names):
                delete_lines.add(idx)
                continue

        for g in group:
            name, kind, col = g["name"], g["kind"], g["col"]
            pos = col - 1
            # verify name at/near col
            seg = text[max(0, pos - 1):pos + len(name) + 1]
            m = re.search(r"\b" + re.escape(name) + r"\b", seg)
            if not m:
                m = re.search(r"\b" + re.escape(name) + r"\b", text)
                if not m:
                    continue
                pos = m.start()
            else:
                pos = max(0, pos - 1) + m.start()

            # object destructuring member?
            if inside(text, pos, "{", "}"):
                new = strip_member(text, name)
                if new != text:
                    edits.append((idx, text, new))
                    text = new
                continue

            # single-declarator const/let/var -> delete statement
            if re.match(r"^\s*(?:const|let|var)\s+" + re.escape(name) + r"\s*=", text):
                delete_lines.add(idx)
                continue

            # array destructure or function arg -> rename to _name
            new = text[:pos] + "_" + text[pos:]
            edits.append((idx, text, new))
            text = new

    if not delete_lines and not edits:
        return 0

    # per-line edits were chained on `text` — last `new` holds the cumulative
    # result, so last-wins is correct
    final: dict[int, str] = {}
    for idx, _old, new in edits:
        if idx not in delete_lines:
            final[idx] = new

    out = []
    for i, orig in enumerate(lines):
        if i in delete_lines:
            continue
        out.append(final.get(i, orig))

    path.write_text("".join(out), encoding="utf-8")
    return len(delete_lines) + len(edits)


def main() -> None:
    sites = collect_sites()
    total = 0
    for f, ss in sites.items():
        p = Path(f)
        if not p.exists():
            # eslint prints absolute Windows paths already
            print(f"  skip missing {f}")
            continue
        n = process_file(p, ss)
        total += n
        if n:
            print(f"  {p.name}: {n} fixes")
    print(f"total: {total} fixes across {len(sites)} files")


if __name__ == "__main__":
    main()
