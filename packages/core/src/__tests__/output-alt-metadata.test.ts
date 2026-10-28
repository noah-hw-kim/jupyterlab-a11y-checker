import { describe, expect, it } from "vitest";
import {
  computeImageHash,
  extractImageCandidates,
} from "../utils/image-utils.js";
import type { IGeneralCell } from "../types.js";

function outputCell(mimeType?: string): IGeneralCell {
  const data = "aGVsbG8=";
  return {
    cellIndex: 0,
    type: "code",
    source: "plot()",
    outputs: [{ data: { "image/png": data } }],
    metadata: {
      a11y_metadata: {
        outputs: {
          "0": {
            dataHash: computeImageHash(data),
            altText: "Saved plot",
            ...(mimeType && { mimeType }),
          },
        },
      },
    },
  };
}

describe("output metadata MIME identity", () => {
  it("rejects a mismatching stored MIME even when the data hash matches", () => {
    expect(extractImageCandidates([outputCell("image/jpeg")])[0].altState).toBe(
      "missing",
    );
    expect(
      extractImageCandidates([outputCell("image/png")])[0].existingAltText,
    ).toBe("Saved plot");
  });

  it("preserves extraction of older hash-matched records without MIME", () => {
    expect(extractImageCandidates([outputCell()])[0].existingAltText).toBe(
      "Saved plot",
    );
  });
});
