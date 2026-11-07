# Evaluation Summary (heldout-gemini35-v1)

- **Split / Total cases:** 18 cases (Common valid cases across all 4 strategies: 16/18)
- **Note:** Descriptive counts and rates from saved experiment artifacts; single-rater strategy-masked evaluation.

## Part A: Primary Quality Metrics

| Strategy | Valid Responses | Required-Fact Coverage | Unsupported Outputs | Unsupported Claims | Detection (TP/TN/FP/FN) | Detection F1 (P / R) |
| --- | --- | --- | --- | --- | --- | --- |
| `minimal` | 17/18 | 43.6% (25/57) | 0/17 (0.0%) | 0 | 6/1/5/0 (12/12) | 0.71 (0.55 / 1.00) |
| `fixed-window` | 17/18 | 43.6% (25/57) | 0/17 (0.0%) | 0 | 6/1/5/0 (12/12) | 0.71 (0.55 / 1.00) |
| `structure-aware` | 17/18 | 60.8% (34/57) | 0/17 (0.0%) | 0 | 6/5/1/0 (12/12) | 0.92 (0.86 / 1.00) |
| `largest-practical` | 18/18 | 51.9% (31/60) | 0/18 (0.0%) | 0 | 6/2/4/0 (12/12) | 0.75 (0.60 / 1.00) |

## Part A: Secondary Efficiency & Validity Metrics

| Strategy | Avg Source Chars | Avg Formatted Chars | Avg Total Tokens | Avg Latency (ms) | Total Requests | Parse Failures | Constraint-Valid (<=40w) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `minimal` | 261 | 261 | 1526 | 1706 | 18 | 1 | 16/16 (100.0%) |
| `fixed-window` | 431 | 557 | 1609 | 5694 | 19 | 1 | 16/16 (100.0%) |
| `structure-aware` | 469 | 561 | 1580 | 4845 | 18 | 1 | 12/12 (100.0%) |
| `largest-practical` | 632 | 810 | 1656 | 5958 | 19 | 0 | 16/16 (100.0%) |

## Part B: Validation Screening Comparison (`structure-aware`)

- **Eligible replacements:** 12 (Excluded: 6)
- **Passes (Human OK, Validator Pass):** 9
- **Problems Flagged (Human Defect, Validator Flagged):** 1
- **Problems Missed (Human Defect, Validator Pass):** 1
- **Correct Suggestions Flagged / False Alarms (Human OK, Validator Flagged):** 1
- **Validator Request/Parse Failures:** 0

| Case | Item | Eligibility | Human Coverage | Human Quality Defect? | Validator Decision | Comparison Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| `case-07` | `ITEM-02` | Eligible | 2/3 | No | `pass` | `pass` |
| `case-08` | `ITEM-43` | Eligible | 2/4 | No | `pass` | `pass` |
| `case-09` | `ITEM-01` | Eligible | 2/3 | No | `pass` | `pass` |
| `case-10` | `ITEM-27` | Eligible | 1/4 | No | `pass` | `pass` |
| `case-11` | `ITEM-51` | Excluded (source-unavailable) | - | - | - | - |
| `case-12` | `ITEM-47` | Eligible | 1/3 | Yes | `pass` | `problem-missed` |
| `case-13` | `ITEM-26` | Eligible | 2/4 | No | `pass` | `pass` |
| `case-14` | `ITEM-67` | Eligible | 3/3 | No | `pass` | `pass` |
| `case-15` | `ITEM-19` | Eligible | 1/3 | Yes | `manual-review` | `problem-flagged` |
| `case-16` | `ITEM-71` | Eligible | 1/3 | No | `pass` | `pass` |
| `case-17` | `ITEM-34` | Eligible | 2/4 | No | `pass` | `pass` |
| `case-18` | `ITEM-44` | Eligible | 2/3 | No | `manual-review` | `correct-suggestion-flagged` |
| `case-19` | `ITEM-37` | Excluded (no-improvement) | - | - | - | - |
| `case-20` | `ITEM-31` | Eligible | 1/4 | No | `pass` | `pass` |
| `case-21` | `ITEM-38` | Excluded (no-improvement) | - | - | - | - |
| `case-22` | `ITEM-33` | Excluded (no-improvement) | - | - | - | - |
| `case-23` | `ITEM-62` | Excluded (no-improvement) | - | - | - | - |
| `case-24` | `ITEM-63` | Excluded (no-improvement) | - | - | - | - |
