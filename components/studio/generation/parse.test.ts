import { describe, expect, it } from "vitest";
import { parseJSON, repairJSON } from "./parse";

describe("parseJSON", () => {
  it("parses a clean JSON object", () => {
    expect(parseJSON<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });

  it("strips markdown fences", () => {
    const input = '```json\n{"a": 2}\n```';
    expect(parseJSON<{ a: number }>(input)).toEqual({ a: 2 });
  });

  it("removes trailing commas before closers", () => {
    expect(parseJSON<{ arr: number[] }>('{"arr":[1,2,3,],}')).toEqual({ arr: [1, 2, 3] });
  });

  it("throws when no object is present", () => {
    expect(() => parseJSON("no json here")).toThrowError(/JSON 구조를 찾을 수 없습니다/);
  });

  it("repairs truncated objects", () => {
    // Missing closing brace
    const truncated = '{"a": 1, "b": {"c": 2';
    expect(repairJSON<{ a: number; b: { c: number } }>(truncated)).toEqual({
      a: 1,
      b: { c: 2 },
    });
  });

  it("falls back to repairJSON for malformed input", () => {
    // Trailing comma + missing bracket
    const broken = '{"xs":[1,2,';
    expect(parseJSON<{ xs: number[] }>(broken)).toEqual({ xs: [1, 2] });
  });
});
