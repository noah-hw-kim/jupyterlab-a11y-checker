import type {
  IImageCandidate,
  IGeneralCell,
  ISemanticRequest,
} from "../types.js";

export function buildSemanticRequest(
  candidate: IImageCandidate,
  cell: IGeneralCell,
  imageDataUrl: string,
): ISemanticRequest {
  // 1. Verify candidate.cellIndex matches cell.cellIndex.
  if (candidate.cellIndex !== cell.cellIndex) {
    throw new Error("Candidate cellIndex does not match cell cellIndex.");
  }
  // 2. Verify imageDataUrl is not empty.
  if (!imageDataUrl.trim()) {
    throw new Error("Image data URL is empty.");
  }
  // 3. Route present alt text to "evaluate".
  if (candidate.altState === "present") {
    if (
      candidate.existingAltText === undefined ||
      candidate.existingAltText === ""
    ) {
      throw new Error(
        "A present alt-text candidate must include existingAltText.",
      );
    }

    return {
      task: "evaluate",
      imageDataUrl,
      cellText: cell.source,
      existingAltText: candidate.existingAltText,
    };
  }
  // 4. Route missing/empty alt text to "generate".
  return {
    task: "generate",
    imageDataUrl,
    cellText: cell.source,
  };
}
