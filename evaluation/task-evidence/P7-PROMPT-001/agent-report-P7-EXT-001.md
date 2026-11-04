# Agent report

Task ID: `P7-EXT-001`

Status: Completed.

## Outcome

Task `P7-EXT-001` executed successfully in read-only inspection mode. The downloaded notebook and its source metadata were verified against upstream commit `1cbc7bc59acbcc9d39fc4314d36eb66a843d5cf5`.

Key inventory finding: `06_plotting.ipynb` contains **zero saved code-cell image outputs** (`outputs: []` across all 108 cells). However, it contains **two static Markdown images** (`<img src="...">` tags pointing to the repository's `figs/` directory) that serve as pedagogical targets for students to replicate. Both images were visually inspected and verified to have clear, traceable semantic context.

---

## Verification and Evidence

### 1. File Integrity & Pinned Upstream Hash Verification
* **Local Notebook Path:** `evaluation/external-candidates/elements-06-plotting/06_plotting.ipynb`
* **Computed SHA-256:** `5b3b6a14b0750a55bc7d1eb578c859c35f84f3f26aeb1b0d2dff1b9119c84949`
* **Matches `SOURCE.md`?** Yes.
* **Git Blob SHA:** `2fcf927427f47e1a86c6b9d958f45d1625c81ffc`
* **Upstream Comparison:** Verified against GitHub tree API for commit `1cbc7bc59acbcc9d39fc4314d36eb66a843d5cf5`; the local file is 100% byte-identical.

### 2. License Evidence Verification
* **Upstream `LICENSE` at `1cbc7bc59acbcc9d39fc4314d36eb66a843d5cf5`:**
  * Code License: MIT License (`https://opensource.org/licenses/MIT`)
  * Content License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0) (`https://creativecommons.org/licenses/by-nc-sa/4.0/`)
  * Copyright 2021 Allen B. Downey (confirmed in Cell 107 of `06_plotting.ipynb`).
* **Third-Party Asset Nuance (Unresolved):**
  * The two embedded images are reproductions of third-party graphics:
    1. Pew Research Center (`figs/pew_religion_figure1.png`)
    2. The Economist / Pret A Manger (`figs/20190907_FNC941.png`)
  * While Downey incorporates them under educational fair use / CC BY-NC-SA 4.0 textbook terms, downstream distribution in an official public benchmark requires user/Codex sign-off.

### 3. Notebook Structure & Output Inventory
* Total Cells: 108 (55 Markdown, 53 Code).
* Code Cell Outputs: **0 outputs found**. All code cell `outputs` arrays are empty (`[]`), characteristic of an unexecuted student notebook.
* Markdown Images: **2 found** via `<img src="...">` HTML tags referencing `figs/` assets.
* Evidence Directory: `evaluation/external-candidates/elements-06-plotting/P7-EXT-001/` contains downloaded PNG copies used for visual inspection.

---

## Candidate Proposals Table

| Field | Candidate 1: Religious Affiliation | Candidate 2: Sandwich Prices |
| :--- | :--- | :--- |
| **Cell Index** | Cell 19 (Markdown) | Cell 46 (Markdown) |
| **Source Identity** | `<img src=".../figs/pew_religion_figure1.png" width="350">` | `<img src=".../figs/20190907_FNC941.png" width="300">` |
| **Section Heading** | `## Graphing Religious Affiliation` (Cell 19) | `## Plotting Sandwich Prices` (Cell 44) |
| **Chart Subject** | U.S. adult religious affiliation changes (Christian vs. Unaffiliated, 2007–2019) | Pret A Manger sandwich prices comparison: London vs. Boston (August 2019) |
| **Plot Type & Units** | Two-series line chart; units = `% of U.S. adults` | Categorical dot/range plot; units = `Price in USD ($)` |
| **Observable Pattern** | Christian share drops 78% $\rightarrow$ 65%; Unaffiliated ("nones") rises 16% $\rightarrow$ 26% | Boston prices consistently higher than London across all 6 sandwiches |
| **Supporting Cells** | Cells 19, 20, 21, 22, 24, 26 | Cells 44, 46, 47, 48, 49 |
| **Visible in Image** | Titles, axis labels, callout percentages (78%, 71%, 65%; 16%, 23%, 26%), Pew survey notes | "Shell companies" title, 6 sandwich names, $0–$10 axis, cyan/red city dots, Economist source |
| **Supplied by Context** | Pew report citation, replication intent, exact Python lists (`year`, `christian`, `unaffiliated`) | Economist article context, replication intent, Python lists (`name_list`, price lists) |
| **Current +/- 2 Sufficiency** | Window [17, 21] captures Pew context and replication prompt, but misses data arrays in cells 22–26 | Window [44, 48] captures section heading, article context, sandwich names, and Boston prices |
| **Proposed Required Facts** | 1. Line chart of U.S. adult religious affiliation.<br>2. Christian affiliation declined (~78% in 2007 to ~65% in 2019).<br>3. Unaffiliated affiliation increased (~16% in 2007 to ~26% in 2019). | 1. Dot/range chart comparing sandwich prices in Boston and London.<br>2. Prices are in US Dollars ($).<br>3. Boston prices are higher than London for all listed sandwiches. |
| **Uncertain Facts** | Distinction between RLS studies vs. aggregated political surveys (secondary methodology) | Exact price endpoints for intermediate sandwiches (Lobster roll is clear at $10 / ~$7.50; others need scale interpolation) |

---

## Educational Context Limitations

These candidates represent textbook examples with specific characteristics:
1. **Clean Linear Progression:** Unlike production notebooks with exploratory dead ends, cell rewrites, or out-of-order execution, these cells follow a strictly polished pedagogical path.
2. **Markdown Target vs. Code Output:** These images are embedded Markdown figures (`<img src="...">`), not code-cell outputs (`outputs[].data['image/png']`). They evaluate markdown image accessibility rather than dynamic matplotlib output persistence.
3. **Professional Typography:** The images were professionally produced by Pew Research and The Economist, featuring high contrast and clear callouts, which does not test unstyled, chaotic, or poorly labeled matplotlib figures often encountered in the wild.
4. **Generalization Limit:** A two-chart sample from a single introductory plotting chapter cannot establish broader performance across diverse domains (e.g. genomic heatmaps, geospatial projections, subplots).

---

## Commands and Changed Files

### Commands Executed (Read-Only & Supporting Download)
* `sha256sum evaluation/external-candidates/elements-06-plotting/06_plotting.ipynb`
* `git hash-object evaluation/external-candidates/elements-06-plotting/06_plotting.ipynb`
* `curl -sSL "https://raw.githubusercontent.com/.../LICENSE"`
* `mkdir -p evaluation/external-candidates/elements-06-plotting/P7-EXT-001/`
* `curl -sSL ".../figs/pew_religion_figure1.png" -o .../P7-EXT-001/pew_religion_figure1.png`
* `curl -sSL ".../figs/20190907_FNC941.png" -o .../P7-EXT-001/20190907_FNC941.png`
* `file evaluation/external-candidates/elements-06-plotting/P7-EXT-001/*`

### Changed Files
* `evaluation/agent-report.md` (replaced with this report)
* `evaluation/external-candidates/elements-06-plotting/P7-EXT-001/pew_religion_figure1.png` (evidence image)
* `evaluation/external-candidates/elements-06-plotting/P7-EXT-001/20190907_FNC941.png` (evidence image)

---

## Unresolved Issues and Decisions Needed

1. **Markdown Images vs. Code Outputs:** Does the supplemental evaluation intend to evaluate Markdown `<img src="...">` assets, or does it require code-cell outputs? If code-cell outputs are strictly required, `06_plotting.ipynb` cannot be used as-is because its outputs are stripped (`outputs: []`).
2. **Third-Party Rights Review:** Before adding these candidates to any persistent evaluation benchmark, confirm acceptable fair-use terms for Pew Research Center and The Economist graphics.
3. **No Execution / Benchmark Invariant:** The existing frozen benchmark (`test_files/benchmark/`) remains 100% untouched. No model calls or evaluations were launched.
