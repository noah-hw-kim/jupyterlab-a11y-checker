import { describe, expect, it } from "vitest";
import { checkSuggestionLength } from "../utils/semantic-validation.js";

describe("checkSuggestionLength", () => {
  it.each([
    { count: 39, withinLimit: true },
    { count: 40, withinLimit: true },
    { count: 41, withinLimit: false },
  ])(
    "checks $count words against the default limit",
    ({ count, withinLimit }) => {
      const suggestion = Array(count).fill("word").join(" ");

      expect(checkSuggestionLength(suggestion)).toEqual({
        wordCount: count,
        maxWords: 40,
        withinLimit,
      });
    },
  );

  it("uses the configured limit without changing the suggestion", () => {
    const suggestion = "Line chart showing growth";

    expect(checkSuggestionLength(suggestion, 4)).toEqual({
      wordCount: 4,
      maxWords: 4,
      withinLimit: true,
    });
    expect(checkSuggestionLength(suggestion, 3)).toEqual({
      wordCount: 4,
      maxWords: 3,
      withinLimit: false,
    });
    expect(suggestion).toBe("Line chart showing growth");
  });

  it.each([
    { text: "  Line\tchart\nshowing   growth.  ", count: 4 },
    { text: "Blue-green bars.", count: 2 },
    { text: " \t\n ", count: 0 },
  ])("counts whitespace-separated words in %j", ({ text, count }) => {
    expect(checkSuggestionLength(text)).toEqual({
      wordCount: count,
      maxWords: 40,
      withinLimit: true,
    });
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid word limit %s",
    (maxWords) => {
      expect(() => checkSuggestionLength("A chart", maxWords)).toThrow(
        "maxWords must be a positive safe integer",
      );
    },
  );
});
