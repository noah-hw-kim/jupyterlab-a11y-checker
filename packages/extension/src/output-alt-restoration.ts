import type { NotebookPanel } from '@jupyterlab/notebook';
import type { CodeCell } from '@jupyterlab/cells';
import { extractImageCandidates } from '@berkeley-dsep-infra/a11y-checker-core';
import { notebookToGeneralCells } from './adapter.js';
import { type IAppliedOutputAlt, syncRenderedOutputAlt } from './output-alt.js';

/** Restore accepted alt text on open, model changes, and output rendering. */
export function installOutputAltRestoration(notebook: NotebookPanel): void {
  const managed = new WeakMap<HTMLImageElement, IAppliedOutputAlt>();
  let frame: number | undefined;
  const reconcile = () => {
    frame = undefined;
    if (notebook.isDisposed) {
      return;
    }
    const cells = notebookToGeneralCells(notebook);
    for (const cell of cells) {
      if (cell.type !== 'code') {
        continue;
      }
      const widget = notebook.content.widgets[cell.cellIndex] as CodeCell;
      const area = widget.outputArea;
      if (!area) {
        continue;
      }
      const candidates = extractImageCandidates([cell]);
      const handled = new Set<HTMLImageElement>();
      // Truncated output areas cannot safely be indexed against the full model.
      if (area.widgets.length === (cell.outputs?.length ?? 0)) {
        for (const candidate of candidates) {
          const output = area.widgets[candidate.outputIndex!];
          const images = output?.node.querySelectorAll<HTMLImageElement>(
            '.jp-RenderedImage img'
          );
          if (images?.length !== 1) {
            continue;
          }
          const image = images[0];
          handled.add(image);
          syncRenderedOutputAlt(
            image,
            candidate,
            cell.metadata?.a11y_metadata,
            managed
          );
        }
      }
      for (const image of widget.node.querySelectorAll<HTMLImageElement>(
        '.jp-OutputArea .jp-RenderedImage img'
      )) {
        if (!handled.has(image)) {
          syncRenderedOutputAlt(image, undefined, undefined, managed);
        }
      }
    }
  };
  const schedule = () => {
    if (!notebook.isDisposed && frame === undefined) {
      frame = requestAnimationFrame(reconcile);
    }
  };
  const observer = new MutationObserver(schedule);
  notebook.disposed.connect(() => {
    observer.disconnect();
    notebook.content.modelContentChanged.disconnect(schedule);
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
  });
  void notebook.context.ready.then(() => {
    if (notebook.isDisposed) {
      return;
    }
    notebook.content.modelContentChanged.connect(schedule);
    // Ignore alt mutations made by this extension to avoid feedback loops.
    observer.observe(notebook.content.node, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src']
    });
    schedule();
  });
}
