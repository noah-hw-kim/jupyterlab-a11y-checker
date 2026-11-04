# Phase 7 experiment protocol

Status: development trial completed and analysis reproduced.
Held-out settings are specified in ../evaluation/config.held-out.json.
Before the first held-out request, checkpoint the reviewed code and freeze
the protocol, scoring rules, configuration, endpoint and both prompt templates.
The runner records the experiment identity before dispatch.
Held-out execution requires separate authorization.

## Question and scope

Does structure-aware context improve reference-fact coverage or reduce unsupported
claims relative to Minimal, Fixed-window, and Largest-practical context?
Use six development cases for implementation/preflight and 18 frozen held-out
cases for the study: four strategies × 18 cases = 72 generation jobs. A job is
one case/strategy pair, not one HTTP attempt. Never modify the frozen notebooks,
images, or annotations to make outputs score better.

## Proposed fixed configuration

| Setting | Value |
| --- | --- |
| Requested model | `gemini-3.5-flash-lite` |
| Provider | One OpenAI-compatible endpoint, recorded during preflight and fixed for the study |
| Reasoning | Provider default; omit reasoning/thinking overrides |
| Temperature | Provider default; omit `temperature` consistently |
| Generation and validation output limit | `max_tokens: 2048`, matching the current client |
| Suggestion word limit | 40 whitespace-separated words, matching current deterministic validation |
| Context source-text ceiling | 2,000 characters for each of the four strategies |
| Image input | The case's saved PNG bytes as a data URL; identical bytes across strategies |
| Concurrency | One request at a time |
| Request timeout | 120 seconds per attempt |
| Maximum attempts | Two total attempts per generation job, including across resumed sessions |
| Retry eligibility | Temporary transport/provider failures only |

The model ID is listed in [Google's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).
Our endpoint may proxy the model; record both requested and returned model IDs.
Do not claim the endpoint's effective defaults are known unless it reports them.
Provider defaults and one sample per condition do not guarantee identical outputs
on repeated generation. Reproducibility means recomputing analysis from saved data.

The current benchmark notebooks each contain fewer than 1,000 source characters
(maximum 926 at protocol drafting), so 2,000 avoids source truncation. This is a
context-selection experiment, not a tight-budget stress test. Minimal still
selects only the current cell; Fixed-window selects current ±2; Structure-aware
selects section context; Largest-practical includes the whole notebook here.
Labels added by the formatter, prompts, and image bytes are outside the source
budget. Record actual selected-source and formatted-context character counts.
Do not pad shorter strategies or force them to consume their full allowance.

Existing alt text is legitimate model input and must be identical across a case's
four conditions. Some acceptable descriptions already identify the subject even
when the chart labels are generic; `contextSensitive` does not guarantee that
Minimal must fail. Report category and context-sensitive subgroups descriptively.

## Model availability and configuration changes

There is no automatic fallback to Gemini 3.1 Flash-Lite. If 3.5 is temporarily busy,
pause and resume the same configuration later. If switching models is necessary,
create a new experiment revision using `gemini-3.1-flash-lite`, preflight it with
development cases, and run all four strategies under that model. Preserve the
partial 3.5 records; never fill its missing jobs with 3.1 outputs and aggregate
them as one experiment. A model, prompt, budget, or request-setting change after
held-out generation starts likewise requires a separate revision.

## Part A: generation and recording

1. Verify all 49 frozen input/reference hashes before making requests.
2. Freeze the code commit, exact prompt templates, endpoint, configuration, and
   seeded randomized job order. Interleave strategies to reduce time/order effects.
3. Reuse shared candidate extraction, context selectors, formatter, and generation
   client. Each request sees only its selected image, selected notebook context,
   and existing alt text. Reference facts and expected judgments never enter prompts.
4. Save an attempt-start record before dispatch, then append the response or error.
   Save raw `message.content` before parsing or validation, plus finish reason,
   response model/ID, timestamps, request latency, actual input sizes, selected cell
   indices, truncation, and provider usage when available. Missing usage is null
   with an availability indicator, never estimated as reported usage or zero.
5. Save parsed results and deterministic checks alongside raw content. A suggestion
   that exceeds 40 words remains available for content scoring and is separately
   recorded as constraint-invalid. Do not rewrite it or hide it from the study.
6. Do not run model-assisted validation on all four conditions in Part A. Preserve
   the first valid generation result under the retry policy for each job.

Use append-only JSONL records with experiment ID, configuration hash, case ID,
strategy, stage, attempt number, request-dispatched indicator, and status. Store
input image paths/SHA-256 hashes rather than repeating base64 blobs. Save exact
formatted context and the prompt/template snapshot needed to reconstruct inputs.
Do not save API keys, authorization headers, reasoning fields, thought signatures,
or unrelated provider metadata. Store resume identifiers and scores separately
from the frozen benchmark. Never overwrite successful outputs with fresh samples.

## Failures, two attempts, and resume

- `pending`: no request dispatched yet; safe to run later.
- `retryable-error`: a temporary failure with one attempt used; one remains.
- `succeeded`: a valid generation result exists; skip on resume.
- `model-output-error`: a response arrived but content was empty, malformed,
  schema-invalid, or truncated without a valid result; preserve it and do not retry.
- `exhausted-error`: both allowed attempts failed; retain as an unavailable result.
- `interrupted-unknown`: a dispatched request has no saved completion; preserve it
  and count it as an attempt rather than silently issuing an extra request.

Retry timeouts, connection interruptions, and HTTP 408/429/500/502/503/504 once.
Wait at least 30 seconds, honor a longer Retry-After when provided, or pause and
perform the second attempt manually in a later resumed session. Never reclassify
a bad description, no-improvement decision, or manual-review judgment as a
transport failure just to obtain another answer. Authentication/configuration
errors stop the run for investigation; preserve any existing held-out records.

Resume only unstarted jobs or retry-eligible jobs with an unused attempt under
the exact same experiment configuration. Selected case/strategy subsets are
allowed; changing the subset does not reset the attempt counter. Both automatic
and manual attempts share the two-attempt limit. Further attempts after exhaustion
require a separately labeled supplemental experiment and cannot replace primary
results. Record first-attempt success, eventual success, attempt counts, and total
request latency. Server-side completion after a client timeout may be unknown.

A study may finish with 72 terminal job records containing successes and explicit
failures; it does not require 72 successful descriptions. Investigate failures
individually and always report availability alongside quality metrics.

## Scoring valid model results

| Result | Description to score | Improvement decision |
| --- | --- | --- |
| `concern: true` with valid suggestion | Raw proposed replacement, before quality validation | Improvement recommended |
| `concern: false`, existing nonempty alt | Original existing alt text, unchanged | No improvement recommended |
| `concern: false`, missing/empty alt | Empty description; fact coverage zero; no usable-alt result | Missed required improvement |
| No valid response | Unavailable; no model-quality score | No valid decision, not a correct negative |

Weak and acceptable cases supply binary reference judgments. A false concern on
an acceptable case is an unnecessary replacement under this rubric, even if the
replacement is fluent. A missed weak case is a false negative. Missing/empty
cases are reported separately as generation availability, coverage, and failures.
Never reward a strategy merely for proposing more replacements.

Use the [scoring template](evaluation-scoring-template.md). Shuffle and replace
run identifiers with opaque scoring IDs; hide strategy, selected cells, token/
latency data, provider metadata, and validator decisions. The scoring packet may
show the image, approved reference context, required facts, and effective
unvalidated description. Keep the scoring-ID-to-run mapping separate and do not
inspect it until scores and uncertainty decisions are finalized. Existing knowledge
of the cases and recognition of repeated outputs remain limitations of blinding.

Score each fact yes/no, accept equivalent wording, and quote supporting text.
An unsure flag is temporary and must be resolved with an evidence note before
unblinding. Count distinct unsupported factual assertions, not repeated mentions
of the same assertion. Prohibited claims are examples, not an exhaustive list;
missing a required fact is not itself an unsupported claim. Do not change frozen
reference facts after seeing outputs; document suspected annotation issues for a
future dataset revision. Practice the rubric only on development examples.

Report fact coverage averaged over valid-response jobs, counting a valid
no-improvement response with missing/empty alt as zero. Report unsupported-output
rate over nonempty descriptions, with the numerator and denominator shown.
Unavailable responses have N/A content scores and are never labeled hallucination-
free. Also report valid-response and usable-description rates out of 18 per strategy.
If availability differs, additionally compare the common cases with valid responses
across all four strategies; do not present unequal-denominator averages alone as
proof of superiority. Report precision/recall/F1 for valid weak/acceptable decisions
and show decision availability out of the 12 eligible held-out cases per strategy.
Undefined metrics use N/A, not a fabricated zero. Keep input size, token use when
reported, request counts, deterministic validity, and latency as separate metrics.

A second person may independently score a predetermined, strategy-balanced subset
before discussion. Report original agreement and resolve disagreements explicitly.
If there is only the author, disclose a single-rater exploratory evaluation; this
is not a study of screen-reader-user preferences. Do not show an LLM's ratings to
the author before primary scoring; optional LLM assistance is secondary evidence.

## Part B: validation decisions

Reuse saved Structure-aware suggestions; do not regenerate text. Run deterministic
checks first, then one model-assisted validation job only for nonempty replacement
suggestions within 40 words. Each such job has the same two-total-attempt transient
retry policy, recorded separately from generation; retries do not create a second
successful judgment. No-improvement results and over-limit suggestions require no
quality-model request and must be recorded as not eligible/not run.

Freeze the validator prompt/config with Part A. Keep raw judgments and failures.
A validator failure preserves the generation result and yields manual-review.
Compare judgments against blinded human evidence: problems flagged, problems
missed, correct suggestions flagged, passes, and request/parse failures. Judge all
five checks: coverage and unsupported claims alone do not establish conciseness
or full context consistency. The scoring sheet records those additional defects.
A failure reason must agree with a false flag; contradictory reasons are separately
noted as validator inconsistencies. Do not let validator output become the human
answer key. This stage measures screening decisions, not improved wording: there
is no automatic rewrite, and no author-edited text enters experimental scores.

## Deliverables and limits

Save the frozen protocol/config, raw attempt records, finalized blinded scores,
private unblinding mapping, metric-generation script, summary tables, and individual
failure examples. Every reported number must be reproducible from saved artifacts
without new model calls. Report synthetic/repeated chart patterns, small case
count, one sample per condition, possible provider/model drift, partial blinding,
and single-rater limitations. Do not claim statistical significance or general
superiority from descriptive differences alone.
