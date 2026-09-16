# Versioning

> How version numbers work in this repo — what "the version" actually means
> and when to bump which number.

## The product version = git tags

The project as a whole is versioned by **git tags**, following
[Semantic Versioning](https://semver.org) — `vMAJOR.MINOR.PATCH`:

| Tag | Meaning |
|-----|---------|
| `v4.0` | Big architecture refactor (10-day plan) landed |
| `v4.1` | Post-refactor feature set — current product release |

Rules of thumb for the **product** tag:

- **PATCH** (`v4.1.x`→`v4.1.y`): bug fixes, audit remediations, no behavior
  change — e.g. the monitoring-scope fixes would be a patch.
- **MINOR** (`v4.1`→`v4.2`): new features, new panels, new strategies,
  backwards-compatible changes.
- **MAJOR** (`v4`→`v5`): breaking changes — wire protocol, config schema,
  removed components.

Release flow:

```bat
:: 1. Update CHANGELOG.md — move [Unreleased] notes under a dated version header
:: 2. Bump component versions that changed (table below)
:: 3. Commit, tag, push tag
git tag -a v4.2.0 -m "release notes summary"
git push origin v4.2.0
```

## Component versions (independent SemVer, do NOT need to match)

Each component carries its own version — bump it **only when that component
changes**:

| Component | Where it lives | Current |
|---|---|---|
| ai-signal-bot | `ai-signal-bot/__init__.py` → `__version__` | 4.1.0 |
| exchange_simulator | `exchange_simulator/__init__.py` → `__version__` | 4.1.0 |
| web-ui | `web-ui/package.json` → `"version"` | 2.2.0 |
| hft-trade-bot | `hft-trade-bot/CMakeLists.txt` → `project(... VERSION x.y.z)` | 2.0.0 |
| helm chart | `helm/Chart.yaml` → `version` (chart) / `appVersion` (app) | 2.0.0 |

They drifted historically (each was versioned at its own last big change) —
that's fine. The rule that keeps it honest:

- Python services share the product version (they shipped together at v4.1).
- web-ui / hft-trade-bot / helm have their own SemVer — bump independently
  when the component itself changes; they don't need to equal the product tag.
- README badge shows the **product** version (git tag), not a component one.

## Practical checklist per release

1. `CHANGELOG.md` — dated `[Unreleased]` section becomes the version header.
2. If a component changed: bump its `__version__` / `package.json` /
   `project(VERSION)` / `appVersion`.
3. `git tag -a vX.Y.Z`.
4. README badge only needs updating on product releases.

## What NOT to do

- Don't bump a component that didn't change — stale-but-accurate beats
  inflated-but-empty.
- Don't use the audit finding IDs (S###/R###) as versions — they're ledger
  keys, not releases.
- Don't tag from a dirty tree — `git status` must be clean first.
