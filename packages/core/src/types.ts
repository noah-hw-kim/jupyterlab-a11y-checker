export type ImageSourceType =
  | "markdown-inline"
  | "markdown-html"
  | "attachment"
  | "code-output";
export type AltTextState = "missing" | "empty" | "present";

export interface ICellIssue {
  cellIndex: number;
  cellType: "markdown" | "code";
  violationId: string;
  customDescription?: string;
  issueContentRaw: string;
  metadata?: {
    previousHeadingLevel?: number;
    [key: string]: any;
  };
  suggestedFix?: string;
  detectedBy?: "axe-core" | "custom";
}

export interface IGeneralCell {
  cellIndex: number;
  type: "markdown" | "code" | "raw";
  source: string;
  attachments?: { [key: string]: { [mimeType: string]: string } };
}

export interface IIssueInformation {
  title: string;
  description: string;
  detailedDescription: string;
  descriptionUrl?: string;
  severity?: "violation" | "best-practice";
}

export interface IImageProcessor {
  loadImage(src: string): Promise<any>;
  createCanvas(width: number, height: number): any;
}

export interface IImageCandidate {
  /** The 0-based index of the cell containing the image */
  cellIndex: number;
  /** For code-cell outputs, the index within the outputs array */
  outputIndex?: number;
  /** Where this image was found */
  sourceType: ImageSourceType;
  /** URL, file path, attachment key, or raw source tag */
  src: string;
  /** MIME type if known (e.g., 'image/png', 'image/jpeg') */
  mimeType?: string;
  /** Existing alt text string, if any */
  existingAltText?: string;
  /** Alt text status: missing, empty string, or present */
  altState: AltTextState;
  /** Character offsets in cell source (for Markdown images to enable in-place edits) */
  offsets?: {
    start: number;
    end: number;
  };
  /** Content hash of output images to detect when outputs change/rerun */
  dataHash?: string;
}
