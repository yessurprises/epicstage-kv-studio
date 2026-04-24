import { describe, expect, it } from "vitest";
import { buildExcelTemplate } from "./excel-template";
import { parseExcel } from "./excel-parser";

const schema = [
  { key: "name", label: "이름", required: true },
  { key: "role", label: "직책" },
  { key: "company", label: "소속" },
];

describe("excel template + parser roundtrip", () => {
  it("template parses cleanly back through parseExcel", async () => {
    const blob = await buildExcelTemplate("명찰 카탈로그", schema);
    const buf = await blob.arrayBuffer();
    const parsed = await parseExcel(buf);

    expect(parsed.errors).toEqual([]);
    expect(parsed.headers).toEqual(["name", "role", "company"]);
    // The template seeds row 2 with localized labels as a guide row. parser
    // should treat that row as data (operator is supposed to overwrite it),
    // and we should see exactly 1 row with the guide-row contents.
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].name).toContain("이름");
    expect(parsed.rows[0].name).toContain("필수");
  });

  it("parser surfaces empty-input error rather than throwing", async () => {
    const empty = new ArrayBuffer(0);
    const parsed = await parseExcel(empty);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.rows).toEqual([]);
  });

  it("template Blob is a valid xlsx MIME", async () => {
    const blob = await buildExcelTemplate("X", schema);
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(blob.size).toBeGreaterThan(1000); // xlsx zip overhead alone > 1KB
  });
});
