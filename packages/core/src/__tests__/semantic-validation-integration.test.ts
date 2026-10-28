import { describe, expect, it, vi } from "vitest";
import type {
  IGeneralCell,
  IImageCandidate,
  IQualityCheckResult,
} from "../types.js";
import { analyzeImageCandidate } from "../utils/semantic-orchestrator.js";

const cells: IGeneralCell[] = [
  { cellIndex: 0, type: "markdown", source: "# Revenue" },
  { cellIndex: 1, type: "markdown", source: "Measured in dollars." },
  { cellIndex: 2, type: "markdown", source: "Current cell" },
];
const candidate: IImageCandidate = {
  cellIndex: 2,
  sourceType: "markdown-inline",
  src: "data:image/png;base64,dGVzdA==",
  altState: "empty",
};
const options = {
  modelName: "test-model",
  contextStrategy: "structure-aware" as const,
  contextCharacterBudget: 1000,
  notebookCells: cells,
};
const passing: IQualityCheckResult = {
  grounded: true,
  contextConsistent: true,
  informative: true,
  concise: true,
  noUnsupportedClaims: true,
  reasons: [],
};

it.each([false, true])(
  "reuses generation image/context and retains quality judgments (flagged: %s)",
  async (flagged) => {
    const suggestion = "Line chart showing growth.";
    const analyzeImage = vi
      .fn()
      .mockResolvedValue({ concern: true, suggestion });
    const quality = flagged
      ? {
          ...passing,
          informative: false,
          reasons: ["Important axis labels are missing."],
        }
      : passing;
    const validateSuggestion = vi.fn().mockResolvedValue(quality);

    const result = await analyzeImageCandidate(
      candidate,
      cells[2],
      { analyzeImage },
      {
        ...options,
        validator: { validateSuggestion },
      },
    );

    expect(analyzeImage).toHaveBeenCalledOnce();
    const request = analyzeImage.mock.calls[0][0];
    expect(validateSuggestion).toHaveBeenCalledExactlyOnceWith({
      imageDataUrl: request.imageDataUrl,
      cellText: request.cellText,
      suggestion,
    });
    expect(result.result).toEqual({ concern: true, suggestion });
    expect(result.validation).toMatchObject({
      outcome: flagged ? "manual-review" : "pass",
      modelCheckStatus: "succeeded",
      qualityCheck: quality,
      requestCount: 1,
    });
    expect(result.metadata).toMatchObject({ success: true, requestCount: 2 });
  },
);

describe("validation failure and skip behavior", () => {
  it.each(["provider-error", "malformed-judgment"])(
    "retains the suggestion on %s without retrying",
    async (mode) => {
      const analyzeImage = vi
        .fn()
        .mockResolvedValue({ concern: true, suggestion: "A chart." });
      const validateSuggestion =
        mode === "provider-error"
          ? vi.fn().mockRejectedValue(new Error("Provider unavailable"))
          : vi.fn().mockResolvedValue({});

      const result = await analyzeImageCandidate(
        candidate,
        cells[2],
        { analyzeImage },
        {
          ...options,
          validator: { validateSuggestion },
        },
      );

      expect(analyzeImage).toHaveBeenCalledOnce();
      expect(validateSuggestion).toHaveBeenCalledOnce();
      expect(result.result?.suggestion).toBe("A chart.");
      expect(result.validation).toMatchObject({
        outcome: "manual-review",
        modelCheckStatus: "failed",
        requestCount: 1,
        errorMessage: expect.any(String),
      });
      expect(result.metadata).toMatchObject({ success: true, requestCount: 2 });
    },
  );

  it("skips the model check when the word limit fails", async () => {
    const analyzeImage = vi.fn().mockResolvedValue({
      concern: true,
      suggestion: "A chart with many details.",
    });
    const validateSuggestion = vi.fn();
    const result = await analyzeImageCandidate(
      candidate,
      cells[2],
      { analyzeImage },
      {
        ...options,
        validator: { validateSuggestion },
        maxSuggestionWords: 3,
      },
    );

    expect(validateSuggestion).not.toHaveBeenCalled();
    expect(result.validation).toMatchObject({
      outcome: "manual-review",
      modelCheckStatus: "not-run",
      wordLimit: { wordCount: 5, maxWords: 3, withinLimit: false },
      requestCount: 0,
    });
    expect(result.metadata.requestCount).toBe(1);
  });

  it("skips validation when no replacement is needed", async () => {
    const analyzeImage = vi
      .fn()
      .mockResolvedValue({ concern: false, suggestion: null });
    const validateSuggestion = vi.fn();
    const result = await analyzeImageCandidate(
      candidate,
      cells[2],
      { analyzeImage },
      {
        ...options,
        validator: { validateSuggestion },
      },
    );

    expect(validateSuggestion).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("validation");
    expect(result.metadata.requestCount).toBe(1);
  });

  it("never marks generation-only callers as validated", async () => {
    const analyzeImage = vi
      .fn()
      .mockResolvedValue({ concern: true, suggestion: "A chart." });
    const result = await analyzeImageCandidate(
      candidate,
      cells[2],
      { analyzeImage },
      options,
    );

    expect(result.validation).toMatchObject({
      outcome: "manual-review",
      modelCheckStatus: "not-run",
      requestCount: 0,
    });
    expect(result.metadata.requestCount).toBe(1);
  });

  it("rejects an invalid word limit before calling the provider", async () => {
    const analyzeImage = vi.fn();
    const result = await analyzeImageCandidate(
      candidate,
      cells[2],
      { analyzeImage },
      {
        ...options,
        maxSuggestionWords: 0,
      },
    );

    expect(analyzeImage).not.toHaveBeenCalled();
    expect(result.result).toBeNull();
    expect(result.metadata).toMatchObject({ success: false, requestCount: 0 });
  });

  it("rejects malformed generation before validation", async () => {
    const analyzeImage = vi
      .fn()
      .mockResolvedValue({ concern: false, suggestion: "Inconsistent result" });
    const validateSuggestion = vi.fn();
    const result = await analyzeImageCandidate(
      candidate,
      cells[2],
      { analyzeImage },
      {
        ...options,
        validator: { validateSuggestion },
      },
    );

    expect(validateSuggestion).not.toHaveBeenCalled();
    expect(result.result).toBeNull();
    expect(result.metadata).toMatchObject({ success: false, requestCount: 1 });
  });
});
