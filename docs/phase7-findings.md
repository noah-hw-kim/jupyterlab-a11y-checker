# Phase 7 findings and limitations

Prepared November 6, 2026. This report describes the saved held-out experiment
`heldout-gemini35-v1`; development trials were used for implementation and prompt
calibration, not counted as held-out evidence.

## Research question and study design

Does structure-aware notebook context improve alt-text reference-fact coverage
or reduce unsupported claims relative to Minimal, Fixed-window, and
Largest-practical context?

The study used 18 frozen synthetic held-out cases and four strategies, for 72
generation jobs. Each condition used the same PNG, existing alt text, generation
prompt, requested `gemini-3.5-flash-lite` model, and 2,000-character context source
ceiling. Temperature and reasoning overrides were omitted consistently. There
was one successful generation at most per condition; transient failures could use
one additional attempt under the frozen two-total-attempt policy.

The source notebooks fit within the budget. This tests context selection on short
notebooks, rather than truncation or performance on long notebooks. Context
formatter labels are outside the source-character ceiling.

Raw responses, prompts, configuration, attempts, and source identities are saved
in the [generation experiment](../evaluation/runs/heldout-gemini35-v1/experiment.json).
The [protocol](evaluation-protocol.md) describes the planned procedure; the scoring
deviations and limitations below describe what actually happened.

## Primary generation results

All 72 jobs reached terminal outcomes: 69 valid responses and three model-output
format errors. Generation used 74 HTTP requests, including two successful retries
after HTTP 503 responses. No jobs remain pending or exhausted by provider failure.

| Strategy          | Valid responses | Mean required-fact coverage | Coverage on the same 16 cases | Unsupported outputs | Detection F1 |
| ----------------- | --------------- | --------------------------- | ----------------------------- | ------------------- | ------------ |
| Minimal           | 17/18           | 43.6%                       | 42.2%                         | 0/17                | 0.71         |
| Fixed-window      | 17/18           | 43.6%                       | 42.2%                         | 0/17                | 0.71         |
| Structure-aware   | 17/18           | 60.8%                       | 60.4%                         | 0/17                | 0.92         |
| Largest-practical | 18/18           | 51.9%                       | 50.0%                         | 0/18                | 0.75         |

Coverage is the average of each scored case's conveyed-facts / required-facts
ratio, not one pooled ratio. Unavailable results have no content score. The common
16-case comparison includes only cases with valid responses from all strategies.
A valid no-improvement decision is scored using the existing alt text.

Semantic detection uses the 12 weak/acceptable cases per strategy. Every strategy
identified all six weak cases; unnecessary replacement recommendations on the six
acceptable cases were five for Minimal, five for Fixed-window, one for
Structure-aware, and four for Largest-practical. Missing/empty cases are measured
separately, not counted in detection F1. They received valid replacements in 5/6,
5/6, 5/6, and 6/6 cases respectively; the other three outcomes were format errors.

Structure-aware had the highest observed coverage, including on common cases,
and fewer unnecessary replacements. No unsupported claims were recorded in any
scored description. This supports higher observed coverage on this benchmark;
it does not establish a reduction in hallucinations, since all observed rates
were zero. Low coverage can reflect omitted subject details or relationships
without a fabricated claim or an overall important-content defect.

The [primary Markdown report](../evaluation/scoring/heldout-gemini35-v1/analysis/summary.md)
and [JSON report](../evaluation/scoring/heldout-gemini35-v1/analysis/summary.json)
contain exact numerators, category/context-sensitive breakdowns, and efficiency
metrics. Mean selected-source lengths were 261, 431, 469, and 632 characters;
mean reported total tokens on valid-response jobs were 1,526, 1,609, 1,580, and
1,656 respectively. More context did not monotonically improve coverage in this
run. These observations do not isolate why a strategy performed differently.
Provider and network variability limit interpretation of latency differences.

## Individual failures and supplementary recovery

| Case / strategy           | Item    | Primary failure                 | Treatment                                                      |
| ------------------------- | ------- | ------------------------------- | -------------------------------------------------------------- |
| case-07 / Minimal         | ITEM-20 | One surplus final closing brace | Preserve format failure; score exact recovered text separately |
| case-07 / Fixed-window    | ITEM-64 | One surplus final closing brace | Preserve format failure; score exact recovered text separately |
| case-11 / Structure-aware | ITEM-51 | One surplus final closing brace | Preserve format failure; score exact recovered text separately |

The offline recovery removed exactly one surplus brace, without changing
any description words or sending new requests. The author finalized the three
supplementary scores. ITEM-20 and ITEM-64 each conveyed 1/3 required facts and
missed important subject information; ITEM-51 conveyed 2/3 and had no recorded
quality defect. Coverage and important-content defects are separate judgments.

| Strategy          | Primary mean coverage | Mean coverage including recovered text |
| ----------------- | --------------------- | -------------------------------------- |
| Minimal           | 43.6%                 | 43.1%                                  |
| Fixed-window      | 43.6%                 | 43.1%                                  |
| Structure-aware   | 60.8%                 | 61.1%                                  |
| Largest-practical | 51.9%                 | 51.9%                                  |

The supplementary view has 18 scored descriptions per strategy and zero recorded
unsupported claims. The ordering is unchanged. These are additional content
scores, not additional API successes: primary availability remains 69/72, and
Part B eligibility is unchanged. The [supplementary report](../evaluation/scoring/heldout-gemini35-v1-recovery-analysis/summary.md)
records the source hashes and comparisons separately from primary results.

## Part B: validator screening

The validator evaluated the 12 eligible Structure-aware replacements using the
saved validation prompt and configuration. Five no-improvement decisions and
one primary format failure were excluded. All 12 validation requests succeeded
on their first attempt; no descriptions were regenerated.

| Human evidence / validator result             | Count |
| --------------------------------------------- | ----- |
| No recorded quality defect; validator passed  | 9     |
| Recorded problem; validator flagged           | 1     |
| Recorded problem; validator passed            | 1     |
| No recorded quality defect; validator flagged | 1     |
| Validator request or parse failure            | 0     |

The individual disagreements matter:

- **ITEM-47 / case-12, missed problem:** the description listed decreasing values
  but omitted battery charge and percentage. The author marked important content
  missing; the validator passed it.
- **ITEM-19 / case-15, problem flagged:** generic X/Value labels and coordinate
  pairs did not identify walking duration or cumulative distance. The validator
  correctly required manual review against the author's defect mark.
- **ITEM-44 / case-18, false alarm:** the description identified execution duration
  in seconds and input size in megabytes, supported by the approved context. The
  author recorded no quality defect, but the validator required manual review.

Here, a human problem means a recorded unsupported assertion or one of the four
quality defects; a missing required fact alone does not automatically count.
The validator flagged one of two human-identified problems and one of ten
suggestions without a recorded defect. These small counts support treating it as
an imperfect screening aid that retains author review, not an acceptance gate
that guarantees correctness. No validator changes were tuned on these results.

## Scoring and study limitations

- This is a small, synthetic chart benchmark with repeated visual templates and
  short notebooks. Its 72 conditions are not 72 independent notebook samples.
  Real-world notebook supplementation remains deferred.
- One requested model through one endpoint and one generation sample per
  condition do not establish behavior across models, providers, or repeated
  trials. Provider defaults were not independently controlled or verified.
- The packets hid strategy names and validator judgments. The author knew the
  cases, could recognize repeated text, discussed scoring with AI, and reviewed
  some later ratings that had been prefilled with AI assistance. Finalization by
  Hyeonwoo Kim is recorded on November 6, 2026. This is not independent,
  unassisted human scoring; no inter-rater agreement was measured. This differs
  from the protocol's instruction not to show LLM ratings before primary scoring.
- The relationship-fact versus important-content interpretation was clarified
  after held-out collection, during scoring. The dated
  [clarification](../evaluation/scoring/clarifications/2026-11-06-relationship-and-important-content.md)
  and mark log preserve that decision. Explicit relational wording is required
  for a relationship fact, while a short complete value sequence can still
  convey essential information without an overall missing-content defect.
- Coverage depends on the frozen facts and their granularity. It does not by
  itself measure usability, listening burden, or screen-reader-user preference.
  There was no accessibility user study. Zero recorded unsupported claims is
  not a guarantee that future descriptions will be grounded.
- Availability differs in the primary run. Common-case and supplementary
  comparisons address this transparently without replacing primary failures.
  The format-recovery analysis was supplementary, not part of the original
  primary parser or a demonstration of production reliability.
- All differences are descriptive. No statistical significance or causal
  explanation of the observed strategy ordering is claimed. Reproducibility
  here means recalculating metrics from saved evidence, not obtaining identical
  model outputs from fresh requests.

## Completion and next phase

The saved primary analysis, separate recovery analysis, finalized scores, and
individual failure review complete the planned Phase 7 study. Before sharing a
release, Phase 8 still includes final regression/build/browser verification,
report and demo preparation, and a reviewed Git checkpoint containing the
necessary evidence without credentials. No additional held-out requests or
real-world notebook expansion are required to close Phase 7.
