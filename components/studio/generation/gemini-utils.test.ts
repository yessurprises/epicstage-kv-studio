import { describe, expect, it } from "vitest";
import {
  extractFirstImage,
  extractText,
  splitDataUrl,
  toInlineDataParts,
  type GeminiResponse,
} from "./gemini-utils";

describe("toInlineDataParts", () => {
  it("maps images to inlineData parts and respects the cap", () => {
    const images = Array.from({ length: 10 }, (_, i) => ({
      mime: "image/png",
      base64: `b64-${i}`,
    }));
    const parts = toInlineDataParts(images, 3);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ inlineData: { mimeType: "image/png", data: "b64-0" } });
  });
});

describe("extractFirstImage", () => {
  it("returns a data URL for the first inlineData part", () => {
    const response: GeminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              { text: "blah" },
              { inlineData: { mimeType: "image/jpeg", data: "AAAA" } },
            ],
          },
        },
      ],
    };
    expect(extractFirstImage(response)).toBe("data:image/jpeg;base64,AAAA");
  });

  it("throws with the provided message when no image is present", () => {
    const response: GeminiResponse = {
      candidates: [{ content: { parts: [{ text: "nope" }] } }],
    };
    expect(() => extractFirstImage(response, "missing")).toThrowError("missing");
  });
});

describe("extractText", () => {
  it("joins all text parts", () => {
    const response: GeminiResponse = {
      candidates: [{ content: { parts: [{ text: "hello " }, { text: "world" }] } }],
    };
    expect(extractText(response)).toBe("hello world");
  });

  it("returns empty string when no text parts exist", () => {
    expect(extractText({ candidates: [] })).toBe("");
  });
});

describe("splitDataUrl", () => {
  it("splits a data URL into mime + base64", () => {
    expect(splitDataUrl("data:image/png;base64,AAAA")).toEqual({
      mime: "image/png",
      base64: "AAAA",
    });
  });

  it("returns null for non-data URLs", () => {
    expect(splitDataUrl("https://example.test/a.png")).toBeNull();
  });
});
