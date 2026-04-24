"use client";

import { useEffect, useMemo, useState } from "react";
import {
  generateNoTextVersion,
  generateProductionImage,
  suggestDimensions,
  upscaleToExactSize,
  type TopazModel,
} from "./generation";
import { MASTER_CATALOG } from "./constants";
import CropModal from "./crop-modal";
import EditOverlay from "./edit-overlay";
import BulkOverlayModal from "./bulk-overlay/bulk-overlay-modal";
import CardNewsModal from "./cardnews/cardnews-modal";
import EdmModal from "./edm/edm-modal";
import { downloadAsSvg } from "./export-utils";
import type { EditRegion, Production } from "./types";
import { useStore } from "./use-store";
import type { VectorizeProvider } from "./vectorize-service";

interface Props {
  prod: Production;
  onDelete: (id: string) => void;
}

export default function ProductionCard({ prod, onDelete }: Props) {
  const { updateProduction, addProductionVariant } = useStore();
  const activeVersion = useStore((s) =>
    s.versions.find((v) => v.id === s.selectedVersionId),
  );
  const [svgProvider, setSvgProvider] = useState<VectorizeProvider>("arrow");
  const [vectorizing, setVectorizing] = useState(false);
  const [topazModel, setTopazModel] = useState<TopazModel>("Standard V2");
  const [cropOpen, setCropOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [cardnewsOpen, setCardnewsOpen] = useState(false);
  const [edmOpen, setEdmOpen] = useState(false);
  const catalog = useMemo(
    () => MASTER_CATALOG.find((c) => c.name === prod.name),
    [prod.name],
  );
  // safeZone[0]만 본다 — 현재 모든 카탈로그 항목은 단일 사각형이고 다중 영역
  // 운영 사례가 없다. 다중 영역이 필요해지면 effectiveSafeZone을 배열로
  // 바꾸고 EDM/대량/렌더러 측 호출 위치 4곳을 함께 손봐야 한다.
  const effectiveSafeZone =
    prod.userInput?.safeZone?.[0] ?? catalog?.safeZone?.[0];

  // 배수(scale) 모드가 기본. "커스텀" 토글 시 임의 W×H 입력이 노출됨.
  const [scale, setScale] = useState<number>(2);
  const [customMode, setCustomMode] = useState(false);
  const suggested = useMemo(() => suggestDimensions(prod.ratio, "2K"), [prod.ratio]);
  const [customW, setCustomW] = useState<string>(String(suggested.w));
  const [customH, setCustomH] = useState<string>(String(suggested.h));

  // 원본 자연 해상도 측정 — 배수 계산/표시에 사용
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!prod.imageUrl) {
      setSourceDims(null);
      return;
    }
    const img = new Image();
    img.onload = () => setSourceDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = prod.imageUrl;
  }, [prod.imageUrl]);

  const derivedW = sourceDims ? sourceDims.w * scale : 0;
  const derivedH = sourceDims ? sourceDims.h * scale : 0;
  const effectiveW = customMode ? Number(customW) : derivedW;
  const effectiveH = customMode ? Number(customH) : derivedH;

  async function handleRegenerate() {
    if (!activeVersion) return;
    updateProduction(prod.id, { status: "generating", error: undefined, stale: false });
    const { ciImages, ciBrief, refAnalysis } = useStore.getState();
    const ci = ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));
    const masterKvUrl = activeVersion.masterKv?.imageUrl;
    try {
      const imageUrl = await generateProductionImage(
        activeVersion.guideline,
        prod,
        ci,
        masterKvUrl,
        refAnalysis || undefined,
        {
          provider: activeVersion.provider ?? "gemini",
          ciBrief: ciBrief || undefined,
        },
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
      const noTextUrl = await generateNoTextVersion(prod.imageUrl, {
        provider: activeVersion?.provider ?? "gemini",
      });
      updateProduction(prod.id, { noTextStatus: "done", noTextUrl });
    } catch (err) {
      updateProduction(prod.id, {
        noTextStatus: "error",
        noTextError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleUpscale() {
    if (!prod.imageUrl) return;
    const w = effectiveW;
    const h = effectiveH;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
      updateProduction(prod.id, {
        upscaleStatus: "error",
        upscaleError: "유효한 목표 크기가 필요합니다",
      });
      return;
    }
    updateProduction(prod.id, {
      upscaleStatus: "pending",
      upscaleUrl: undefined,
      upscaleRawUrl: undefined,
      upscaleTargetW: w,
      upscaleTargetH: h,
      upscaleError: undefined,
    });
    try {
      const { rawUrl, finalUrl } = await upscaleToExactSize(prod.imageUrl, w, h, {
        model: topazModel,
      });
      updateProduction(prod.id, {
        upscaleStatus: "done",
        upscaleUrl: finalUrl,
        upscaleRawUrl: rawUrl,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateProduction(prod.id, {
        upscaleStatus: "error",
        upscaleError: msg,
      });
      console.error("upscale error:", err);
    }
  }

  function handleCropApply(croppedDataUrl: string) {
    updateProduction(prod.id, { upscaleUrl: croppedDataUrl });
    setCropOpen(false);
  }

  async function handleEditSubmit(regions: EditRegion[], globalInstruction: string) {
    setEditOpen(false);
    if (!activeVersion || !prod.imageUrl) return;
    if (regions.length === 0 && !globalInstruction.trim()) return;

    const variantId = `prod_${Date.now()}_edit`;
    const variant: Production = {
      ...prod,
      id: variantId,
      parentId: prod.id,
      editRegions: regions,
      globalEditInstruction: globalInstruction.trim() || undefined,
      status: "generating",
      imageUrl: undefined,
      noTextStatus: undefined,
      noTextUrl: undefined,
      noTextError: undefined,
      upscaleStatus: undefined,
      upscaleUrl: undefined,
      upscaleRawUrl: undefined,
      upscaleTargetW: undefined,
      upscaleTargetH: undefined,
      upscaleError: undefined,
      stale: false,
      error: undefined,
    };
    addProductionVariant(variant);

    const { ciImages, ciBrief, refAnalysis } = useStore.getState();
    const ci = ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));
    const masterKvUrl = activeVersion.masterKv?.imageUrl;

    try {
      const imageUrl = await generateProductionImage(
        activeVersion.guideline,
        { ...prod, catalog, userInput: prod.userInput },
        ci,
        masterKvUrl,
        refAnalysis || undefined,
        {
          provider: activeVersion.provider ?? "gemini",
          ciBrief: ciBrief || undefined,
          editRequest: {
            sourceImageUrl: prod.imageUrl,
            regions,
            globalInstruction: globalInstruction.trim() || undefined,
          },
        },
      );
      updateProduction(variantId, { status: "done", imageUrl });
    } catch (err) {
      updateProduction(variantId, {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
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
          {prod.parentId && (
            <span
              className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300"
              title={`원본 ${prod.parentId}에서 파생`}
            >
              수정본
            </span>
          )}
          {prod.status === "done" && prod.imageUrl && (
            <button
              onClick={() => setEditOpen(true)}
              className="rounded bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-gray-700"
              title="이미지 일부 영역만 다시 그리기"
            >
              수정
            </button>
          )}
          {prod.status === "done" &&
            prod.imageUrl &&
            catalog?.bulkCsvOverlay && (
              <button
                onClick={() => setBulkOpen(true)}
                className="rounded bg-emerald-600/30 px-2 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-600/50"
                title="CSV로 명단을 올려 영역에 이름·직함을 자동 합성한 PNG를 일괄 생성"
              >
                대량 제작
              </button>
            )}
          {prod.status === "done" &&
            prod.imageUrl &&
            catalog?.cardNewsSlides && (
              <button
                onClick={() => setCardnewsOpen(true)}
                className="rounded bg-indigo-600/30 px-2 py-0.5 text-[10px] text-indigo-300 hover:bg-indigo-600/50"
                title="첫 슬라이드를 reference로 체이닝하여 일관된 시리즈 카드뉴스를 생성"
              >
                카드뉴스 {catalog.cardNewsSlides}장
              </button>
            )}
          {prod.status === "done" && prod.imageUrl && catalog?.edmTemplate && (
            <button
              onClick={() => setEdmOpen(true)}
              className="rounded bg-sky-600/30 px-2 py-0.5 text-[10px] text-sky-300 hover:bg-sky-600/50"
              title="배경+CTA 하이브리드 EDM HTML 생성 (다크모드 미리보기 포함)"
            >
              EDM
            </button>
          )}
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
            <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">업스케일 (Topaz)</span>
                {!customMode ? (
                  <>
                    <select
                      value={scale}
                      onChange={(e) => setScale(Number(e.target.value))}
                      aria-label="배수"
                      className="rounded border border-gray-800 bg-gray-950 px-2 py-1 text-[10px] text-gray-300"
                    >
                      <option value={2}>2×</option>
                      <option value={3}>3×</option>
                      <option value={4}>4×</option>
                      <option value={6}>6×</option>
                    </select>
                    <span className="font-mono text-[10px] text-gray-500">
                      {sourceDims
                        ? `${sourceDims.w} × ${sourceDims.h} → ${derivedW} × ${derivedH} px`
                        : "원본 측정 중…"}
                    </span>
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      min={1}
                      value={customW}
                      onChange={(e) => setCustomW(e.target.value)}
                      aria-label="목표 폭(px)"
                      className="w-20 rounded border border-gray-800 bg-gray-950 px-2 py-1 text-right text-[10px] text-gray-300"
                    />
                    <span className="text-[10px] text-gray-600">×</span>
                    <input
                      type="number"
                      min={1}
                      value={customH}
                      onChange={(e) => setCustomH(e.target.value)}
                      aria-label="목표 높이(px)"
                      className="w-20 rounded border border-gray-800 bg-gray-950 px-2 py-1 text-right text-[10px] text-gray-300"
                    />
                    <span className="text-[10px] text-gray-600">px</span>
                  </>
                )}
                <button
                  onClick={handleUpscale}
                  disabled={prod.upscaleStatus === "pending"}
                  className="ml-auto rounded bg-gray-800 px-3 py-1 text-[10px] text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                >
                  {prod.upscaleStatus === "pending" ? "업스케일 중..." : "업스케일"}
                </button>
                {prod.upscaleStatus === "done" && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                    완료
                  </span>
                )}
                {prod.upscaleStatus === "error" && (
                  <span className="text-[10px] text-red-400" role="alert">
                    실패
                  </span>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setCustomMode((v) => !v)}
                  className="text-[10px] text-gray-500 hover:text-indigo-400 hover:underline"
                >
                  {customMode ? "배수 모드로 전환" : "커스텀 치수 수정"}
                </button>
              </div>
              {prod.upscaleStatus === "error" && prod.upscaleError && (
                <div
                  className="rounded border border-red-500/20 bg-red-500/5 px-2 py-1 text-[10px] text-red-300"
                  role="alert"
                >
                  {prod.upscaleError}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">모델</span>
                <select
                  value={topazModel}
                  onChange={(e) => setTopazModel(e.target.value as TopazModel)}
                  aria-label="Topaz Gigapixel 모델"
                  className="rounded border border-gray-800 bg-gray-950 px-2 py-1 text-[10px] text-gray-300"
                >
                  <option value="Standard V2">Standard V2 (범용)</option>
                  <option value="High Fidelity V2">High Fidelity V2 (디테일 보존)</option>
                  <option value="Low Resolution V2">Low Resolution V2 (저해상 복원)</option>
                  <option value="CGI">CGI (일러스트/아트)</option>
                  <option value="Text Refine">Text Refine (타이포/그래픽)</option>
                </select>
              </div>
              {prod.upscaleStatus === "done" && prod.upscaleUrl && (
                <div className="flex items-center justify-end gap-3">
                  {prod.upscaleRawUrl && (
                    <button
                      onClick={() => setCropOpen(true)}
                      className="text-[10px] text-indigo-400 hover:underline"
                    >
                      크롭 조정
                    </button>
                  )}
                  <a
                    href={prod.upscaleUrl}
                    download={`${prod.name}-${prod.upscaleTargetW ?? effectiveW}x${prod.upscaleTargetH ?? effectiveH}.png`}
                    className="text-[10px] text-indigo-400 hover:underline"
                  >
                    {prod.upscaleTargetW ?? effectiveW} × {prod.upscaleTargetH ?? effectiveH} px 다운로드
                  </a>
                </div>
              )}
            </div>
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
      {prod.upscaleRawUrl && (
        <CropModal
          open={cropOpen}
          imageUrl={prod.upscaleRawUrl}
          targetW={prod.upscaleTargetW ?? (effectiveW || 1024)}
          targetH={prod.upscaleTargetH ?? (effectiveH || 1024)}
          title={`${prod.name} 크롭 — ${prod.upscaleTargetW ?? effectiveW} × ${prod.upscaleTargetH ?? effectiveH} px`}
          onApply={handleCropApply}
          onClose={() => setCropOpen(false)}
        />
      )}
      {prod.imageUrl && (
        <EditOverlay
          open={editOpen}
          imageUrl={prod.imageUrl}
          onCancel={() => setEditOpen(false)}
          onSubmit={handleEditSubmit}
        />
      )}
      {prod.imageUrl && catalog?.bulkCsvOverlay && (
        <BulkOverlayModal
          open={bulkOpen}
          templateUrl={prod.imageUrl}
          catalog={catalog}
          effectiveSafeZone={effectiveSafeZone}
          onClose={() => setBulkOpen(false)}
        />
      )}
      {prod.imageUrl && catalog?.cardNewsSlides && (
        <CardNewsModal
          open={cardnewsOpen}
          prod={prod}
          catalog={catalog}
          defaultSlideCount={catalog.cardNewsSlides}
          onClose={() => setCardnewsOpen(false)}
        />
      )}
      {prod.imageUrl && catalog?.edmTemplate && (
        <EdmModal
          open={edmOpen}
          prod={prod}
          catalog={catalog}
          effectiveSafeZone={effectiveSafeZone}
          onClose={() => setEdmOpen(false)}
        />
      )}
    </div>
  );
}
