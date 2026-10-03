# Notebook Output Image Access Architecture (Phase 1 Feasibility)

This document records how code-cell output images (e.g., matplotlib plots) are accessed across both notebook environments in `jupyterlab-a11y-checker`:
1. **Raw `.ipynb` File Adapter** (CLI and offline testing in `packages/core/src/parsers.ts`)
2. **Live JupyterLab Adapter** (Interactive extension in `packages/extension/src/adapter.ts`)

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
* **Planned for Phase 2**: In `packages/core/src/parsers.ts` (`rawIpynbToGeneralCells`).
* Iterates through `cell.outputs`.
* Inspects `output.data` for keys starting with `image/` (primarily `image/png` and `image/jpeg`).
* Extracts MIME type and raw base64 data string.
* **Phase 1 Feasibility Verified by**: `scratch/read_ipynb_outputs.mjs` against `scratch/sample_plot.ipynb` and `test_files/dev_benchmark_cases.ipynb`.

---

## 2. Live JupyterLab Adapter (Extension)

### A. Model API Access
In the live JupyterLab extension, the notebook is managed by a `NotebookPanel` widget:
* In `packages/extension/src/adapter.ts` (`notebookToGeneralCells`), cells are accessed via `panel.content.widgets`.
* For code cells (`cell.model.type === 'code'`), the underlying data model provides output data via:
  ```typescript
  const cellData = cell.model.toJSON() as nbformat.ICodeCell;
  const outputs = cellData.outputs;
  ```
* Alternatively, via the reactive output area model:
  ```typescript
  import { ICodeCellModel } from '@jupyterlab/cells';
  const codeCellModel = cell.model as ICodeCellModel;
  const outputAreaModel = codeCellModel.outputs; // IOutputAreaModel
  ```
* Each output in `outputs` contains the exact same data bundle structure (`output.data['image/png']`) as the `.ipynb` file.

### B. Live DOM Access
While JupyterLab is open, rendered plot images exist directly in the browser DOM:
* **Container Selector**: `.jp-Cell.jp-CodeCell .jp-Cell-outputArea` (or `.jp-OutputArea`)
* **Rendered Image Element**: `.jp-OutputArea-child .jp-RenderedImage img`
* **Image Source**: `img.src` is set to `data:image/png;base64,...`
* **Live DOM Verification**: In JupyterLab's browser DevTools console with a plotted notebook open, run:
  ```javascript
  const img = document.querySelector('.jp-OutputArea-child .jp-RenderedImage img');
  console.log('Live DOM plot found:', img?.tagName, img?.src?.slice(0, 40));
  ```
  **Observed Result (Live JupyterLab Verification):**
  ```text
  Live DOM plot found: IMG data:image/png;base64,iVBORw0KGgoAAAANSUhEUgA
  ```
  *(Proves that the rendered plot `<img>` tag and its base64 data are directly accessible in the browser DOM).*
* **DOM Remediation**: In Phase 6, author-accepted alternative text for code-cell outputs is injected directly into this `img` tag's `alt` attribute:
  ```javascript
  imgElement.setAttribute('alt', acceptedAltText);
  ```
  and persisted into the cell's metadata (`cell.model.setMetadata('a11y_metadata', ...)`).

---

## 3. Unified Contract for Phase 2

In Phase 2, `IGeneralCell` in `packages/core/src/types.ts` will be extended with:
```typescript
export interface IGeneralCell {
  cellIndex: number;
  type: "markdown" | "code" | "raw";
  source: string;
  attachments?: { [key: string]: { [mimeType: string]: string } };
  outputs?: ICellOutput[]; // <-- Added in Phase 2
}
```

Both `rawIpynbToGeneralCells` (Core) and `notebookToGeneralCells` (Extension) will populate this optional `outputs` array using the exact mechanisms documented above.
