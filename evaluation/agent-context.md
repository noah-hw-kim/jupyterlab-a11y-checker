# Shared agent context

Owner: Codex. Keep current decisions concise; do not append conversations.

## Roles and workflow

- User: primary developer, final design decisions, and triggers each agent.
- Codex: architecture, planning, complex implementation, debugging and code review.
- Executor (Copilot or Antigravity): routine approved commands, test/batch execution,
  background workloads, logs and evidence collection. Implementation only when
  the task explicitly delegates a simple approved change. Do not send complex
  code through repeated proposal/review cycles; Codex handles required fixes.
- Report actual commands/results. Distinguish observed evidence from hypotheses.
- Follow repository and latest user instructions. No automatic cross-agent
  messaging or file watching; the user triggers each task.
- Codex updates agent-handoff.md whenever recommending the next executor task.
  The handoff states proposal/implementation/execution scope and limits.
- Executor replaces agent-report.md with the matching task ID after archiving
  the previous report unchanged under task evidence. Never overwrite archives.
- Check completed matching reports before duplicate execution. Stop on material
  scope changes or blockers and report; don't invent authorization.

## Current project state

A11yLens is a JupyterLab accessibility extension. Phase 7 compares Minimal,
Fixed-window, Structure-aware and Largest-practical. Structure-aware is a
hypothesis, not a required winner.

- Frozen controlled benchmark: 6 development and 18 held-out synthetic cases.
  The author reviewed all annotations; held-out system outputs are ungenerated.
- V1: 21 successful jobs, 3 exhausted from combined HTTP/transport failures.
  V2 revised-prompt development generation: 24 successes; two 503 retries recovered.
  Both have 18 suggestions including 14 revenue descriptions; v1 has 3 retained
  descriptions and v2 has 6. Never backfill/reset historical experiments.
- V2 existing-alt adequacy: 8 TP, 6 TN, 2 FP, 0 FN (14/16). Eight missing/empty
  remediation jobs are separate. Case 05 FP remains in fixed-window/largest-
  practical. Case 04 has incomplete age-concentration fact coverage. No general
  strategy ranking or causal prompt-effect claim from this small development set.
- Part B runner implemented by Codex (P7-VALIDATION-004): exact saved suggestion/
  context/image lineage, separate artifacts and shared durable dispatch/recovery.
  Core build/313 tests, 14 generation and 15 validation tests previously passed.
  V2 preview found four eligible jobs and two exclusions. No validator model calls.
- Scoring exporter is verified: 6 exporter, 14 generation and 15 validation
  tests passed under P7-SCORING-005; temporary v2 export produced 24 items.
- Current November 3 progress: actual development packet has 24 finalized items;
  raw rater marks and revisions are saved at evaluation/scoring/backups/
  raw-marks-log.txt. Four validator jobs succeeded, two exclusions. No held-out
  system outputs. Human packet mtime precedes validator start but this alone is
  not immutable evidence of scoring/unblinding order; preserve provenance.
- analyze-scoring.mjs and four tests now exist, plus development summaries at
  evaluation/scoring/dev-gemini35-v2/analysis/. Summary currently reports 17/18
  structure-aware fact coverage versus 16/18 others; Part B 2 passes, 1 missed
  defect, 1 false alarm. These are provisional development descriptions, not
  general rankings or proof the validator helps overall.
- Codex review reproduced acceptance of blank reviewer/date, missing fact
  evidence and altered packet description/fact content. Analyzer also needs
  shared lineage/event validation, mapping agreement, rubric-aligned Part B
  defect logic and F1 zero-case regression checks. Four current tests cover only
  parser/formatter. Codex owns code fixes; executor should not propose/refactor.
- Next: correct analyzer, verify/reproduce saved development analysis, then freeze
  final protocol/code/config before 72 held-out jobs, masked scoring, validation
  and final reports. Real-notebook supplement remains deferred.
- Active handoff: P7-ANALYSIS-AUDIT-001, routine read-only tests and saved-data
  consistency/provenance audit only. No source edits, score changes, report
  regeneration, model calls or held-out execution.

## Paths and boundaries

- evaluation/agent-handoff.md: one active task, Codex-owned.
- evaluation/agent-report.md: executor's report; Codex may report its own direct work.
- evaluation/run.mjs, runner.mjs: generation/validation; export-scoring.mjs: scoring.
- evaluation/runs/dev-gemini35-v1/ and dev-gemini35-v2/: immutable generation evidence.
- test_files/benchmark/references/{manifest.json,freeze.json}: frozen reference data.
- docs/evaluation-protocol.md and evaluation-scoring-template.md: agreed protocol.
- Preserve user changes, frozen inputs, histories and downloaded external candidates.
- Never reveal credentials, headers or .env contents; don't install dependencies,
  commit, push, execute notebooks or call models without explicit task authority.
- Future authorized model execution retains existing pacing/cooldowns, concurrency
  one, at most four HTTP attempts per invocation and two attempts per job. Never
  regenerate successful jobs or bypass exhausted attempts via a new directory.
