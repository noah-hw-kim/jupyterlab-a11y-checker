export type ImageSourceType =
  | "markdown-inline"
  | "markdown-html"
  | "attachment"
  | "code-output";

export type AltTextState = "missing" | "empty" | "present";

export type ContextStrategy = "minimal" | "preceding" | "surrounding" | "full";

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
  outputs?: ICellOutput[];
  metadata?: ICellMetadata;
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

export type SemanticTask = "generate" | "evaluate";

export interface ISemanticRequest {
  task: SemanticTask;
  imageDataUrl: string;
  cellText: string;
  existingAltText?: string;
}

export interface ISemanticResult {
  concern: boolean;
  suggestion: string | null;
}

export interface IModelClient {
  analyzeImage(request: ISemanticRequest): Promise<ISemanticResult>;
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

export interface ICellOutput {
  output_type?: string;
  data?: { [mimeType: string]: any };
  metadata?: any;
  [key: string]: any;
}

export interface IOutputA11yMetadata {
  dataHash: string;
  altText: string;
}

export interface IA11yMetadata {
  altText?: string; // Legacy cell-level fallback
  dataHash?: string;
  outputs?: Record<string, IOutputA11yMetadata>;
  [key: string]: any;
}

export interface ICellMetadata {
  a11y_metadata?: IA11yMetadata;
  [key: string]: any;
}

export interface ISemanticCallMetadata {
  contextStrategy: ContextStrategy;
  includeCellIndices: number[];
  inputCharacterCount: number;
  model: string;
  latencyMs: number;
  requestCount: number;
  success: boolean;
  errorMessage?: string;
}

export interface ISemanticAnalysisResult {
  candidate: IImageCandidate;
  task: SemanticTask;
  result: ISemanticResult | null;
  metadata: ISemanticCallMetadata;
}
