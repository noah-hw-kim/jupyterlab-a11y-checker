import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseQualityCheckResult,
  parseQualityResponseText,
} from "../utils/semantic-validation.js";
import { OpenAICompatibleModelClient } from "../utils/semantic-model-client.js";
import { http } from "../utils/http.js";

vi.mock("../utils/http.js", () => ({
  http: { post: vi.fn() },
}));

const passing = {
  grounded: true,
  contextConsistent: true,
  informative: true,
  concise: true,
  noUnsupportedClaims: true,
  reasons: [],
};

describe("quality response parsing", () => {
  it("accepts passing checks and normalizes failure explanations", () => {
    expect(parseQualityResponseText(JSON.stringify(passing))).toEqual(passing);
    expect(
      parseQualityCheckResult({
        ...passing,
        grounded: false,
        reasons: ["  The suggested trend is not visible.  "],
      }),
    ).toEqual({
      ...passing,
      grounded: false,
      reasons: ["The suggested trend is not visible."],
    });
  });

  it("strips markdown code fences before parsing JSON", () => {
    const fencedJson = "```json\n" + JSON.stringify(passing) + "\n```";
    expect(parseQualityResponseText(fencedJson)).toEqual(passing);
  });

  it.each([
    null,
    [],
    {},
    { ...passing, concise: "true" },
    { ...passing, grounded: undefined },
    { ...passing, reasons: "unsupported numbers" },
    { ...passing, reasons: [123] },
    { ...passing, grounded: false, reasons: ["  "] },
    { ...passing, grounded: false },
    { ...passing, reasons: ["An unexplained failure"] },
  ])("rejects malformed or inconsistent judgment %j", (value) => {
    expect(() => parseQualityCheckResult(value)).toThrow();
  });

  it.each(["", "not JSON", '{"grounded":'])(
    "rejects invalid response text %j",
    (text) => {
      expect(() => parseQualityResponseText(text)).toThrow("valid JSON");
    },
  );
});

describe("validateSuggestion", () => {
  const settings = {
    baseUrl: "https://example.test/v1/chat/completions",
    apiKey: "test-key",
    model: "test-vision-model",
  };
  const request = {
    imageDataUrl: "data:image/png;base64,dGVzdA==",
    cellText: "Cell 2 — current-cell\nQuarterly revenue.\n",
    suggestion: "Line chart showing quarterly revenue increasing.",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(http.post).mockResolvedValue({
      data: {
        choices: [{ message: { content: JSON.stringify(passing) } }],
      },
    } as never);
  });

  it.each([undefined, "low"] as const)(
    "sends one validation request with reasoning effort %s",
    async (reasoningEffort) => {
      const client = new OpenAICompatibleModelClient({
        ...settings,
        reasoningEffort,
      });

      await expect(client.validateSuggestion(request)).resolves.toEqual(
        passing,
      );
      expect(http.post).toHaveBeenCalledOnce();

      const [url, body, config] = vi.mocked(http.post).mock.calls[0];
      expect(url).toBe(settings.baseUrl);
      expect(body.model).toBe(settings.model);
      expect(body.max_tokens).toBe(2048);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].role).toBe("user");
      expect(JSON.parse(body.messages[1].content[0].text)).toEqual({
        cellText: request.cellText,
        suggestion: request.suggestion,
      });
      expect(body.messages[1].content[1]).toEqual({
        type: "image_url",
        image_url: { url: request.imageDataUrl },
      });
      if (reasoningEffort === "low") {
        expect(body.reasoning_effort).toBe("low");
      } else {
        expect(body).not.toHaveProperty("reasoning_effort");
      }
      expect(config).toMatchObject({
        headers: { Authorization: "Bearer test-key" },
      });
    },
  );

  it.each([null, "", "not JSON", "{}"])(
    "rejects missing or malformed validator content %j",
    async (content) => {
      vi.mocked(http.post).mockResolvedValue({
        data: { choices: [{ message: { content } }] },
      } as never);

      const client = new OpenAICompatibleModelClient(settings);
      await expect(client.validateSuggestion(request)).rejects.toThrow();
    },
  );

  it("propagates provider failure without retrying", async () => {
    vi.mocked(http.post).mockRejectedValue(new Error("Provider unavailable"));

    const client = new OpenAICompatibleModelClient(settings);
    await expect(client.validateSuggestion(request)).rejects.toThrow(
      "Provider unavailable",
    );
    expect(http.post).toHaveBeenCalledOnce();
  });

  it.each([
    { ...request, imageDataUrl: " " },
    { ...request, suggestion: " " },
  ])("rejects incomplete validation input", async (invalidRequest) => {
    const client = new OpenAICompatibleModelClient(settings);

    await expect(client.validateSuggestion(invalidRequest)).rejects.toThrow(
      "requires image data and a nonempty suggestion",
    );
    expect(http.post).not.toHaveBeenCalled();
  });
});
