# Evaluation Summary (dev-gemini35-v2)

- **Split / Total cases:** 6 cases (Common valid cases across all 4 strategies: 6/6)
- **Note:** Descriptive counts and rates from saved experiment artifacts; single-rater strategy-masked evaluation.

## Part A: Primary Quality Metrics

| Strategy | Valid Responses | Required-Fact Coverage | Unsupported Outputs | Unsupported Claims | Detection (TP/TN/FP/FN) | Detection F1 (P / R) |
| --- | --- | --- | --- | --- | --- | --- |
| `minimal` | 6/6 | 88.9% (16/18) | 0/6 (0.0%) | 0 | 2/2/0/0 (4/4) | 1.00 (1.00 / 1.00) |
| `fixed-window` | 6/6 | 88.9% (16/18) | 0/6 (0.0%) | 0 | 2/1/1/0 (4/4) | 0.80 (0.67 / 1.00) |
| `structure-aware` | 6/6 | 94.4% (17/18) | 0/6 (0.0%) | 0 | 2/2/0/0 (4/4) | 1.00 (1.00 / 1.00) |
| `largest-practical` | 6/6 | 88.9% (16/18) | 0/6 (0.0%) | 0 | 2/1/1/0 (4/4) | 0.80 (0.67 / 1.00) |

## Part A: Secondary Efficiency & Validity Metrics

| Strategy | Avg Source Chars | Avg Formatted Chars | Avg Total Tokens | Avg Latency (ms) | Total Requests | Parse Failures | Constraint-Valid (<=40w) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `minimal` | 87 | 87 | 1429 | 1716 | 6 | 0 | 4/4 (100.0%) |
| `fixed-window` | 257 | 383 | 1514 | 1066 | 7 | 0 | 5/5 (100.0%) |
| `structure-aware` | 208 | 305 | 1483 | 1199 | 6 | 0 | 4/4 (100.0%) |
| `largest-practical` | 366 | 544 | 1555 | 2109 | 7 | 0 | 5/5 (100.0%) |

## Part B: Validation Screening Comparison (`structure-aware`)

- **Eligible replacements:** 4 (Excluded: 2)
- **Passes (Human OK, Validator Pass):** 2
- **Problems Flagged (Human Defect, Validator Flagged):** 0
- **Problems Missed (Human Defect, Validator Pass):** 1
- **Correct Suggestions Flagged / False Alarms (Human OK, Validator Flagged):** 1
- **Validator Request/Parse Failures:** 0

| Case | Item | Eligibility | Human Coverage | Human Quality Defect? | Validator Decision | Comparison Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| `case-01` | `ITEM-08` | Eligible | 3/3 | No | `manual-review` | `correct-suggestion-flagged` |
| `case-02` | `ITEM-11` | Eligible | 3/3 | No | `pass` | `pass` |
| `case-03` | `ITEM-23` | Eligible | 3/3 | No | `pass` | `pass` |
| `case-04` | `ITEM-09` | Eligible | 2/3 | Yes | `pass` | `problem-missed` |
| `case-05` | `ITEM-01` | Excluded (no-improvement) | - | - | - | - |
| `case-06` | `ITEM-02` | Excluded (no-improvement) | - | - | - | - |
