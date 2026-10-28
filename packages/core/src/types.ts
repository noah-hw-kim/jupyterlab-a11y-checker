export type ImageSourceType =
  | "markdown-inline"
  | "markdown-html"
  | "attachment"
  | "code-output";

export type AltTextState = "missing" | "empty" | "present";

export type ContextStrategy =
  | "minimal"
  | "fixed-window"
  | "structure-aware"
  | "largest-practical";

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

export interface IWordLimitCheck {
  wordCount: number;
  maxWords: number;
  withinLimit: boolean;
}

export type ValidationOutcome = "pass" | "manual-review";

/** Overall outcome, assembled after the applicable validation checks. */
export interface IValidationResult {
  outcome: ValidationOutcome;
  reasons: string[];
  wordLimit: IWordLimitCheck;
  qualityCheck?: IQualityCheckResult;
  modelCheckStatus: "not-run" | "succeeded" | "failed";
  /** Number of quality-validator requests attempted; excludes generation. */
  requestCount: number;
  latencyMs: number;
  errorMessage?: string;
}

export interface IModelClient {
  analyzeImage(request: ISemanticRequest): Promise<ISemanticResult>;
}

export interface IQualityValidationRequest {
  imageDataUrl: string;
  /** The exact formatted context used for generation. */
  cellText: string;
  suggestion: string;
}

export interface IQualityCheckResult {
  grounded: boolean;
  contextConsistent: boolean;
  informative: boolean;
  concise: boolean;
  noUnsupportedClaims: boolean;
  reasons: string[];
}

export interface IModelValidator {
  validateSuggestion(
    request: IQualityValidationRequest,
  ): Promise<IQualityCheckResult>;
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
  /** Written by the author review flow; optional for older notebooks. */
  mimeType?: string;
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
  /** Total generation and quality-validator requests attempted. */
  requestCount: number;
  /** Preparation/generation success; inspect validation for the quality outcome. */
  success: boolean;
  errorMessage?: string;
  contextCharacterBudget?: number;
  contextTruncated?: boolean;
  selectedSourceCharacterCount?: number;
}

export interface ISemanticAnalysisResult {
  candidate: IImageCandidate;
  task: SemanticTask;
  result: ISemanticResult | null;
  validation?: IValidationResult;
  metadata: ISemanticCallMetadata;
}

export interface IContextPackage {
  strategy: ContextStrategy;
  cells: Array<{
    cellIndex: number;
    text: string;
    reason: string;
  }>;
  truncated: boolean;
  characterCount: number;
}

/** Reference-only benchmark data; never pass this record to a model. */
export interface IEvaluationCase {
  id: string;
  split: "development" | "held-out";
  category: "missing-empty" | "weak" | "acceptable";
  sourceType: "markdown-inline" | "markdown-html" | "code-output";
  notebookPath: string;
  imagePath: string;
  cellIndex: number;
  outputIndex?: number;
  contextCellIndices: number[];
  contextSensitive: boolean;
  expectedAltState: AltTextState;
  existingAltText?: string;
  shouldImprove: boolean;
  requiredFacts: string[];
  prohibitedClaims: string[];
  evidence: {
    context: string;
    image: string;
    sourceValues: number[];
    sourceX: Array<string | number>;
  };
  annotationStatus: "draft" | "reviewed";
  provenance?: {
    notebook: string;
    cellIndex: number;
    note: string;
  };
}
