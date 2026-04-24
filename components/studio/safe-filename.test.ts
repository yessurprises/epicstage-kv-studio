import { describe, expect, it } from "vitest";
import { toAsciiSafeName } from "./safe-filename";

describe("toAsciiSafeName", () => {
  it("returns ASCII strings unchanged (modulo trim)", () => {
    expect(toAsciiSafeName("hello-world")).toBe("hello-world");
    expect(toAsciiSafeName("file 01")).toBe("file-01");
  });

  it("strips Hangul and falls back when nothing ASCII remains", () => {
    expect(toAsciiSafeName("홍길동")).toBe("row");
    expect(toAsciiSafeName("이벤트", "event")).toBe("event");
  });

  it("preserves ASCII surrounding stripped Hangul", () => {
    // Hangul strip → "KTOA  2026" → whitespace collapse → "KTOA 2026" →
    // space-to-hyphen → "KTOA-2026". Single dash, not double.
    expect(toAsciiSafeName("KTOA 데모데이 2026")).toBe("KTOA-2026");
  });

  it("removes filesystem-illegal punctuation", () => {
    expect(toAsciiSafeName("a/b\\c:d*e?f\"g<h>i|j")).toBe("abcdefghij");
  });

  it("strips combining marks via NFKD", () => {
    // "e" + combining acute → "e"
    expect(toAsciiSafeName("e\u0301clair")).toBe("eclair");
  });

  it("collapses spaces and trims", () => {
    expect(toAsciiSafeName("   foo   bar   ")).toBe("foo-bar");
  });

  it("strips leading dots and trailing dots/hyphens", () => {
    expect(toAsciiSafeName("...foo---")).toBe("foo");
    expect(toAsciiSafeName(".hidden")).toBe("hidden");
  });

  it("returns fallback for Windows reserved names (case-insensitive)", () => {
    expect(toAsciiSafeName("CON")).toBe("row");
    expect(toAsciiSafeName("nul")).toBe("row");
    expect(toAsciiSafeName("com1")).toBe("row");
    expect(toAsciiSafeName("LPT9", "fb")).toBe("fb");
  });

  it("caps length at 120 characters", () => {
    const long = "a".repeat(300);
    expect(toAsciiSafeName(long)).toHaveLength(120);
  });

  it("returns fallback for empty/whitespace input", () => {
    expect(toAsciiSafeName("")).toBe("row");
    expect(toAsciiSafeName("   ")).toBe("row");
    expect(toAsciiSafeName("///***")).toBe("row");
  });

  it("supports custom fallback string", () => {
    expect(toAsciiSafeName("한글만", "cardnews")).toBe("cardnews");
  });
});
