# A11yLens Implementation Plan (Beginner-Friendly)

> [!NOTE]
> This document rewrites the original `a11ylens-implementation-plan.md` so that each phase is understandable and actionable for an entry-level developer. The *scope* and *goals* are unchanged — only the explanation is clearer.

> [!NOTE]
> **Schedule revised (Sep 30, 2026):** Work started Oct 1 instead of Sep 24 (start slipped). Phases 2–6 trimmed to 6 days and Phase 8 to 8 days to protect the 10-day experiment window. The Nov 21 deadline is unchanged.

> [!NOTE]
> **Midterm milestone added (Oct 3, 2026):** The midterm report is due October 23. Report drafting runs alongside development, with a complete draft by October 19 and target submission October 22. Reserve October 20–22 for report review and submission. The November 4–13 experiment window and November 21 final deadline remain unchanged.

---

## What is this project?

You are extending an **existing** JupyterLab accessibility checker (`jupyterlab-a11y-checker`) with a new feature called **A11yLens**.

### What already exists

The checker already:
- Parses Jupyter notebooks (both `.ipynb` files and live JupyterLab notebooks).
- Detects **structural** accessibility problems using rules — e.g., "this image has no alt text", "heading levels skip from h1 to h3."
- Shows the findings in the JupyterLab sidebar and in a CLI.
- Has 52 passing tests, three packages (`core`, `extension`, `cli`), and working AI-assisted alt-text generation via an OpenAI-compatible API.

### What you are adding

A11yLens adds **context-aware, AI-assisted image alt-text analysis**. In plain English:

1. **Find images** — in Markdown cells and in code-cell outputs (e.g., matplotlib plots).
2. **Gather notebook context** — headings, nearby text, related code — not just the image itself.
3. **Ask an AI model** — "Is this alt text good? If not, suggest a better one."
4. **Validate the suggestion** — check it isn't hallucinated or too long *before* showing it to the user.
5. **Let the author decide** — show the suggestion in JupyterLab; the user accepts, edits, or rejects it. Nothing is auto-applied.

### The research question

> Does giving the AI model *notebook context* (headings, surrounding text, code) produce better alt-text suggestions than giving it the image alone?

You will answer this by running a controlled experiment with 24 test cases across four context strategies.

### Deadlines

- **Midterm report:** October 23, 2026; target submission October 22.
- **Final delivery:** November 21, 2026.

Dates per development phase are targets; you advance when the phase's checklist ("gate") is done, not when a calendar date arrives. Submit the midterm on time with an accurate account of progress even if a development gate is unfinished.

---

## How the phases fit together

```
Phase 1  Set up contracts & prove the AI model works at all
Phase 2  Find all the images in a notebook (the "candidates")
Phase 3  Wire up the simplest end-to-end flow: image → AI → suggestion in UI
Phase 4  Build four different ways to select notebook context
Phase 5  Add quality checks on the AI's output (validation)
Phase 6  Build the full JupyterLab review UI (accept / edit / reject)
Phase 7  Run the experiment and collect results
Phase 8  Fix bugs, write documentation, deliver everything
```

Each phase builds on the one before it. **Do not skip ahead.**

Report writing runs in parallel with these development phases. Describing a planned feature in the report does not require implementing it early; clearly distinguish proposed design, completed implementation, and observed results.

---

## Midterm Report — October 23 Submission

**Goal:** Submit a report in the department's final-report format, with every intended chapter and substantive preliminary content. The supplied midterm instructions explicitly allow incomplete results; they require a credible path to completing the approved proposal. **No midterm presentation is required.**

### Requirements and items to clarify

- Obtain the department's current Master's Project Guidelines and Appendix F approval-cover template. Use the final-report cover, not the proposal cover; verify layout and other formatting rules against those documents.
- Include all intended chapter and section titles, with a matching table of contents. Include the required lists of tables, figures, and appendices as applicable.
- Provide meaningful content in every chapter. For unfinished work, explain its purpose, planned approach, acceptance criteria, and scheduled completion instead of leaving only “TBD.”
- Explain how the work follows the approved proposal. Distinguish the existing checker and published work from your own A11yLens contribution, with citations where claims and comparisons appear.
- Use consistent references, original writing, careful reasoning, and checked grammar/spelling. Do not present proposed behavior or expected experiment outcomes as observed results.
- The stated late penalty is **−1 per day**. Confirm the submission method and exact cutoff time from the course instructions.
- **Page count is pending instructor clarification.** The general policy mentions a 30-page minimum and a recommended maximum of 100, but its application to the midterm and which pages count are unclear. Ask whether the minimum applies and whether front matter, references, and appendices count. Record the answer and budget writing time accordingly; do not assume an exemption or pad the report.

### Writing schedule and development tradeoff

| Dates (2026) | Report milestone |
|-------------|------------------|
| October 3–7 | Obtain the required template, clarify page count, and create the cover, front matter, full ToC, and every intended chapter/section heading. |
| October 8–16 | Draft every chapter alongside Phases 2–3. Incorporate Phase 1 evidence, requirements, architecture, related-work comparison, and current implementation/tests. |
| October 17–19 | Complete the first full draft. Add available Phase 4 progress, figures, citations, and a realistic remaining-work schedule. |
| October 20–21 | Prioritize report review: technical accuracy, proposal alignment, formatting, citations, grammar, and ToC consistency. |
| October 22 | Check the exported PDF, submit, and retain submission confirmation. |
| October 23 | Official deadline; contingency time, not the planned first submission. |

Reserve writing time throughout October 3–19; it is part of the workload, not an extra task after coding. A tested **Phase 3 end-to-end flow** is the recommended software milestone for the midterm, not an instructor-mandated completion threshold. Report whatever is actually verified.

At the October 16 checkpoint, compare remaining Phase 4 work with the writing workload. October 20–22 are reserved for report completion, so Phase 4's October 17–22 target has reduced development capacity. If it cannot fit, explicitly revise the remaining development dates and report the unfinished work; do not silently skip a gate or claim all strategies are complete. Protect the November 4–13 experiment window and November 21 deadline, and raise any forecast conflict early.

### Report structure and midterm content

Follow the department's exact formatting requirements when the guidelines are available. Use this chapter structure, based on the supplied development-project example:

| Report section | Content to prepare for the midterm |
|----------------|-----------------------------------|
| Front matter | Required approval cover; short abstract reflecting current progress; keywords; ToC; applicable lists of tables, figures, and appendices. |
| **1. Introduction** | **1.1 Description of the Problem; 1.2 Project Objectives; 1.3 Development Environment; 1.4 Operational Environment.** Describe actual software/hardware, scope, research question, and context from related work. |
| **2. Requirements Description** | External functions and interfaces; supported images; alt-text presence versus quality; author review; failure behavior; acceptance criteria. |
| **3. Design Description** | Architecture diagram, package boundaries, internal functions/interfaces, candidate-to-review flow, context selection, and planned validation. Mark proposed components clearly. |
| **4. Implementation** | Source-file organization and a reference list of important files/functions; current implementation status; your additions versus inherited behavior; remaining work and schedule. |
| **5. Test and Integration** | Test plan and available results; Phase 1 feasibility evidence; development cases; integration approach; planned held-out experiment, metrics, and limitations. Keep future results explicitly pending. |
| **6. Installation Instructions** | Reproducible setup/build/configuration steps for the current version, with planned additions identified and credentials excluded. |
| **7. Operating Instructions** | Current user workflow and useful screenshots; label unimplemented A11yLens interactions as planned. |
| **8. Recommendations for Enhancement** | Extensions beyond required scope. Required unfinished work belongs in Chapter 4's remaining-work schedule. |
| **9. Bibliography** | Consistently formatted references cited in the main text, including relevant publications and existing software. |
| Appendices, as needed | Supporting benchmark annotations, test details, or other evidence referenced from the main text. |

### Midterm submission gate

- [ ] Department guidelines and the correct final-report cover have been checked.
- [ ] The instructor's page-count clarification is recorded and followed.
- [ ] Front matter, every intended chapter/section, and applicable appendices are present; headings match the ToC.
- [ ] Every chapter has substantive preliminary content; completed, in-progress, and planned work are clearly distinguished.
- [ ] The report explains proposal alignment, the existing-work comparison, and the student's own contribution.
- [ ] Current claims/results have supporting evidence; the remaining schedule explains how final delivery will be achieved.
- [ ] References and in-text citations are consistent; grammar, spelling, figures, tables, and PDF formatting have been reviewed.
- [ ] The report was submitted by the deadline and confirmation retained. Submit the best available version on time even if another checklist item remains unresolved.

After submission, record each advisor comment with its planned correction and resolution. Explain any comment that cannot be addressed. Incorporate feedback as development continues, respond promptly to instructor correspondence, and update the report with Phase 5–7 evidence; Phase 8 finalizes the report rather than starting it.

---

## Phase 1 — Set Up and Prove Feasibility

**Target dates:** October 1–4  
**One-sentence goal:** Make sure the AI model works, verify access to notebook outputs, and create your first test cases.

### Why this phase exists

Before writing any real feature code, you need to confirm three things:
1. The AI model you plan to use actually accepts images and returns structured JSON.
2. You can access notebook outputs (like plot images) from the code you'll write.
3. You have concrete examples to develop and test against.

### What to do, step by step

#### 1. Preview core interfaces (roadmap — read, don't implement yet)

Review this table as a high-level map of where the project is heading. We follow a **just-in-time** strategy: we will define each interface in the specific phase where it is first needed so the reason for each field is concrete and clear.

| Interface | Purpose | Defined & Used In |
|-----------|---------|-------------------|
| `IImageCandidate` | Describes one image found in a notebook | Phase 1 (defined), Phase 2 (populated) |
| `IModelClient` | How the app talks to any AI model | Phase 3 (Minimal E2E) |
| `ISemanticResult` | The AI's judgment about an image's alt text | Phase 3 (Minimal E2E) |
| `IContextPackage` | Describes the notebook context selected for one image | Phase 4 (Context Strategies) |
| `IValidationResult` | Quality check on a suggestion | Phase 5 (Validation) |
| `IEvaluationCase` | One test case for the final experiment | Phase 5 (Benchmark freeze) |
| `IEvaluationRecord` | Recorded result of running one test case | Phase 7 (Experiment) |

> [!TIP]
> `IImageCandidate`, `ImageSourceType`, and `AltTextState` are already defined in `packages/core/src/types.ts`. Do not add the remaining interfaces (`IModelClient`, `ISemanticResult`, etc.) yet — define each one step by step as we build the feature that requires it.

#### 2. Confirm the AI model works

You're using a **Berkeley-hosted OpenAI-compatible multimodal model** (like Qwen or Gemma served via an OpenAI-compatible API).

- Make **one** test API call from a throwaway script (not committed to the repo).
- Send it a sample image and ask for a structured JSON response.
- Confirm it returns something parseable.
- **Do not commit API keys or real notebook content.**

#### 3. Check that you can access code-cell outputs

In JupyterLab, when a code cell runs `plt.show()`, the plot image is stored as a **base64-encoded PNG** inside the cell's `outputs` array (under `display_data` or `execute_result` with MIME type `image/png`).

- Verify you can read these output images from:
  - A raw `.ipynb` file (JSON — look at `cells[i].outputs`).
  - The live JupyterLab DOM/API.
- Document how you'll access them in each adapter.

#### 4. Create 6 development test cases

Build 6 small notebook examples by hand:

| # | Alt-text state | Example |
|---|----------------|---------|
| 1 | Missing | `<img src="sales_chart.png">` — HTML tag with no alt attribute at all |
| 2 | Empty | `![](sales_chart.png)` — Markdown brackets with empty alt string |
| 3 | Weak | `![graph](sales_chart.png)` — Markdown alt is "graph" (too generic) |
| 4 | Weak | Code cell output plot with stored metadata (`a11y_metadata.altText: "histogram"`) |
| 5 | Acceptable | `![Line chart showing quarterly revenue increasing steadily across five quarters.](sales_chart.png)` |
| 6 | Acceptable | Code cell output plot with stored descriptive metadata (`a11y_metadata.altText: "Bar chart..."`) |

For each case, write down:
- **Evidence:** What's in the image? What does the surrounding notebook say?
- **Required facts:** 2–4 facts a good alt text *must* mention (e.g., "chart type", "what the axes show").
- **Prohibited claims:** Things the AI should *not* say (e.g., inventing specific numbers not in the image).
- **Expected judgment:** Should the system flag this as needing improvement? (`shouldImprove: true/false`)

### ✅ Phase 1 is done when

- [x] One live AI API call succeeded (in a throwaway script, not committed).
- [x] You've demonstrated reading code-cell output images from a `.ipynb` file.
- [x] All 6 development cases have written-down reference annotations.
- [x] No API keys or sensitive content are in the repo.

---

## Phase 2 — Find All Images in a Notebook

**Target dates:** October 5–10  
**One-sentence goal:** Build the code that scans every cell in a notebook and produces a list of `IImageCandidate` objects.

### Why this phase exists

Before the AI can analyze an image, you need to *find* all the images. Images can appear in three places in a Jupyter notebook:

1. **Markdown cells** — `![alt](url)` or `<img src="..." alt="...">` tags.
2. **Cell attachments** — images pasted directly into Markdown cells (stored as base64 in the cell's `attachments` field).
3. **Code-cell outputs** — plots generated by code (stored as `image/png` or `image/jpeg` in the cell's `outputs` array).

### What to do, step by step

#### 1. Extend `IGeneralCell` to include outputs

The existing [`IGeneralCell`](../packages/core/src/types.ts) interface only has `cellIndex`, `type`, `source`, and `attachments`. You need to add an optional `outputs` field so that code-cell outputs (images) are available.

```typescript
export interface IGeneralCell {
  cellIndex: number;
  type: "markdown" | "code" | "raw";
  source: string;
  attachments?: { [key: string]: { [mimeType: string]: string } };
  outputs?: ICellOutput[];  // ← ADD THIS
}
```

**Important:** Adding an optional field won't break any existing callers, because they simply won't use it.

#### 2. Update both notebook adapters

The project has two ways of reading notebooks:
- **Raw adapter** — reads a `.ipynb` JSON file directly (used by CLI).
- **JupyterLab adapter** — reads from the live JupyterLab notebook model (used by the extension).

Both need to populate the new `outputs` field when converting cells to `IGeneralCell`.

#### 3. Build the image-candidate extractor

Write a function that takes an array of `IGeneralCell` objects and returns an array of `IImageCandidate` objects. For each cell:

- **Markdown cells:** Parse the source text. Find `![alt](url)` patterns and `<img>` tags. For each one, record:
  - Cell index
  - Source kind: `"markdown-inline"` or `"markdown-html"`
  - Existing alt text (might be empty or missing)
  - Character offset in the source (so you can edit it later)
  - MIME type (if determinable)

- **Code cells:** Look at each output. Find `image/png` and `image/jpeg` data. For each one, record:
  - Cell index
  - Output index (a cell can have multiple outputs)
  - Source kind: `"code-output"`
  - MIME type
  - A hash of the image data (so you can detect when the image changes later)
  - Existing alt text: read a valid stored description for this output, when available. Metadata associated with a different image must not be reused.
  - Alt state: `"missing"` when no valid stored description exists, `"empty"` when the stored description is an empty string, or `"present"` when it is nonempty. This records presence only; semantic analysis later assesses whether a present description is weak or acceptable.

- **Attachments:** Handle `attachment:filename.png` references in Markdown cells.

> [!IMPORTANT]
> A single cell can contain **multiple images** (e.g., a Markdown cell with three `<img>` tags, or a code cell that produces two plots). Each one is a separate `IImageCandidate`.

#### 4. Reuse existing scanners

The project already has image-detection code in [`packages/core/src/detection/category/image.ts`](../packages/core/src/detection/category/image.ts). **Don't rewrite it** — extend or call it. The existing code already finds missing alt text; you're adding the ability to also capture the image data and handle code outputs.

#### 5. Write tests

Add tests that verify:
- Markdown images are found (with correct alt text and offsets).
- HTML `<img>` tags are found.
- Attachment-based images are found.
- Code-cell output images are found (PNG, JPEG).
- Multiple images in one cell each get their own candidate.
- Cells with no images produce no candidates.
- The existing 52 core tests still pass.

### ✅ Phase 2 is done when

- [x] `IGeneralCell` has the `outputs` field; existing code still compiles and passes.
- [x] Both adapters populate outputs.
- [x] Candidate extraction finds Markdown images, attachments, and code-output images.
- [x] Multiple images per cell are distinguished.
- [x] New tests pass; existing 52 tests still pass.

---

## Phase Delivery Levels

For Phases 3–8, work in this order:

1. **Working minimum:** implement the required behavior using existing components where practical.
2. **Focused verification:** check normal use, important failure paths, and regressions that could invalidate the feature or experiment. This belongs in the required gate; do not claim untested behavior works.
3. **Additional coverage:** add cases when the acceptance fixtures, experiment, or observed failures require them. It does not mean exhaustive coverage of every format or environment.
4. **Optional enhancements:** use the backlog below; these do not block a phase or final delivery unless explicitly promoted into required scope.

The checklists below are required functional gates, not comprehensive product-hardening checklists. Required functionality is not optional merely because its implementation or tests are deferred to a later phase. Do not expand a gate without an explicit scope decision.

## Phase 3 — Minimal End-to-End Flow

**Target dates:** October 11–16  
**One-sentence goal:** Wire everything together so that *one image* goes through: candidate → context → AI call → recommendation displayed in JupyterLab.

### Why this phase exists

This is the "vertical slice" — the minimum path to prove the whole pipeline works. You'll use only **minimal context** (just the image and the current cell's text) and a simple UI display. Phases 4–6 will make it smarter, more robust, and prettier.

### Scope boundary and completion chunks

Build the minimum working flow with clear boundaries, then expand it in the phase that owns the additional behavior. Correct image selection, structured-response validation, accurate call metadata, visible failure messages, loading cleanup, and no automatic notebook edits belong in Phase 3. Exhaustive source-format coverage and a polished review interface do not.

Keep the existing candidate, model-client, and orchestrator boundaries. Browser/JupyterLab file access belongs in an extension resolver passed through `resolveImageDataUrl`; reuse the notebook context's URL resolver rather than constructing server file URLs manually. Complete and review these chunks as units:

1. **Prove one local Markdown image end to end.** Finish the browser image resolver, connect it to the image suggestion widget, and verify that a real provider response appears as editable suggestion text. Use only the image and its current cell's text. Keep status messages separate from replacement alt text.
2. **Meet the required image coverage.** Select a small development notebook as the Phase 3 acceptance fixture: two Markdown images in one cell and a PNG code output. Provide the minimum selection/display path needed to analyze each image separately. Reuse existing development assets where suitable; do not use the held-out experiment cases for debugging or prompt tuning.
3. **Verify the completion gate and stop expanding scope.** Check the correct image is sent, provider and image-loading failures leave structural findings visible, loading always clears, notebook content is not automatically changed, and per-call metadata is available for inspection. Record the fixture, checks, and observed results before marking the gate complete. Add focused tests for important regression risks and failures found during integration.

The first chunk is an intermediate milestone, not completion of Phase 3. The Markdown/code-output and multi-image requirements below remain in force. Generation/evaluation routing must remain covered; the current missing-alt-text findings alone do not establish a user path for evaluating existing alt text.

**Defer explicitly:** four context strategies to Phase 4; semantic-quality validation to Phase 5 (automatic revision is optional); the full accept/edit/reject interface, persistent code-output alt text, and rendered-output application to Phase 6. Optional remote-host support, unusual URL/path variants, additional image formats, and handling edits during an in-flight AI request should not expand Phase 3 unless needed by the acceptance fixture or approved requirements. Unsupported sources must fail visibly rather than target another image.

Use the October 16 checkpoint to compare this bounded remaining work with the midterm writing workload. If the gate cannot fit, revise the forecast explicitly and report verified progress; do not silently drop completion criteria or displace the October 20–22 report review/submission period or November 4–13 experiment window.

### What to do, step by step

#### 1. Implement `IModelClient` with one real provider

Create a class like `OpenAICompatibleModelClient` that implements `IModelClient`.

- It takes the API endpoint URL and API key from settings (not hardcoded).
- It constructs an OpenAI-compatible chat-completion request with:
  - A system prompt explaining the task.
  - The image (as base64).
  - The existing alt text (if any).
  - The current cell's source text.
- It asks for a **structured JSON response** matching `ISemanticResult`.
- It parses the response and returns a typed result.

> [!WARNING]
> **Treat the AI's response as untrusted input.** Always validate that the JSON has the expected fields and types. If parsing fails, return an error — don't crash.

#### 2. Implement routing logic

Different alt-text states need different handling:

```
If alt text is MISSING or EMPTY:
  → Skip semantic analysis (we already know it's bad)
  → Go straight to remediation (ask AI to generate alt text)

If alt text EXISTS but might be weak:
  → Ask AI to evaluate it and include a replacement when needed
  → concern=true → return the suggestion in the same structured response
  → concern=false → no replacement needed
```

#### 3. Record metadata about each AI call

For every AI request, save:
- Which context strategy was used (for now, always "minimal").
- Which cells were included.
- Input size (character count).
- Model name and settings (temperature, etc.).
- Response latency (how many milliseconds).
- Number of API requests made.
- Whether it succeeded or failed.

This data is needed for the Phase 7 experiment. In Phase 3, make metadata inspectable and record the effective model settings without credentials; a persistent history UI, database, or export system is not required. Phase 7 adds the durable experiment records.

#### 4. Display one recommendation in JupyterLab

You don't need fancy UI yet. Just show the recommendation somewhere visible — e.g., in the existing findings panel. It should show:
- The image that was analyzed.
- The AI's concern / suggestion.
- **Do NOT auto-apply it.** Just display it.

#### 5. Verify with a multi-image notebook

Test with a notebook that has at least 2–3 images (some in Markdown, some as code outputs). Confirm each image gets its own recommendation.

### ✅ Phase 3 is done when

- [ ] A real notebook image → gets sent to the AI → returns a structured recommendation → displays in JupyterLab.
- [ ] Multi-image cases work (each image analyzed separately).
- [ ] No notebook content is automatically changed.
- [ ] If the AI call fails, existing structural findings (like "missing alt text") still appear.
- [ ] Metadata (latency, input size, etc.) is recorded for each call.

---

## Phase 4 — Build Four Context Strategies

**Target dates:** October 17–22  
**One-sentence goal:** Implement four different ways to select which notebook content gets sent to the AI along with the image.

### Why this phase exists

This is **the core research question** of the project. You want to compare whether giving the AI more (or smarter) context produces better alt-text suggestions. You need four strategies to compare:

### Working minimum, verification, and deferrals

Implement minimal and structure-aware selection first to exercise the shared pipeline, then add fixed-window and largest-practical baselines before closing this phase. All four remain required comparison strategies. Functions and a small shared output type are sufficient; do not build a strategy plugin framework.

Use one configurable character budget and deterministic priority rules. Preserve current-cell context first, include eligible context up to the limit, and record omissions/truncation. State the supported notebook/image representation. Do not add tokenizer integration, advanced relevance scoring, dependency tracing, or a context-inspection UI.

Focused verification covers a representative result for each strategy, first/last-cell window boundaries, section boundaries, and an exceeded budget. Add more cases for observed failures or benchmark needs, not to achieve an arbitrary coverage percentage.

### The four strategies

#### 1. Minimal Context
Send the AI **only**:
- The image itself.
- The current cell's source text.

*This is your baseline — the simplest possible approach.*

#### 2. Fixed-Window Context
Send the AI:
- The image itself.
- The current cell.
- **2 cells before** and **2 cells after** (regardless of what they contain).

*This is a "dumb" approach — it doesn't consider notebook structure.*

#### 3. Structure-Aware Context ⭐ (this is your main contribution)
Send the AI:
- The image itself.
- The current cell.
- The **nearest section heading** above this cell.
- Up to **2 nearby Markdown cells** in the same section.
- The **code that produced** this image (for code outputs), or **nearby code** (for Markdown images).

*This approach uses the notebook's logical structure to pick relevant context.*

#### 4. Largest-Practical Context
Send the AI:
- The image itself.
- **As many notebook cells as fit** within the model's context window.

*This tests whether "more is better" — maybe just sending everything works fine.*

### What to do, step by step

#### 1. Define a common interface

All four strategies should produce the **same output type** — an `IContextPackage`. This means downstream code doesn't need to know which strategy was used.

```typescript
interface IContextStrategy {
  readonly id: string;  // e.g., "minimal", "fixed-window", "structure-aware", "largest-practical"
  selectContext(candidate: IImageCandidate, cells: IGeneralCell[]): IContextPackage;
}
```

#### 2. Implement each strategy

Each strategy is a function/class that takes a candidate + the full cell list and returns an `IContextPackage` with:
- Which cells were selected (by index).
- Why each cell was selected (e.g., "section heading", "same-section markdown").
- Whether anything was truncated to fit the budget.
- Total input size in characters.

#### 3. Respect context budgets

Each strategy has a **character budget** (configurable). If the selected content is too long:
- Keep the highest-priority content (the image and current cell).
- Truncate or drop lower-priority content.
- Record what was truncated.

Don't hardcode the budget — it depends on the model you use. Start with a reasonable default after checking the model's limits.

#### 4. Write deterministic tests

These tests don't need the AI model. They verify:
- Minimal strategy returns only the current cell.
- Fixed-window returns the correct 5-cell window (handling edge cases like cell 0 or the last cell).
- Structure-aware finds the right heading, nearby Markdown, and associated code.
- Largest-practical includes cells in order up to the budget.
- All strategies respect the budget and truncate gracefully.
- All strategies return a valid `IContextPackage`.

### ✅ Phase 4 is done when

- [ ] All four strategies are implemented.
- [ ] They all produce `IContextPackage` objects.
- [ ] Context budgets are respected; truncation drops low-priority content first.
- [ ] Deterministic unit tests pass for all four strategies.
- [ ] Switching strategy doesn't break any other part of the pipeline.

---

## Phase 5 — Validate AI Suggestions

**Target dates:** October 23–28  
**One-sentence goal:** Add quality checks so bad AI suggestions get caught before the user sees them.

### Why this phase exists

AI models sometimes produce bad output: hallucinated numbers, overly long text, missing fields, or claims not supported by the image. Validation catches these problems.

### Two types of validation

#### Type 1: Deterministic validation (code-based checks)

Reuse the parsing, field/type, and nonempty-suggestion checks implemented in Phase 3; do not rebuild a second parser. Add the configured length check and a validation outcome that the UI can display:

| Check | Example failure |
|-------|----------------|
| Required JSON fields exist | AI returned `{}` with no `suggestion` |
| Types are correct | `suggestion` is a number instead of a string or null |
| Suggestion is not empty when concern is true | `suggestion: ""` |
| Suggestion can be parsed | Response isn't valid JSON |
| Configured word limit (initially 40) | Suggestion exceeds that limit |

#### Type 2: Model-assisted validation (AI checks AI)

Use a **separate AI call** (same model, different prompt) to check:

| Check | What it catches |
|-------|----------------|
| Groundedness | "Does the suggestion describe things actually visible in the image?" |
| Context consistency | "Does the suggestion match the surrounding notebook content?" |
| Informativeness | "Does the suggestion convey the key message of the image?" |
| Conciseness | "Is the suggestion unnecessarily wordy?" |
| Unsupported claims | "Does the suggestion state specific numbers or facts not in the image?" |

#### Validation outcomes

The working minimum uses one separate validation request and two outcomes:

- **`pass`** — Passed the configured checks; still subject to author review, not a guarantee of accuracy.
- **`manual-review`** — Flag the suggestion for additional author review. Malformed output is an error, not a valid suggestion; validator failure must not be reported as a pass.

Automatic revision is optional. If added later, introduce a `revise` state and allow at most one regeneration/validation cycle. No retry machinery is needed to close this phase.

Focused verification covers a valid suggestion, malformed output using the existing parser tests, a length violation, a failed quality judgment, and a validator request failure. Use mocks for repeatable behavior and a development-case provider smoke check; do not tune on held-out results.

### Also in this phase: freeze the benchmark

Expand your 6 development cases to **24 total cases** for the final experiment:

| Category | Count |
|----------|-------|
| Missing/empty alt text | 8 |
| Weak alt text | 8 |
| Acceptable alt text | 8 |

Additional requirements:
- 12 should be Markdown images, 12 should be code-output images.
- At least 12 should be "context-sensitive" (where surrounding notebook context matters).
- 6 are your development cases (used to build/debug); 18 are **held-out** (never used for tuning).

> [!IMPORTANT]
> **Freeze the 18 held-out cases now.** Do not look at how the AI performs on them. Do not tweak prompts to make them score better. They are your unbiased test set.

### ✅ Phase 5 is done when

- [ ] Deterministic validation catches malformed/empty/too-long suggestions.
- [ ] Model-assisted validation runs once as a separate AI call and returns pass/manual-review; failures never become passes.
- [ ] Validation outcomes and failures are recorded; the default flow does not regenerate suggestions.
- [ ] All 24 benchmark cases are finalized with reference annotations.
- [ ] The 18 held-out cases are frozen and untouched.

---

## Phase 6 — Complete the Minimal JupyterLab Author Review Flow

**Target dates:** October 29 – November 3  
**One-sentence goal:** Build the user interface where notebook authors review, edit, accept, or reject AI suggestions.

### Why this phase exists

Extend the simple suggestion display built in Phase 3. Reuse the existing input, Apply button, and findings panel rather than building a new review application.

The working minimum lets authors request analysis for images with existing alt text as well as missing/empty alt text, see the outcome, edit a suggestion, explicitly apply it, or dismiss it without changing the notebook. The current missing-alt finding list alone does not provide the existing-alt evaluation entry point.

Accept and Edit may use the same editable input plus Apply; Reject may be a simple dismissal control. Separate buttons, custom visual badges, batch review, recommendation history, and persistence of rejected suggestions are optional. Keep ordinary keyboard operation, visible status, and structural findings available.

### What the UI should show

For each image finding, display:

| Element | Description |
|---------|-------------|
| **Finding type** | Plain text distinguishing structural findings from AI recommendations; decorative badges are optional |
| **Current alt text** | What the image's alt text is right now |
| **Concern** | Whether improvement is recommended; a generated prose explanation is optional and does not require expanding the model schema |
| **Suggestion** | The AI's proposed new alt text |
| **Validation status** | pass / manual-review in plain text; icons and revision states are optional |

### User actions

| Button | What it does |
|--------|-------------|
| **Accept** | Apply the AI's suggestion to the notebook |
| **Edit** | Let the user modify the suggestion, then apply |
| **Reject** | Dismiss the recommendation (keep current alt text) |

### Critical rules

1. **Never auto-apply.** The user must click Accept or Edit.
2. **Structural findings stay separate.** If the AI is down, the user still sees "missing alt text" structural violations.
3. **Keyboard accessible.** The entire review flow must work without a mouse.

### Handling code-output images

Code-output images (like matplotlib plots) are special — you can't add alt text to them by editing source code. Instead:

- Store the accepted alt text in **cell metadata** (a JSON field attached to the cell), keyed by:
  - Output index
  - MIME type
  - Image content hash
- While A11yLens is active, apply this stored alt text to the rendered `<img>` element in the DOM.
- If the user re-runs the code cell and the output changes (different hash), **reject stale alt text for that output**. Automatic deletion of old metadata is optional; never apply it to changed image data.

### ✅ Phase 6 is done when

- [ ] AI recommendations display separately from structural violations.
- [ ] Authors can request evaluation of existing alt text and accept, edit, or reject a recommendation using simple controls.
- [ ] Nothing is auto-applied to the notebook.
- [ ] The entire review flow works with keyboard only.
- [ ] Code-output alt text is stored in cell metadata and applied to the DOM.
- [ ] Stale metadata is rejected when outputs change.
- [ ] Accepted code-output alt text survives save/reopen and is applied only to matching image data. Persisting recommendation history is optional.

Focused verification is one Markdown review/application, one existing-alt evaluation, one code-output metadata round trip, rejection of a changed output, and a keyboard walkthrough. These check required behavior; broad UI automation and visual polish do not block the phase.

---

## Phase 7 — Run the Experiment

**Target dates:** November 4–13  
**One-sentence goal:** Use your 24 test cases to answer the research question: does structure-aware context help?

### Working minimum and optional infrastructure

Use a straightforward script and saved JSON/JSONL records, plus a scoring sheet or small analysis script. Reuse the shared semantic pipeline. Do not build a dashboard, database service, job scheduler, or multi-provider evaluation platform.

Keep the agreed 24 cases (6 development, 18 held-out), four comparison strategies, blinded scoring, and validation comparison. Freeze case annotations and experiment configuration before held-out generation. Save raw outputs and failures, and regenerate reported metrics from saved records without new model calls. Small development-only trial runs can check the runner before the held-out run.

Optional additions include repeated trials, more models/providers, parameter sweeps, advanced plots, and formal statistical testing. They must not displace the required runs, scoring, or report.

### The experiment has two parts

#### Part A: Context comparison (the main experiment)

**Setup:**
- Use **one** model, **one** prompt, **one** temperature setting, **one** image format.
- The **only thing that changes** is the context strategy.
- Use the 18 held-out cases (not the 6 development cases).

**Procedure:**
1. For each of the 4 strategies × 18 held-out cases = 72 runs:
   - Run the pipeline with low temperature (for reproducibility).
   - Save the raw AI output *before* validation.
   - Record all metadata (latency, tokens, input size, etc.).
2. **Score the outputs by hand** (blinded):
   - Shuffle all 72 outputs randomly.
   - Hide which strategy produced each output.
   - For each output, score:
     - How many of the required facts does it mention? (fact coverage)
     - Does it contain any unsupported claims? (hallucination check)

#### Part B: Validation experiment

**Setup:**
- Take only the structure-aware outputs from Part A.
- Compare them before and after model-assisted validation.

**Question:** Does validation catch bad suggestions? Does it make things worse?

### What to measure

#### Primary metrics (the important ones)

| Metric | How to calculate |
|--------|-----------------|
| **Required-fact coverage** | (facts mentioned ÷ total required facts) per case, then average across cases |
| **Unsupported-output rate** | % of outputs with at least one hallucinated claim |
| **Unsupported-claim count** | Total hallucinated claims per strategy |
| **Semantic detection accuracy** | For weak-vs-acceptable cases: precision, recall, F1 |

#### Secondary metrics (supporting information)

| Metric | How to calculate |
|--------|-----------------|
| Input size | Characters sent to the model |
| Token usage | If the API reports it |
| Latency | Milliseconds per request |
| Request count | Total API calls per strategy |
| Parse failures | How often the AI returned unparseable output |
| Constraint-valid rate | % of outputs that pass deterministic validation |

### How to interpret results

| Outcome | Meaning |
|---------|---------|
| **Improved** | Structure-aware has higher fact coverage AND no more hallucinations |
| **Safer** | Structure-aware has fewer hallucinations AND no lower fact coverage |
| **Mixed** | One metric is better, the other is worse |
| **No improvement** | Neither metric improves |

> [!IMPORTANT]
> This project uses a small, single-rater benchmark with one generation per condition. Report exact counts, descriptive differences, and these limitations; do not claim general superiority. Statistical significance is not determined by case count alone, but formal inference is outside the planned analysis. Do not call a difference statistically significant without an appropriate justified analysis.

### ✅ Phase 7 is done when

- [ ] All 72 runs (4 strategies × 18 cases) are complete and saved.
- [ ] Manual scoring was done blinded (you didn't know which strategy produced which output).
- [ ] Required quality and efficiency metrics are calculated from saved records; unavailable optional provider token counts are explicitly marked unavailable, not invented.
- [ ] You can reproduce every number from the saved outputs (no re-running the AI).
- [ ] Important failures are analyzed individually (not just averaged away).

---

## Phase 8 — Polish and Deliver

**Target dates:** November 14–21  
**One-sentence goal:** Fix remaining bugs, write documentation, prepare the demo, and package everything.

### What to do

#### 1. Bug fixes (conservative)

Only fix bugs that:
- Block the demo from working, OR
- Would invalidate the experiment results.

**Do not** add new features or refactor code.

#### 2. Run all quality checks

- [ ] All core tests pass.
- [ ] TypeScript type-checking passes (`tsc --noEmit`).
- [ ] Linting passes.
- [ ] The extension builds and loads in JupyterLab.
- [ ] Manual walkthrough of the full flow works.

#### 3. Write documentation

Finalize the report drafted for the midterm: resolve advisor comments (or explain unresolved items), replace planned-work descriptions with verified implementation details, and add the experiment results and limitations. Recheck consistency across chapters and the final formatting requirements.

Document:
- **Architecture:** How the system is organized (which files do what).
- **Model configuration:** Which model, what settings, how to set it up.
- **Benchmark construction:** How you built the 24 test cases.
- **Scoring rules:** How you scored fact coverage and hallucinations.
- **Results:** Your findings and what they mean.
- **Privacy limitations:** What notebook content gets sent to the AI.
- **Code-output limitations:** How the cell-metadata approach works and its limits.

#### 4. Prepare the demo

Use one reliable live walkthrough or a simple recording, according to submission requirements. Elaborate video editing, both a live and a recorded version, or extra scenarios are not required unless the course instructions request them. Cover:

1. Structural detection (existing feature — "this image has no alt text").
2. Semantic analysis ("this alt text says 'graph' but should be more descriptive").
3. Structure-aware context ("I used the section heading and nearby code to understand this image").
4. Validation ("the suggestion was checked for hallucinations").
5. Author editing ("the user edits the suggestion and accepts it").

#### 5. Package the deliverables

| Deliverable | Description |
|-------------|-------------|
| Source code | The full repository |
| Benchmark data | All 24 cases with reference annotations |
| Anonymized outputs | The 72 AI outputs (no API keys or private data) |
| Evaluation config | Model settings, prompt templates, scoring criteria |
| Setup instructions | How to install, build, and run the extension |
| Report | Final project report |
| Recording | Demo video |

### ✅ Phase 8 is done when

- [ ] A reviewer can clone the repo, follow setup instructions, and see the extension working.
- [ ] A reviewer can look at the saved outputs and reproduce every number in the report.
- [ ] Every claim in the report has traceable evidence.
- [ ] Midterm feedback has been addressed, or each unresolved item has an explanation.
- [ ] The demo shows the complete workflow.

---

## Optional Enhancement Backlog — Does Not Block Required Phases

Only start these after the required working flow, experiment, and report are secure:

- Additional image formats, external hosts, and unusual URL/path variants beyond the declared supported fixtures.
- Automatic revision after validation (at most one controlled cycle if implemented).
- Cancellation, automatic retries, and comprehensive handling of notebook edits during in-flight analysis. Keep the supported workflow explicit and reject known stale targets before writing accepted text; comprehensive concurrent-edit support can wait.
- Visual redesign, decorative badges/icons, batch review, recommendation history, and persistence of dismissed suggestions.
- Token-aware budgeting, advanced context relevance, and dependency tracing.
- Experiment dashboards, databases, multiple models/providers, parameter sweeps, and repeated trials.
- Additional installation targets, release automation, and demo production polish.

Broader coverage becomes required only when an approved acceptance case, experiment input, consequential defect, or course requirement needs it. Record that decision instead of silently enlarging a phase.

---

## Quick Reference: Core Interfaces

| Interface | One-line description | Defined & Used In |
|-----------|---------------------|-------------------|
| `IImageCandidate` | One image found in the notebook | Phase 1 (defined), Phase 2 (populated) |
| `IModelClient` | API wrapper for any OpenAI-compatible model | Phase 3 (Minimal E2E) |
| `ISemanticResult` | AI's judgment: concern + suggestion | Phase 3 (Minimal E2E) |
| `IContextPackage` | Notebook context selected for one image | Phase 4 (Context Strategies) |
| `IValidationResult` | Quality check: pass / manual-review; optional revision later | Phase 5 (Validation) |
| `IEvaluationCase` | One benchmark test case | Phase 5 (Benchmark freeze) |
| `IEvaluationRecord` | Recorded result of one experiment run | Phase 7 (Experiment) |
| `ICellIssue` | Structural finding (already exists) | Already in the codebase |

---

## Test Plan Summary

| Test type | What it covers | When |
|-----------|---------------|------|
| **Unit tests** | Candidate extraction, context selection, response parsing, validation rules | Phases 2–5 |
| **Integration tests** | Full pipeline with mocked AI responses | Phases 3–5 |
| **Manual JupyterLab tests** | Thin image flow in Phase 3; complete author review and keyboard operation in Phase 6 | Phases 3 and 6 |
| **Live provider checks** | Feasibility, integrated image flow, and validation smoke checks using development cases; avoid redundant calls | Phases 1, 3, and 5 |
| **Regression tests** | Existing behavior remains covered; use the current suite rather than a fixed historical test count | Every phase |
| **Reproducibility** | Saved experiment data regenerates all reported numbers | Phase 7 |

---

## Rules That Apply to Every Phase

1. **Meet required gates.** Complete the working minimum and focused verification before dependent work. Additional coverage and backlog items do not block progress. Keep report writing and benchmark annotation preparation parallel; freeze annotations before held-out generation. Record any approved change to required scope.
2. **Keep diffs small.** Each phase should be a reviewable set of changes, not a massive rewrite.
3. **Preserve existing behavior.** Run focused checks for each chunk and the broader existing suite at integration milestones. Do not weaken checks or leave known consequential regressions merely to pass a gate.
4. **Don't commit secrets.** No API keys in code, tests, or notebooks.
5. **Don't auto-apply AI output.** The user always decides.
6. **Document your decisions.** For each phase, write down what you chose and why.

---

## Assumptions

- **Deadlines:** Midterm report October 23, 2026 (target submission October 22); final delivery November 21, 2026.
- **Midterm page count:** Applicability of the general 30-page minimum and which pages count await instructor clarification; no exemption is assumed.
- **AI model:** One Berkeley-hosted OpenAI-compatible multimodal model.
- **You (the author)** write the benchmark cases and do the blinded scoring.
- **One AI run per condition** is acceptable for a course project. Document model nondeterminism as a limitation.
- **JupyterLab is the main interface.** CLI compatibility is nice-to-have.
- **Out of scope:** Link quality, table captions, embeddings, agent frameworks, dependency tracing, decorative-image classification, dynamic outputs.
