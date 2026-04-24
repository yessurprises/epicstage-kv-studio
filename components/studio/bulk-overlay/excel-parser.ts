// Phase F — Excel(.xlsx) → ParsedCsv shape. 운영자가 엑셀 양식에 채워서
// 업로드하면 csv-parser와 동일한 { headers, rows, errors } 형태로 정규화한다.
// CSV 입력 경로와 다운스트림(validateRows, renderOverlayBatch)을 공유하기
// 위해 출력 형태가 같아야 한다.
//
// 셀 트리밍 정책: 헤더는 항상 trim. 본문 셀은 문자열로 변환 후 trim — 엑셀의
// `=NAME` 같은 수식은 셀의 result(.text/.value)를 사용해 평문으로 받는다.
// CSV 쪽 quoted 보존 규칙은 엑셀에는 의미가 없어 적용하지 않는다(엑셀 셀에는
// 따옴표 메타가 없음).

import ExcelJS from "exceljs";
import type { ParsedCsv } from "./csv-parser";

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) {
    // ISO date — 운영자가 별도 표기 원하면 양식 셀 서식을 텍스트로 두면 됨.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    // RichText / Hyperlink / Formula
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result !== undefined) {
      return cellToString(value.result as ExcelJS.CellValue);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((rt) => rt.text ?? "").join("");
    }
    if ("hyperlink" in value && typeof value.hyperlink === "string") {
      return value.hyperlink;
    }
  }
  return String(value);
}

export async function parseExcel(buffer: ArrayBuffer): Promise<ParsedCsv> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (err) {
    return {
      headers: [],
      rows: [],
      errors: [`엑셀 파일을 읽을 수 없습니다: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  // 첫 번째 워크시트만 사용. 운영자가 양식 외 시트(설명, 예시 등)를 추가해도
  // 첫 시트만 데이터로 처리한다는 규칙을 양식 헤더에서 안내.
  const ws = wb.worksheets[0];
  if (!ws) {
    return { headers: [], rows: [], errors: ["엑셀에 워크시트가 없습니다"] };
  }

  const allRows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    // row.values는 1-indexed (인덱스 0은 항상 undefined). 가시 컬럼 범위까지만
    // 수집하되, 중간 빈 셀은 ""로 채워 헤더 위치와 정렬을 유지한다.
    const lastCol = row.cellCount;
    for (let c = 1; c <= lastCol; c++) {
      cells.push(cellToString(row.getCell(c).value));
    }
    allRows.push(cells);
  });

  if (allRows.length === 0) {
    return { headers: [], rows: [], errors: ["엑셀이 비어 있습니다"] };
  }

  const headers = allRows[0].map((h) => h.trim()).filter((h) => h.length > 0);
  if (headers.length === 0) {
    return { headers: [], rows: [], errors: ["헤더 행이 비어 있습니다"] };
  }

  const out: Array<Record<string, string>> = [];
  for (let r = 1; r < allRows.length; r++) {
    const row = allRows[r];
    if (row.every((v) => v.trim() === "")) continue;
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = (row[i] ?? "").trim();
    });
    out.push(record);
  }

  return { headers, rows: out, errors: [] };
}
