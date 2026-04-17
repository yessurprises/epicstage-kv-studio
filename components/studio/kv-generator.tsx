"use client";

import { useRef, useState } from "react";
import { useStore, type MasterKv } from "./use-store";
import { generateMasterKV, generateRecraftKV } from "./guideline-generator";
import { downloadNoTextPng, downloadTransparentPng, downloadAsSvg, downloadNoTextSvg, downloadTransparentSvg } from "./export-utils";
import type { VectorizeProvider } from "./vectorize-service";
import { KV_RATIOS } from "./constants";

const RATIO_LABELS = {
  "16:9": "가로형",
  "3:4": "세로형",
  "1:1": "정사각",
} as const;

export default function KvGenerator({ onConfirm }: { onConfirm: () => void }) {
  const {
    versions, selectedVersionId,
    ciImages, refAnalysis,
    setMasterKv, confirmMasterKv, markVariationsStale,
    addLog,
  } = useStore();

  const activeVersion = versions.find((v) => v.id === selectedVersionId);
  const masterKv = activeVersion?.masterKv;

  type KvEngine = "gemini" | "recraft_vector";
  const [selectedRatio, setSelectedRatio] = useState<string>("16:9");
  const [engine, setEngine] = useState<KvEngine>("gemini");
  const [generating, setGenerating] = useState(false);
  const [exportingNoText, setExportingNoText] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [exportingPngStage, setExportingPngStage] = useState<"notext" | "rembg" | "">("");
  const [exportingSvg, setExportingSvg] = useState(false);
  const [exportingSvgType, setExportingSvgType] = useState<"" | "original" | "notext" | "transparent">("");
  const [svgProvider, setSvgProvider] = useState<VectorizeProvider>("vectorizer");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedKvDef = KV_RATIOS.find((r) => r.ratio === selectedRatio)!;

  async function handleGenerate() {
    if (!activeVersion) return;
    setGenerating(true);
    setError("");
    const engineLabel = engine === "gemini" ? "Gemini" : engine === "recraft_vector" ? "Recraft Vector" : "Recraft";
    addLog(`마스터 KV 생성 중... (${selectedRatio}, ${engineLabel})`);
    try {
      const ci = ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));
      let imageUrl: string;

      if (engine === "gemini") {
        imageUrl = await generateMasterKV(
          activeVersion.guideline,
          selectedRatio,
          selectedKvDef.name,
          ci,
          refAnalysis || undefined
        );
      } else {
        const result = await generateRecraftKV(
          activeVersion.guideline,
          selectedRatio,
          selectedKvDef.name,
          engine === "recraft_vector",
          undefined,
          ci.length > 0 ? ci : undefined,
          refAnalysis || undefined
        );
        imageUrl = result.imageUrl;
      }

      const kv: MasterKv = {
        imageUrl,
        ratio: selectedRatio,
        confirmed: false,
      };
      setMasterKv(activeVersion.id, kv);
      addLog(`마스터 KV 생성 완료 (${engineLabel})`, "ok");
    } catch (err: any) {
      const msg = err.message || "알 수 없는 오류";
      setError(msg);
      addLog(`KV 생성 실패: ${msg}`, "err");
    }
    setGenerating(false);
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeVersion) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const kv: MasterKv = {
        imageUrl: dataUrl,
        ratio: selectedRatio,
        confirmed: false,
        uploadedByUser: true,
      };
      setMasterKv(activeVersion.id, kv);
      addLog("마스터 KV 업로드 완료", "ok");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleConfirm() {
    if (!activeVersion || !masterKv?.imageUrl) return;
    // 이미 확정됐다가 다시 확정 시 → 바리에이션 stale 표시
    if (masterKv.confirmed) {
      markVariationsStale(activeVersion.id);
    }
    confirmMasterKv(activeVersion.id);
    addLog("마스터 KV 확정 — Step 4로 이동", "ok");
    onConfirm();
  }

  if (!activeVersion) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-gray-800 bg-gray-900/30 py-20 text-center">
        <p className="text-sm text-gray-400">Step 2에서 가이드라인 버전을 먼저 확정해주세요</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 비율 선택 */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">KV 비율 선택</h3>
        <div className="flex gap-2">
          {KV_RATIOS.map((r) => (
            <button
              key={r.ratio}
              onClick={() => setSelectedRatio(r.ratio)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-5 py-3 text-sm transition-all ${
                selectedRatio === r.ratio
                  ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                  : "border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-300"
              }`}
            >
              {/* Aspect ratio preview */}
              <span className={`flex items-center justify-center rounded border border-current/30 bg-current/5 ${
                r.ratio === "16:9" ? "h-6 w-10" : r.ratio === "3:4" ? "h-10 w-7" : "h-8 w-8"
              }`} />
              <span className="font-medium">{RATIO_LABELS[r.ratio as keyof typeof RATIO_LABELS]}</span>
              <span className="font-mono text-[10px] opacity-60">{r.ratio}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 생성 엔진 선택 */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">생성 엔진</h3>
        <div className="flex gap-2">
          {([
            { id: "gemini" as KvEngine, label: "Gemini", desc: "Nano Banana 2" },
            { id: "recraft_vector" as KvEngine, label: "Recraft Vector", desc: "V4 SVG" },
          ]).map((e) => (
            <button
              key={e.id}
              onClick={() => setEngine(e.id)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-4 py-2.5 text-sm transition-all ${
                engine === e.id
                  ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                  : "border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-300"
              }`}
            >
              <span className="font-medium">{e.label}</span>
              <span className="text-[10px] opacity-60">{e.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* KV 캔버스 */}
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
        {masterKv?.imageUrl ? (
          <div className="relative">
            <img
              src={masterKv.imageUrl}
              alt="마스터 KV"
              className="w-full object-contain"
            />
            {masterKv.confirmed && (
              <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400 backdrop-blur-sm ring-1 ring-emerald-500/30">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M14.3.3c.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4l-8 8c-.2.2-.4.3-.7.3-.3 0-.5-.1-.7-.3l-4-4c-.4-.4-.4-1 0-1.4.4-.4 1-.4 1.4 0L7 7.6 14.3.3z" />
                </svg>
                확정됨
              </div>
            )}
          </div>
        ) : (
          <div
            className="flex cursor-pointer flex-col items-center justify-center gap-3 py-24 transition-colors hover:bg-gray-900/50"
            onClick={handleUploadClick}
          >
            <svg className="h-10 w-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-gray-600">생성 또는 이미지 업로드</p>
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="btn flex items-center gap-2 rounded-xl bg-gradient-to-t from-indigo-600 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50"
        >
          {generating ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              KV 생성 중...
            </>
          ) : masterKv?.imageUrl ? (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              다른 시드로 재생성
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              KV 생성
            </>
          )}
        </button>

        <button
          onClick={handleUploadClick}
          className="btn flex items-center gap-2 rounded-xl border border-gray-700 px-6 py-3 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          업로드
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* 내보내기 버튼 — KV 이미지 있을 때만 */}
        {masterKv?.imageUrl && (
          <>
            <div className="h-6 w-px bg-gray-800" />

            {/* 대지 PNG — 벡터화/배경제거 전 중간 단계 */}
            <button
              onClick={async () => {
                setExportingNoText(true);
                setError("");
                try {
                  const name = `${activeVersion?.guideline?.event_summary?.name || "kv"}-notext.png`;
                  await downloadNoTextPng(masterKv.imageUrl, name);
                  addLog("대지 PNG 다운로드 완료", "ok");
                } catch (e: any) { setError(e.message); }
                setExportingNoText(false);
              }}
              disabled={exportingNoText || exportingPng || exportingSvg}
              className="btn flex items-center gap-2 rounded-xl border border-gray-700 px-4 py-3 text-sm text-gray-400 transition-colors hover:border-indigo-500/50 hover:text-indigo-300 disabled:opacity-50"
            >
              {exportingNoText ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  대지 생성 중...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  대지 PNG
                </>
              )}
            </button>

            <button
              onClick={async () => {
                setExportingPng(true);
                setError("");
                try {
                  const name = `${activeVersion?.guideline?.event_summary?.name || "kv"}-transparent.png`;
                  await downloadTransparentPng(masterKv.imageUrl, name, (stage) => setExportingPngStage(stage));
                  addLog("투명 PNG 다운로드 완료", "ok");
                } catch (e: any) { setError(e.message); }
                setExportingPng(false);
                setExportingPngStage("");
              }}
              disabled={exportingNoText || exportingPng || exportingSvg}
              className="btn flex items-center gap-2 rounded-xl border border-gray-700 px-4 py-3 text-sm text-gray-400 transition-colors hover:border-indigo-500/50 hover:text-indigo-300 disabled:opacity-50"
            >
              {exportingPng ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {exportingPngStage === "notext" ? "대지 생성 중..." : "배경 제거 중..."}
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                  </svg>
                  투명 PNG
                </>
              )}
            </button>

            {/* SVG Provider 선택 */}
            <select
              value={svgProvider}
              onChange={(e) => setSvgProvider(e.target.value as VectorizeProvider)}
              className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-2 text-xs text-gray-400"
            >
              <option value="vectorizer">Vectorizer.ai</option>
              <option value="recraft">Recraft AI</option>
            </select>

            {/* 원본 SVG */}
            <button
              onClick={async () => {
                setExportingSvg(true); setExportingSvgType("original"); setError("");
                try {
                  const name = `${activeVersion?.guideline?.event_summary?.name || "kv"}-vector.svg`;
                  await downloadAsSvg(masterKv.imageUrl, name, svgProvider);
                  addLog(`원본 SVG 다운로드 완료 (${svgProvider})`, "ok");
                } catch (e: any) { setError(e.message); }
                setExportingSvg(false); setExportingSvgType("");
              }}
              disabled={exportingNoText || exportingPng || exportingSvg}
              className="btn flex items-center gap-2 rounded-xl border border-gray-700 px-3 py-3 text-xs text-gray-400 transition-colors hover:border-indigo-500/50 hover:text-indigo-300 disabled:opacity-50"
            >
              {exportingSvgType === "original" ? "변환 중..." : "원본 SVG"}
            </button>

            {/* 대지 SVG */}
            <button
              onClick={async () => {
                setExportingSvg(true); setExportingSvgType("notext"); setError("");
                try {
                  const name = `${activeVersion?.guideline?.event_summary?.name || "kv"}-notext-vector.svg`;
                  await downloadNoTextSvg(masterKv.imageUrl, name, svgProvider);
                  addLog(`대지 SVG 다운로드 완료 (${svgProvider})`, "ok");
                } catch (e: any) { setError(e.message); }
                setExportingSvg(false); setExportingSvgType("");
              }}
              disabled={exportingNoText || exportingPng || exportingSvg}
              className="btn flex items-center gap-2 rounded-xl border border-gray-700 px-3 py-3 text-xs text-gray-400 transition-colors hover:border-indigo-500/50 hover:text-indigo-300 disabled:opacity-50"
            >
              {exportingSvgType === "notext" ? "대지→SVG 중..." : "대지 SVG"}
            </button>

            {/* 투명 SVG */}
            <button
              onClick={async () => {
                setExportingSvg(true); setExportingSvgType("transparent"); setError("");
                try {
                  const name = `${activeVersion?.guideline?.event_summary?.name || "kv"}-transparent-vector.svg`;
                  await downloadTransparentSvg(masterKv.imageUrl, name, svgProvider);
                  addLog(`투명 SVG 다운로드 완료 (${svgProvider})`, "ok");
                } catch (e: any) { setError(e.message); }
                setExportingSvg(false); setExportingSvgType("");
              }}
              disabled={exportingNoText || exportingPng || exportingSvg}
              className="btn flex items-center gap-2 rounded-xl border border-gray-700 px-3 py-3 text-xs text-gray-400 transition-colors hover:border-indigo-500/50 hover:text-indigo-300 disabled:opacity-50"
            >
              {exportingSvgType === "transparent" ? "투명→SVG 중..." : "투명 SVG"}
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* 확정 바 */}
      {masterKv?.imageUrl && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-300">이 KV로 바리에이션 생성</p>
              <p className="mt-0.5 text-xs text-gray-600">
                확정 후 Step 4에서 54종 바리에이션을 KV 기반으로 생성합니다
              </p>
            </div>
            <button
              onClick={handleConfirm}
              className="btn shrink-0 rounded-xl bg-gradient-to-t from-emerald-600 to-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20"
            >
              {masterKv.confirmed ? "재확정 → Step 4" : "확정 → Step 4"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
