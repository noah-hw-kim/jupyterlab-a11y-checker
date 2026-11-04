# Agent report

Task ID: `P7-DEV2-002`

Status: Completed.

---

## 1. Execution Summary

Task `P7-DEV2-002` executed exactly one live development batch in `dev-gemini35-v2` targeting Case 03 under all four context strategies (`largest-practical`, `minimal`, `structure-aware`, and `fixed-window`). The goal was to verify whether the prompt revision implemented in `P7-PROMPT-003` preserved sensitivity on genuinely deficient alt text without introducing False Negatives.

- **Command:**
  ```bash
  node --env-file=.env evaluation/run.mjs --config evaluation/config.example.json --experiment dev-gemini35-v2 --case case-03
  ```
- **Exit Code:** `0`
- **Stopped Reason:** `batch-limit` (capped at 4 requests)
- **Requests Dispatched:** `4` (all 4 returned HTTP 200 on Attempt 1)
- **Target Filter Confirmation:** Only `case-03` jobs were dispatched.

### JSON Summary:

```json
{
  "dryRun": false,
  "experimentId": "dev-gemini35-v2",
  "outputDir": "/home/orrijoa61b/projects/jupyterlab-a11y-checker/evaluation/runs/dev-gemini35-v2",
  "requests": 4,
  "stopped": "batch-limit",
  "results": [
    {
      "job": {
        "caseId": "case-03",
        "strategy": "largest-practical",
        "stage": "generation"
      },
      "attemptNumber": 1,
      "outcome": "succeeded",
      "result": {
        "concern": true,
        "suggestion": "Line chart of quarterly revenue from Q1 to Q5, rising steadily from 12 thousand dollars in Q1 to 40 thousand dollars in Q5."
      }
    },
    {
      "job": {
        "caseId": "case-03",
        "strategy": "minimal",
        "stage": "generation"
      },
      "attemptNumber": 1,
      "outcome": "succeeded",
      "result": {
        "concern": true,
        "suggestion": "Line graph of Quarterly Revenue from Q1 to Q5, showing a steady increase from $12k in Q1 to $40k in Q5."
      }
    },
    {
      "job": {
        "caseId": "case-03",
        "strategy": "structure-aware",
        "stage": "generation"
      },
      "attemptNumber": 1,
      "outcome": "succeeded",
      "result": {
        "concern": true,
        "suggestion": "Line chart showing quarterly revenue increasing from $12k in Q1 to $40k in Q5."
      }
    },
    {
      "job": {
        "caseId": "case-03",
        "strategy": "fixed-window",
        "stage": "generation"
      },
      "attemptNumber": 1,
      "outcome": "succeeded",
      "result": {
        "concern": true,
        "suggestion": "Line graph of Quarterly Revenue showing an upward trend from $12k in Q1 to $40k in Q5."
      }
    }
  ]
}
```

---

## 2. Request Timing & Pacing Verification

All request dispatches adhered to the required $\ge 15,000\text{ ms}$ start spacing. Request 1 was spaced from the prior recorded job in `dev-gemini35-v2` (`case-05 [structure-aware]`), and all subsequent requests maintained the minimum interval:

| Dispatch # | Strategy            | Attempt Start Timestamp (UTC) |                      Interval from Prior Start                      | Latency  | HTTP Status | Transport / Error Kind |
| :--------: | :------------------ | :---------------------------- | :-----------------------------------------------------------------: | :------: | :---------: | :--------------------: |
|   **1**    | `largest-practical` | `2026-11-01T00:31:16.383Z`    | **640.282 s** (from `case-05 [structure-aware]` at `00:20:36.101Z`) | 1,494 ms |     200     |          None          |
|   **2**    | `minimal`           | `2026-11-01T00:31:31.399Z`    |                **15.016 s** ($\ge 15.000\text{ s}$)                 | 1,384 ms |     200     |          None          |
|   **3**    | `structure-aware`   | `2026-11-01T00:31:46.432Z`    |                **15.033 s** ($\ge 15.000\text{ s}$)                 | 1,037 ms |     200     |          None          |
|   **4**    | `fixed-window`      | `2026-11-01T00:32:01.472Z`    |                **15.040 s** ($\ge 15.000\text{ s}$)                 |  964 ms  |     200     |          None          |

- **First Request in Batch:** `2026-11-01T00:31:16.383Z` (November 1, 2026)
- **Last Request in Batch:** `2026-11-01T00:32:01.472Z` (November 1, 2026)
- **Dispatched Target Scope:** 100% of dispatches were for `case-03`.

---

## 3. Case 03 Strategy Outcomes & Sensitivity Evaluation

In our benchmark ground truth ([`manifest.json`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/test_files/benchmark/references/manifest.json#L54-L84)):

- **Existing Alt Text:** `"graph"`
- **Ground Truth:** Category = `weak`, **`shouldImprove: true`**
- **Classification Rule:**
  - `concern: true` $\rightarrow$ **True Positive (TP)** (Deficient alt text correctly flagged).
  - `concern: false` $\rightarrow$ **False Negative (FN)** (Deficient alt text missed; dangerous false comfort).

### Strategy Performance Table:

| Strategy                | Attempt | HTTP Status |   Outcome   | Actual `concern` | Suggestion                                                                                                                      |         Word Count          | Classification | Provisional Review Flags                |
| :---------------------- | :-----: | :---------: | :---------: | :--------------: | :------------------------------------------------------------------------------------------------------------------------------ | :-------------------------: | :------------: | :-------------------------------------- |
| **`largest-practical`** |    1    |     200     | `succeeded` |    **`true`**    | _"Line chart of quarterly revenue from Q1 to Q5, rising steadily from 12 thousand dollars in Q1 to 40 thousand dollars in Q5."_ | 23 ($\le 40$, within limit) |     **TP**     | None (explicit dollars & units present) |
| **`minimal`**           |    1    |     200     | `succeeded` |    **`true`**    | _"Line graph of Quarterly Revenue from Q1 to Q5, showing a steady increase from $12k in Q1 to $40k in Q5."_                     | 21 ($\le 40$, within limit) |     **TP**     | None (concise, correct units)           |
| **`structure-aware`**   |    1    |     200     | `succeeded` |    **`true`**    | _"Line chart showing quarterly revenue increasing from $12k in Q1 to $40k in Q5."_                                              | 14 ($\le 40$, within limit) |     **TP**     | None (concise, correct units)           |
| **`fixed-window`**      |    1    |     200     | `succeeded` |    **`true`**    | _"Line graph of Quarterly Revenue showing an upward trend from $12k in Q1 to $40k in Q5."_                                      | 17 ($\le 40$, within limit) |     **TP**     | None (concise, correct units)           |

### Key Sensitivity Takeaways:

1. **Preserved Defect Sensitivity (100% Recall on Case 03):** All 4 context strategies identified `"graph"` as inadequate and flagged `concern: true`. Expanding acceptance criteria to avoid over-critiquing good summaries (`case-05`) did **not** weaken the model's ability to catch uninformative placeholder text.
2. **Zero False Negatives:** There were 0 FNs on Case 03.
3. **Unit Preservation in Suggestions:** Unlike the missing-unit defect observed in `dev-gemini35-v1` on `case-02 [fixed-window]`, all 4 strategies in `dev-gemini35-v2` included units (`$12k` to `$40k` or `12 thousand dollars` to `40 thousand dollars`).
4. **Resilience on Largest-Practical:** In `dev-gemini35-v1`, `case-03 [largest-practical]` encountered an upstream 503 and exhausted retries. In `dev-gemini35-v2`, it succeeded on Attempt 1 with 200 OK.

---

## 4. Experiment Totals Across All 24 Jobs (`planEvaluationResume`)

Reconstructed from [`dev-gemini35-v2/attempts.jsonl`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/evaluation/runs/dev-gemini35-v2/attempts.jsonl) using:

```javascript
planEvaluationResume(
  {
    experimentId: exp.experimentId,
    fingerprint: exp.fingerprint,
    config: exp.config,
    jobs: exp.generationJobs,
  },
  exp.config,
  records,
);
```

- **Total Frozen Generation Jobs:** 24
- **Status Counts:**
  - **`succeeded`:** **8** (`case-05` [4 strategies] + `case-03` [4 strategies])
  - **`pending`:** **16** (Cases 01, 02, 04, and 06 across all 4 strategies)
  - **`retryable-error`:** **0**
  - **`exhausted-error`:** **0**
- **Remaining Eligible Jobs (`action: "send"`):** **16**

The remaining 16 eligible jobs in scheduled order:

1. `case-06 [structure-aware]`
2. `case-01 [minimal]`
3. `case-06 [fixed-window]`
4. `case-04 [structure-aware]`
5. `case-04 [fixed-window]`
6. `case-01 [structure-aware]`
7. `case-02 [structure-aware]`
8. `case-01 [largest-practical]`
9. `case-06 [minimal]`
10. `case-02 [largest-practical]`
11. `case-04 [largest-practical]`
12. `case-02 [fixed-window]`
13. `case-04 [minimal]`
14. `case-02 [minimal]`
15. `case-06 [largest-practical]`
16. `case-01 [fixed-window]`

---

## 5. Artifact & Fixture Preservation Verification

SHA-256 hashes recorded before execution ([`before-hashes.txt`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/evaluation/task-evidence/P7-DEV2-002/before-hashes.txt)) were compared directly against post-execution hashes ([`after-hashes.txt`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/evaluation/task-evidence/P7-DEV2-002/after-hashes.txt)). `diff -u` produced zero differences, confirming that no source code, compiled bundles, configuration, or baseline runs were altered:

| File                                                        | SHA-256 Checksum                                                   | Preservation Status |
| :---------------------------------------------------------- | :----------------------------------------------------------------- | :-----------------: |
| `evaluation/config.example.json`                            | `0c0bc09f5beea0bced5a006746102aeed4d9293a9bf3545cac58e5449036197a` |    **Preserved**    |
| `packages/core/src/utils/semantic-model-request.ts`         | `462c7936e1120961a58b4e1b15a0d9e44a5806f07797469c465bf3d50328c6c7` |    **Preserved**    |
| `packages/core/dist/utils/semantic-model-request.js`        | `a8618caa0a6ba2b24ecaad7b42c9c420367f7b6d77a2133e41423c4583f6db5c` |    **Preserved**    |
| `packages/core/src/__tests__/semantic-model-client.test.ts` | `1a3cbb20c28cd8354a38b6bbb87a1a21c2aaaea2220c958ac9beb15d2d6d5c09` |    **Preserved**    |
| `evaluation/runs/dev-gemini35-v1/experiment.json`           | `79023a5746c52de3c304be4b2ac6bd62fc6ab4343d54022f9161b229a4fe7192` |    **Preserved**    |
| `evaluation/runs/dev-gemini35-v1/attempts.jsonl`            | `5a3da0782f1b8cda6a1073e458d824635b1287fae3a30392945beabbbc6955aa` |    **Preserved**    |
| `evaluation/runs/dev-gemini35-v1/prompts/generation.json`   | `516feb3c9fc9352170773b6f39db75ec05e23b410a199c6aadd15ad3d807a5a2` |    **Preserved**    |
| `evaluation/runs/dev-gemini35-v1/prompts/validation.json`   | `073b5e463da200dc4f94d882ae052cf048ff7bdb41856c925eed3d6bdcf6b51c` |    **Preserved**    |
| `evaluation/runs/dev-gemini35-v2/experiment.json`           | `991c5ce3037c676ee31870a9d7981f6c0144159fbb9c1498774ddf534a6d0d75` |    **Preserved**    |
| `evaluation/runs/dev-gemini35-v2/prompts/generation.json`   | `98437795b1f58c31323ff36277efc304d9dacb48b34dd0f59b1e391a5acc349c` |    **Preserved**    |
| `evaluation/runs/dev-gemini35-v2/prompts/validation.json`   | `073b5e463da200dc4f94d882ae052cf048ff7bdb41856c925eed3d6bdcf6b51c` |    **Preserved**    |
| `test_files/benchmark/references/manifest.json`             | `6c8b817c4155b92487a5e5705812086dd2afc8c64cb8c3f4802aef762af0954b` |    **Preserved**    |
| `test_files/benchmark/references/freeze.json`               | `3ae902906f328f6378c5585db75acdfd6fe80535b4d49e877b767c6aa70d7ef8` |    **Preserved**    |

Prior report archived at: [`evaluation/task-evidence/P7-DEV2-002/agent-report-P7-DEV2-001.md`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/evaluation/task-evidence/P7-DEV2-002/agent-report-P7-DEV2-001.md).

---

## 6. Limitations & Unresolved Issues

1. **Deficient Coverage Sample (Case 03 Only):** While Case 03 shows preserved sensitivity on generic single-word alt text (`"graph"`), it represents an extreme weak baseline. Genuinely deficient alt text with misleading context (e.g., `case-02`, `case-04`) remains to be verified in future batches.
2. **Acceptable Alt Verification (`case-06`):** Case 05 showed a 50% reduction in False Positives (2 TN, 2 FP). However, `case-06` (another acceptable case) has not yet been run under v2 to determine whether acceptance generalizes across multiple acceptable examples.
3. **Standing Recommendation:** Await Codex inspection of `evaluation/agent-report.md` and subsequent user instruction before dispatching any further development batch.
