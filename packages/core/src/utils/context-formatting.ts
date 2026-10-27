import type { IContextPackage } from "../types.js";

/**
 * Formats selected notebook context for the model request.
 * Labels and separators are additional to the selected-source character budget.
 */
export function formatContext(context: IContextPackage): string {
  if (context.cells.length === 1) {
    return context.cells[0].text;
  }

  return context.cells
    .map((cell) => `Cell ${cell.cellIndex} — ${cell.reason}\n${cell.text}`)
    .join("\n\n");
}
