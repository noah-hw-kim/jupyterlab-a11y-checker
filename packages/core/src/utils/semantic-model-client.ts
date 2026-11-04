import type {
  IModelClient,
  IModelValidator,
  IQualityCheckResult,
  IQualityValidationRequest,
  ISemanticRequest,
  ISemanticResult,
} from "../types.js";
import type { IModelSettings } from "./ai-utils.js";
import {
  buildSemanticModelRequestBody,
  buildQualityModelRequestBody,
} from "./semantic-model-request.js";
import { http } from "./http.js";
import { parseSemanticResponseText } from "./semantic.js";
import { parseQualityResponseText } from "./semantic-validation.js";

export class OpenAICompatibleModelClient
  implements IModelClient, IModelValidator
{
  constructor(private readonly settings: IModelSettings) {}

  async analyzeImage(request: ISemanticRequest): Promise<ISemanticResult> {
    const body = buildSemanticModelRequestBody(request, this.settings);

    const response = await http.post(this.settings.baseUrl, body, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.settings.apiKey}`,
      },
    });

    const content = response.data?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      throw new Error(
        "Semantic model response did not contain message content",
      );
    }

    return parseSemanticResponseText(content);
  }

  async validateSuggestion(
    request: IQualityValidationRequest,
  ): Promise<IQualityCheckResult> {
    if (!request.imageDataUrl.trim() || !request.suggestion.trim()) {
      throw new Error(
        "Quality validation requires image data and a nonempty suggestion",
      );
    }

    const response = await http.post(
      this.settings.baseUrl,
      buildQualityModelRequestBody(request, this.settings),
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.settings.apiKey}`,
        },
      },
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error(
        "Quality validator response did not contain message content",
      );
    }

    return parseQualityResponseText(content);
  }
}
