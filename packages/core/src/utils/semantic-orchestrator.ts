import type {
  ContextStrategy,
  IGeneralCell,
  IImageCandidate,
  IModelClient,
  ISemanticAnalysisResult,
  SemanticTask,
} from "../types.js";
import {
  codeOutputCandidateToDataUrl,
  attachmentCandidateToDataUrl,
} from "./semantic-image-data.js";
import { buildSemanticRequest } from "./semantic-routing.js";

export interface IAnalyzeCandidateOptions {
  modelName: string;
  contextStrategy?: ContextStrategy;
  /** The caller handles file or network access for local paths and external URLs. */
  resolveImageDataUrl?: (
    candidate: IImageCandidate,
    cell: IGeneralCell,
  ) => Promise<string> | string;
}

/**
 * Resolves one image, routes generation or evaluation, and records the outcome.
 * A mismatched cell rejects the call; resolution, request-building, and model
 * errors return a failure result for the caller to handle.
 */
export async function analyzeImageCandidate(
  candidate: IImageCandidate,
  cell: IGeneralCell,
  client: IModelClient,
  options: IAnalyzeCandidateOptions,
): Promise<ISemanticAnalysisResult> {
  // Reject mismatched inputs before the recoverable analysis work begins.
  if (candidate.cellIndex !== cell.cellIndex) {
    throw new Error(
      `Candidate cellIndex (${candidate.cellIndex}) does not match provided cell.cellIndex (${cell.cellIndex})`,
    );
  }

  const startTime = Date.now();
  // Keep the intended task available even if request building fails.
  const task: SemanticTask =
    candidate.altState === "present" ? "evaluate" : "generate";
  let requestCount = 0;

  try {
    let imageDataUrl: string;

    if (candidate.sourceType === "code-output") {
      imageDataUrl = codeOutputCandidateToDataUrl(candidate);
    } else if (candidate.sourceType === "attachment") {
      imageDataUrl = attachmentCandidateToDataUrl(candidate, cell);
    } else if (candidate.src.startsWith("data:")) {
      imageDataUrl = candidate.src;
    } else if (options.resolveImageDataUrl) {
      imageDataUrl = await options.resolveImageDataUrl(candidate, cell);
    } else {
      throw new Error("Unsupported image source type for semantic analysis");
    }

    const semanticRequest = buildSemanticRequest(candidate, cell, imageDataUrl);
    requestCount = 1;
    const semanticResult = await client.analyzeImage(semanticRequest);

    const latencyMs = Date.now() - startTime;
    return {
      candidate,
      task,
      result: semanticResult,
      metadata: {
        contextStrategy: options.contextStrategy ?? "minimal",
        includeCellIndices: [cell.cellIndex],
        inputCharacterCount: semanticRequest.cellText.length,
        model: options.modelName,
        latencyMs,
        requestCount,
        success: true,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    return {
      candidate,
      task,
      result: null,
      metadata: {
        contextStrategy: options.contextStrategy ?? "minimal",
        includeCellIndices: [cell.cellIndex],
        inputCharacterCount: cell.source.length,
        model: options.modelName,
        latencyMs,
        requestCount,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
