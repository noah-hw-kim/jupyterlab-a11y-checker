import type {
  ContextStrategy,
  IContextPackage,
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
import {
  selectFixedWindowContext,
  selectLargestPracticalContext,
  selectMinimalContext,
  selectStructureAwareContext,
} from "./context-selection.js";
import { formatContext } from "./context-formatting.js";

export interface IAnalyzeCandidateOptions {
  modelName: string;
  contextStrategy?: ContextStrategy;
  /** The caller handles file or network access for local paths and external URLs. */
  resolveImageDataUrl?: (
    candidate: IImageCandidate,
    cell: IGeneralCell,
  ) => Promise<string> | string;
  contextCharacterBudget?: number;
  /** Notebook-order cells, required for structure-aware selection. */
  notebookCells?: IGeneralCell[];
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
  let inputCharacterCount = 0;
  let contextStrategy = options.contextStrategy ?? "minimal";
  let includeCellIndices: number[] = [];
  let contextCharacterBudget: number | undefined;
  let contextTruncated: boolean | undefined;
  let selectedSourceCharacterCount: number | undefined;

  try {
    let context: IContextPackage;

    switch (contextStrategy) {
      case "minimal":
        context = selectMinimalContext(
          candidate,
          [cell],
          options.contextCharacterBudget ?? cell.source.length,
        );
        break;

      case "fixed-window": {
        if (!options.notebookCells) {
          throw new Error("Fixed-window context requires notebookCells");
        }
        if (options.contextCharacterBudget === undefined) {
          throw new Error(
            "Fixed-window context requires contextCharacterBudget",
          );
        }
        if (
          !options.notebookCells.some(
            (entry) => entry.cellIndex === cell.cellIndex,
          )
        ) {
          throw new Error("The current cell is missing from notebookCells");
        }

        const notebookCells = options.notebookCells.map((entry) =>
          entry.cellIndex === cell.cellIndex ? cell : entry,
        );

        context = selectFixedWindowContext(
          candidate,
          notebookCells,
          options.contextCharacterBudget,
        );
        break;
      }

      case "structure-aware": {
        if (!options.notebookCells) {
          throw new Error("Structure-aware context requires notebookCells");
        }
        if (options.contextCharacterBudget === undefined) {
          throw new Error(
            "Structure-aware context requires contextCharacterBudget",
          );
        }
        if (
          !options.notebookCells.some(
            (entry) => entry.cellIndex === cell.cellIndex,
          )
        ) {
          throw new Error("The current cell is missing from notebookCells");
        }

        const notebookCells = options.notebookCells.map((entry) =>
          entry.cellIndex === cell.cellIndex ? cell : entry,
        );
        context = selectStructureAwareContext(
          candidate,
          notebookCells,
          options.contextCharacterBudget,
        );
        break;
      }

      case "largest-practical": {
        if (!options.notebookCells) {
          throw new Error("Largest-practical context requires notebookCells");
        }
        if (options.contextCharacterBudget === undefined) {
          throw new Error(
            "Largest-practical context requires contextCharacterBudget",
          );
        }
        if (
          !options.notebookCells.some(
            (entry) => entry.cellIndex === cell.cellIndex,
          )
        ) {
          throw new Error("The current cell is missing from notebookCells");
        }

        const notebookCells = options.notebookCells.map((entry) =>
          entry.cellIndex === cell.cellIndex ? cell : entry,
        );

        context = selectLargestPracticalContext(
          candidate,
          notebookCells,
          options.contextCharacterBudget,
        );
        break;
      }

      default:
        throw new Error(
          `Context strategy is not implemented: ${contextStrategy}`,
        );
    }

    contextStrategy = context.strategy;
    includeCellIndices = context.cells.map((entry) => entry.cellIndex);
    contextTruncated = context.truncated;
    selectedSourceCharacterCount = context.characterCount;
    contextCharacterBudget =
      options.contextCharacterBudget ??
      (contextStrategy === "minimal" ? cell.source.length : undefined);

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
    semanticRequest.cellText = formatContext(context);
    inputCharacterCount = semanticRequest.cellText.length;

    requestCount = 1;
    const semanticResult = await client.analyzeImage(semanticRequest);
    const latencyMs = Date.now() - startTime;

    return {
      candidate,
      task,
      result: semanticResult,
      metadata: {
        contextStrategy,
        includeCellIndices,
        inputCharacterCount: inputCharacterCount,
        model: options.modelName,
        latencyMs,
        requestCount,
        success: true,
        ...(contextCharacterBudget !== undefined && { contextCharacterBudget }),
        ...(contextTruncated !== undefined && { contextTruncated }),
        ...(selectedSourceCharacterCount !== undefined && {
          selectedSourceCharacterCount,
        }),
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    return {
      candidate,
      task,
      result: null,
      metadata: {
        contextStrategy,
        includeCellIndices,
        inputCharacterCount: inputCharacterCount,
        model: options.modelName,
        latencyMs,
        requestCount,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        ...(contextCharacterBudget !== undefined && { contextCharacterBudget }),
        ...(contextTruncated !== undefined && { contextTruncated }),
        ...(selectedSourceCharacterCount !== undefined && {
          selectedSourceCharacterCount,
        }),
      },
    };
  }
}
