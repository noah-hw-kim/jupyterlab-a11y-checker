import { describe, expect, it, vi } from "vitest";
import type { IGeneralCell, IImageCandidate, IModelClient } from "../types.js";
import { analyzeImageCandidate } from "../utils/semantic-orchestrator.js";

describe("analyzeImageCandidate", () => {
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
