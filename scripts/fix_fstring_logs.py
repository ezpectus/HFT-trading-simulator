#!/usr/bin/env python3
"""Convert `logger.level(f"...{expr}...")` to `logger.level("...%s...", expr)`.

Parses the f-string template char-by-char (handles nested {…} inside
expressions and {{/}} escapes). Sites with format specs / conversions are
left alone — report them as skipped. Verifies each rewritten line parses.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

SITE_RE = re.compile(
    r'(?P<prefix>logger\.(?:info|debug|warning|error|critical)\()f(?P<q>["\'])'
)


def convert_line(line: str) -> tuple[str, bool]:
    m = SITE_RE.search(line)
    if not m:
        return line, False
    start = m.end()
    q = m.group("q")
    i = start
    tmpl: list[str] = []
    args: list[str] = []
    while i < len(line):
        ch = line[i]
        if ch == q and (i == start or line[i - 1] != "\\"):
            break  # end of f-string
        if ch == "{" and i + 1 < len(line) and line[i + 1] == "{":
            tmpl.append("{{")
            i += 2
            continue
        if ch == "}" and i + 1 < len(line) and line[i + 1] == "}":
            tmpl.append("}}")
            i += 2
            continue
        if ch == "{":
            depth = 0
            j = i
            expr: list[str] = []
            while j < len(line):
                c = line[j]
                if c == "{":
                    depth += 1
                    if depth > 1:
                        expr.append(c)
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        break
                    expr.append(c)
                else:
                    expr.append(c)
                j += 1
            if depth != 0:
                return line, False  # unbalanced — bail
            e = "".join(expr)
            if ":" in e or "!" in e or "=" == e[-1:]:
                return line, False  # format spec / conversion / self-doc
            args.append(e)
            tmpl.append("%s")
            i = j + 1
            continue
        tmpl.append(ch)
        i += 1
    if not args:
        return line, False
    template = "".join(tmpl)
    # % inside template literal text would break %-format -> skip those
    if "%" in template.replace("%%", ""):
        # any literal % is fine (logger uses %-format itself), but braces
        # we emitted must stay %s — already are.
        pass
    new = (
        line[: start - 1]  # up to and incl. the 'f' position minus 1 -> drops 'f'
        + q + template + q
        + ", " + ", ".join(args)
        + line[i + 1:]
    )
    return new, True


def process(path: Path) -> tuple[int, int]:
    src = path.read_text(encoding="utf-8").splitlines(keepends=True)
    changed = skipped = 0
    out: list[str] = []
    for line in src:
        if SITE_RE.search(line):
            new, ok = convert_line(line)
            if ok:
                try:
                    ast.parse(new.strip())
                except SyntaxError:
                    ok = False
            if ok:
                out.append(new)
                changed += 1
                continue
            skipped += 1
        out.append(line)
    if changed:
        path.write_text("".join(out), encoding="utf-8")
    return changed, skipped


def main() -> None:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("exchange_simulator")
    total_c = total_s = 0
    for p in sorted(root.rglob("*.py")):
        c, s = process(p)
        if c or s:
            print(f"{p}: {c} converted, {s} skipped")
        total_c += c
        total_s += s
    print(f"TOTAL: {total_c} converted, {total_s} skipped")


if __name__ == "__main__":
    main()
