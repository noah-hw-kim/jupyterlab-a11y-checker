# A11yLens Development Benchmark Cases (Phase 1)

This document defines the **6 development benchmark test cases** used to build, tune, and test the A11yLens pipeline.

All 6 test cases are concretely implemented as live notebook cells in the fixture notebook:  
📂 **[`test_files/dev_benchmark_cases.ipynb`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/test_files/dev_benchmark_cases.ipynb)**  
(using the test image fixture **[`test_files/sales_chart.png`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/test_files/sales_chart.png)**).

---

## Benchmark Summary

| Case # | ID | State | Type | Fixture Location | Expected Judgment |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Case 1** | `dev-case-01-missing-html` | `missing` | `markdown-html` | `dev_benchmark_cases.ipynb` (Cell 1) | `shouldImprove: true` |
| **Case 2** | `dev-case-02-empty-markdown` | `empty` | `markdown-inline` | `dev_benchmark_cases.ipynb` (Cell 2) | `shouldImprove: true` |
| **Case 3** | `dev-case-03-weak-markdown` | `weak` | `markdown-inline` | `dev_benchmark_cases.ipynb` (Cell 3) | `shouldImprove: true` |
| **Case 4** | `dev-case-04-weak-code-output` | `weak` | `code-output` | `dev_benchmark_cases.ipynb` (Cell 4) | `shouldImprove: true` |
| **Case 5** | `dev-case-05-acceptable-markdown` | `acceptable` | `markdown-inline` | `dev_benchmark_cases.ipynb` (Cell 5) | `shouldImprove: false` |
| **Case 6** | `dev-case-06-acceptable-code-output` | `acceptable` | `code-output` | `dev_benchmark_cases.ipynb` (Cell 6) | `shouldImprove: false` |

---

## Case 1: Missing Alt Text (HTML `<img>` tag without `alt` attribute)

* **ID**: `dev-case-01-missing-html`
* **Source Type**: `markdown-html`
* **Fixture**: `test_files/dev_benchmark_cases.ipynb` (Cell 1)
* **Snippet**: `<img src="sales_chart.png">`
* **Current Alt Text**: *(None — `alt` attribute is completely omitted from the HTML tag)*
* **Alt-Text State**: `missing`
* **Surrounding Context**:
  * Heading: `## Case 1: Missing Alt Text (HTML <img> without alt attribute)`
  * Preceding Markdown: `The following line chart illustrates quarterly revenue performance.`
* **Visual Content**: A line chart showing quarterly sales performance increasing over time.
* **Expected Judgment**: `shouldImprove: true` (WCAG 2.1 AA violation: image tag lacks an `alt` attribute entirely).
* **Required Facts (2–4 facts)**:
  1. Chart type is a line chart / graph.
  2. Measures sales/revenue performance over quarters.
  3. Indicates an increasing / upward trend across time periods.
* **Prohibited Claims**:
  1. Mentioning unlabelled precise decimal numbers.
  2. Speculating on external causes not present in the notebook or image.

---

## Case 2: Empty Alt Text (Markdown Inline with empty brackets `![]`)

* **ID**: `dev-case-02-empty-markdown`
* **Source Type**: `markdown-inline`
* **Fixture**: `test_files/dev_benchmark_cases.ipynb` (Cell 2)
* **Snippet**: `![](sales_chart.png)`
* **Current Alt Text**: `""` *(explicitly empty string between brackets)*
* **Alt-Text State**: `empty`
* **Surrounding Context**:
  * Heading: `## Case 2: Empty Alt Text (Markdown empty brackets)`
  * Preceding Markdown: `The following chart illustrates quarterly revenue growth over recent quarters.`
* **Visual Content**: A line chart showing quarterly revenue increasing steadily across five quarters.
* **Expected Judgment**: `shouldImprove: true` (Informative chart has empty alt text; it is not decorative).
* **Required Facts (2–4 facts)**:
  1. Chart type identification (line chart).
  2. Measures quarterly revenue / performance over quarters.
  3. Indicates an increasing / upward trend across time periods.
* **Prohibited Claims**:
  1. Mentioning unlabelled precise decimal numbers.
  2. Speculating on external market causes not shown in the chart.

---

## Case 3: Weak Alt Text (Markdown Inline with generic label)

* **ID**: `dev-case-03-weak-markdown`
* **Source Type**: `markdown-inline`
* **Fixture**: `test_files/dev_benchmark_cases.ipynb` (Cell 3)
* **Snippet**: `![graph](sales_chart.png)`
* **Current Alt Text**: `"graph"`
* **Alt-Text State**: `weak`
* **Surrounding Context**:
  * Heading: `## Case 3: Weak Alt Text (Markdown with generic "graph")`
  * Preceding Markdown: `Company financial overview showing quarterly revenue performance.`
* **Visual Content**: A line chart showing quarterly revenue increasing steadily across five quarters.
* **Expected Judgment**: `shouldImprove: true` (Alt text "graph" is overly generic and lacks descriptive content).
* **Required Facts (2–4 facts)**:
  1. Specific chart type (line chart, not just "graph").
  2. Description of the subject matter (quarterly revenue).
  3. Upward/positive trend across quarters.
* **Prohibited Claims**:
  1. Financial/market predictions not shown in chart.
  2. Speculative claims about external causes.

---

## Case 4: Weak Alt Text (Code Output Plot)

* **ID**: `dev-case-04-weak-code-output`
* **Source Type**: `code-output`
* **Fixture**: `test_files/dev_benchmark_cases.ipynb` (Cell 4)
* **Snippet**: Code cell output with stored metadata `a11y_metadata.altText`: `"histogram"`
  ```python
  import matplotlib.pyplot as plt
  plt.hist([22, 25, 29, 31, 34, 28, 45, 52, 27, 33], bins=5)
  plt.title("Customer Age Distribution")
  plt.xlabel("Age")
  plt.ylabel("Count")
  plt.show()
  ```
* **Current Alt Text**: `"histogram"`
* **Alt-Text State**: `weak`
* **Surrounding Context**:
  * Code Cell: Matplotlib histogram plotting customer age distribution.
  * Section Title: `"Customer Age Distribution"`
* **Visual Content**: A histogram with customer age on the x-axis and count on the y-axis, centered around 25–35.
* **Expected Judgment**: `shouldImprove: true` (Alt text "histogram" is generic and lacks description of the variable or distribution).
* **Required Facts (2–4 facts)**:
  1. Identifies the visualization as a histogram.
  2. Measures customer age distribution.
  3. Identifies the peak demographic (concentrated in 25–35 age range).
* **Prohibited Claims**:
  1. Customer income or purchasing behavior.
  2. Exact bin heights not readable on the y-axis.

---

## Case 5: Acceptable Alt Text (Markdown Inline)

* **ID**: `dev-case-05-acceptable-markdown`
* **Source Type**: `markdown-inline`
* **Fixture**: `test_files/dev_benchmark_cases.ipynb` (Cell 5)
* **Snippet**: `![Line chart showing quarterly revenue increasing steadily across five quarters.](sales_chart.png)`
* **Current Alt Text**: `"Line chart showing quarterly revenue increasing steadily across five quarters."`
* **Alt-Text State**: `acceptable`
* **Surrounding Context**:
  * Heading: `## Case 5: Acceptable Alt Text (Markdown Descriptive)`
  * Preceding Markdown: `Financial summary showing revenue across five consecutive quarters.`
* **Visual Content**: Line chart with quarterly intervals showing steady upward revenue.
* **Expected Judgment**: `shouldImprove: false` (Existing alt text is accurate, concise, and identifies chart type and trend).
* **Required Facts (2–4 facts)**:
  1. Identifies line chart.
  2. Specifies quarterly revenue.
  3. Describes the upward trajectory across five quarters.
* **Prohibited Claims**:
  1. Flagging as deficient or needing revision.

---

## Case 6: Acceptable Alt Text (Code Output with Alt Metadata)

* **ID**: `dev-case-06-acceptable-code-output`
* **Source Type**: `code-output`
* **Fixture**: `test_files/dev_benchmark_cases.ipynb` (Cell 6)
* **Snippet**: Code cell output with stored cell metadata `a11y_metadata.altText`:
  `"Bar chart comparing 2026 department enrollment with Computer Science highest at 1,200 students."`
* **Current Alt Text**: `"Bar chart comparing 2026 department enrollment with Computer Science highest at 1,200 students."`
* **Alt-Text State**: `acceptable`
* **Surrounding Context**:
  * Code Cell:
     ```python
     import matplotlib.pyplot as plt
     plt.bar(["CS", "Bio", "Math", "Hist"], [1200, 850, 600, 400])
     plt.title("2026 Department Enrollment")
     plt.show()
     ```
* **Visual Content**: Vertical bar chart comparing enrollment across four departments.
* **Expected Judgment**: `shouldImprove: false` (The metadata alt text accurately names the chart type and key comparison).
* **Required Facts (2–4 facts)**:
  1. Identifies bar chart.
  2. Compares 2026 department enrollment.
  3. Identifies Computer Science as the highest enrollment.
* **Prohibited Claims**:
  1. Flagging as deficient or needing revision.
