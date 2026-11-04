import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEvaluationConfig } from "../utils/evaluation-config.js";

const example = JSON.parse(
  readFileSync(
    new URL("../../../../evaluation/config.example.json", import.meta.url),
    "utf8",
  ),
);

describe("evaluation configuration boundary", () => {
  it("accepts the real development example and returns a detached configuration", () => {
    const input = structuredClone(example);
    const parsed = parseEvaluationConfig(input);
    expect(parsed.split).toBe("development");
    expect(parsed.batchSize).toBe(4);
    expect(parsed.retry.maxAttempts).toBe(2);
    input.retry.maxAttempts = 9;
    expect(parsed.retry.maxAttempts).toBe(2);
  });

  it.each([
    { contextCharacterBudget: 0 },
    { batchSize: -1 },
    { minimumRequestIntervalMs: NaN },
    { concurrency: 2 },
    {
      strategies: [
        "minimal",
        "minimal",
        "structure-aware",
        "largest-practical",
      ],
    },
    { strategies: ["minimal", "fixed-window", "structure-aware", "unknown"] },
    { retry: { ...example.retry, maxAttempts: 3 } },
    { retry: { ...example.retry, minimumDelayMs: 1 } },
    { retry: { ...example.retry, httpStatuses: [200] } },
    { temperature: 0 },
    { apiKeyEnv: example.endpointEnv },
  ])("rejects invalid or policy-breaking settings %j", (changes) => {
    expect(() => parseEvaluationConfig({ ...example, ...changes })).toThrow(
      "Invalid evaluation config",
    );
  });

  it("rejects credential fields without echoing their values", () => {
    const secret = "private-test-value-not-a-real-key";
    try {
      parseEvaluationConfig({ ...example, apiKey: secret });
      throw new Error("Expected configuration rejection");
    } catch (error) {
      expect(String(error)).toContain("Invalid evaluation config");
      expect(String(error)).not.toContain(secret);
    }
  });
});
