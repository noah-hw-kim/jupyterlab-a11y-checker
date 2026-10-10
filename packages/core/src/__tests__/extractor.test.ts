import { describe, expect, it } from "vitest";
import {
  computeImageHash,
  extractImageCandidates,
} from "../utils/image-utils.js";
import { IGeneralCell } from "../types.js";
import * as fs from "fs";
import { rawIpynbToGeneralCells } from "../parsers.js";
import { fileURLToPath } from "url";

describe("extractImageCandidates", () => {
  it("extracts markdown inline image with present alt text", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 0,
        type: "markdown",
        source: "Here is a chart: ![Quarterly Revenue](sales_chart.png)",
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].cellIndex).toBe(0);
    expect(candidates[0].sourceType).toBe("markdown-inline");
    expect(candidates[0].src).toBe("sales_chart.png");
    expect(candidates[0].existingAltText).toBe("Quarterly Revenue");
    expect(candidates[0].altState).toBe("present");
  });

  it("extracts HTML image tag with missing alt attribute", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 1,
        type: "markdown",
        source: '<p><img src="sales_chart.png"></p>',
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].cellIndex).toBe(1);
    expect(candidates[0].sourceType).toBe("markdown-html");
    expect(candidates[0].src).toBe("sales_chart.png");
    expect(candidates[0].existingAltText).toBeUndefined();
    expect(candidates[0].altState).toBe("missing");
  });

  it("extracts code cell output with existing alt in cell metadata", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 2,
        type: "code",
        source: "plt.plot(x, y)\nplt.show()",
        outputs: [
          {
            output_type: "display_data",
            data: {
              "image/png": "iVBORw0KGgoAAAANSUhEUgAA...",
            },
          },
        ],
        metadata: {
          a11y_metadata: {
            altText: "Line chart showing growth",
          },
        },
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].cellIndex).toBe(2);
    expect(candidates[0].outputIndex).toBe(0);
    expect(candidates[0].sourceType).toBe("code-output");
    expect(candidates[0].mimeType).toBe("image/png");
    expect(candidates[0].existingAltText).toBe("Line chart showing growth");
    expect(candidates[0].altState).toBe("present");
  });

  it("Empty alt text on inline markdown", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 3,
        type: "markdown",
        source: "![](sales_chart.png)",
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].cellIndex).toBe(3);
    expect(candidates[0].sourceType).toBe("markdown-inline");
    expect(candidates[0].src).toBe("sales_chart.png");
    expect(candidates[0].existingAltText).toBe("");
    expect(candidates[0].altState).toBe("empty");
  });

  it("extracts HTML image tag with empty alt attribute", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 4,
        type: "markdown",
        source: '<p><img src="icon.png" alt=""></p>',
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].cellIndex).toBe(4);
    expect(candidates[0].sourceType).toBe("markdown-html");
    expect(candidates[0].src).toBe("icon.png");
    expect(candidates[0].existingAltText).toBe("");
    expect(candidates[0].altState).toBe("empty");
  });

  it("extracts markdown attachment image", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 5,
        type: "markdown",
        source: "![Architecture](attachment:arch_diagram.png)",
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].cellIndex).toBe(5);
    expect(candidates[0].sourceType).toBe("attachment");
    expect(candidates[0].src).toBe("attachment:arch_diagram.png");
    expect(candidates[0].existingAltText).toBe("Architecture");
    expect(candidates[0].altState).toBe("present");
  });

  it("extracts code cell output without metadata as missing alt", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 6,
        type: "code",
        source: "plt.hist(data)\nplt.show()",
        outputs: [
          {
            output_type: "display_data",
            data: {
              "image/png": "base64-png-bytes",
            },
          },
        ],
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].cellIndex).toBe(6);
    expect(candidates[0].sourceType).toBe("code-output");
    expect(candidates[0].existingAltText).toBeUndefined();
    expect(candidates[0].altState).toBe("missing");
  });

  it("extracts code cell output with empty string alt", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 7,
        type: "code",
        source: "plt.show()",
        outputs: [
          {
            output_type: "display_data",
            data: {
              "image/jpeg": "base64-jpeg-bytes",
            },
          },
        ],
        metadata: {
          a11y_metadata: {
            altText: "",
          },
        },
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].mimeType).toBe("image/jpeg");
    expect(candidates[0].existingAltText).toBe("");
    expect(candidates[0].altState).toBe("empty");
  });

  it("ignores code cell outputs that are not images", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 8,
        type: "code",
        source: 'print("Hello world")',
        outputs: [
          {
            output_type: "stream",
            name: "stdout",
            text: ["Hello world\n"],
          },
        ],
      },
    ];

    const candidates = extractImageCandidates(cells);
    expect(candidates).toHaveLength(0);
  });

  it("extracts multiple candidates across mixed markdown and code cells", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 0,
        type: "markdown",
        source: '![First](first.png)\n<img src="second.png">',
      },
      {
        cellIndex: 1,
        type: "code",
        source: "plt.show()",
        outputs: [
          {
            data: {
              "image/png": "img-data",
            },
          },
        ],
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(3);
    expect(candidates[0].sourceType).toBe("markdown-inline");
    expect(candidates[1].sourceType).toBe("markdown-html");
    expect(candidates[2].sourceType).toBe("code-output");
  });

  it("extracts exactly 6 candidates from the benchmark dev cases notebook fixture", () => {
    const fixturePath = fileURLToPath(
      new URL(
        "../../../../test_files/dev_benchmark_cases.ipynb",
        import.meta.url,
      ),
    );
    const rawJson = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const cells = rawIpynbToGeneralCells(rawJson);

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(6);

    // Case 1: HTML img without alt
    expect(candidates[0].cellIndex).toBe(1);
    expect(candidates[0].sourceType).toBe("markdown-html");
    expect(candidates[0].altState).toBe("missing");

    // Case 2: Markdown inline image
    expect(candidates[1].cellIndex).toBe(2);
    expect(candidates[1].sourceType).toBe("markdown-inline");
    expect(candidates[1].altState).toBe("empty");

    // Case 3: Markdown weak alt
    expect(candidates[2].cellIndex).toBe(3);
    expect(candidates[2].sourceType).toBe("markdown-inline");
    expect(candidates[2].altState).toBe("present");

    // Case 4: Code output weak alt
    expect(candidates[3].cellIndex).toBe(4);
    expect(candidates[3].sourceType).toBe("code-output");
    expect(candidates[3].existingAltText).toBe("histogram");
    expect(candidates[3].altState).toBe("present");
    expect(candidates[3].dataHash).toBeDefined();

    // Case 5: Markdown descriptive alt
    expect(candidates[4].cellIndex).toBe(5);
    expect(candidates[4].sourceType).toBe("markdown-inline");
    expect(candidates[4].existingAltText).toBe(
      "Line chart showing quarterly revenue increasing steadily across five quarters.",
    );
    expect(candidates[4].altState).toBe("present");

    // Case 6: Code output descriptive alt
    expect(candidates[5].cellIndex).toBe(6);
    expect(candidates[5].sourceType).toBe("code-output");
    expect(candidates[5].existingAltText).toBe(
      "Bar chart comparing 2026 department enrollment with Computer Science highest at 1,200 students.",
    );
    expect(candidates[5].altState).toBe("present");
    expect(candidates[5].dataHash).toBeDefined();
  });

  it("does not assign legacy cell-level alt text when cell has multiple image outputs", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 0,
        type: "code",
        source: "plt.plot(x); plt.show()\nplt.plot(y); plt.show()",
        outputs: [
          { data: { "image/png": "first-image-data" } },
          { data: { "image/png": "second-image-data" } },
        ],
        metadata: {
          a11y_metadata: {
            altText: "Ambiguous description meant for only one plot",
          },
        },
      },
    ];
    const candidates = extractImageCandidates(cells);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].outputIndex).toBe(0);
    expect(candidates[1].outputIndex).toBe(1);

    expect(candidates[0].altState).toBe("missing");
    expect(candidates[1].altState).toBe("missing");
  });

  it("invalidates alt text when dataHash does not match current image", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 0,
        type: "code",
        source: "plt.plot(newData); plt.show()",
        outputs: [{ data: { "image/png": "new-different-image-bytes" } }],
        metadata: {
          a11y_metadata: {
            altText: "Old description for replaced image",
            dataHash: "stale-hash-from-previous-run",
          },
        },
      },
    ];
    const candidates = extractImageCandidates(cells);
    expect(candidates).toHaveLength(1);
    // Stale hash must cause the candidate to be marked missing
    expect(candidates[0].altState).toBe("missing");
    expect(candidates[0].existingAltText).toBeUndefined();
  });

  it("handles HTML attribute spacing, ignores data-alt, and skips img without src", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 0,
        type: "markdown",
        source:
          '### Header with <img> mention\n<img src = "chart.png" data-alt="fake" alt = "real description">',
      },
    ];
    const candidates = extractImageCandidates(cells);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].src).toBe("chart.png");
    expect(candidates[0].existingAltText).toBe("real description");
    expect(candidates[0].altState).toBe("present");
  });

  it("resolves MIME type for attachment images from cell attachments", () => {
    const cells: IGeneralCell[] = [
      {
        cellIndex: 0,
        type: "markdown",
        source: "![Flowchart](attachment:flowchart.png)",
        attachments: {
          "flowchart.png": {
            "image/png": "base64-attachment-data",
          },
        },
      },
    ];
    const candidates = extractImageCandidates(cells);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourceType).toBe("attachment");
    expect(candidates[0].mimeType).toBe("image/png");
  });

  it("uses per-output alt text when the image hash matches", () => {
    const imageData = "current-image-data";
    const dataHash = computeImageHash(imageData);

    const cells: IGeneralCell[] = [
      {
        cellIndex: 0,
        type: "code",
        source: "plt.plot(data)",
        outputs: [
          {
            data: {
              "image/png": imageData,
            },
          },
        ],
        metadata: {
          a11y_metadata: {
            outputs: {
              "0": {
                dataHash,
                altText: "Line chart showing increasing revenue",
              },
            },
          },
        },
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].outputIndex).toBe(0);
    expect(candidates[0].dataHash).toBe(dataHash);
    expect(candidates[0].existingAltText).toBe(
      "Line chart showing increasing revenue",
    );
    expect(candidates[0].altState).toBe("present");
  });

  it("rejects per-output alt text when the image hash has changed", () => {
    const currentImageData = "new-image-data";
    const oldImageHash = computeImageHash("old-image-data");

    const cells: IGeneralCell[] = [
      {
        cellIndex: 0,
        type: "code",
        source: "plt.plot(newData)",
        outputs: [
          {
            data: {
              "image/png": currentImageData,
            },
          },
        ],
        metadata: {
          a11y_metadata: {
            outputs: {
              "0": {
                dataHash: oldImageHash,
                altText: "Description of the old image",
              },
            },
          },
        },
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].existingAltText).toBeUndefined();
    expect(candidates[0].altState).toBe("missing");
    expect(candidates[0].dataHash).toBe(computeImageHash(currentImageData));
  });

  it("matches separate metadata to multiple image outputs", () => {
    const firstImage = "first-image-data";
    const secondImage = "second-image-data";

    const cells: IGeneralCell[] = [
      {
        cellIndex: 0,
        type: "code",
        source: "display(firstPlot); display(secondPlot)",
        outputs: [
          {
            output_type: "stream",
            text: ["Creating plots\n"],
          },
          {
            output_type: "display_data",
            data: {
              "image/png": firstImage,
            },
          },
          {
            output_type: "display_data",
            data: {
              "image/jpeg": secondImage,
            },
          },
        ],
        metadata: {
          a11y_metadata: {
            outputs: {
              "1": {
                dataHash: computeImageHash(firstImage),
                altText: "Description of the first plot",
              },
              "2": {
                dataHash: computeImageHash(secondImage),
                altText: "Description of the second plot",
              },
            },
          },
        },
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(2);

    expect(candidates[0].outputIndex).toBe(1);
    expect(candidates[0].existingAltText).toBe("Description of the first plot");
    expect(candidates[0].altState).toBe("present");

    expect(candidates[1].outputIndex).toBe(2);
    expect(candidates[1].existingAltText).toBe(
      "Description of the second plot",
    );
    expect(candidates[1].altState).toBe("present");
  });

  it("classifies matching per-output empty alt text as empty", () => {
    const imageData = "image-with-empty-alt";
    const dataHash = computeImageHash(imageData);

    const cells: IGeneralCell[] = [
      {
        cellIndex: 0,
        type: "code",
        source: "plt.show()",
        outputs: [
          {
            data: {
              "image/png": imageData,
            },
          },
        ],
        metadata: {
          a11y_metadata: {
            outputs: {
              "0": {
                dataHash,
                altText: "",
              },
            },
          },
        },
      },
    ];

    const candidates = extractImageCandidates(cells);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].existingAltText).toBe("");
    expect(candidates[0].altState).toBe("empty");
  });
});
