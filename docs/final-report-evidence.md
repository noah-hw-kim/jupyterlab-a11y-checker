# Final report evidence map

Use implemented code and finalized results for factual claims.
The project brief describes intended scope; older phase notes describe
historical checkpoints, not necessarily the final implementation.

## Suggested chapter sources

| Report topic | Main source |
| --- | --- |
| Problem and intended contribution | [Project brief](a11ylens-project-brief.md) |
| Setup and author workflow | [Setup and demo](a11ylens-setup-and-demo.md) |
| Notebook adapters and output identity | [Output access architecture](notebook-output-access.md) |
| Benchmark construction | [Benchmark README](../test_files/benchmark/README.md) |
| Experiment settings and retry policy | [Protocol](evaluation-protocol.md) and saved experiment |
| Scoring and dated clarification | [Scoring template](evaluation-scoring-template.md) |
| Results, interpretation, and limitations | [Phase 7 findings](phase7-findings.md) |
| Software and browser verification | [Phase 8 record](a11ylens-implementation-plan.md#phase-8--polish-and-deliver) |
| Offline metric reproduction | [Evaluation README](../evaluation/README.md) |

## Implemented architecture

The extension adapts live notebook cells, identifies image candidates,
selects context, and calls the shared core analysis pipeline.
Generated replacements receive validation before author review.
Only explicit Apply changes the notebook.

| Responsibility | Implementation |
| --- | --- |
| Notebook representation | `packages/core/src/types.ts`; `packages/extension/src/adapter.ts` |
| Context selection and formatting | `packages/core/src/utils/context-selection.ts`; `context-formatting.ts` |
| Analysis orchestration | `packages/core/src/utils/semantic-orchestrator.ts` |
| Provider requests | `packages/core/src/utils/semantic-model-client.ts`; `semantic-model-request.ts` |
| Suggestion validation | `packages/core/src/utils/semantic-validation.ts` |
| Author review | `packages/extension/src/components/imageReviewWidget.ts` |
| Exact Markdown application | `packages/extension/src/semantic-image-review.ts` |
| Output metadata and restoration | `packages/extension/src/output-alt.ts`; `output-alt-restoration.ts` |

The CLI shares core functionality but is not the implemented interactive
A11yLens review interface. The browser calls the configured model endpoint
directly; this project does not introduce a backend proxy.

## Reporting boundaries

- Distinguish inherited checker features from the A11yLens contribution.
- Distinguish 24 benchmark cases, 18 held-out cases, 72 generation jobs,
  and 74 generation HTTP requests.
- Primary results contain 69 valid responses and three format failures.
  Supplementary recovery adds content scores, not API successes.
- Coverage percentages are averages of per-case coverage fractions.
- Higher observed coverage supports a result on this benchmark, not
  universal superiority or demonstrated accessibility usability.
- Zero recorded unsupported claims does not establish hallucination
  reduction: every strategy had zero recorded unsupported claims.
- Browser checks were author-reported. Fresh-clone installation remains
  unverified.
- Preserve the disclosed scoring assistance and dated rubric clarification.
