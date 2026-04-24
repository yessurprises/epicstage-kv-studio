"use client";

// Phase F — bulk overlay modal. Operator drops a CSV (or pastes rows), the
// renderer generates one PNG per row from the catalog template, and we hand
// back a ZIP. UI flow:
//   1. file-drop / paste → parse → show schema check + first 3 preview rows
//   2. "전체 N명 일괄 생성" → render in a Web-API loop (no worker), with
//      progress counter
//   3. "ZIP 다운로드" emits a JSZip blob

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { toAsciiSafeName } from "../safe-filename";
import type { CatalogItem, SafeZoneBox } from "../types";
import { parseCsv, validateRows } from "./csv-parser";
import { parseExcel } from "./excel-parser";
import { buildExcelTemplate } from "./excel-template";
import { renderOverlayBatch, type OverlayField } from "./renderer";

interface Props {
  open: boolean;
  templateUrl: string;
  catalog: CatalogItem;
  effectiveSafeZone?: SafeZoneBox;
  onClose: () => void;
}

export default function BulkOverlayModal({
  open,
  templateUrl,
  catalog,
  effectiveSafeZone,
  onClose,
}: Props) {
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<
    Array<{ filename: string; dataUrl: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  const schema = catalog.csvSchema ?? [];
  const safeZone =
    effectiveSafeZone ??
    catalog.safeZone?.[0] ??
    null;

  useEffect(() => {
    if (!open) {
      setCsvText("");
      setRows([]);
      setParseErrors([]);
      setResults([]);
      setError(null);
      setProgress(0);
      setGenerating(false);
    }
  }, [open]);

  const sampleHeader = useMemo(
    () => schema.map((c) => c.key).join(","),
    [schema],
  );
  const sampleRow = useMemo(() => {
    if (schema.find((c) => c.key === "name")) {
      return "홍길동,CTO,가나회사";
    }
    return schema.map(() => "").join(",");
  }, [schema]);

  function handleParse(text: string) {
    setCsvText(text);
    if (!text.trim()) {
      setRows([]);
      setParseErrors([]);
      return;
    }
    const parsed = parseCsv(text);
    const validationErrors = validateRows(parsed.rows, schema);
    setRows(parsed.rows);
    setParseErrors([...parsed.errors, ...validationErrors]);
  }

  async function handleFile(file: File) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const buf = await file.arrayBuffer();
      const parsed = await parseExcel(buf);
      const validationErrors = validateRows(parsed.rows, schema);
      setRows(parsed.rows);
      setParseErrors([...parsed.errors, ...validationErrors]);
      // 엑셀 업로드 시 textarea를 비우고 안내 문구만 노출 — 한쪽이 진실이라
      // 양쪽이 동시에 활성화되지 않도록 한다.
      setCsvText(`# ${file.name} (${parsed.rows.length}행) — 엑셀에서 로드됨`);
      return;
    }
    const text = await file.text();
    handleParse(text);
  }

  async function handleDownloadTemplate() {
    try {
      const blob = await buildExcelTemplate(catalog.name, schema);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${toAsciiSafeName(catalog.name, "catalog")}-template.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleGenerate() {
    if (!safeZone) {
      setError("safeZone이 설정되지 않았습니다 — plan 편집기에서 영역을 먼저 지정하세요");
      return;
    }
    if (rows.length === 0) return;

    setError(null);
    setGenerating(true);
    setResults([]);
    setProgress(0);

    try {
      // Render in chunks of 5 so the UI stays responsive on long lists.
      const fields: OverlayField[] = schema.map((c) => ({
        key: c.key,
        weight: c.key === "name" ? 1.6 : 1,
      }));
      const out: Array<{ filename: string; dataUrl: string }> = [];
      const chunkSize = 5;
      const catalogSlug = toAsciiSafeName(catalog.name, "catalog");
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const part = await renderOverlayBatch({
          templateUrl,
          safeZone,
          fields,
          rows: chunk,
          // 한글 파일명은 ZIP/Content-Disposition 호환 이슈로 ASCII 슬러그 강제.
          // {n}는 항상 3자리 zero-pad, {name}은 본문에서 ASCII 정제됨.
          filenamePattern: `${catalogSlug}-{n}-{name}.png`,
          // chunk 단위 인덱스 보정 — {n}는 chunk 내부 인덱스가 아닌 전체 행
          // 인덱스를 가리키도록 i 오프셋을 더해줘야 한다.
          startIndex: i,
        });
        out.push(...part);
        setProgress(out.length);
      }
      setResults(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadZip() {
    if (results.length === 0) return;
    const zip = new JSZip();
    for (const r of results) {
      const base64 = r.dataUrl.split(",")[1];
      if (!base64) continue;
      zip.file(r.filename, base64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${toAsciiSafeName(catalog.name, "catalog")}-bulk-${results.length}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">대량 제작 — {catalog.name}</div>
            <div className="text-[11px] text-gray-500">
              CSV/엑셀 1행당 1매 명찰을 생성합니다. 텍스트는 카탈로그 safeZone에 자동 정렬됩니다.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-200"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 overflow-auto p-4">
          {!safeZone && (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              이 카탈로그 항목에는 safeZone이 정의되지 않았습니다. plan 편집기에서 영역을
              먼저 지정해 주세요.
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">
                명단 입력 (CSV 붙여넣기 또는 엑셀 업로드)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-300 hover:border-emerald-500 hover:text-emerald-300"
                  title="csvSchema 기반 빈 엑셀 양식을 받습니다"
                >
                  양식 다운로드
                </button>
                <label className="cursor-pointer rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-300 hover:border-indigo-500 hover:text-indigo-300">
                  파일 선택 (CSV/XLSX)
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                      // 같은 파일을 다시 업로드해도 onChange가 발화되도록 초기화
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
            <textarea
              value={csvText}
              onChange={(e) => handleParse(e.target.value)}
              placeholder={`${sampleHeader}\n${sampleRow}`}
              rows={6}
              className="w-full resize-y rounded bg-gray-950 px-2 py-1.5 font-mono text-[11px] text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
            />
            <div className="mt-1 text-[10px] text-gray-600">
              필수 컬럼: {schema.filter((c) => c.required).map((c) => c.key).join(", ") || "없음"}
              {" · "}
              전체 컬럼: {schema.map((c) => `${c.key} (${c.label})`).join(" / ")}
            </div>
          </div>

          {parseErrors.length > 0 && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
              {parseErrors.slice(0, 5).map((e, i) => (
                <div key={i}>• {e}</div>
              ))}
              {parseErrors.length > 5 && (
                <div className="text-[10px] text-rose-400/70">
                  외 {parseErrors.length - 5}건…
                </div>
              )}
            </div>
          )}

          {rows.length > 0 && parseErrors.length === 0 && (
            <div className="rounded border border-gray-800 bg-gray-900/40 p-2">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">
                미리보기 ({rows.length}행 인식, 처음 3개)
              </div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-gray-500">
                    {schema.map((c) => (
                      <th key={c.key} className="border-b border-gray-800 px-2 py-1 text-left">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 3).map((r, i) => (
                    <tr key={i} className="text-gray-300">
                      {schema.map((c) => (
                        <td key={c.key} className="border-b border-gray-900 px-2 py-1">
                          {r[c.key] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
              {error}
            </div>
          )}

          {generating && (
            <div className="rounded border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[11px] text-indigo-300">
              렌더링 중… {progress} / {rows.length}
            </div>
          )}

          {results.length > 0 && !generating && (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
              {results.length}매 렌더링 완료. ZIP 다운로드를 눌러 저장하세요.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
          >
            닫기
          </button>
          {results.length === 0 ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={
                generating ||
                rows.length === 0 ||
                parseErrors.length > 0 ||
                !safeZone
              }
              className="rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              {generating ? "생성 중…" : `전체 ${rows.length}매 일괄 생성`}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDownloadZip}
              className="rounded bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-400"
            >
              ZIP 다운로드 ({results.length}매)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
