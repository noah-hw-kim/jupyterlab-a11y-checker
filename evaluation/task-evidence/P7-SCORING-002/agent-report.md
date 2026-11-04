# Agent report

Task ID: `P7-SCORING-002`

Status: Revised proposal completed; implementation intentionally not applied.

## Corrected deliverable

The complete proposed production/test patch is in
[`implementation.diff`](./implementation.diff). It adds an offline
`evaluation/export-scoring.mjs` exporter and executable hermetic tests. This is
a proposal artifact only, per the active handoff; no repository implementation,
packet, source log, benchmark file, dependency, or model output was changed.

## Exact measurement contract

- The exporter requires explicit `sourceDir`, `frozenDir`, and `outputDir`; it
  does not infer a repository run or use a pending development fixture.
- It verifies snapshot schema/fingerprint, the source freeze hash, every file
  listed by `freeze.json` (including manifest and image bytes), and the complete
  split schedule: every case × all four strategies, exactly once.
- It rejects malformed JSONL, unknown jobs, missing starts/finishes, pending,
  retryable, interrupted, or otherwise incomplete source states. A terminal
  unavailable response is retained in private bookkeeping with
  `availability: "unavailable"` and no reviewer item or fact rows.
- For successful `concern: true`, the effective description is the exact
  parsed suggestion. For successful `concern: false` with a present alt it is
  the exact source `existingAltText`; for missing/empty alt it is `""`.
  Case 05 therefore retains exactly
  `Line chart showing quarterly revenue increasing steadily across five quarters.`
  No description is invented, shortened, or paraphrased.
- The private mapping records source snapshot/log hashes, frozen-file hashes,
  source attempt identity, actual concern-derived source, availability, and
  `shouldImprove`. It contains no validator judgments or reviewer scores.

## Corrected sample item

```markdown
## Review Item: ITEM-07

![Chart](assets/ITEM-07.png)

**Approved context**

> The chart shows quarterly revenue in thousands of dollars across five consecutive quarters.

**Description to score**

> Line chart showing quarterly revenue increasing steadily across five quarters.
```

The packet continues with the four required facts copied verbatim from the
frozen manifest, blank Yes/No/Unsure and evidence cells, blank unsupported-claim
rows, all four defect checks, and blank finalization fields. It does not write
`None`, `Yes`, or an uncertainty resolution on the reviewer's behalf.

## Output layout and unavailable behavior

```text
<outputDir>/
  COMPLETE
  reviewer/
    scoring-packet.md
    assets/ITEM-01.png
  private-mapping.json
```

Assets are copied byte-for-byte to opaque scoring IDs. The packet never links to
case/model/strategy paths. Unavailable jobs appear only in
`private-mapping.json`; they have `availability: "unavailable"` and no
description or fact-scoring form. The staged sibling directory is removed on
failure, and `COMPLETE` is written before atomic rename. Existing nonempty
outputs are never overwritten.

## Text and methodological boundaries

Context, descriptions, and facts are rendered line-by-line as literal quoted
text, so newlines, pipes, headings, backticks, and HTML cannot become packet
syntax or reviewer instructions. Image bytes are not altered; visual
recognition of familiar benchmark images remains an unavoidable limitation.

This is strategy-masked single-rater scoring, not double-blind research or
cryptographic concealment. The author reviewed all manifest annotations,
including held-out cases; only held-out system outputs remain ungenerated.
Prior familiarity and repeated images limit masking, and shuffling only reduces
cues.

## Path, seed, and source contracts

Paths are resolved before overlap checks. Source/frozen/output ancestor
overlaps and destinations beneath symlinked parents are rejected before
creation. The seed must be a decimal unsigned safe integer in the supported
32-bit range; malformed, fractional, negative, overflow, and NaN-like values
are rejected. Source hashes are captured before export and must be rechecked by
the caller before any later unblinding; the exporter never mutates source logs.

## Future verification commands

After implementation is explicitly authorized, use:

```bash
node --test evaluation/__tests__/export-scoring.test.mjs
node evaluation/export-scoring.mjs \
  --source evaluation/runs/dev-gemini35-v2 \
  --frozen test_files/benchmark \
  --output evaluation/scoring/dev-gemini35-v2
```

The first command must run against the complete explicit fixture schedule and
exercise replacement, exact retained-alt, empty no-improvement, unavailable
versus incomplete source, literal rendering, opaque assets/mapping separation,
seed validation/determinism, unchanged source hashes, protected paths, and
existing-output preservation. The second command is offline and must be
reviewed for the expected 24-job development source before any packet is used.
