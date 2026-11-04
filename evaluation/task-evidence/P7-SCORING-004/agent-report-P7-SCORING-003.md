# Agent report

Task ID: `P7-SCORING-003`

Status: Corrected proposal and candidate-only offline verification completed.
No production code, experiment logs, benchmark files, packets, dependencies, or
model calls were changed.

## Deliverables

- Candidate exporter: [export-scoring.mjs](task-evidence/P7-SCORING-003/export-scoring.mjs)
- Candidate tests: [export-scoring.test.mjs](task-evidence/P7-SCORING-003/export-scoring.test.mjs)
- Exact candidate diff: [implementation.diff](task-evidence/P7-SCORING-003/implementation.diff)
- Complete offline fixtures: [fixtures/](task-evidence/P7-SCORING-003/fixtures/)
- Test output: [test-results.log](task-evidence/P7-SCORING-003/test-results.log)
- Source preservation hashes: [source-hashes.txt](task-evidence/P7-SCORING-003/source-hashes.txt)
- Archived prior report: [agent-report-P7-SCORING-002.md](task-evidence/P7-SCORING-003/agent-report-P7-SCORING-002.md)

## Corrected proposal

The candidate uses one canonical array job key everywhere and delegates raw
event validation to the existing built core `planEvaluationResume` contract.
It accepts retryable-then-succeeded histories, uses the latest terminal finish,
rejects pending/retryable/response-recorded/interrupted states, checks prompt
artifacts, snapshot fingerprint, full frozen-file inventory and raw/parsed
agreement, and rechecks source bytes before atomic publication.

Effective descriptions are exact:

- successful `concern: true`: parsed suggestion unchanged;
- successful `concern: false` with present alt: source request
  `existingAltText`, checked against the frozen candidate;
- successful `concern: false` with missing/empty alt: `""`;
- terminal unavailable: no reviewer item or fact rows, private mapping only.

Reviewer text uses dynamically sized fenced blocks for context/descriptions and
escapes fact-table pipes/newlines. It preserves literal text without allowing
headings, HTML, backticks, or pipes to become reviewer instructions or packet
structure. The packet leaves evidence and finalization fields blank and includes
fact equivalence, unsupported-claim, omission, and all four defect checks.

The output stages under a sibling temporary directory, copies bytes to opaque
`ITEM-##.png` names, keeps `private-mapping.json` outside `reviewer/`, writes a
`COMPLETE` marker, and atomically renames. Existing nonempty outputs and
protected/overlapping/symlinked paths are rejected. Seeds must be decimal
unsigned 32-bit integers; malformed, fractional, negative, NaN-like, and
overflow values are rejected.

## Actual verification

Command:

```bash
node --test evaluation/task-evidence/P7-SCORING-003/export-scoring.test.mjs
```

Result: **4 passed, 0 failed**. The tests verify:

1. complete 24-job source with retry history, exact Case 05 retained text,
   missing/empty no-improvement mapping, and one terminal unavailable exclusion;
2. incomplete/corrupt source rejection and unchanged source bytes;
3. literal fenced Markdown and escaped fact cells;
4. opaque copied assets, private mapping separation, deterministic output,
   stable IDs, existing-output preservation, and all required seed failures.

The fixture starts from copied complete v2 source/frozen artifacts, then changes
only the temporary source copy to create a valid no-improvement and terminal
unavailable case while retaining core raw/parsed validation. It does not read
the repository live run during the test.

Read-only smoke command against the real completed v2 source:

```text
itemCount: 24
unavailableCount: 0
output: temporary /tmp directory, removed after completion
```

Node emitted only the existing module-type warning for the built core package.
The source and benchmark hashes were captured after verification in
[source-hashes.txt](task-evidence/P7-SCORING-003/source-hashes.txt); the
repository status shows no changes under either source tree.

This remains a proposal candidate, not production implementation. It has not
been applied to `evaluation/export-scoring.mjs` or any production test path.
