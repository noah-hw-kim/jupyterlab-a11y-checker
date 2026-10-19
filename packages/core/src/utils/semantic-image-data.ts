import type { IGeneralCell, IImageCandidate } from "../types.js";

export function codeOutputCandidateToDataUrl(
  candidate: IImageCandidate,
): string {
  // Validate and convert the candidate.
  if (candidate.sourceType !== "code-output") {
    throw new Error("Candidate must be a code-output image.");
  }

  if (
    candidate.mimeType !== "image/png" &&
    candidate.mimeType !== "image/jpeg"
  ) {
    throw new Error("Code-output image must have a supported MIME type.");
  }

  if (!candidate.src.trim()) {
    throw new Error("Code-output image src must not be empty.");
  }

  return `data:${candidate.mimeType};base64,${candidate.src}`;
}

export function attachmentCandidateToDataUrl(
  candidate: IImageCandidate,
  cell: IGeneralCell,
): string {
  if (candidate.sourceType !== "attachment") {
    throw new Error("Candidate must be an attachment image.");
  }

  if (candidate.cellIndex !== cell.cellIndex) {
    throw new Error("Candidate and cell indexes do not match.");
  }

  if (!candidate.src.startsWith("attachment:")) {
    throw new Error(
      'Attachment image src must start with the "attachment:" prefix.',
    );
  }

  const filename = candidate.src.slice("attachment:".length);
  const mimeType = candidate.mimeType;

  if (!mimeType) {
    throw new Error("Attachment image must have a MIME type.");
  }

  const payload = cell.attachments?.[filename]?.[mimeType];

  if (!payload) {
    throw new Error("Attachment image payload was not found.");
  }

  // Combine the MIME type and base64 payload into a data URL and return it.
  return `data:${mimeType};base64,${payload}`;
}
