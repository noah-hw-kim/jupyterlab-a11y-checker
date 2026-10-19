import { describe, expect, it } from "vitest";
import type { IGeneralCell, IImageCandidate } from "../types.js";
import {
  attachmentCandidateToDataUrl,
  codeOutputCandidateToDataUrl,
} from "../utils/semantic-image-data.js";

describe("codeOutputCandidateToDataUrl", () => {
  it("converts a PNG output payload into a data URL", () => {
    const candidate: IImageCandidate = {
      cellIndex: 0,
      outputIndex: 0,
      sourceType: "code-output",
      src: "dGVzdA==",
      mimeType: "image/png",
      altState: "missing",
    };

    expect(codeOutputCandidateToDataUrl(candidate)).toBe(
      "data:image/png;base64,dGVzdA==",
    );
  });

  it("converts a JPEG output payload into a data URL", () => {
    const candidate: IImageCandidate = {
      cellIndex: 0,
      outputIndex: 0,
      sourceType: "code-output",
      src: "dGVzdA==",
      mimeType: "image/jpeg",
      altState: "missing",
    };

    expect(codeOutputCandidateToDataUrl(candidate)).toBe(
      "data:image/jpeg;base64,dGVzdA==",
    );
  });

  it("rejects a candidate that is not a code output", () => {
    const candidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "markdown-inline",
      src: "chart.png",
      mimeType: "image/png",
      altState: "missing",
    };

    expect(() => codeOutputCandidateToDataUrl(candidate)).toThrow(
      "Candidate must be a code-output image.",
    );
  });

  it("rejects a candidate that is missing a MIME type", () => {
    const candidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "code-output",
      src: "chart.png",
      altState: "missing",
    };

    expect(() => codeOutputCandidateToDataUrl(candidate)).toThrow(
      "Code-output image must have a supported MIME type.",
    );
  });

  it("rejects a candidate that is an unsupported MIME type", () => {
    const candidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "code-output",
      src: "chart.png",
      mimeType: "image/gif",
      altState: "missing",
    };

    expect(() => codeOutputCandidateToDataUrl(candidate)).toThrow(
      "Code-output image must have a supported MIME type.",
    );
  });

  it("rejects a candidate that has an empty src", () => {
    const candidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "code-output",
      src: "",
      mimeType: "image/png",
      altState: "missing",
    };

    expect(() => codeOutputCandidateToDataUrl(candidate)).toThrow(
      "Code-output image src must not be empty.",
    );
  });

  it("rejects a candidate that has a blank src", () => {
    const candidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "code-output",
      src: " ",
      mimeType: "image/png",
      altState: "missing",
    };

    expect(() => codeOutputCandidateToDataUrl(candidate)).toThrow(
      "Code-output image src must not be empty.",
    );
  });
});

describe("attachmentCandidateToDataUrl", () => {
  it("converts a PNG attachment payload into a data URL", () => {
    const candidate: IImageCandidate = {
      cellIndex: 2,
      sourceType: "attachment",
      src: "attachment:chart.png",
      mimeType: "image/png",
      altState: "missing",
    };

    const cell: IGeneralCell = {
      cellIndex: 2,
      type: "markdown",
      source: "![](attachment:chart.png)",
      attachments: {
        "chart.png": {
          "image/png": "dGVzdA==",
        },
      },
    };

    expect(attachmentCandidateToDataUrl(candidate, cell)).toBe(
      "data:image/png;base64,dGVzdA==",
    );
  });

  it("rejects an attachment candidate if sourceType is not 'attachment'", () => {
    // Create a candidate with valid attachment fields,
    // but set sourceType to "markdown-inline".
    const candidate: IImageCandidate = {
      cellIndex: 2,
      sourceType: "markdown-inline",
      src: "attachment:chart.png",
      mimeType: "image/png",
      altState: "missing",
    };

    const cell: IGeneralCell = {
      cellIndex: 2,
      type: "markdown",
      source: "![](attachment:chart.png)",
      attachments: {
        "chart.png": {
          "image/png": "dGVzdA==",
        },
      },
    };

    expect(() => attachmentCandidateToDataUrl(candidate, cell)).toThrow(
      "Candidate must be an attachment image.",
    );
  });

  it("rejects cell when candidate and cell indexes do not match", () => {
    const candidate: IImageCandidate = {
      cellIndex: 2,
      sourceType: "attachment",
      src: "attachment:chart.png",
      mimeType: "image/png",
      altState: "missing",
    };

    const cell: IGeneralCell = {
      cellIndex: 3,
      type: "markdown",
      source: "![](attachment:chart.png)",
      attachments: {
        "chart.png": {
          "image/png": "dGVzdA==",
        },
      },
    };

    expect(() => attachmentCandidateToDataUrl(candidate, cell)).toThrow(
      "Candidate and cell indexes do not match.",
    );
  });

  it("rejects an attachment candidate without the attachment prefix", () => {
    const candidate: IImageCandidate = {
      cellIndex: 2,
      sourceType: "attachment",
      src: "chart.png",
      mimeType: "image/png",
      altState: "missing",
    };

    const cell: IGeneralCell = {
      cellIndex: 2,
      type: "markdown",
      source: "![](attachment:chart.png)",
      attachments: {
        "chart.png": {
          "image/png": "dGVzdA==",
        },
      },
    };

    expect(() => attachmentCandidateToDataUrl(candidate, cell)).toThrow(
      'Attachment image src must start with the "attachment:" prefix.',
    );
  });
});
