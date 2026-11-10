# A11yLens setup and demo guide

## Scope and verification

A11yLens extends the existing checker with notebook-context selection,
image-alt evaluation/generation, validation, and author review.
This guide covers the JupyterLab extension built from this checkout.

The existing development installation passed automated checks and an
author-reported browser walkthrough on November 6–7, 2026.
Installation from a fresh clone has not yet been verified.

## Build from source

Use Python 3.9 or newer, JupyterLab 4, Node.js, and Yarn Classic 1.22.22.
The checked development environment used Node.js 26.13.0 and JupyterLab
4.6.2. Run these commands from the repository root, with the intended
Python environment active:

```bash
python -m pip install 'jupyterlab>=4,<5'
corepack yarn --version
# Confirm Yarn 1.22.22 before installing dependencies.
corepack yarn install --frozen-lockfile
corepack yarn workspace @berkeley-dsep-infra/a11y-checker-core build
corepack yarn workspace jupyterlab-a11y-checker build
python -m pip install -e packages/extension
jupyter labextension develop packages/extension --overwrite
jupyter labextension list
jupyter lab
```

Core builds first because the extension imports its generated `dist`
exports. After source edits, rebuild the affected packages and refresh
JupyterLab. A successful build alone does not refresh an open browser tab.

Use a working Corepack installation in the same environment as Node.
Do not substitute a different Yarn version or regenerate the lockfile
to work around a local command-resolution problem.

## Model configuration

In Settings → Settings Editor → A11y Checker Settings, configure Vision
Model Settings with the complete chat-completions endpoint URL, API key,
and an image-capable model name. Refresh after changing settings.
Language Model Settings configure other existing AI helpers.

The evaluation requested `gemini-3.5-flash-lite` with provider-default
reasoning. Availability depends on the configured provider.
The extension does not load the evaluation runner's root `.env` file.

Requests are sent directly from the browser. The endpoint must allow
the JupyterLab origin through CORS; a successful terminal request alone
does not establish browser compatibility.

## Review and demo workflow

Duplicate `test_files/dev_benchmark_cases.ipynb` in the same directory
to preserve relative image paths and keep the original ready for reuse.
Do not edit frozen benchmark inputs for a demo.

1. Open the duplicate and the checker panel.
2. Enable Use AI. Choose Structure-aware and a 2,000-character budget.
3. Select Analyze Notebook to populate findings.
4. Demonstrate a missing-alt structural finding.
5. Request analysis for Case 3's weak Markdown alt text.
6. Explain the validation status, edit the suggestion, and Apply it.
7. Demonstrate Case 4's code-output alt text, then save and reopen.

Analysis does not change notebook content. Apply writes the accepted
text; Dismiss discards the suggestion. Editing a suggestion does not
automatically validate the edited version. Rerun the notebook check
after applying fixes to refresh findings.

## Context strategies

| Strategy | Selected notebook text |
| --- | --- |
| Minimal | Current cell |
| Fixed-window | Current cell and up to two cells before and after |
| Structure-aware | Current cell, section heading, up to two nearby same-section Markdown cells, and nearby code when applicable |
| Largest-practical | Notebook cells selected within the budget |

The budget limits selected source text, not image size, total request
tokens, or all prompt text. Formatter labels add characters.
Minimal permits a blank budget for the full current cell; the other
strategies require a budget. A small budget can omit useful context.

## Supported behavior and limitations

- The review section handles inline Markdown/HTML images with existing
  alt text and supported PNG/JPEG code outputs. Missing or empty Markdown
  alt text is handled through structural findings.
- Structure-aware selection uses Markdown headings, including headings
  before the image in its own cell. HTML headings and headings nested
  inside other Markdown blocks are not supported section boundaries.
- Output alt text is stored in notebook cell metadata and restored by
  this extension. Other notebook viewers may not use that metadata.
  Changed or ambiguous image targets must be rechecked before applying.
- Validation is an imperfect screening aid. A passed result still needs
  author review, and a manual-review result does not prove the text wrong.
- AI requests send image data, existing alt text, and selected notebook
  context to the configured provider. Validation also sends the proposed
  description. Selected text can include code or unrelated content;
  review notebook sensitivity before using external models.
- The evaluation used small synthetic notebooks, one requested model,
  and one author reviewing scores. Its results do not establish
  performance on long real-world notebooks or screen-reader usability.

See [Phase 7 findings](phase7-findings.md) for results, scoring
qualifications, and evidence links. No model calls are needed to read
the saved analysis.
