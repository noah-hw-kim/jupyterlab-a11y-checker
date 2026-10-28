import { describe, expect, it } from "vitest";
import {
  parseSemanticResponseText,
  parseSemanticResult,
} from "../utils/semantic.js";

describe("parseSemanticResult", () => {
  it("accepts and trims a suggestion when there is a concern", () => {
    expect(
      parseSemanticResult({
        concern: true,
        suggestion: "  Useful description  ",
      }),
    ).toEqual({
      concern: true,
      suggestion: "Useful description",
    });
  });

  it("accepts null when there is no concern", () => {
    expect(
      parseSemanticResult({
        concern: false,
        suggestion: null,
      }),
    ).toEqual({
      concern: false,
      suggestion: null,
    });
  });

  it("rejects a non-boolean concern", () => {
    expect(() =>
      parseSemanticResult({
        concern: "yes",
        suggestion: "Useful description",
      }),
    ).toThrow("concern");
  });

  it("rejects a concern without a suggestion", () => {
    expect(() =>
      parseSemanticResult({
        concern: true,
        suggestion: null,
      }),
    ).toThrow("suggestion");
  });

  it("rejects a concern with an empty suggestion", () => {
    expect(() =>
      parseSemanticResult({
        concern: true,
        suggestion: "   ",
      }),
    ).toThrow(
      "Invalid semantic result format: 'suggestion' must be provided when 'concern' is true",
    );
  });

  it("rejects a concern with a suggestion when there is no concern", () => {
    expect(() =>
      parseSemanticResult({
        concern: false,
        suggestion: "Unnecessary suggestion",
      }),
    ).toThrow(
      "Invalid semantic result format: 'suggestion' must not be provided when 'concern' is false",
    );
  });

  it("rejects a missing concern", () => {
    expect(() =>
      parseSemanticResult({
        suggestion: "Description",
      }),
    ).toThrow("Invalid semantic result format: 'concern' must be a boolean");
  });

  it("rejects a missing suggestion", () => {
    expect(() =>
      parseSemanticResult({
        concern: true,
      }),
    ).toThrow(
      "Invalid semantic result format: 'suggestion' must be a string or null",
    );
  });

  it.each([null, [], "not an object"])(
    "rejects an invalid top-level value",
    (value) => {
      expect(() => parseSemanticResult(value)).toThrow(
        "Invalid semantic result format",
      );
    },
  );
});

describe("parseSemanticResponseText", () => {
  it("parses a valid JSON response", () => {
    expect(
      parseSemanticResponseText(
        '{"concern":true,"suggestion":"Useful description"}',
      ),
    ).toEqual({
      concern: true,
      suggestion: "Useful description",
    });
  });

  it("rejects a JSON response missing concern", () => {
    expect(() =>
      parseSemanticResponseText('{"suggestion":"Useful description"}'),
    ).toThrow("Invalid semantic result format: 'concern' must be a boolean");
  });

  it("rejects an empty JSON response", () => {
    expect(() => parseSemanticResponseText("")).toThrow(
      "Semantic response must not be empty",
    );
  });

  it("rejects an invalid JSON response", () => {
    expect(() => parseSemanticResponseText("invalid json")).toThrow(
      "Semantic response must be valid JSON",
    );
  });

  it("rejects an invalid semantic shape", () => {
    expect(() =>
      parseSemanticResponseText(
        '{"concern":"yes", "suggestion":"Description"}',
      ),
    ).toThrow("Invalid semantic result format: 'concern' must be a boolean");
  });

  it("parses valid JSON without a concern", () => {
    expect(
      parseSemanticResponseText('{"concern":false,"suggestion":null}'),
    ).toEqual({
      concern: false,
      suggestion: null,
    });
  });

  it("strips markdown code fences before parsing", () => {
    expect(
      parseSemanticResponseText(
        '```json\n{"concern":false,"suggestion":null}\n```',
      ),
    ).toEqual({
      concern: false,
      suggestion: null,
    });
  });
});
