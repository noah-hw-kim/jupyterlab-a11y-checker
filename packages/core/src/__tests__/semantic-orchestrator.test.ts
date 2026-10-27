import { describe, expect, it, vi } from "vitest";
import type { IGeneralCell, IImageCandidate, IModelClient } from "../types.js";
import { analyzeImageCandidate } from "../utils/semantic-orchestrator.js";

describe("analyzeImageCandidate", () => {
  describe("strategy selection", () => {
    const cell: IGeneralCell = {
      cellIndex: 2,
      type: "markdown",
      source: "Sales chart",
    };
    const candidate: IImageCandidate = {
      cellIndex: 2,
      sourceType: "markdown-inline",
      src: "data:image/png;base64,dGVzdA==",
      altState: "empty",
    };
    const notebookCells: IGeneralCell[] = [
      { cellIndex: 0, type: "markdown", source: "# Revenue" },
      { cellIndex: 1, type: "markdown", source: "Measured in dollars." },
      cell,
    ];
    const expectedText =
      "Cell 2 — current-cell\nSales chart\n\n" +
      "Cell 0 — section-heading\n# Revenue\n\n" +
      "Cell 1 — same-section-markdown\nMeasured in dollars.";

    it.each([false, true])(
      "sends structure-aware context and retains metadata (provider fails: %s)",
      async (providerFails) => {
        const analyzeImage = providerFails
          ? vi.fn().mockRejectedValue(new Error("Provider unavailable"))
          : vi.fn().mockResolvedValue({
              concern: true,
              suggestion: "A sales chart.",
            });

        const result = await analyzeImageCandidate(
          candidate,
          cell,
          { analyzeImage },
          {
            modelName: "test-model",
            contextStrategy: "structure-aware",
            contextCharacterBudget: 1000,
            notebookCells,
          },
        );

        expect(analyzeImage).toHaveBeenCalledExactlyOnceWith({
          task: "generate",
          imageDataUrl: candidate.src,
          cellText: expectedText,
        });
        expect(result.metadata).toMatchObject({
          contextStrategy: "structure-aware",
          includeCellIndices: [2, 0, 1],
          inputCharacterCount: expectedText.length,
          requestCount: 1,
          success: !providerFails,
        });
        if (providerFails) {
          expect(result.result).toBeNull();
          expect(result.metadata.errorMessage).toBe("Provider unavailable");
        }
      },
    );

    it.each([
      {
        options: { contextCharacterBudget: 1000 },
        error: "requires notebookCells",
      },
      {
        options: { notebookCells },
        error: "requires contextCharacterBudget",
      },
      {
        options: {
          notebookCells: notebookCells.slice(0, 2),
          contextCharacterBudget: 1000,
        },
        error: "current cell is missing",
      },
    ])("rejects missing inputs: $error", async ({ options, error }) => {
      const analyzeImage = vi.fn();
      const result = await analyzeImageCandidate(
        candidate,
        cell,
        { analyzeImage },
        {
          modelName: "test-model",
          contextStrategy: "structure-aware",
          ...options,
        },
      );

      expect(analyzeImage).not.toHaveBeenCalled();
      expect(result.metadata).toMatchObject({
        success: false,
        requestCount: 0,
        includeCellIndices: [],
        inputCharacterCount: 0,
        errorMessage: expect.stringContaining(error),
      });
    });

    it("rejects an unknown strategy", async () => {
      const analyzeImage = vi.fn();
      const result = await analyzeImageCandidate(
        candidate,
        cell,
        { analyzeImage },
        { modelName: "test-model", contextStrategy: "unknown" as any },
      );

      expect(analyzeImage).not.toHaveBeenCalled();
      expect(result.metadata).toMatchObject({
        contextStrategy: "unknown",
        success: false,
        requestCount: 0,
        errorMessage: expect.stringContaining("not implemented"),
      });
    });

    it("sends largest-practical context and retains metadata", async () => {
      const fullNotebook: IGeneralCell[] = [
        { cellIndex: 0, type: "markdown", source: "Cell 0" },
        { cellIndex: 1, type: "code", source: "cell_1 = 1" },
        cell,
        { cellIndex: 3, type: "markdown", source: "Cell 3" },
      ];
      const analyzeImage = vi.fn().mockResolvedValue({
        concern: true,
        suggestion: "A sales chart.",
      });

      const result = await analyzeImageCandidate(
        candidate,
        cell,
        { analyzeImage },
        {
          modelName: "test-model",
          contextStrategy: "largest-practical",
          contextCharacterBudget: 1000,
          notebookCells: fullNotebook,
        },
      );

      const expectedText =
        "Cell 0 — preceding-cell\nCell 0\n\n" +
        "Cell 1 — preceding-cell\ncell_1 = 1\n\n" +
        "Cell 2 — current-cell\nSales chart\n\n" +
        "Cell 3 — following-cell\nCell 3";

      expect(analyzeImage).toHaveBeenCalledExactlyOnceWith({
        task: "generate",
        imageDataUrl: candidate.src,
        cellText: expectedText,
      });
      expect(result.metadata).toMatchObject({
        contextStrategy: "largest-practical",
        includeCellIndices: [0, 1, 2, 3],
        inputCharacterCount: expectedText.length,
        requestCount: 1,
        success: true,
      });
    });

    it.each([
      {
        options: { contextCharacterBudget: 1000 },
        error: "requires notebookCells",
      },
      {
        options: { notebookCells },
        error: "requires contextCharacterBudget",
      },
      {
        options: {
          notebookCells: notebookCells.slice(0, 2),
          contextCharacterBudget: 1000,
        },
        error: "current cell is missing",
      },
    ])(
      "rejects missing inputs for largest-practical: $error",
      async ({ options, error }) => {
        const analyzeImage = vi.fn();
        const result = await analyzeImageCandidate(
          candidate,
          cell,
          { analyzeImage },
          {
            modelName: "test-model",
            contextStrategy: "largest-practical",
            ...options,
          },
        );

        expect(analyzeImage).not.toHaveBeenCalled();
        expect(result.metadata).toMatchObject({
          contextStrategy: "largest-practical",
          success: false,
          requestCount: 0,
          errorMessage: expect.stringContaining(error),
        });
      },
    );

    it("sends fixed-window context and retains metadata", async () => {
      const fixedNotebook: IGeneralCell[] = [
        { cellIndex: 0, type: "markdown", source: "Cell 0" },
        { cellIndex: 1, type: "code", source: "cell_1 = 1" },
        cell,
        { cellIndex: 3, type: "markdown", source: "Cell 3" },
        { cellIndex: 4, type: "code", source: "cell_4 = 4" },
      ];
      const analyzeImage = vi.fn().mockResolvedValue({
        concern: true,
        suggestion: "A sales chart.",
      });

      const result = await analyzeImageCandidate(
        candidate,
        cell,
        { analyzeImage },
        {
          modelName: "test-model",
          contextStrategy: "fixed-window",
          contextCharacterBudget: 1000,
          notebookCells: fixedNotebook,
        },
      );

      const expectedFixedText =
        "Cell 0 — preceding-cell\nCell 0\n\n" +
        "Cell 1 — preceding-cell\ncell_1 = 1\n\n" +
        "Cell 2 — current-cell\nSales chart\n\n" +
        "Cell 3 — following-cell\nCell 3\n\n" +
        "Cell 4 — following-cell\ncell_4 = 4";

      expect(analyzeImage).toHaveBeenCalledExactlyOnceWith({
        task: "generate",
        imageDataUrl: candidate.src,
        cellText: expectedFixedText,
      });
      expect(result.metadata).toMatchObject({
        contextStrategy: "fixed-window",
        includeCellIndices: [0, 1, 2, 3, 4],
        inputCharacterCount: expectedFixedText.length,
        requestCount: 1,
        success: true,
      });
    });

    it.each([
      {
        options: { contextCharacterBudget: 1000 },
        error: "requires notebookCells",
      },
      {
        options: { notebookCells },
        error: "requires contextCharacterBudget",
      },
      {
        options: {
          notebookCells: notebookCells.slice(0, 2),
          contextCharacterBudget: 1000,
        },
        error: "current cell is missing",
      },
    ])(
      "rejects missing inputs for fixed-window: $error",
      async ({ options, error }) => {
        const analyzeImage = vi.fn();
        const result = await analyzeImageCandidate(
          candidate,
          cell,
          { analyzeImage },
          {
            modelName: "test-model",
            contextStrategy: "fixed-window",
            ...options,
          },
        );

        expect(analyzeImage).not.toHaveBeenCalled();
        expect(result.metadata).toMatchObject({
          contextStrategy: "fixed-window",
          success: false,
          requestCount: 0,
          errorMessage: expect.stringContaining(error),
        });
      },
    );

    it("uses the authoritative current cell without modifying notebookCells", async () => {
      const snapshot = notebookCells.map((entry) =>
        entry.cellIndex === cell.cellIndex
          ? { ...entry, source: "Outdated text" }
          : entry,
      );
      const analyzeImage = vi.fn().mockResolvedValue({
        concern: false,
        suggestion: null,
      });

      await analyzeImageCandidate(
        candidate,
        cell,
        { analyzeImage },
        {
          modelName: "test-model",
          contextStrategy: "structure-aware",
          contextCharacterBudget: 1000,
          notebookCells: snapshot,
        },
      );

      expect(analyzeImage).toHaveBeenCalledExactlyOnceWith({
        task: "generate",
        imageDataUrl: candidate.src,
        cellText: expectedText,
      });
      expect(snapshot[2].source).toBe("Outdated text");
    });
  });

  describe("minimal context integration", () => {
    const cell: IGeneralCell = {
      cellIndex: 4,
      type: "markdown",
      source: "Sales chart",
    };
    const candidate: IImageCandidate = {
      cellIndex: 4,
      sourceType: "markdown-inline",
      src: "data:image/png;base64,dGVzdA==",
      altState: "empty",
    };

    it.each([
      { budget: undefined, expectedText: "Sales chart" },
      { budget: 5, expectedText: "Sales" },
      { budget: 0, expectedText: "" },
    ])(
      "sends selected context and records its size with budget $budget",
      async ({ budget, expectedText }) => {
        const analyzeImage = vi.fn().mockResolvedValue({
          concern: true,
          suggestion: "A sales chart.",
        });

        const result = await analyzeImageCandidate(
          candidate,
          cell,
          { analyzeImage },
          { modelName: "test-model", contextCharacterBudget: budget },
        );

        expect(analyzeImage).toHaveBeenCalledExactlyOnceWith({
          task: "generate",
          imageDataUrl: candidate.src,
          cellText: expectedText,
        });
        expect(result.metadata).toMatchObject({
          contextStrategy: "minimal",
          includeCellIndices: [4],
          inputCharacterCount: expectedText.length,
          requestCount: 1,
          success: true,
        });
        expect(cell.source).toBe("Sales chart");
      },
    );

    it.each([-1, 1.5])(
      "rejects budget %s without calling the model",
      async (budget) => {
        const analyzeImage = vi.fn();

        const result = await analyzeImageCandidate(
          candidate,
          cell,
          { analyzeImage },
          { modelName: "test-model", contextCharacterBudget: budget },
        );

        expect(analyzeImage).not.toHaveBeenCalled();
        expect(result.result).toBeNull();
        expect(result.metadata).toMatchObject({
          success: false,
          requestCount: 0,
          errorMessage: expect.stringContaining("nonnegative integer"),
        });
      },
    );

    it("records the selected text size when the model request fails", async () => {
      const analyzeImage = vi
        .fn()
        .mockRejectedValue(new Error("Provider unavailable"));

      const result = await analyzeImageCandidate(
        candidate,
        cell,
        { analyzeImage },
        { modelName: "test-model", contextCharacterBudget: 5 },
      );

      expect(analyzeImage).toHaveBeenCalledExactlyOnceWith({
        task: "generate",
        imageDataUrl: candidate.src,
        cellText: "Sales",
      });
      expect(result.result).toBeNull();
      expect(result.metadata).toMatchObject({
        success: false,
        requestCount: 1,
        inputCharacterCount: 5,
        errorMessage: "Provider unavailable",
      });
    });
  });

  describe("truncation and budget metadata preservation", () => {
    const cell: IGeneralCell = {
      cellIndex: 1,
      type: "markdown",
      source: "0123456789",
    };
    const candidate: IImageCandidate = {
      cellIndex: 1,
      sourceType: "markdown-inline",
      src: "data:image/png;base64,dGVzdA==",
      altState: "empty",
    };
    const notebookCells: IGeneralCell[] = [
      { cellIndex: 0, type: "markdown", source: "Intro" },
      cell,
      { cellIndex: 2, type: "markdown", source: "Outro" },
    ];

    it("records truncation, budget, and selected source count on shortened selection", async () => {
      const analyzeImage = vi.fn().mockResolvedValue({
        concern: true,
        suggestion: "Digit diagram.",
      });

      const result = await analyzeImageCandidate(
        candidate,
        cell,
        { analyzeImage },
        {
          modelName: "test-model",
          contextStrategy: "fixed-window",
          contextCharacterBudget: 5,
          notebookCells,
        },
      );

      expect(result.metadata).toMatchObject({
        contextStrategy: "fixed-window",
        contextCharacterBudget: 5,
        contextTruncated: true,
        selectedSourceCharacterCount: 5,
        success: true,
      });
    });

    it("preserves truncation and budget metadata when provider fails", async () => {
      const analyzeImage = vi.fn().mockRejectedValue(new Error("Provider 500"));

      const result = await analyzeImageCandidate(
        candidate,
        cell,
        { analyzeImage },
        {
          modelName: "test-model",
          contextStrategy: "fixed-window",
          contextCharacterBudget: 5,
          notebookCells,
        },
      );

      expect(result.result).toBeNull();
      expect(result.metadata).toMatchObject({
        contextStrategy: "fixed-window",
        contextCharacterBudget: 5,
        contextTruncated: true,
        selectedSourceCharacterCount: 5,
        success: false,
        errorMessage: "Provider 500",
      });
    });

    it("leaves truncation metadata absent when preparation fails before selection completes", async () => {
      const analyzeImage = vi.fn();

      const result = await analyzeImageCandidate(
        candidate,
        cell,
        { analyzeImage },
        {
          modelName: "test-model",
          contextStrategy: "fixed-window",
        },
      );

      expect(analyzeImage).not.toHaveBeenCalled();
      expect(result.metadata.success).toBe(false);
      expect("contextTruncated" in result.metadata).toBe(false);
      expect("contextCharacterBudget" in result.metadata).toBe(false);
      expect("selectedSourceCharacterCount" in result.metadata).toBe(false);
    });
  });

  function createMockClient(analyzeImageFn: any): IModelClient {
    return { analyzeImage: analyzeImageFn };
  }

  it("successfully analyzes a code-output candidate for generation", async () => {
    const cell: IGeneralCell = {
      cellIndex: 0,
      source: "plt.plot()",
      type: "code",
    };

    const candidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "code-output",
      src: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
      mimeType: "image/png",
      altState: "missing",
    };
    const mockClient = createMockClient(async (request) => {
      return {
        concern: true,
        suggestion: "Line chart showing growth",
      };
    });

    const res = await analyzeImageCandidate(candidate, cell, mockClient, {
      modelName: "test-model",
    });
    expect(res.task).toBe("generate");
    expect(res.result?.suggestion).toBe("Line chart showing growth");
    expect(res.metadata.success).toBe(true);
    expect(res.metadata.requestCount).toBe(1);
    expect(res.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.metadata.includeCellIndices).toEqual([0]);
  });

  it("successfully analyzes an attachment candidate for evaluation", async () => {
    const cell: IGeneralCell = {
      cellIndex: 0,
      source: "# Diagram\n\n![Chart](diagram.png)",
      type: "markdown",
      attachments: {
        "diagram.png": {
          "image/png": "iVBORw0KGgoAAAANSUhEUgAAAAUA",
        },
      },
    };

    const candidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "attachment",
      src: "attachment:diagram.png",
      mimeType: "image/png",
      altState: "present",
      existingAltText: "Chart",
    };

    const mockClient = createMockClient(async (request) => {
      return {
        concern: false,
        suggestion: null,
      };
    });

    const res = await analyzeImageCandidate(candidate, cell, mockClient, {
      modelName: "test-model",
    });

    expect(res.task).toBe("evaluate");
    expect(res.result?.suggestion).toBe(null);
    expect(res.metadata.success).toBe(true);
    expect(res.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.metadata.includeCellIndices).toEqual([0]);
  });

  it("handles AI client network errors gracefully without throwing", async () => {
    const mockClient = createMockClient(async (request) => {
      throw new Error("Rate limit exceeded");
    });

    const cell: IGeneralCell = {
      cellIndex: 0,
      source: "plt.plot()",
      type: "code",
    };

    const candidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "code-output",
      src: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
      mimeType: "image/png",
      altState: "missing",
    };

    const res = await analyzeImageCandidate(candidate, cell, mockClient, {
      modelName: "test-model",
    });

    expect(res.result).toBeNull();
    expect(res.metadata.success).toBe(false);
    expect(res.metadata.requestCount).toBe(1);
    expect(res.metadata.errorMessage).toContain("Rate limit");
    expect(res.metadata.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("uses custom resolveImageDataUrl when provided for local files", async () => {
    const cell: IGeneralCell = {
      cellIndex: 0,
      source: "![Sales Chart](sales_chart.png)",
      type: "markdown",
    };

    const candidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "markdown-inline",
      src: "sales_chart.png",
      mimeType: "image/png",
      altState: "missing",
    };

    const mockClient = createMockClient(async (request) => {
      return {
        concern: true,
        suggestion: "Sales chart",
      };
    });

    const customResolver = vi
      .fn()
      .mockResolvedValue("data:image/png;base64,resolved-file");

    const res = await analyzeImageCandidate(candidate, cell, mockClient, {
      modelName: "test-model",
      resolveImageDataUrl: customResolver,
    });

    expect(customResolver).toHaveBeenCalledOnce();
    expect(customResolver).toHaveBeenCalledWith(candidate, cell);
    expect(res.result?.suggestion).toBe("Sales chart");
    expect(res.metadata.success).toBe(true);
    expect(res.metadata.requestCount).toBe(1);
  });

  it("throws an error if candidate.cellIndex does not match cell.cellIndex", async () => {
    const cell: IGeneralCell = {
      cellIndex: 2,
      source: "plt.plot()",
      type: "code",
    };

    const candidate: IImageCandidate = {
      cellIndex: 1,
      sourceType: "code-output",
      src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
      mimeType: "image/png",
      altState: "missing",
    };

    const mockClient = createMockClient(async (request) => {
      return {
        concern: true,
        suggestion: "Line chart showing growth",
      };
    });

    await expect(
      analyzeImageCandidate(candidate, cell, mockClient, {
        modelName: "test-model",
      }),
    ).rejects.toThrow(
      "Candidate cellIndex (1) does not match provided cell.cellIndex (2)",
    );
  });

  it("records zero requests when request building fails", async () => {
    const cell: IGeneralCell = {
      cellIndex: 0,
      source: "plt.plot()",
      type: "code",
    };

    const candidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "code-output",
      src: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
      mimeType: "image/png",
      altState: "present",
    };
    const analyzeImage = vi.fn();
    const mockClient = createMockClient(analyzeImage);

    const res = await analyzeImageCandidate(candidate, cell, mockClient, {
      modelName: "test-model",
    });

    expect(res.result).toBeNull();
    expect(res.metadata.success).toBe(false);
    expect(res.metadata.errorMessage).toContain("existingAltText");
    expect(res.metadata.requestCount).toBe(0);
    expect(analyzeImage).not.toHaveBeenCalled();
  });

  it("uses custom resolveImageDataUrl when provided for local files", async () => {
    const cell: IGeneralCell = {
      cellIndex: 0,
      source: "![Sales Chart](sales_chart.png)",
      type: "markdown",
    };

    const candidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "markdown-inline",
      src: "sales_chart.png",
      mimeType: "image/png",
      altState: "missing",
    };

    const analyzeImage = vi.fn().mockResolvedValue({
      concern: true,
      suggestion: "Sales chart",
    });
    const mockClient = createMockClient(analyzeImage);
    const customResolver = vi
      .fn()
      .mockResolvedValue("data:image/png;base64,resolved-file");

    const res = await analyzeImageCandidate(candidate, cell, mockClient, {
      modelName: "test-model",
      resolveImageDataUrl: customResolver,
    });

    expect(customResolver).toHaveBeenCalledOnce();
    expect(customResolver).toHaveBeenCalledWith(candidate, cell);

    expect(analyzeImage).toHaveBeenCalledOnce();
    expect(analyzeImage).toHaveBeenCalledWith({
      task: "generate",
      imageDataUrl: "data:image/png;base64,resolved-file",
      cellText: cell.source,
    });

    expect(res.result).toEqual({
      concern: true,
      suggestion: "Sales chart",
    });
    expect(res.metadata.success).toBe(true);
    expect(res.metadata.requestCount).toBe(1);
  });
});
