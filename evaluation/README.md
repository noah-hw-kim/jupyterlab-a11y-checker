# Evaluation runner contracts

The Part A generation runner is implemented in `run.mjs` and `runner.mjs`.
It reuses core context selectors, routing, and request builders; records raw
responses before semantic parsing; and supports small resumable batches.
Part B validation reuses exact saved Structure-aware replacements through the
same durable execution loop. `export-scoring.mjs` creates strategy-masked human
scoring packets; `analyze-scoring.mjs` verifies the finalized scores and saved
experiment evidence, then calculates Part A and Part B metrics offline.
Development preflight is complete. Held-out collection has not started;
the reviewed code checkpoint and final configuration freeze precede it.
See the approved [protocol](../docs/evaluation-protocol.md) and
[scoring template](../docs/evaluation-scoring-template.md).

`agent-context.md`, `agent-handoff.md`, `agent-report.md`, and `task-evidence/`
document earlier AI-assisted work. They are retained for transparency.
Historical task instructions and status reports may be outdated; current project
decisions are documented in the implementation plan and evaluation protocol.

## Part B: validate saved suggestions

Preview source eligibility without credentials, writes, or model calls:

```bash
node evaluation/run.mjs --source dev-gemini35-v2 --dry-run
```

After separate authorization, a live invocation uses:

```bash
node --env-file=.env evaluation/run.mjs --source dev-gemini35-v2 --experiment dev-gemini35-v2-validation
```

`--source` selects validation mode (`--validate` is also supported and requires
`--source`). It identifies the generation experiment. `--experiment` names the
validation experiment, defaulting to `<source>-validation`. `--source-dir` may
locate an explicitly identified generation experiment elsewhere; `--output`
controls only the validation destination. Source and destination cannot overlap.
Existing generation commands retain their meaning.

Only successful Structure-aware replacements within the configured word limit
are eligible. No-improvement, over-limit, and terminal unavailable sources are
listed as exclusions, with no reserved HTTP attempts. Pending/retryable source
jobs must finish before validation. A valid filter selecting only exclusions,
or a wholly ineligible source, returns a zero-request summary. Live invocations
still create immutable validation snapshots; dry-runs create no artifacts.

The source snapshot, both source prompt artifacts, and event log are verified.
The loader checks the frozen case/image identity and raw/parsed event agreement;
it recomputes eligibility and uses the exact saved suggestion and formatted
context. Validation settings and endpoint must match the source, and the current
validator prompt must match the source's frozen validator prompt. Hashes bind
the local source bytes at initialization; they are not proof of external
authenticity. Source hashes are bound into validation identity, so edits cause
resume rejection. Sources must be trusted local experiment artifacts.

Validation has its own `experiment.json`, both prompt artifacts and append-only
`attempts.jsonl`. The legacy `generationJobs` snapshot field contains jobs with
`stage: "validation"`; its full list and exclusions remain unchanged by runtime
filters. Existing locks, raw-response recovery, pacing, retry limits, cooldowns,
and request caps apply. Filtered runs recover cached responses outside their
filter before dispatching any new calls.

Valid quality JSON is an execution success even when a check is false. The
summary derives `reviewDecision: "pass"` only when all five checks pass;
otherwise it reports `manual-review`, including for request/parse failures.
Neither outcome rewrites generation suggestions. Human scoring must use the
original Part A descriptions and must not see validator judgments.

Changes to runner/core code alter code identity. A completed historical source
can be read by Part B without matching today's code hash, but its Part A run
cannot be resumed under changed code. Before held-out collection, freeze the
generation and validator prompts/configuration together using the final code.

Offline runner checks (temporary mocked experiments, no model requests):

```bash
node evaluation/__tests__/runner.test.mjs
node evaluation/__tests__/validation-runner.test.mjs
```

## Human scoring export

After development review, create a strategy-masked packet from a completed
generation experiment, without making model calls:

```bash
node evaluation/export-scoring.mjs --source evaluation/runs/dev-gemini35-v2 --frozen test_files/benchmark --output evaluation/scoring/dev-gemini35-v2
```

Open only `<output>/reviewer/scoring-packet.md` while scoring. Its copied images
have opaque names. Keep `<output>/private-mapping.json` closed until scores and
uncertainties are finalized. Unavailable jobs appear only in that mapping, not
as descriptions to rate; valid no-improvement responses retain the exact original
alt text (or empty text for missing/empty alt). Repeated strategy outputs remain
separate items. Familiarity with development examples limits masking.

The exporter verifies the source fingerprint, prompts, event history, complete
four-strategy schedule and frozen inputs. It hashes the bytes it parses, rejects
unfinished sources, checks inputs again before publication, and preserves source
files. A sibling lock prevents duplicate exports; temporary staging and a
`COMPLETE` marker distinguish a complete packet. Existing outputs are never
overwritten. Use a different output location for a new export revision.

This exports blank rubric forms, not human scores or validator judgments. Literal
text rendering protects form structure without changing the effective description.
`--seed` optionally selects an unsigned 32-bit shuffle seed. Source/mapping hashes
support reproducibility; they are not cryptographic concealment or proof of source
authenticity. Keep primary scores separate from subsequent model validation.

Offline exporter checks:

```bash
node evaluation/__tests__/export-scoring.test.mjs
```

## Offline scoring analysis

After human scores are finalized, regenerate development metrics from saved
records without credentials or model requests:

```bash
node evaluation/analyze-scoring.mjs --scoring evaluation/scoring/dev-gemini35-v2 --source evaluation/runs/dev-gemini35-v2 --validation evaluation/runs/dev-gemini35-v2-validation --frozen test_files/benchmark --output /tmp/a11ylens-dev-analysis-review
```

Choose a new output directory for each verification so existing reports are
preserved. The analyzer writes `summary.json` and `summary.md`; it does not
regenerate descriptions or modify human scores. `--validation` is optional
when only Part A analysis is needed. Development reports are preflight evidence,
not results from the held-out study.

## Operator workflow

1. Build the core package so the standalone Node runner can reuse its exports.
2. Provide the endpoint and API key through the environment; do not put their
   credential values in the config, records, shell history, or source control.
3. Start a development run using `config.example.json`. The runner will load and
   verify cases, select context, send one request at a time, receive responses,
   and append records automatically. Human scoring is a separate step.
4. Resume the same output directory later, optionally selecting a subset of
   cases/strategies. Completed jobs are skipped; retryable jobs get at most their
   remaining attempt. The configured retry mode is manual, not a timed retry loop.
5. Development preflight is complete. Before held-out collection, checkpoint
   the reviewed code and freeze the protocol, scoring rules, configuration,
   endpoint, and both prompt templates. `config.held-out.json` selects the
   18 held-out cases; a separate experiment ID keeps their results apart from
   development. Default settings select development cases. Held-out execution
   requires separate authorization.

The endpoint variable must resolve to a credential-free URL. Save that URL in the
snapshot so changing an environment variable cannot silently change providers
mid-experiment. Store only the API key's environment variable name, never its value.
Reasoning and temperature `provider-default` mean omit those request parameters.
`config.example.json` contains development settings; `config.held-out.json`
contains the prepared held-out settings. Each run's `experiment.json` records
the configuration and experiment identity for resume checks. Final freeze is
still required before held-out requests.

## Small batches and request pacing

- `batchSize: 4` permits at most four HTTP attempts per invocation, including
  failed attempts and retries. It does not mean four notebooks or four successful
  results. Stop after the fourth attempt even if more jobs remain.
- `minimumRequestIntervalMs: 15000` spaces request starts at least 15 seconds
  apart, with concurrency one. The earliest next dispatch also respects any
  job retry deadline and provider cooldown.
- Preserve the seeded randomized job order across batches; resume the eligible
  remainder rather than generating a new ordering or starting over.
- Read the latest reserved request-start timestamp from the log on resume, so
  restarting cannot bypass pacing. A recovered unknown attempt counts toward
  its job's two-attempt limit; successful jobs are never regenerated.
- On HTTP 429, save the response/error and stop the invocation immediately.
  Save a provider-wide cooldown timestamp using the longer of the 30-second
  minimum retry delay and a valid Retry-After value. The next invocation must
  respect it even when selecting a different case/strategy or when the
  rate-limited job already exhausted its two attempts.
- With manual retry mode, there is no automatic second attempt in the same
  invocation. Resume later to use a remaining retry; it counts toward that
  invocation's four-attempt limit. Opening a new experiment directory is not
  a way to repeat primary-study jobs or bypass a provider's quota.

Fifteen seconds is a provisional four-request-per-minute starting pace, not a
verified quota for the configured endpoint. It does not enforce a token-per-minute
limit or account for other users of a shared provider. Confirm pacing during
development preflight and freeze it before held-out execution. A 429 still stops
the batch rather than triggering a rapid retry loop.

## Separation of responsibilities

- `packages/core/src/evaluation-types.ts`: reusable TypeScript data contracts,
  without filesystem operations or HTTP calls.
- `evaluation/config.example.json`: development settings; no credentials.
- `evaluation/config.held-out.json`: held-out settings; no credentials.
- `evaluation/run.mjs` and `runner.mjs`: Node-only file loading, request recording,
  and execution using shared core selectors, routing, and request builders.
- `evaluation/export-scoring.mjs`: creates strategy-masked scoring packets from
  saved generation records.
- `evaluation/analyze-scoring.mjs`: verifies finalized human scores against saved
  evidence and computes metrics without new model calls.

`parseEvaluationConfig()` validates external configuration, including the full
strategy list, two-attempt/manual-retry policy, numeric settings, and omitted
provider-default controls. Unknown fields are rejected without echoing values.
`planEvaluationResume()` validates supplied event records and derives actions
without filesystem access or HTTP calls. It checks frozen config/identity,
sequencing, repeated-attempt inputs, parsed results against recorded raw responses,
attempt limits, pacing, and retry/provider cooldowns. The executable runner must
still load and verify the benchmark/snapshot identities before using these helpers.
Case/strategy subset filters and the output directory are operator selections;
they must not reset attempts or change the frozen experiment fingerprint.

## Experiment output layout

```text
<experiment-directory>/
  experiment.json           # resolved public config, fingerprint, ordered jobs
  prompts/generation.json   # exact generation/evaluation request templates
  prompts/validation.json   # exact quality-check request template
  attempts.jsonl            # append-only start/response/finish events
```

The snapshot records the code commit and source-snapshot hash, prompt hashes,
benchmark-freeze hash, resolved endpoint, configuration, and randomized job order.
Use a new experiment directory for a changed model or scientific configuration;
do not reset attempts by creating new IDs inside an existing experiment.
The runner must reject resume if the fingerprint or recorded input identity differs.
Validation jobs reference the exact saved generation attempt and suggestion;
they never generate a fresh description or change generation attempt counts.

## Attempt lifecycle

```text
pending job
  -> append and flush attempt-started (reserve attempt 1 or 2)
  -> send request
  -> receive response or error
  -> append and flush response-received with raw content, if received
  -> parse the recorded content or classify the request error
  -> append and flush attempt-finished
```

A saved response without a finish event can be parsed locally and finalized
without another model call. A start with neither saved response nor finish event
means the request might have been sent: recover it as `interrupted-unknown` and
count the reserved slot. Disk and provider dispatch
cannot be committed atomically, so this conservative rule may consume a slot
for a request that never reached the server; it prevents accidental extra samples.
If one attempt remains, it may be resumed after the retry delay. No valid response
is fabricated. An interrupted second attempt is terminal-unavailable.

A crash after raw content is received but before completion is durably written
can lose that response; the started event still preserves the attempt count.
An unparseable partial final JSONL line must not cause the runner to ignore other
valid start events and reset counts. The runner rejects malformed or incomplete
log lines for inspection; it does not automatically repair them or reset counts.

On resume, a valid `succeeded` event wins and is never overwritten or regenerated.
HTTP 200 with bad model content becomes `model-output-error`, not a retry. Temporary
transport/provider failure is retryable only with a remaining attempt. Authentication
or configuration errors block execution rather than classifying the model response
as a correct negative. Reference labels and human scores never enter request records.

## Verification scope

Core tests and the four offline evaluation test suites cover configuration,
resume behavior, mocked request execution, scoring export, and analysis.
The analyzer tests include finalization checks, altered-packet rejection, metric
calculations, and the distinction between missing reference facts and quality
defects. These tests do not establish provider availability or model quality.

## Offline resume planning

Pass the complete frozen job list and frozen configuration to
`planEvaluationResume(context, config, records, nowMs)`. Runtime case/strategy
filters are applied afterward, so filtering cannot hide existing attempts.

| Saved state                          | Planned action                                                        |
| ------------------------------------ | --------------------------------------------------------------------- |
| No attempts                          | Send attempt 1 when pacing allows                                     |
| Successful completion                | Skip; never regenerate                                                |
| Response recorded without completion | Recover/parse the saved response locally                              |
| First transient failure              | Wait for its deadline, then offer attempt 2 on manual resume          |
| Start without response/completion    | Count the reserved attempt; wait through its timeout plus retry delay |
| Second failed/interrupted attempt    | Skip as unavailable; no attempt 3                                     |
| Model-output error                   | Skip as unavailable; no content-based retry                           |
| Authentication/configuration block   | Block new dispatches for investigation                                |

`response-recorded` distinguishes a recoverable saved response from
`interrupted-unknown`. Retry deadlines are saved in response events before parsing,
including the provider-wide 429 deadline, and carried into completion events.
This preserves a longer Retry-After even if the process stops between those events.
Resolve saved responses before starting new network work. A completed quality
judgment is final even if it flags the description; a failed check is not a reason
to request another judgment.

The Node runner adds a single-writer lock, snapshot hashing, reference-input
verification, durable JSONL appends, small-batch execution, and timeout-bound API
transport. Manual retries never happen twice within one invocation. Malformed or
incomplete log lines fail closed and require inspection; automatic partial-write
repair is intentionally not implemented. Valid prior records are never discarded
or interpreted as a fresh experiment with new attempt counts.

## Run development Case 1 with Minimal

Run from the repository root with Node 24 (the current development environment):

```bash
corepack yarn workspace @berkeley-dsep-infra/a11y-checker-core build
node evaluation/run.mjs --dry-run --case case-01 --strategy minimal
```

The dry run requires no credentials, makes no HTTP requests, and writes no
experiment artifacts. It verifies frozen hashes and shows the selected input.

For a live run, create `.env` in the repository root (already ignored by Git):

```dotenv
A11YLENS_MODEL_ENDPOINT=https://your-provider/chat/completions
A11YLENS_API_KEY=your-key
```

Use the full OpenAI-compatible chat-completions URL supplied by your provider.
Do not put credentials in the URL, paste keys into chat, or commit this file.
Alternatively export the two variables in your local shell; the `.env` file is
optional. Node loads it explicitly with `--env-file`:

```bash
node --env-file=.env evaluation/run.mjs --experiment dev-gemini35-v1 --case case-01 --strategy minimal
```

This selects one development generation job. It does not run quality validation.
A repeated identical invocation skips a completed job; a temporary failure may
use its remaining second attempt after the saved delay. Authentication/configuration
blocks require investigation; they are not automatically cleared by rerunning.
An unexpected returned model ID blocks the batch until its identity is verified.
Missing returned model/token fields remain explicitly unavailable.

After checking the first response, run one additional development batch:

```bash
node --env-file=.env evaluation/run.mjs --experiment dev-gemini35-v1
```

It sends at most four requests, excludes successful jobs, preserves the frozen
job order, waits at least 15 seconds between starts, and stops immediately on 429.
The 15-second setting is about four requests/minute, below a reported 15 RPM
quota for this runner alone; token limits and other shared traffic can still
cause 429. A saved Retry-After also applies when resuming a different case.

Results live in `evaluation/runs/<experiment>/`, ignored by Git. The snapshot
records code commit plus actual compiled-core/runner hashes, provider URL,
config, complete split job list, benchmark-freeze hash, and real shared prompt
snapshots. Runtime filters do not change that identity. A changed identity is
rejected without overwriting existing artifacts. Source changes require rebuilding
core; code changes after a run require a separate experiment revision.

An orphaned `.runner.lock` is never removed automatically. Confirm no runner is
active before manually recovering a lock. Preserve partial artifacts or malformed
logs for inspection; do not reset counters by silently deleting them.

Run offline tests (HTTP is mocked; no real keys are required):

```bash
node evaluation/__tests__/runner.test.mjs
node evaluation/__tests__/validation-runner.test.mjs
node evaluation/__tests__/export-scoring.test.mjs
node evaluation/__tests__/analyze-scoring.test.mjs
corepack yarn workspace @berkeley-dsep-infra/a11y-checker-core test
```
