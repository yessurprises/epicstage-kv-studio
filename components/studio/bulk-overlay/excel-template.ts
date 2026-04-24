// Phase F — 엑셀 양식 생성기. csvSchema 기반으로 헤더 1행 + 가이드 셀을
// 가진 빈 .xlsx Blob을 만들어 다운로드시킨다. 운영자가 다운받아 그대로 채워
// 다시 업로드하면 excel-parser가 같은 형태로 읽는다.

import ExcelJS from "exceljs";

export interface TemplateColumn {
  key: string;
  label: string;
  required?: boolean;
}

export async function buildExcelTemplate(
  catalogName: string,
  schema: TemplateColumn[],
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Epic Stage KV Studio";
  wb.created = new Date();

  const ws = wb.addWorksheet("명단", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // 헤더 행은 csvSchema의 key 기준 — excel-parser가 이 키로 record를 만듦.
  ws.columns = schema.map((c) => ({
    header: c.key,
    key: c.key,
    width: Math.max(14, c.label.length * 2 + 4),
  }));

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F46E5" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  // 두 번째 행: 한글 라벨과 필수 여부 안내. 회색 처리해 운영자가 본 행을
  // 데이터로 오해하지 않도록 한다. excel-parser는 "헤더 다음 행 ~ 끝"을 모두
  // 데이터로 읽으므로 가이드 행 사용 시 운영자가 지우고 채워야 한다 →
  // 양식 안내 시트에 그렇게 명시한다.
  const guideRow = ws.getRow(2);
  schema.forEach((c, i) => {
    const cell = guideRow.getCell(i + 1);
    cell.value = `${c.label}${c.required ? " (필수)" : ""}`;
    cell.font = { italic: true, color: { argb: "FF6B7280" }, size: 10 };
  });

  // 안내 시트 — 양식 사용법
  const help = wb.addWorksheet("사용법");
  help.columns = [{ header: "안내", key: "note", width: 80 }];
  help.getRow(1).font = { bold: true };
  const notes = [
    `[${catalogName}] 대량 제작 양식`,
    "",
    "1. '명단' 시트의 1행은 헤더입니다. 그대로 두세요.",
    "2. 2행은 안내 행입니다. 데이터를 입력하기 전에 지우거나 그 위에 덮어쓰세요.",
    "3. 한 행당 한 명입니다. 비어 있는 행은 자동으로 무시됩니다.",
    `4. 필수 컬럼: ${schema.filter((c) => c.required).map((c) => c.key).join(", ") || "없음"}`,
    `5. 전체 컬럼: ${schema.map((c) => `${c.key} (${c.label})`).join(" / ")}`,
    "6. 저장 후 모달의 '엑셀 업로드' 버튼으로 업로드하세요.",
  ];
  notes.forEach((n) => help.addRow({ note: n }));

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
