import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ISemanticRequest } from "../types.js";
import type { IModelSettings } from "../utils/ai-utils.js";
import { OpenAICompatibleModelClient } from "../utils/semantic-model-client.js";
import { http } from "../utils/http.js";

vi.mock("../utils/http.js", () => ({
  http: {
    post: vi.fn(),
  },
}));

const settings: IModelSettings = {
  baseUrl: "https://example.test/v1/chat/completions",
  apiKey: "test-key",
  model: "test-vision-model",
};

const request: ISemanticRequest = {
  task: "generate",
  imageDataUrl: "data:image/png;base64,dGVzdA==",
  cellText: "A notebook cell describing quarterly revenue.",
};

describe("OpenAICompatibleModelClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(http.post).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content:
                '{"concern":true,"suggestion":"A quarterly revenue chart."}',
            },
          },
        ],
      },
    } as never);
  });

  it("posts the image and context and returns a validated result", async () => {
    const client = new OpenAICompatibleModelClient(settings);

    await expect(client.analyzeImage(request)).resolves.toEqual({
      concern: true,
      suggestion: "A quarterly revenue chart.",
    });

    expect(http.post).toHaveBeenCalledOnce();

    const [url, body, config] = vi.mocked(http.post).mock.calls[0];

    expect(url).toBe(settings.baseUrl);

    expect(body).toMatchObject({
      model: settings.model,
      messages: expect.any(Array),
      max_tokens: 2048,
      ...(settings.reasoningEffort === "low"
        ? { reasoning_effort: "low" }
        : {}),
    });

    expect(JSON.stringify(body)).toContain(request.imageDataUrl);
    expect(JSON.stringify(body)).toContain(request.cellText);

    expect(config).toMatchObject({
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-key",
      },
    });
  });

  it("rejects a response without message content", async () => {
    vi.mocked(http.post).mockResolvedValue({
      data: {
        choices: [],
      },
    } as never);

    const client = new OpenAICompatibleModelClient(settings);

    await expect(client.analyzeImage(request)).rejects.toThrow(
      "Semantic model response did not contain message content",
    );
  });

  it("rejects non-JSON provider content", async () => {
    vi.mocked(http.post).mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: "This is not JSON",
            },
          },
        ],
      },
    } as never);

    const client = new OpenAICompatibleModelClient(settings);

    await expect(client.analyzeImage(request)).rejects.toThrow(
      "Semantic response must be valid JSON",
    );
  });

  it("rejects semantic response with incorrect types", async () => {
    vi.mocked(http.post).mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: '{"concern":"yes","suggestion":"Description"}',
            },
          },
        ],
      },
    } as never);

    const client = new OpenAICompatibleModelClient(settings);

    await expect(client.analyzeImage(request)).rejects.toThrow(
      "Invalid semantic result format: 'concern' must be a boolean",
    );
  });

  it("propagates a network failure", async () => {
    vi.mocked(http.post).mockRejectedValueOnce(
      new Error("Network unavailable"),
    );

    const client = new OpenAICompatibleModelClient(settings);

    await expect(client.analyzeImage(request)).rejects.toThrow(
      "Network unavailable",
    );
  });

  it("analyzes an existing alt text", async () => {
    const evaluateRequest: ISemanticRequest = {
      ...request,
      task: "evaluate",
      existingAltText: "graph",
    };

    vi.mocked(http.post).mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: '{"concern":false,"suggestion":null}',
            },
          },
        ],
      },
    } as never);

    const client = new OpenAICompatibleModelClient(settings);

    await expect(client.analyzeImage(evaluateRequest)).resolves.toEqual({
      concern: false,
      suggestion: null,
    });

    const [, body] = vi.mocked(http.post).mock.calls[0];

    expect(JSON.stringify(body)).toContain("graph");
    expect(JSON.stringify(body)).toContain("Evaluate this existing alt text");
  });
});
