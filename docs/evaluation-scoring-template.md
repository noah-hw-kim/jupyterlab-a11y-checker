# Blinded scoring template

Status: author-approved October 28, 2026; relationship-coverage and defect 3.3
interpretation clarified November 6, 2026, after held-out collection, during the
first held-out item's review. See the [dated clarification record](../evaluation/scoring/clarifications/2026-11-06-relationship-and-important-content.md).
Use with the [experiment protocol](evaluation-protocol.md).
Fill one form per valid-response job, including no-improvement results. The
packet generator supplies the effective description according to the protocol.
Unavailable requests are recorded automatically, not invented as descriptions.
Keep strategy names, validator results, and run metadata out of the scoring packet.

## Review item

- Scoring ID: `<opaque ID>`
- Case reference: `<image and approved context supplied here>`
- Description to score: `<replacement, retained existing alt, or empty>`
- Required facts: `<copied verbatim from the frozen manifest>`

| Fact | Conveyed? Yes / No / Unsure | Exact supporting words or explanation |
| --- | --- | --- |
| Fact 1: `<reference fact>` | | |
| Fact 2: `<reference fact>` | | |
| Fact 3, if defined: `<reference fact>` | | |
| Fact 4, if defined: `<reference fact>` | | |

Only count defined facts. Equivalent wording counts. A wrong subject or unit does
not satisfy a fact requiring that subject or unit. Use the complete supported
meaning, not keyword matches. Do not add a new criterion because a description
happens to mention more details. Empty text conveys no required facts.

For a reference fact about a trend, comparison, peak, or other relationship,
the description must express the relationship. Equivalent relational wording
counts; no particular keyword is required. For example, "revenue rises from
$12k to $40k" expresses an increase. Listing Q1 through Q5 values alone does
not satisfy an increase fact, even when the increase can be inferred.
This applies wherever a relationship fact appears, not only to facts numbered F3.
Standard unit abbreviations count as stated units: "ms" conveys milliseconds.

## Unsupported factual assertions

List each distinct assertion; if there are none, write `None`. Check against the
image, approved context, and source evidence. A claim need not appear verbatim in
the required facts to be supported. An inferred cause, rate, or time interval
requires evidence. Correct unit conversions are allowed.

| Quoted assertion | Evidence showing it is unsupported/incorrect |
| --- | --- |
| | |

An omitted fact is missing coverage, not an invented claim. Do not count the same
unsupported assertion twice just because it is repeated.

## Other defects for validation analysis

Mark Yes / No / Unsure and quote evidence. These are concrete checks, not an
overall preference score. Review relevant qualities beyond the minimum fact list.

| Defect | Present? | Evidence |
| --- | --- | --- |
| Visual claim conflicts with the image | | |
| Description contradicts approved notebook context | | |
| Important image content is missing | | |
| Wording is unnecessarily repetitive or irrelevant | | |

Word count and the 40-word limit are calculated automatically, independently of
whether the text is unnecessarily verbose. A short description can omit important
content; a longer one can be accurate but violate the configured length limit.
Missing any one reference fact does not automatically mean the whole description
is uninformative: identify the important missing content in the evidence column.

For defect 3.3 (important image content is missing), mark Yes when essential
information is absent or cannot be established from the description. Do not
mark Yes solely because a summary sentence is absent or the reader must make a
straightforward comparison between a few clearly identified values. A short,
complete, ordered sequence can supply sufficient information even without
explicitly summarizing its relationship. A range alone may not: "revenue ranges
from $12k to $40k" does not establish which quarters are higher.

Thus a relationship fact can be No while 3.3 is No: the relationship is not
expressed, but the essential information remains available. Conversely, mark
3.3 Yes if important information is genuinely missing. Do not choose either
mark merely to avoid or create overlap with fact coverage. For complex or
ambiguous presentations, use Unsure and record the specific uncertainty.

## Finalization

- Uncertainties and their resolution: `<evidence note, or None>`
- Reviewer identifier: `<author or second reviewer ID>`
- Finalized date: `<date>`
- All Unsure entries resolved before unblinding: Yes / No

The analysis script derives fact coverage and unsupported-claim counts from these
entries. It derives improvement-decision correctness from the saved model decision
and frozen `shouldImprove`, rather than asking the reviewer to guess the strategy.
The hidden case/strategy mapping is joined only after scores are finalized.

## Development-only example

Reference facts: line chart; quarterly revenue; increases across five quarters.
Description: “Line chart showing quarterly revenue increasing across five quarters.”
All three facts are conveyed: coverage is 3/3. No numeric values are required by
this rubric, so omitting dollar amounts is not a failure. A statement about what
caused the increase would need additional supporting evidence.
