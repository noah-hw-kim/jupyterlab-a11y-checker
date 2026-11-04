# Agent report

Task ID: `P7-SCORING-005`

Status: Complete. All offline checks passed; no failures. No model calls, network use,
production edits, installs, builds, commits or pushes. No human scores or validator
judgments produced or read.

## Setup

- Previous report archived unchanged (byte-identical, `cmp` verified) at
  `evaluation/task-evidence/P7-SCORING-005/agent-report-P7-SCORING-004.md`.
  Existing archives untouched. No prior matching P7-SCORING-005 report existed.

## Current test results (integrated P7-SCORING-004 implementation)

Each run once. All exit 0.

| Command | Exit | Tests | Pass | Fail |
|---|---|---|---|---|
| `node evaluation/__tests__/export-scoring.test.mjs` | 0 | 6 | 6 | 0 |
| `node evaluation/__tests__/runner.test.mjs` | 0 | 14 | 14 | 0 |
| `node evaluation/__tests__/validation-runner.test.mjs` | 0 | 15 | 15 | 0 |

Counts match expectations (6 / 14 / 15). The only stderr noise is Node's
`MODULE_TYPELESS_PACKAGE_JSON` warning for `packages/core/dist/index.js`
(`packages/core/package.json` lacks `"type"`). Harmless; not changed.

These are the first behavioral results for the integrated exporter. The earlier
4-test Copilot candidate results are a different artifact and are not reused here.

## Smoke export (temporary, offline)

```bash
node evaluation/export-scoring.mjs --source evaluation/runs/dev-gemini35-v2 \
  --frozen test_files/benchmark --output /tmp/p7-smoke-005/packet
```

- Exit 0; output `itemCount: 24`, `unavailableCount: 0`.
- Packet retained at `/tmp/p7-smoke-005/packet` (temporary, not in evaluation/scoring/).
- Contents: `COMPLETE` marker, `private-mapping.json` (outside `reviewer/`),
  `reviewer/scoring-packet.md`, `reviewer/assets/` with 24 opaque files
  (`ITEM-01.png` ...). 27 files total.
- Packet inspection (text only, no browser): header states strategy-masked single-rater
  scoring; each item has image, approved context and description in fenced literal
  text blocks, a blank fact table, unsupported-assertion table, four-defect table and
  finalization fields. Grep for strategy names, model names and "gemini" found only the
  header phrase "Strategy-masked"; no strategy/model leakage in reviewer text.
  Private mapping contents were not printed.

Not checked: rendering via `marked` or a browser; correctness of every mapping entry
against its source; fact tables for all 24 items (only ITEM-01 was read).

## Preservation

- Recomputed SHA-256 of the 60 v1/v2/benchmark files listed in
  `task-evidence/P7-SCORING-004/preservation-after.json`: 60/60 match, 0 differ.
  Evidence: `task-evidence/P7-SCORING-005/preservation-after.json`.
- A separate before-hash was not captured this task; the comparison is against the
  P7-SCORING-004 after-hash, and the smoke export wrote only under `/tmp`.
- No experiment was reset, resumed or launched.

## Unresolved

None from these checks. This is a verification result, not a claim about tool or
strategy quality.

## Next handoff

Codex review. Then, per plan: export the development reviewer packet to a real
location and practice the rubric; finalize human scores before opening validator
judgments.
