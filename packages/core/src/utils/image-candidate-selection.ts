import type { ICellIssue, IGeneralCell, IImageCandidate } from "../types.js";
import { getIssueOffsets } from "./edit.js";
import { extractImageCandidates } from "./image-utils.js";

export function findImageCandidateForIssue(
  issue: ICellIssue,
  cell: IGeneralCell,
  candidates: IImageCandidate[],
): IImageCandidate | undefined {
  if (cell.type !== "markdown") {
    return undefined;
  }

  if (cell.cellIndex !== issue.cellIndex) {
    return undefined;
  }

  const offsets = getIssueOffsets(issue, cell.source.length);
  if (!offsets) {
    return undefined;
  }

  const sourceSlice = cell.source.slice(offsets.offsetStart, offsets.offsetEnd);
  if (sourceSlice !== issue.issueContentRaw) {
    return undefined;
  }

  const matchingCandidates = candidates.filter((candidate) => {
    return (
      candidate.cellIndex === issue.cellIndex &&
      candidate.offsets?.start === offsets.offsetStart &&
      candidate.offsets?.end === offsets.offsetEnd
    );
  });

  if (matchingCandidates.length === 1) {
    return matchingCandidates[0];
  } else {
    return undefined;
  }
}

/** Re-read the selected output and reject a changed or removed image. */
export function findCurrentCodeOutputCandidate(
  selected: IImageCandidate,
  cell: IGeneralCell,
): IImageCandidate | undefined {
  if (
    selected.sourceType !== "code-output" ||
    cell.type !== "code" ||
    selected.cellIndex !== cell.cellIndex ||
    selected.outputIndex === undefined ||
    !selected.dataHash
  ) {
    return undefined;
  }

  // 2. Re-extract candidates from this single cell:
  const freshCandidates = extractImageCandidates([cell]);

  return freshCandidates.find(
    (candidate) =>
      candidate.sourceType === "code-output" &&
      candidate.outputIndex === selected.outputIndex &&
      candidate.mimeType === selected.mimeType &&
      candidate.dataHash === selected.dataHash,
  );
}
