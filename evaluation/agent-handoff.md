# Active handoff

Task ID: `P7-ANALYSIS-AUDIT-001`

Status: Routine read-only consistency audit authorized when triggered by the user.
No production code edits or model calls. Codex owns analyzer corrections.

## Purpose and phase

Phase 7 development preflight now has generation, human scores, validation and a
preliminary analyzer summary. Verify saved-data consistency while Codex handles
code-review findings. Learning importance: Low for execution, high importance for
accurate evidence. Do not redesign or patch the analyzer yourself.

Read agent-context.md, current docs/evaluation-protocol.md and scoring template.
The old P7-SCORING-005 agent report describes an earlier step and is stale relative
to the user's new scoring/validation/analysis files. Preserve it before replacing.

## Known Codex review findings (not executor implementation work)

- parseScoringPacket accepts blank reviewer/date fields because regex whitespace
  can consume the next line, and accepts missing required-fact evidence.
- Analyzer does not bind scored fact rows/description/context/image reference to
  their immutable source. A temporary altered packet with a replaced fact and
  description still analyzed successfully in Codex's focused probe.
- Source/validator logs and mapping joins need shared schema/raw-parsed/lineage
  checks, not hashes alone. Duplicate/missing jobs and altered mapping fields must
  not silently alter denominators/decisions.
- Part B must not automatically treat every missing reference fact as an overall
  quality defect: the rubric explicitly distinguishes coverage from informativeness.
  Current case 04 still has an explicit importantContentMissing Yes, so this fix
  does not by itself reverse that example's missed-defect classification.
- F1 must be 0 when TP=0 and FP,FN are positive; current formula yields null.
- Four tests exercise parser/formatter, not Part A/B metric calculations or full
  artifact-loading behavior. Focused regression tests are needed, not more prompts.

## Execute once

1. Archive current evaluation/agent-report.md unchanged under
   evaluation/task-evidence/P7-ANALYSIS-AUDIT-001/ using its original task ID.
   Do not overwrite archives. Check for a completed matching report first.
2. Capture hashes of scoring packet, private mapping, raw rater log at
   evaluation/scoring/backups/raw-marks-log.txt, v1/v2 generation artifacts,
   v2-validation artifacts, original summary.md/summary.json and frozen inputs.
   Do not print full private mapping, credentials, headers or .env contents.
3. Run existing four tests, recording command, actual count, exit and output:

   ```bash
   node evaluation/__tests__/analyze-scoring.test.mjs
   ```

   A pass does not clear the known review findings. Do not change tests or code.
4. Cross-check saved counts directly from validated terminal job records:
   - V2 generation: 24 successes, 18 suggestions, 6 retained descriptions.
   - Adequacy-only decisions: 8 TP, 6 TN, 2 FP, 0 FN; 8 remediation jobs separate.
   - Validator: 4 eligible completed jobs, 2 no-improvement exclusions.
   - Current summary: Part B 2 passes, 1 missed defect, 1 false alarm, no request/
     parse failures. Check the underlying flags and human defect marks, not just
     these expected values.
   Use core planEvaluationResume with saved config/identity/jobs to verify both
   stage logs; do not compare historical code identity to today's code or resume
   model calls. Report any mismatch instead of fixing artifacts.
5. Verify all 24 packet item IDs correspond one-to-one with available mapping
   jobs, exact source descriptions, frozen facts/context and opaque image bytes.
   Do not change human Yes/No judgments. Report structural/content discrepancies
   with the item ID and relevant evidence, without re-rating descriptions.
6. Recompute fact-mark counts per strategy and compare with summary numerators
   (16/18,16/18,17/18,16/18 in configured strategy order). Treat these as human
   annotation totals, not proof of strategy superiority. Check every scored item
   is finalized; record packet/raw-marks-log hash and finalization provenance.
   File mtime/date can support chronology but is not immutable proof that scores
   were finalized before validation/unblinding. Flag missing evidence honestly;
   do not invent timestamps or edit prior scores.
7. Confirm all before hashes match afterward. Keep any one-off audit scripts
   and logs only in task evidence or /tmp. Do not regenerate/overwrite summaries,
   human scores, mapping, source logs or benchmark inputs.

## Report and stop

Replace evaluation/agent-report.md with matching ID/status, actual commands/test
results, consistency results, preservation hashes and concise discrepancies.
Keep known code defects separate from actual saved-data mismatches. Report whether
current numbers agree with these saved inputs, not whether the analyzer is ready
for held-out use. Do not claim a complete Phase 7 or an unbiased development test.

Allowed writes: evaluation/agent-report.md, evidence under
evaluation/task-evidence/P7-ANALYSIS-AUDIT-001/ and temporary audit files.
No production changes, package installation/builds, model calls, notebook execution,
new experiments, metric overwrites, human ratings, commits or pushes. Stop after
reporting. Codex will implement corrections before final freeze and held-out work.
