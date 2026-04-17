"use client";

import { useState } from "react";
import { generateNoTextVersion, generateProductionImage } from "./generation";
import { downloadAsSvg } from "./export-utils";
import type { Production } from "./types";
import { useStore } from "./use-store";
import type { VectorizeProvider } from "./vectorize-service";

interface Props {
  prod: Production;
  onDelete: (id: string) => void;
}

export default function ProductionCard({ prod, onDelete }: Props) {
  const { updateProduction } = useStore();
  const activeVersion = useStore((s) =>
    s.versions.find((v) => v.id === s.selectedVersionId),
  );
  const [svgProvider, setSvgProvider] = useState<VectorizeProvider>("arrow");
  const [vectorizing, setVectorizing] = useState(false);

  async function handleRegenerate() {
    if (!activeVersion) return;
    updateProduction(prod.id, { status: "generating", error: undefined, stale: false });
    const { ciImages, refAnalysis } = useStore.getState();
    const ci = ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));
    const masterKvUrl = activeVersion.masterKv?.imageUrl;
    try {
      const imageUrl = await generateProductionImage(
        activeVersion.guideline,
        prod,
        ci,
        masterKvUrl,
        refAnalysis || undefined,
      );
      updateProduction(prod.id, { status: "done", imageUrl });
    } catch (err) {
      updateProduction(prod.id, {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleNoText() {
    if (!prod.imageUrl) return;
    updateProduction(prod.id, { noTextStatus: "generating", noTextError: undefined });
    try {
      const noTextUrl = await generateNoTextVersion(prod.imageUrl);
      updateProduction(prod.id, { noTextStatus: "done", noTextUrl });
    } catch (err) {
      updateProduction(prod.id, {
        noTextStatus: "error",
        noTextError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleVectorize() {
    if (!prod.imageUrl) return;
    setVectorizing(true);
    try {
      await downloadAsSvg(prod.imageUrl, `${prod.name}-vector.svg`, svgProvider);
    } catch {
      /* handled by service */
    } finally {
      setVectorizing(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/50">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-nacelle text-sm font-semibold text-white">{prod.name}</span>
          <span className="font-mono text-[10px] text-gray-600">{prod.ratio}</span>
          <span className="text-[10px] text-gray-600">{prod.category}</span>
          {prod.stale && (
            <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-400 ring-1 ring-orange-500/20">
              KV 변경됨 · 재생성 필요
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(prod.status === "error" || prod.stale) && prod.status !== "generating" && (
            <button
              onClick={handleRegenerate}
              className="rounded bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-gray-700"
            >
              {prod.stale ? "재생성" : "재시도"}
            </button>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
              prod.status === "done"
                ? "bg-emerald-500/10 text-emerald-400"
                : prod.status === "generating"
                  ? "bg-indigo-500/10 text-indigo-400"
                  : prod.status === "error"
                    ? "bg-red-500/10 text-red-400"
                    : "bg-gray-800 text-gray-500"
            }`}
          >
            {prod.status === "done"
              ? "완료"
              : prod.status === "generating"
                ? "생성 중..."
                : prod.status === "error"
                  ? "오류"
                  : "대기"}
          </span>
          <button
            onClick={() => onDelete(prod.id)}
            className="rounded p-0.5 text-gray-600 hover:bg-gray-800 hover:text-red-400"
            title="삭제"
            aria-label={`${prod.name} 삭제`}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-4">
        {prod.status === "done" && prod.imageUrl ? (
          <img
            src={prod.imageUrl}
            alt={prod.name}
            className="block w-full rounded-lg"
          />
        ) : (
          <div
            className="flex items-center justify-center rounded-lg bg-gray-950"
            style={{ minHeight: 120 }}
          >
            {prod.status === "generating" && (
              <div className="animate-pulse py-12 text-sm text-gray-600">생성 중...</div>
            )}
            {prod.status === "error" && (
              <div className="py-12 text-xs text-red-400" role="alert">
                {prod.error || "생성 실패"}
              </div>
            )}
            {prod.status === "pending" && (
              <div className="py-12 text-xs text-gray-600">생성 전</div>
            )}
          </div>
        )}

        {prod.status === "done" && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2">
              <button
                onClick={handleNoText}
                disabled={prod.noTextStatus === "generating"}
                className="rounded bg-gray-800 px-3 py-1 text-[10px] text-gray-300 hover:bg-gray-700 disabled:opacity-50"
              >
                {prod.noTextStatus === "generating" ? "생성 중..." : "대지 버전"}
              </button>
              {prod.noTextStatus === "done" && (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                  완료
                </span>
              )}
              {prod.noTextStatus === "error" && (
                <span className="text-[10px] text-red-400" role="alert">
                  {prod.noTextError}
                </span>
              )}
            </div>
            {prod.noTextStatus === "done" && prod.noTextUrl && (
              <div className="rounded-lg border border-gray-800 overflow-hidden">
                <div className="px-3 py-1 text-[10px] text-gray-600 bg-gray-900">
                  대지 (텍스트 제거)
                </div>
                <img src={prod.noTextUrl} alt={`${prod.name} 대지`} className="w-full" />
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2">
              <select
                value={svgProvider}
                onChange={(e) => setSvgProvider(e.target.value as VectorizeProvider)}
                aria-label="벡터화 엔진 선택"
                className="rounded border border-gray-800 bg-gray-950 px-2 py-1 text-[10px] text-gray-400"
              >
                <option value="arrow">Arrow 1.1</option>
                <option value="arrow-max">Arrow 1.1 Max</option>
                <option value="recraft">Recraft</option>
              </select>
              <button
                onClick={handleVectorize}
                disabled={vectorizing}
                className="rounded bg-gray-800 px-3 py-1 text-[10px] text-gray-300 hover:bg-gray-700 disabled:opacity-50"
              >
                {vectorizing ? "변환 중..." : "SVG 벡터화"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
