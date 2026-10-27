import { marked } from "marked";
import { maskMathBlocks } from "./sanitize.js";
import type {
  IContextPackage,
  IGeneralCell,
  IImageCandidate,
} from "../types.js";

export function selectMinimalContext(
  candidate: IImageCandidate,
  cells: IGeneralCell[],
  characterBudget: number,
): IContextPackage {
  if (!Number.isInteger(characterBudget) || characterBudget < 0) {
    throw new Error(
      `selectMinimalContext: characterBudget must be a nonnegative integer, got ${characterBudget}`,
    );
  }

  const cell = cells.find((c) => c.cellIndex === candidate.cellIndex);
  if (!cell) {
    throw new Error(
      `selectMinimalContext: no cell found with cellIndex ${candidate.cellIndex}`,
    );
  }

  const text = cell.source.slice(0, characterBudget);

  return {
    strategy: "minimal",
    cells: [
      {
        cellIndex: candidate.cellIndex,
        text,
        reason: "current-cell",
      },
    ],
    truncated: text.length < cell.source.length,
    characterCount: text.length,
  };
}

/**
 * Selects a fixed window of up to 5 cells (current cell + 2 before + 2 after).
 * Budget is prioritized: current cell first, then closer neighbors, then outer neighbors.
 * Selected cells are returned in notebook order.
 */
export function selectFixedWindowContext(
  candidate: IImageCandidate,
  cells: IGeneralCell[],
  characterBudget: number,
): IContextPackage {
  if (!Number.isInteger(characterBudget) || characterBudget < 0) {
    throw new Error(
      `selectFixedWindowContext: characterBudget must be a nonnegative integer, got ${characterBudget}`,
    );
  }

  const currentPosition = cells.findIndex(
    (cell) => cell.cellIndex === candidate.cellIndex,
  );
  if (currentPosition === -1) {
    throw new Error(
      `selectFixedWindowContext: no cell found with cellIndex ${candidate.cellIndex}`,
    );
  }

  const currentCell = cells[currentPosition];
  const currentText = currentCell.source.slice(0, characterBudget);
  let remaining = characterBudget - currentText.length;
  let truncated = currentText.length < currentCell.source.length;

  const selectedCells = [
    {
      cellIndex: currentCell.cellIndex,
      text: currentText,
      reason: "current-cell",
    },
  ];

  const neighborOffsets = [-1, 1, -2, 2];
  for (const offset of neighborOffsets) {
    const pos = currentPosition + offset;
    if (pos >= 0 && pos < cells.length) {
      const neighbor = cells[pos];
      if (remaining > 0 && neighbor.source.length > 0) {
        const text = neighbor.source.slice(0, remaining);
        truncated ||= text.length < neighbor.source.length;
        selectedCells.push({
          cellIndex: neighbor.cellIndex,
          text,
          reason: offset < 0 ? "preceding-cell" : "following-cell",
        });
        remaining -= text.length;
      } else if (neighbor.source.length > 0) {
        truncated = true;
      }
    }
  }

  selectedCells.sort((a, b) => {
    const posA = cells.findIndex((c) => c.cellIndex === a.cellIndex);
    const posB = cells.findIndex((c) => c.cellIndex === b.cellIndex);
    return posA - posB;
  });

  return {
    strategy: "fixed-window",
    cells: selectedCells,
    truncated,
    characterCount: selectedCells.reduce((sum, c) => sum + c.text.length, 0),
  };
}

/**
 * Selects as many notebook cells as fit within the character budget.
 * Prioritizes the current cell first, then includes remaining notebook
 * cells in top-to-bottom reading order up to the limit.
 */
export function selectLargestPracticalContext(
  candidate: IImageCandidate,
  cells: IGeneralCell[],
  characterBudget: number,
): IContextPackage {
  if (!Number.isInteger(characterBudget) || characterBudget < 0) {
    throw new Error(
      `selectLargestPracticalContext: characterBudget must be a nonnegative integer, got ${characterBudget}`,
    );
  }

  const currentPosition = cells.findIndex(
    (cell) => cell.cellIndex === candidate.cellIndex,
  );
  if (currentPosition === -1) {
    throw new Error(
      `selectLargestPracticalContext: no cell found with cellIndex ${candidate.cellIndex}`,
    );
  }

  const currentCell = cells[currentPosition];

  // 1. Current cell is guaranteed priority
  const currentText = currentCell.source.slice(0, characterBudget);
  let remaining = characterBudget - currentText.length;
  let truncated = currentText.length < currentCell.source.length;

  const selectedCells = [
    {
      cellIndex: currentCell.cellIndex,
      text: currentText,
      reason: "current-cell",
    },
  ];

  // 2. Fill remaining budget with notebook cells in order
  for (let i = 0; i < cells.length; i++) {
    if (i === currentPosition) {
      continue;
    }

    const cell = cells[i];
    if (remaining > 0 && cell.source.length > 0) {
      const text = cell.source.slice(0, remaining);
      truncated ||= text.length < cell.source.length;
      selectedCells.push({
        cellIndex: cell.cellIndex,
        text,
        reason: i < currentPosition ? "preceding-cell" : "following-cell",
      });
      remaining -= text.length;
    } else if (cell.source.length > 0) {
      truncated = true;
    }
  }

  // 3. Restore chronological notebook order
  selectedCells.sort((a, b) => {
    const posA = cells.findIndex((c) => c.cellIndex === a.cellIndex);
    const posB = cells.findIndex((c) => c.cellIndex === b.cellIndex);
    return posA - posB;
  });

  return {
    strategy: "largest-practical",
    cells: selectedCells,
    truncated,
    characterCount: selectedCells.reduce((sum, c) => sum + c.text.length, 0),
  };
}

interface IContextHeading {
  position: number;
  offset: number;
  level: number;
  text: string;
}

/** Top-level Markdown headings only; source offsets refer to the original cell. */
function collectContextHeadings(cells: IGeneralCell[]): IContextHeading[] {
  const headings: IContextHeading[] = [];

  cells.forEach((cell, position) => {
    if (cell.type !== "markdown") {
      return;
    }

    const source = maskMathBlocks(cell.source);
    // Marked normalizes line endings. Map its offsets back to the cell source.
    const normalizedSource = source.replace(/\r\n?/g, "\n");
    const sourceOffsets: number[] = [];
    for (let offset = 0; offset < source.length; offset++) {
      sourceOffsets.push(offset);
      if (source[offset] === "\r" && source[offset + 1] === "\n") {
        offset++;
      }
    }
    sourceOffsets.push(source.length);
    let cursor = 0;
    for (const token of marked.lexer(normalizedSource)) {
      const offset = normalizedSource.indexOf(token.raw, cursor);
      if (offset === -1) {
        throw new Error("Unable to locate parsed Markdown in its source cell");
      }
      cursor = offset + token.raw.length;
      if (token.type === "heading") {
        headings.push({
          position,
          offset: sourceOffsets[offset],
          level: token.depth,
          text: cell.source
            .slice(sourceOffsets[offset], sourceOffsets[cursor])
            .trimEnd(),
        });
      }
    }
  });

  return headings;
}

/**
 * Selects section context in priority order, preserving full current-cell text.
 * Cells must be in notebook order with unique cellIndex values. Markdown image
 * offsets are required when the current cell has headings. Supports top-level
 * Markdown headings (including Setext), not HTML or nested block headings.
 */
export function selectStructureAwareContext(
  candidate: IImageCandidate,
  cells: IGeneralCell[],
  characterBudget: number,
): IContextPackage {
  const minimal = selectMinimalContext(candidate, cells, characterBudget);
  const currentPosition = cells.findIndex(
    (cell) => cell.cellIndex === candidate.cellIndex,
  );
  const currentCell = cells[currentPosition];
  const headings = collectContextHeadings(cells);
  const imageOffset = candidate.offsets?.start;

  if (
    currentCell.type === "markdown" &&
    ((imageOffset !== undefined &&
      (!Number.isInteger(imageOffset) ||
        imageOffset < 0 ||
        imageOffset > currentCell.source.length)) ||
      (imageOffset === undefined &&
        headings.some((heading) => heading.position === currentPosition)))
  ) {
    throw new Error(
      "Valid image source offsets are required for section selection",
    );
  }

  const beforeImage = (heading: IContextHeading): boolean =>
    heading.position < currentPosition ||
    (heading.position === currentPosition &&
      heading.offset < (imageOffset ?? 0));

  const precedingHeadings = headings.filter(beforeImage);
  const sectionHeading = precedingHeadings[precedingHeadings.length - 1];
  const sectionEnd = headings.find(
    (heading) =>
      !beforeImage(heading) &&
      (!sectionHeading || heading.level <= sectionHeading.level),
  );
  const startPosition = sectionHeading?.position ?? -1;
  const endPosition = sectionEnd?.position ?? cells.length;
  const headingPositions = new Set(headings.map((heading) => heading.position));

  const nearbyPositions = cells
    .map((_, position) => position)
    .filter(
      (position) =>
        position > startPosition &&
        position < endPosition &&
        position !== currentPosition &&
        cells[position].source.trim().length > 0,
    )
    .sort(
      (left, right) =>
        Math.abs(left - currentPosition) - Math.abs(right - currentPosition) ||
        left - right,
    );

  const selectedCells = [...minimal.cells];
  let remaining = characterBudget - minimal.characterCount;
  let truncated = minimal.truncated;
  const appendText = (
    position: number,
    source: string,
    reason: string,
  ): void => {
    const text = source.slice(0, remaining);
    truncated ||= text.length < source.length;
    if (text.length > 0) {
      selectedCells.push({
        cellIndex: cells[position].cellIndex,
        text,
        reason,
      });
      remaining -= text.length;
    }
  };

  // A heading in the current cell is already included; don't duplicate the cell.
  if (sectionHeading && sectionHeading.position !== currentPosition) {
    appendText(sectionHeading.position, sectionHeading.text, "section-heading");
  }

  const markdownPositions = nearbyPositions
    .filter(
      (position) =>
        cells[position].type === "markdown" && !headingPositions.has(position),
    )
    .slice(0, 2);
  for (const position of markdownPositions) {
    appendText(position, cells[position].source, "same-section-markdown");
  }

  // For output images, producing code is already included as the current cell.
  if (candidate.sourceType !== "code-output") {
    const codePosition = nearbyPositions.find(
      (position) => cells[position].type === "code",
    );
    if (codePosition !== undefined) {
      appendText(codePosition, cells[codePosition].source, "nearby-code");
    }
  }

  return {
    strategy: "structure-aware",
    cells: selectedCells,
    truncated,
    characterCount: selectedCells.reduce(
      (total, cell) => total + cell.text.length,
      0,
    ),
  };
}
