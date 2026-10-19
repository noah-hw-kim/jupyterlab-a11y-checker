import { describe, expect, it } from "vitest";
import type { IGeneralCell, IImageCandidate } from "../types.js";
import { buildSemanticRequest } from "../utils/semantic-routing.js";

const cell: IGeneralCell = {
  cellIndex: 0,
  type: "markdown",
  source: "A cell describing quarterly revenue.",
};

const imageDataUrl = "data:image/png;base64,dGVzdA==";

const missingCandidate: IImageCandidate = {
  cellIndex: 0,
  sourceType: "markdown-inline",
  src: "chart.png",
  altState: "missing",
};

describe("buildSemanticRequest", () => {
  it("routes a missing alt text to generation", () => {
    expect(buildSemanticRequest(missingCandidate, cell, imageDataUrl)).toEqual({
      task: "generate",
      imageDataUrl,
      cellText: cell.source,
    });
  });

  it("routes an empty alt text to generation", () => {
    const emptyCandidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "markdown-inline",
      src: "chart.png",
      altState: "empty",
    };

    expect(buildSemanticRequest(emptyCandidate, cell, imageDataUrl)).toEqual({
      task: "generate",
      imageDataUrl,
      cellText: cell.source,
    });
  });

  it("routes a present alt text to evaluation", () => {
    const presentCandidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "markdown-inline",
      src: "chart.png",
      altState: "present",
      existingAltText: "A chart showing quarterly revenue.",
    };

    expect(buildSemanticRequest(presentCandidate, cell, imageDataUrl)).toEqual({
      task: "evaluate",
      imageDataUrl,
      cellText: cell.source,
      existingAltText: presentCandidate.existingAltText,
    });
  });

  it("mismatched cellIndex throws an error", () => {
    const mismatchedCandidate: IImageCandidate = {
      cellIndex: 1,
      sourceType: "markdown-inline",
      src: "chart.png",
      altState: "present",
      existingAltText: "A chart showing quarterly revenue.",
    };

    expect(() =>
      buildSemanticRequest(mismatchedCandidate, cell, imageDataUrl),
    ).toThrow("Candidate cellIndex does not match cell cellIndex.");
  });

  it("throws when present alt text has no existingAltText", () => {
    const inconsistentCandidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "markdown-inline",
      src: "chart.png",
      altState: "present",
    };

    expect(() =>
      buildSemanticRequest(inconsistentCandidate, cell, imageDataUrl),
    ).toThrow("A present alt-text candidate must include existingAltText.");
  });

  it("throws when present alt text is an empty string", () => {
    const inconsistentCandidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "markdown-inline",
      src: "chart.png",
      altState: "present",
      existingAltText: "",
    };

    expect(() =>
      buildSemanticRequest(inconsistentCandidate, cell, imageDataUrl),
    ).toThrow("A present alt-text candidate must include existingAltText.");
  });

  it("throws an error when the image data URL is empty", () => {
    expect(() => buildSemanticRequest(missingCandidate, cell, "")).toThrow(
      "Image data URL is empty.",
    );
  });

  it("throws when the image data URL contains only whitespace", () => {
    expect(() => buildSemanticRequest(missingCandidate, cell, "   ")).toThrow(
      "Image data URL is empty.",
    );
  });
});
