# Notebook Output Image Access Architecture

This document records how code-cell output images (for example, matplotlib
plots) are accessed and converted into image candidates across both notebook
environments in `jupyterlab-a11y-checker`:

1. **Raw `.ipynb` File Adapter** (CLI and offline testing in `packages/core/src/parsers.ts`)
2. **Live JupyterLab Adapter** (Interactive extension in `packages/extension/src/adapter.ts`)

Phase 1 established that both environments expose image data. Phase 2
implements the shared cell contract, adapters, and image-candidate extraction.
Applying accepted alt text to notebook content remains planned for Phase 6.

---

## 1. Raw `.ipynb` File Adapter (CLI & Core)

### Structure in `.ipynb` JSON

In raw notebook files, code cells contain an `outputs` array. Static raster images (like matplotlib plots) are stored under `display_data` or `execute_result` objects:

```json
{
  "cell_type": "code",
  "source": ["plt.plot([1, 2, 3])\n", "plt.show()"],
  "outputs": [
    {
      "output_type": "display_data",
      "data": {
        "text/plain": ["<Figure size 640x480 with 1 Axes>"],
        "image/png": "iVBORw0KGgoAAAANSUhEUgAA..."
      },
      "metadata": {}
    }
  ]
}
```

### Extraction Logic

**Implemented in Phase 2** in
`packages/core/src/parsers.ts` by `rawIpynbToGeneralCells()`.

The adapter preserves:

- the cell source and cell type;
- Markdown attachments;
- code-cell outputs;
- cell metadata, including `a11y_metadata`.

Code outputs retain their notebook MIME bundles. The candidate extractor
recognizes string data stored under `image/png` and `image/jpeg`.
Non-image outputs, such as streams and errors, do not produce image
candidates.

---

## 2. Live JupyterLab Adapter (Extension)

### A. Model API Access

In the live JupyterLab extension, the notebook is managed by a `NotebookPanel` widget:

**Implemented in Phase 2** in `packages/extension/src/adapter.ts` by
`notebookToGeneralCells()`.

The adapter iterates through `panel.content.widgets`. For each cell, it reads
the current source from the shared model and calls `cell.model.toJSON()` to
preserve attachments, outputs, and metadata:

```typescript
const cellData = cell.model.toJSON();

return {
  cellIndex: index,
  type,
  source,
  attachments: cellData.attachments,
  outputs: cellData.outputs,
  metadata: cellData.metadata,
};
```

Each live output uses the same MIME-bundle shape as a raw notebook output,
including data under keys such as `image/png` and `image/jpeg`. The shared core
extractor can therefore process cells from either adapter without depending on
JupyterLab widgets.

### B. Live DOM Access

While JupyterLab is open, rendered plot images exist directly in the browser DOM:

- **Container Selector**: `.jp-Cell.jp-CodeCell .jp-Cell-outputArea` (or `.jp-OutputArea`)
- **Rendered Image Element**: `.jp-OutputArea-child .jp-RenderedImage img`
- **Image Source**: `img.src` is set to `data:image/png;base64,...`
- **Live DOM Verification**: In JupyterLab's browser DevTools console with a plotted notebook open, run:

  ```javascript
  const img = document.querySelector(
    ".jp-OutputArea-child .jp-RenderedImage img",
  );
  console.log("Live DOM plot found:", img?.tagName, img?.src?.slice(0, 40));
  ```

  **Observed Result (Live JupyterLab Verification):**

  ```text
  Live DOM plot found: IMG data:image/png;base64,iVBORw0KGgoAAAANSUhEUgA
  ```

  _(Proves that the rendered plot `<img>` tag and its base64 data are directly accessible in the browser DOM)._

- **DOM Remediation**: In Phase 6, author-accepted alternative text for code-cell outputs is injected directly into this `img` tag's `alt` attribute:

  ```javascript
  imgElement.setAttribute("alt", acceptedAltText);
  ```

  and persisted into the cell's metadata (`cell.model.setMetadata('a11y_metadata', ...)`).

---

## 3. Unified Contract for Phase 2

Phase 2 extends `IGeneralCell` in `packages/core/src/types.ts` with optional
output and metadata fields:

```typescript
export interface IGeneralCell {
  cellIndex: number;
  type: "markdown" | "code" | "raw";
  source: string;
  attachments?: { [key: string]: { [mimeType: string]: string } };
  outputs?: ICellOutput[];
  metadata?: ICellMetadata;
}
```

Both `rawIpynbToGeneralCells()` and `notebookToGeneralCells()` populate this
environment-independent representation. Optional fields keep existing callers
compatible and allow Markdown, raw, and code cells to share one contract.

---

## 4. Image Candidate Extraction

`extractImageCandidates()` in `packages/core/src/utils/image-utils.ts` scans
every `IGeneralCell` and returns one `IImageCandidate` for each supported image.

It handles:

- Markdown images such as `![description](image.png)`;
- HTML `<img>` elements with a usable `src`;
- Markdown attachment references such as `attachment:diagram.png`;
- PNG and JPEG code-cell outputs.

Markdown and HTML candidates include source offsets for later editing.
Attachment candidates retain the attachment reference and record the MIME type
when it is available. Code-output candidates include the output-array index,
MIME type, base64 image data, and a deterministic content hash.

A cell may produce multiple candidates. For code cells, `outputIndex` refers to
the image's position in the complete outputs array, including any preceding
non-image outputs.

### Alt-Text Presence

Phase 2 records only whether alt text exists:

- `missing`: no valid stored description exists;
- `empty`: a stored description exists but is the empty string;
- `present`: a nonempty stored description exists.

These states do not determine whether present alt text is semantically weak or
acceptable. Semantic quality is assessed in a later phase.

---

## 5. Code-Output Metadata Identity

New per-output metadata is stored under the output-array index:

```json
{
  "a11y_metadata": {
    "outputs": {
      "0": {
        "dataHash": "abc123",
        "altText": "Line chart showing increasing revenue"
      }
    }
  }
}
```

The record key identifies the output position. `dataHash` identifies the image
content at that position. The extractor reuses the stored alt text only when
the stored hash equals the hash of the current image. If a cell rerun replaces
the image, the hashes differ and the candidate is treated as missing alt text.

Older notebooks and the Phase 1 development fixtures may contain cell-level
metadata instead:

```json
{
  "a11y_metadata": {
    "altText": "Histogram"
  }
}
```

This legacy value is used only when the cell contains exactly one image output.
If legacy metadata includes a hash, that hash must match the current image.
Newly persisted metadata should use the hashed per-output structure.

---

## 6. Phase 2 Verification and Boundary

The integration test reads `test_files/dev_benchmark_cases.ipynb` through the
raw adapter and verifies that the extractor returns exactly six candidates with
the expected source types and alt-text presence states.

Additional core tests cover:

- Markdown, HTML, and attachment images;
- PNG and JPEG outputs;
- cells without images;
- multiple outputs and their actual output-array indexes;
- matching and stale image hashes;
- empty and nonempty per-output alt text.

Run the Phase 2 checks from the repository root:

```bash
npm test --workspace=packages/core -- --run
npx tsc -p packages/core/tsconfig.json --noEmit \
  --tsBuildInfoFile /tmp/a11ylens-core.tsbuildinfo
npx tsc -p packages/extension/tsconfig.json --noEmit \
  --tsBuildInfoFile /tmp/a11ylens-extension.tsbuildinfo
```

Phase 2 finds images and records mechanically detectable alt-text presence. It
does not call an AI model, judge semantic quality, or modify notebook content.
