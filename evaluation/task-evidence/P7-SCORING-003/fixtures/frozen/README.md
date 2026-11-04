# A11yLens benchmark fixtures

This is a synthetic controlled benchmark, not a collection of real-world user
notebooks. It contains 24 cases: six development cases and 18 held-out cases.
The fixture builder and automated fixture tests make no model API calls.
Reference annotations were drafted with AI assistance from source data and plots.
On October 28, 2026, the project author completed review and accepted all 24
annotations, using another AI only to check annotation correctness. The author
confirmed that no held-out system outputs were generated or used for tuning.
The benchmark is frozen; held-out system evaluation has not started.

| Category      | Development | Held-out | Markdown total | Code-output total |
| ------------- | ----------: | -------: | -------------: | ----------------: |
| Missing/empty |           2 |        6 |              4 |                 4 |
| Weak          |           2 |        6 |              4 |                 4 |
| Acceptable    |           2 |        6 |              4 |                 4 |
| Total         |           6 |       18 |             12 |                12 |

Twelve held-out cases are context-sensitive: image titles and axes are generic,
while the section narrative supplies the subject and units. Six held-out cases
are self-contained controls with explicit image titles and axis labels.

## Inputs and reference data

- `development/`: neutral-context derivatives of the original six development
  cases. Saved histogram/enrollment output pixels and the revenue asset are
  reused; the original manual notebook is preserved.
- `held-out/`: 18 new cases. Do not request AI suggestions for these while tuning
  generation or validation prompts.
- `assets/`: the PNG associated with each case. Output cases also embed these
  same bytes in the notebook output.
- `references/manifest.json`: case locations, split, expected judgment, required
  facts, prohibited claims, and source evidence. This file is **reference-only**;
  pass only the selected notebook's cells and image into the model pipeline.
- `references/freeze.json`: SHA-256 hashes of inputs, images, and the manifest.
  Status is `frozen`, following author acceptance on October 28, 2026. Hashes
  identify the accepted file versions; no model evaluation results are included.

Each notebook contains exactly one candidate at zero-based cell index 4. Cells
0–1 provide the relevant section heading and narrative. Cells 2–3 are neutral
setup code. Cells 5–6 form an unrelated section. Fixed-window therefore includes
different context from structure-aware selection; largest-practical may include
both sections. Expected quality labels and verification instructions never appear
in notebook source.

Code-output cells use per-output accessibility metadata gated by the image hash.
Missing/empty alt text remains distinct from weak or acceptable nonempty alt.
Expected judgments are reference hypotheses for evaluation, not guarantees about
what a model must return. "Prohibited claims" concern unsupported facts; concern
classification accuracy is recorded separately by `shouldImprove`.

The sidebar offers AI suggestions for missing/empty Markdown findings and AI
review cards for existing-alt Markdown images and code outputs. Review cards
support editing, explicit application, and dismissal. Accepted output alt text
is stored in metadata and restored only for matching rendered image data. Use
development cases for manual checks; keep held-out cases untouched until the
controlled evaluation. Do not apply changes to frozen inputs and then treat the
modified notebooks as the same benchmark revision.

## Review and freeze

1. Review each image, source values, required facts, and acceptable existing alt.
   Resolve annotation errors without looking at model outputs on held-out cases.
2. Confirm the balance above and the `contextSensitive` flags. The fixture tests
   validate structure, identity, hashes, and budgets; they do not establish that
   reference judgments are scientifically correct or that a strategy is better.
3. Mark reviewed annotations in the manifest, then update its integrity hash and
   set the freeze status to `frozen` only after explicit author acceptance. Commit
   inputs, references, and the freeze file together before held-out generation.
4. After freeze, changes require a documented new dataset revision. Preserve old
   artifacts alongside the results collected from them.

Run offline structural checks with:

```bash
corepack yarn workspace @berkeley-dsep-infra/a11y-checker-core test src/__tests__/benchmark-fixtures.test.ts
```

`build_fixtures.py` needs the existing development environment's matplotlib and
Pillow. It renders only its own generated plotting code, not code from the
original notebook. It refuses to overwrite an existing manifest. To inspect a
candidate regeneration without changing these inputs:

```bash
MPLCONFIGDIR=/tmp/a11ylens-matplotlib .venv/bin/python test_files/benchmark/build_fixtures.py --output /tmp/a11ylens-benchmark-candidate
```

PNG byte identity may vary with plotting-library/font versions. The stored hashes
verify the supplied artifact version, rather than promising identical rendering
in every environment. Repeated chart patterns, synthetic data, and a small case
count limit generalization; report those limitations with experiment results.
