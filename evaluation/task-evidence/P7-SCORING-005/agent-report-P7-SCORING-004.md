# Agent report

Task ID: `P7-SCORING-004`

Status: Implemented by Codex; behavioral verification delegated and pending.
No model calls, experiment writes, production scoring packet, commits or pushes.

## Review of P7-SCORING-003

Copilot provided a runnable candidate and four recorded passing tests, a material
improvement over earlier unexecuted proposals. It correctly added shared core
raw/parsed validation, retry-history handling, dynamic fences, opaque assets and
source preservation checks. It still did not implement all reported guarantees:
snapshot fingerprint recomputation, exact frozen inventory, single-read snapshot
binding and full canonicalized path handling were incomplete. Four tests do not
establish all claimed boundary behavior. This evaluates this artifact, not the
relative quality of either product in general.

Per the user's new workflow, Codex handled the complex integration/fixes directly
instead of starting another cross-agent proposal cycle.

## Changes

- Added evaluation/export-scoring.mjs from the useful candidate baseline, with
  the real core package import, CLI and additional validation guards.
- Verify source snapshot identity/fingerprint, prompt artifacts, complete exact
  split/four-strategy schedule and shared core event agreement. Historical source
  code hash is recorded evidence, not required to equal today's code.
- Verify exact frozen input inventory/bytes and source image/original-alt identity.
  Parse the same bytes that are hashed; reject changes across repeated reads and
  recheck bound files before completion.
- Render effective description/context as dynamic fenced literal text, escape
  reference fact cells, and include actual rubric instructions. No scores filled.
- Canonicalize source/frozen/output paths and reject protected overlaps. Add a
  sibling exclusive export lock, unique temporary staging, completion marker,
  source recheck and no-overwrite behavior.
- Retain exactly source suggestions, original alts, or empty text as required.
  Terminal unavailable jobs stay in private mapping with no reviewer form/asset.
- Added six production exporter tests generating complete temporary sources via
  mocked generation calls instead of depending on copied live-run fixtures.
- Updated evaluation/README.md and shared workflow documentation.

## Verification completed here

- node --check evaluation/export-scoring.mjs: passed.
- node --check evaluation/__tests__/export-scoring.test.mjs: passed.
- Prettier checks for changed exporter/tests/README: passed.
- All 60 before-hashed existing v1/v2/benchmark files remain byte-identical.
  Evidence: evaluation/task-evidence/P7-SCORING-004/preservation-before.json
  and preservation-after.json.
- Archived P7-SCORING-003 report unchanged in that evidence directory.

Behavioral tests and real-source temporary smoke export have NOT been run for
this integrated version. Do not describe it as verified or ready for scoring
until the executor returns results. No dependency installation or core changes.
The earlier 4-test candidate results are not results for this implementation.

## Next handoff

P7-SCORING-005 delegates routine offline verification only. If tests fail, return
logs and a concrete reproduction; Codex owns code fixes. Do not ask the executor
to redesign or rewrite the implementation. No model or validator calls.
