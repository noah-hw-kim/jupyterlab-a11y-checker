# Supplementary format-recovery analysis (heldout-gemini35-v1)

Original execution remains **69/72 valid responses**, **3 format failures**, and **74 requests**. No primary outcome is replaced.

The 3 descriptions were recovered only by removing one surplus closing brace, with no rewritten words or new model requests. This is a separate quality-only comparison. Different denominators can change means; this is not evidence of a new or improved generation.

| Strategy | Primary scored descriptions | Primary mean fact coverage | With recovery: scored descriptions | With recovery: mean fact coverage | Unsupported outputs: primary / recovery view |
| --- | --- | --- | --- | --- | --- |
| minimal | 17 | 43.6% (25/57 facts) | 18 | 43.1% (26/60 facts) | 0/17 / 0/18 |
| fixed-window | 17 | 43.6% (25/57 facts) | 18 | 43.1% (26/60 facts) | 0/17 / 0/18 |
| structure-aware | 17 | 60.8% (34/57 facts) | 18 | 61.1% (36/60 facts) | 0/17 / 0/18 |
| largest-practical | 18 | 51.9% (31/60 facts) | 18 | 51.9% (31/60 facts) | 0/18 / 0/18 |

Fact coverage is averaged per scored description; fact totals are also shown and may yield a different micro-average. Cases with scored descriptions for every strategy: 16 primary, 18 with recovery.

| Strategy | Primary common-case coverage | Same original common cases rechecked | All common cases after recovery |
| --- | --- | --- | --- |
| minimal | 42.2% | 42.2% | 43.1% |
| fixed-window | 42.2% | 42.2% | 43.1% |
| structure-aware | 60.4% | 60.4% | 61.1% |
| largest-practical | 50.0% | 50.0% | 51.9% |

Part B validation decisions, eligibility, costs, and primary reliability metrics are unchanged. A recovered source does not retroactively become eligible in the primary validation experiment.
