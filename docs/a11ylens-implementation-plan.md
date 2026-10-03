# A11yLens Implementation Plan (Beginner-Friendly)

> [!NOTE]
> This document rewrites the original `a11ylens-implementation-plan.md` so that each phase is understandable and actionable for an entry-level developer. The *scope* and *goals* are unchanged — only the explanation is clearer.

> [!NOTE]
> **Schedule revised (Sep 30, 2026):** Work started Oct 1 instead of Sep 24 (start slipped). Phases 2–6 trimmed to 6 days and Phase 8 to 8 days to protect the 10-day experiment window. The Nov 21 deadline is unchanged.

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

### Deadline

**November 21, 2026.** Dates per phase are targets; you advance when the phase's checklist ("gate") is done, not when a calendar date arrives.

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

- [ ] `IGeneralCell` has the `outputs` field; existing code still compiles and passes.
- [ ] Both adapters populate outputs.
- [ ] Candidate extraction finds Markdown images, attachments, and code-output images.
- [ ] Multiple images per cell are distinguished.
- [ ] New tests pass; existing 52 tests still pass.

---

## Phase 3 — Minimal End-to-End Flow

**Target dates:** October 11–16  
**One-sentence goal:** Wire everything together so that *one image* goes through: candidate → context → AI call → recommendation displayed in JupyterLab.

### Why this phase exists

This is the "vertical slice" — the minimum path to prove the whole pipeline works. You'll use only **minimal context** (just the image and the current cell's text) and a simple UI display. Phases 4–6 will make it smarter, more robust, and prettier.

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
  → Ask AI: "Is this alt text good enough?"
  → If AI says concern=true → ask for a better suggestion
  → If AI says concern=false → no action needed
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

This data is needed for the Phase 7 experiment.

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

These are simple, fast checks you write in code:

| Check | Example failure |
|-------|----------------|
| Required JSON fields exist | AI returned `{}` with no `suggestedText` |
| Types are correct | `suggestedText` is a number instead of a string |
| Suggestion is not empty | `suggestedText: ""` |
| Suggestion can be parsed | Response isn't valid JSON |
| Word count ≤ 40 | Suggestion is 200 words long |

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

Each suggestion gets one of three statuses:

- **`pass`** — Good to show to the user.
- **`revise`** — Ask the AI to try again (allow **at most one** retry).
- **`manual-review`** — Flag it for the user with a warning that the suggestion may be unreliable.

> [!CAUTION]
> Do not create an open-ended loop where the AI keeps retrying. One retry maximum, then it goes to manual-review.

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
- [ ] Model-assisted validation runs as a separate AI call and returns pass/revise/manual-review.
- [ ] At most one revision is attempted.
- [ ] All 24 benchmark cases are finalized with reference annotations.
- [ ] The 18 held-out cases are frozen and untouched.

---

## Phase 6 — Build the Full JupyterLab Review UI

**Target dates:** October 29 – November 3  
**One-sentence goal:** Build the user interface where notebook authors review, edit, accept, or reject AI suggestions.

### Why this phase exists

Everything built so far is plumbing. This phase creates the **user-facing experience** — what the notebook author actually sees and interacts with.

### What the UI should show

For each image finding, display:

| Element | Description |
|---------|-------------|
| **Type badge** | "Structural" (deterministic) vs. "Recommendation" (AI-assisted) |
| **Current alt text** | What the image's alt text is right now |
| **Concern** | Why the AI flagged this (e.g., "Alt text says 'graph' but doesn't describe the trend") |
| **Suggestion** | The AI's proposed new alt text |
| **Validation status** | pass ✅ / revise 🔄 / manual-review ⚠️ |

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
- If the user re-runs the code cell and the output changes (different hash), **discard the stale metadata**.

### ✅ Phase 6 is done when

- [ ] AI recommendations display separately from structural violations.
- [ ] Accept, Edit, and Reject buttons work correctly.
- [ ] Nothing is auto-applied to the notebook.
- [ ] The entire review flow works with keyboard only.
- [ ] Code-output alt text is stored in cell metadata and applied to the DOM.
- [ ] Stale metadata is rejected when outputs change.
- [ ] Save → reopen → recommendations are still accessible.

---

## Phase 7 — Run the Experiment

**Target dates:** November 4–13  
**One-sentence goal:** Use your 24 test cases to answer the research question: does structure-aware context help?

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
> With only 18 test cases, you cannot claim statistical significance. Report exact counts and differences. Say "in our 18-case benchmark, structure-aware covered 2.1 more facts on average" — **not** "structure-aware is significantly better."

### ✅ Phase 7 is done when

- [ ] All 72 runs (4 strategies × 18 cases) are complete and saved.
- [ ] Manual scoring was done blinded (you didn't know which strategy produced which output).
- [ ] All metrics are calculated and recorded.
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

Document:
- **Architecture:** How the system is organized (which files do what).
- **Model configuration:** Which model, what settings, how to set it up.
- **Benchmark construction:** How you built the 24 test cases.
- **Scoring rules:** How you scored fact coverage and hallucinations.
- **Results:** Your findings and what they mean.
- **Privacy limitations:** What notebook content gets sent to the AI.
- **Code-output limitations:** How the cell-metadata approach works and its limits.

#### 4. Prepare the demo

Record or prepare a live demo covering:
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
- [ ] The demo shows the complete workflow.

---

## Quick Reference: Core Interfaces

| Interface | One-line description | Defined & Used In |
|-----------|---------------------|-------------------|
| `IImageCandidate` | One image found in the notebook | Phase 1 (defined), Phase 2 (populated) |
| `IModelClient` | API wrapper for any OpenAI-compatible model | Phase 3 (Minimal E2E) |
| `ISemanticResult` | AI's judgment: concern + suggestion | Phase 3 (Minimal E2E) |
| `IContextPackage` | Notebook context selected for one image | Phase 4 (Context Strategies) |
| `IValidationResult` | Quality check: pass / revise / manual-review | Phase 5 (Validation) |
| `IEvaluationCase` | One benchmark test case | Phase 5 (Benchmark freeze) |
| `IEvaluationRecord` | Recorded result of one experiment run | Phase 7 (Experiment) |
| `ICellIssue` | Structural finding (already exists) | Already in the codebase |

---

## Test Plan Summary

| Test type | What it covers | When |
|-----------|---------------|------|
| **Unit tests** | Candidate extraction, context selection, response parsing, validation rules | Phases 2–5 |
| **Integration tests** | Full pipeline with mocked AI responses | Phases 3–5 |
| **Manual JupyterLab tests** | UI flow, keyboard nav, accept/edit/reject | Phase 6 |
| **Live provider test** | One real API call to confirm the model works | Phase 1 only |
| **Regression tests** | Existing 52 tests still pass | Every phase |
| **Reproducibility** | Saved experiment data regenerates all reported numbers | Phase 7 |

---

## Rules That Apply to Every Phase

1. **Don't skip a gate.** If a phase's checklist isn't done, don't start the next one.
2. **Keep diffs small.** Each phase should be a reviewable set of changes, not a massive rewrite.
3. **Preserve existing behavior.** The 52 existing tests must keep passing.
4. **Don't commit secrets.** No API keys in code, tests, or notebooks.
5. **Don't auto-apply AI output.** The user always decides.
6. **Document your decisions.** For each phase, write down what you chose and why.

---

## Assumptions

- **Deadline:** November 21, 2026.
- **AI model:** One Berkeley-hosted OpenAI-compatible multimodal model.
- **You (the author)** write the benchmark cases and do the blinded scoring.
- **One AI run per condition** is acceptable for a course project. Document model nondeterminism as a limitation.
- **JupyterLab is the main interface.** CLI compatibility is nice-to-have.
- **Out of scope:** Link quality, table captions, embeddings, agent frameworks, dependency tracing, decorative-image classification, dynamic outputs.
