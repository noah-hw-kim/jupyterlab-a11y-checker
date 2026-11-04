# Agent report

Task ID: `P7-DEV2-001`

Status: Completed.

---

## 1. Execution Summary

Task `P7-DEV2-001` executed exactly one live development batch targeting Case 05 under the new experiment identity `dev-gemini35-v2`. Network-enabled execution was used with zero retries, no automatic re-runs, and no modifications to existing code, config, or benchmark fixtures.

* **Command:**
  ```bash
  node --env-file=.env evaluation/run.mjs --config evaluation/config.example.json --experiment dev-gemini35-v2 --case case-05
  ```
* **Exit Code:** `0`
* **Stopped Reason:** `batch-limit` (capped at 4 requests)
* **Requests Dispatched:** `4` (all 4 returned HTTP 200 on Attempt 1)

### JSON Summary Excerpt:
```json
{
  "dryRun": false,
  "experimentId": "dev-gemini35-v2",
  "outputDir": "/home/orrijoa61b/projects/jupyterlab-a11y-checker/evaluation/runs/dev-gemini35-v2",
  "requests": 4,
  "stopped": "batch-limit",
  "results": [
    {
      "job": { "caseId": "case-05", "strategy": "largest-practical", "stage": "generation" },
      "attemptNumber": 1,
      "outcome": "succeeded",
      "result": {
        "concern": true,
        "suggestion": "Line chart showing quarterly revenue increasing from $12k in Q1 to $40k in Q5."
      }
    },
    {
      "job": { "caseId": "case-05", "strategy": "minimal", "stage": "generation" },
      "attemptNumber": 1,
      "outcome": "succeeded",
      "result": {
        "concern": false,
        "suggestion": null
      }
    },
    {
      "job": { "caseId": "case-05", "strategy": "fixed-window", "stage": "generation" },
      "attemptNumber": 1,
      "outcome": "succeeded",
      "result": {
        "concern": true,
        "suggestion": "Line chart of quarterly revenue increasing steadily from $12k in Q1 to $40k in Q5 across five quarters."
      }
    },
    {
      "job": { "caseId": "case-05", "strategy": "structure-aware", "stage": "generation" },
      "attemptNumber": 1,
      "outcome": "succeeded",
      "result": {
        "concern": false,
        "suggestion": null
      }
    }
  ]
}
```

---

## 2. Request Timing & Pacing Verification

All 4 requests were started with $\ge 15,000\text{ ms}$ intervals between consecutive dispatches:

| Request | Target Job | Attempt Start Timestamp (UTC) | Interval from Prior Start | Latency | HTTP Status |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **1** | `case-05 [largest-practical]` | `2026-11-01T00:19:51.017Z` | *N/A (first request)* | 1,701 ms | 200 |
| **2** | `case-05 [minimal]` | `2026-11-01T00:20:06.032Z` | **15.015 s** ($\ge 15\text{ s}$) | 935 ms | 200 |
| **3** | `case-05 [fixed-window]` | `2026-11-01T00:20:21.052Z` | **15.020 s** ($\ge 15\text{ s}$) | 1,094 ms | 200 |
| **4** | `case-05 [structure-aware]` | `2026-11-01T00:20:36.101Z` | **15.049 s** ($\ge 15\text{ s}$) | 985 ms | 200 |

* **First Request Start:** `2026-11-01T00:19:51.017Z` (November 1, 2026)
* **Last Request Start:** `2026-11-01T00:20:36.101Z` (November 1, 2026)

---

## 3. Snapshot Schedule & Config Verification

Inspection of [`evaluation/runs/dev-gemini35-v2/experiment.json`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/evaluation/runs/dev-gemini35-v2/experiment.json) confirms:
* **Approved Parameters:**
  * `model`: `gemini-3.5-flash-lite`
  * `split`: `development`
  * `batchSize`: 4, `concurrency`: 1, `minimumRequestIntervalMs`: 15000
  * `contextCharacterBudget`: 2000, `maxOutputTokens`: 2048, `maxSuggestionWords`: 40
  * `reasoningEffort`: `"provider-default"`, `temperature`: `"provider-default"`
  * `retry.maxAttempts`: 2, `retry.minimumDelayMs`: 30000
* **Full Schedule Retention:** Contains all **24 generation jobs** (6 cases $\times$ 4 strategies) in `generationJobs`.
* **Case Filtering Scope:** `--case case-05` acted strictly as a runtime dispatch filter; it did not reduce the frozen 24-job plan.
* **Integrity Hashes:**
  * `codeSnapshotSha256`: `aa153747eac239b49be8cb60c49e7c3ebe3f510e4e58b173bbcbdd5f5b2ae6b9` (reflects compiled P7-PROMPT-003 prompt updates).
  * `benchmarkFreezeSha256`: `3ae902906f328f6378c5585db75acdfd6fe80535b4d49e877b767c6aa70d7ef8` (matches frozen ground truth).

---

## 4. Case 05 Strategy Results & Decision Classification

In our benchmark ground truth ([`manifest.json`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/test_files/benchmark/references/manifest.json#L85-L115)), `case-05` has:
* **Existing Alt Text:** *"Line chart showing quarterly revenue increasing steadily across five quarters."*
* **Ground Truth:** Category = `acceptable`, **`shouldImprove: false`**.
* **Classification Rule:**
  * `concern: false` $\rightarrow$ **True Negative (TN)** (Correctly accepted sufficient summary).
  * `concern: true` $\rightarrow$ **False Positive (FP)** (Over-critiqued acceptable summary).

### Strategy Performance Table:

| Strategy | Attempt | HTTP Status | Error Kind | Outcome | Actual `concern` | Suggestion | Word Limit Status | Classification |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- | :---: | :---: |
| **`minimal`** | 1 | 200 | None | `succeeded` | **`false`** | `null` | N/A | **TN** |
| **`structure-aware`** | 1 | 200 | None | `succeeded` | **`false`** | `null` | N/A | **TN** |
| **`fixed-window`** | 1 | 200 | None | `succeeded` | **`true`** | *"Line chart of quarterly revenue increasing steadily from \$12k in Q1 to \$40k in Q5 across five quarters."* | 18 words ($\le 40$, within limit) | **FP** |
| **`largest-practical`** | 1 | 200 | None | `succeeded` | **`true`** | *"Line chart showing quarterly revenue increasing from \$12k in Q1 to \$40k in Q5."* | 14 words ($\le 40$, within limit) | **FP** |

### Comparison with Experiment `v1`:
* **`dev-gemini35-v1` (Old Prompt):**
  * `minimal`: `concern: true` (**FP**)
  * `fixed-window`: `concern: true` (**FP**)
  * `structure-aware`: `concern: true` (**FP**)
  * `largest-practical`: `concern: true` (**FP**)
  * *Result in v1:* **0 / 4 TN, 4 / 4 FP (100% False Positive rate on Case 05)**.
* **`dev-gemini35-v2` (Revised Prompt):**
  * `minimal`: `concern: false` (**TN**)
  * `structure-aware`: `concern: false` (**TN**)
  * `fixed-window`: `concern: true` (**FP**)
  * `largest-practical`: `concern: true` (**FP**)
  * *Result in v2:* **2 / 4 TN, 2 / 4 FP (50% reduction in Case 05 False Positives)**.
* **Qualitative Unit Observation on FPs:** Both `fixed-window` and `largest-practical` suggestions retained the full unit (`$12k` and `$40k`), avoiding the missing-unit defect observed in v1's `case-02 [fixed-window]`.

---

## 5. Experiment Totals Across All 24 Jobs (`planEvaluationResume`)

Reconstructed from [`dev-gemini35-v2/attempts.jsonl`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/evaluation/runs/dev-gemini35-v2/attempts.jsonl) using `planEvaluationResume({ ...exp, jobs: exp.generationJobs }, exp.config, records)`:

* **`succeeded`:** **4** (`case-05` across all 4 strategies)
* **`pending` / unstarted:** **20** (Cases 01, 02, 03, 04, and 06 across all 4 strategies)
* **`retryable-error`:** **0**
* **`exhausted-error`:** **0**
* **Remaining Eligible Jobs:** **20**

---

## 6. Artifact & Fixture Preservation Verification

Before-and-after SHA-256 hash checks confirmed zero modification to prior experiment artifacts, frozen benchmarks, configuration, or source code:

* `evaluation/runs/dev-gemini35-v1/*`: **100% byte-identical** (all hashes matched).
* `test_files/benchmark/references/*`: **100% byte-identical** (`manifest.json` and `freeze.json` untouched).
* `evaluation/config.example.json`: **100% byte-identical**.
* `packages/core/src/utils/semantic-model-request.ts`: **100% byte-identical**.
* Full before/after verification logs saved in `evaluation/task-evidence/P7-DEV2-001/after-hashes-full.txt`.

---

## 7. Limitations & Empirical Boundary

1. **Small Sample Scope:** Evaluating `case-05` demonstrates that the prompt change enabled `minimal` and `structure-aware` to accept an accurate summary without requiring endpoints. However, Case 05 alone **cannot prove** whether sensitivity on genuinely deficient alt text (`cases 01–04`) remains preserved.
2. **Context Window Influence:** `minimal` (which received only the image markdown) and `structure-aware` (which received section-level context) both returned `concern: false`. Conversely, `fixed-window` and `largest-practical` (which both received preceding cell assignments `sample_count = 5` and `display_scale = 1` and subsequent decoy study text) returned `concern: true`. Investigating whether extraneous neighboring cells trigger conservative rewrites remains a question for full development split testing.
3. **Subsequent Batches:** Assessing false-negative risk across `cases 01–04` and verifying acceptable recognition on `case-06` requires subsequent separately authorized development batches in `dev-gemini35-v2`. No further batches or live calls were launched.
