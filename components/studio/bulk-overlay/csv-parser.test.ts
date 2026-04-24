import { describe, expect, it } from "vitest";
import { parseCsv, validateRows } from "./csv-parser";

describe("parseCsv", () => {
  it("parses a basic 3-column CSV with header + 2 rows", () => {
    const out = parseCsv("name,role,company\n홍길동,CTO,가나회사\n이순신,CEO,바다전자");
    expect(out.errors).toEqual([]);
    expect(out.headers).toEqual(["name", "role", "company"]);
    expect(out.rows).toEqual([
      { name: "홍길동", role: "CTO", company: "가나회사" },
      { name: "이순신", role: "CEO", company: "바다전자" },
    ]);
  });

  it("strips BOM from start", () => {
    const out = parseCsv("\uFEFFname\nA");
    expect(out.headers).toEqual(["name"]);
    expect(out.rows).toEqual([{ name: "A" }]);
  });

  it("trims unquoted fields (paste-from-Excel artifact)", () => {
    const out = parseCsv("name, role\n  홍길동 ,  CTO  ");
    expect(out.rows).toEqual([{ name: "홍길동", role: "CTO" }]);
  });

  it("preserves quoted whitespace verbatim (e.g. badge padding)", () => {
    const out = parseCsv('name,role\n"  spacey  ","CTO"');
    expect(out.rows).toEqual([{ name: "  spacey  ", role: "CTO" }]);
  });

  it("handles embedded escaped quotes \"\"", () => {
    const out = parseCsv('msg\n"He said ""hi"""');
    expect(out.rows).toEqual([{ msg: 'He said "hi"' }]);
  });

  it("supports CRLF line endings", () => {
    const out = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(out.rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("skips fully empty lines but keeps quoted-empty cells", () => {
    const out = parseCsv("a,b\n\n1,2\n,\n");
    // empty middle line dropped; trailing ',' row also dropped (every cell empty)
    expect(out.rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("always trims headers regardless of quoting", () => {
    const out = parseCsv('"  name  ", role\nA,B');
    expect(out.headers).toEqual(["name", "role"]);
    expect(out.rows).toEqual([{ name: "A", role: "B" }]);
  });

  it("returns explicit error for empty input", () => {
    expect(parseCsv("").errors).toEqual(["CSV가 비어 있습니다"]);
  });
});

describe("validateRows", () => {
  it("flags missing required columns with row index", () => {
    const errors = validateRows(
      [{ name: "A", role: "" }, { name: "", role: "X" }],
      [{ key: "name", required: true }, { key: "role" }],
    );
    expect(errors).toEqual([
      '2행: 필수 컬럼 "name"가 비어 있습니다',
    ]);
  });

  it("returns no errors when all required columns present", () => {
    const errors = validateRows(
      [{ name: "A" }, { name: "B" }],
      [{ key: "name", required: true }],
    );
    expect(errors).toEqual([]);
  });

  it("treats whitespace-only as empty for required check", () => {
    const errors = validateRows(
      [{ name: "   " }],
      [{ key: "name", required: true }],
    );
    expect(errors).toHaveLength(1);
  });
});
