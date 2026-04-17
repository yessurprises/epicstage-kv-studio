"use client";

import { useState, useEffect } from "react";
import { useStore, type Production, type ProductionPlanItem } from "./use-store";
import { MASTER_CATALOG } from "./constants";
import {
  generateProductionPlan,
  generateProductionImage,
  generateNoTextVersion,
} from "./guideline-generator";
import { downloadAsSvg } from "./export-utils";
import type { VectorizeProvider } from "./vectorize-service";

const PLAN_BATCH_SIZE = 10;
const IMAGE_BATCH_SIZE = 2;

// ─── ProductionCard ─────────────────────────────────────────────────────────

function ProductionCard({
  prod,
  onDelete,
}: {
  prod: Production;
  onDelete: (id: string) => void;
}) {
  const { updateProduction } = useStore();
  const activeVersion = useStore((s) => s.versions.find((v) => v.id === s.selectedVersionId));
  const [svgProvider, setSvgProvider] = useState<VectorizeProvider>("vectorizer");
  const [vectorizing, setVectorizing] = useState(false);

  async function handleRegenerate() {
    if (!activeVersion) return;
    updateProduction(prod.id, { status: "generating", error: undefined, stale: false });
    const { ciImages, refAnalysis } = useStore.getState();
    const ci = ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));
    const masterKvUrl = activeVersion.masterKv?.imageUrl;
    try {
      const imageUrl = await generateProductionImage(
        activeVersion.guideline, prod, ci, masterKvUrl, refAnalysis || undefined
      );
      updateProduction(prod.id, { status: "done", imageUrl });
    } catch (err: any) {
      updateProduction(prod.id, { status: "error", error: err.message });
    }
  }

  async function handleNoText() {
    if (!prod.imageUrl) return;
    updateProduction(prod.id, { noTextStatus: "generating", noTextError: undefined });
    try {
      const noTextUrl = await generateNoTextVersion(prod.imageUrl);
      updateProduction(prod.id, { noTextStatus: "done", noTextUrl });
    } catch (err: any) {
      updateProduction(prod.id, { noTextStatus: "error", noTextError: err.message });
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
            <button onClick={handleRegenerate} className="rounded bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-gray-700">
              {prod.stale ? "재생성" : "재시도"}
            </button>
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
            prod.status === "done" ? "bg-emerald-500/10 text-emerald-400"
              : prod.status === "generating" ? "bg-indigo-500/10 text-indigo-400"
              : prod.status === "error" ? "bg-red-500/10 text-red-400"
              : "bg-gray-800 text-gray-500"
          }`}>
            {prod.status === "done" ? "완료" : prod.status === "generating" ? "생성 중..." : prod.status === "error" ? "오류" : "대기"}
          </span>
          <button
            onClick={() => onDelete(prod.id)}
            className="rounded p-0.5 text-gray-600 hover:bg-gray-800 hover:text-red-400"
            title="삭제"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <div className="p-4">
        {/* Image area — ratio-aware contain */}
        <div className="flex items-center justify-center rounded-lg bg-gray-950" style={{ minHeight: 120 }}>
          {prod.status === "generating" && <div className="animate-pulse py-12 text-sm text-gray-600">생성 중...</div>}
          {prod.status === "done" && prod.imageUrl && (
            <img src={prod.imageUrl} alt={prod.name} className="w-full rounded-lg object-contain" />
          )}
          {prod.status === "error" && <div className="py-12 text-xs text-red-400">{prod.error || "생성 실패"}</div>}
          {prod.status === "pending" && <div className="py-12 text-xs text-gray-600">생성 전</div>}
        </div>

        {/* Action bar */}
        {prod.status === "done" && (
          <div className="mt-3 space-y-2">
            {/* No-text */}
            <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2">
              <button onClick={handleNoText} disabled={prod.noTextStatus === "generating"} className="rounded bg-gray-800 px-3 py-1 text-[10px] text-gray-300 hover:bg-gray-700 disabled:opacity-50">
                {prod.noTextStatus === "generating" ? "생성 중..." : "대지 버전"}
              </button>
              {prod.noTextStatus === "done" && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">완료</span>}
              {prod.noTextStatus === "error" && <span className="text-[10px] text-red-400">{prod.noTextError}</span>}
            </div>
            {prod.noTextStatus === "done" && prod.noTextUrl && (
              <div className="rounded-lg border border-gray-800 overflow-hidden">
                <div className="px-3 py-1 text-[10px] text-gray-600 bg-gray-900">대지 (텍스트 제거)</div>
                <img src={prod.noTextUrl} alt={`${prod.name} 대지`} className="w-full" />
              </div>
            )}
            {/* SVG 벡터화 */}
            <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2">
              <select value={svgProvider} onChange={(e) => setSvgProvider(e.target.value as VectorizeProvider)} className="rounded border border-gray-800 bg-gray-950 px-2 py-1 text-[10px] text-gray-400">
                <option value="vectorizer">Vectorizer.ai</option>
                <option value="recraft">Recraft</option>
              </select>
              <button
                onClick={async () => {
                  if (!prod.imageUrl) return;
                  setVectorizing(true);
                  try {
                    await downloadAsSvg(prod.imageUrl, `${prod.name}-vector.svg`, svgProvider);
                  } catch { /* handled by service */ }
                  setVectorizing(false);
                }}
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

// ─── PlanItemCard (계획만 있고 이미지 아직 없는 상태) ──────────────────────

function PlanItemCard({ item }: { item: ProductionPlanItem }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 px-4 py-3 text-xs space-y-1">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-indigo-400 font-medium">#{item.num}</span>
        <span className="text-gray-300 font-medium">{item.name}</span>
        <span className="text-gray-600 font-mono">{item.ratio}</span>
      </div>
      {item.headline && <div className="text-gray-400"><span className="text-gray-600">카피:</span> {item.headline}</div>}
      {item.subtext && <div className="text-gray-500"><span className="text-gray-600">서브:</span> {item.subtext}</div>}
      {item.layout_note && <div className="text-gray-500"><span className="text-gray-600">레이아웃:</span> {item.layout_note}</div>}
    </div>
  );
}

// ─── Main Grid ──────────────────────────────────────────────────────────────

export default function ProductionGrid() {
  const {
    productions, setProductions, selectedItems, isProcessing, setProcessing,
    addLog, ciImages, refAnalysis, productionPlan, setProductionPlan,
  } = useStore();
  const activeVersion = useStore((s) => s.versions.find((v) => v.id === s.selectedVersionId));
  const [planGenerating, setPlanGenerating] = useState(false);

  // 카탈로그 체크 해제 → plan/productions에서 제거
  useEffect(() => {
    const selectedNames = new Set<string>(
      Array.from(selectedItems).map((i) => MASTER_CATALOG[i]?.name).filter(Boolean)
    );
    if (productionPlan && productionPlan.length > 0) {
      const filtered = productionPlan.filter((p) => selectedNames.has(p.name));
      if (filtered.length !== productionPlan.length) {
        setProductionPlan(filtered.length > 0 ? filtered : null);
      }
    }
    if (productions.length > 0) {
      const filtered = productions.filter((p) => selectedNames.has(p.name));
      if (filtered.length !== productions.length) {
        setProductions(filtered);
      }
    }
  }, [selectedItems]); // eslint-disable-line react-hooks/exhaustive-deps

  function getCiArgs() {
    return ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));
  }

  // 현재 plan에 없는 새 선택 항목 찾기
  function getNewItems(): Array<{ num: number; name: string; ratio: string; category: string }> {
    const plannedNames = new Set((productionPlan || []).map((p) => p.name));
    const prodNames = new Set(productions.map((p) => p.name));
    return Array.from(selectedItems)
      .map((i) => MASTER_CATALOG[i])
      .filter(Boolean)
      .filter((item) => !plannedNames.has(item.name) && !prodNames.has(item.name))
      .map((item, i) => ({
        num: (productionPlan?.length || 0) + productions.length + i + 1,
        name: item.name,
        ratio: item.ratio,
        category: item.category,
      }));
  }

  // 제작 계획 생성 (10개 배치)
  async function handleGeneratePlan() {
    if (!activeVersion || selectedItems.size === 0) return;
    setPlanGenerating(true);

    // 새로 추가된 항목만 계획 생성
    const existingPlan = productionPlan || [];
    const newItems = getNewItems();
    if (newItems.length === 0 && existingPlan.length === 0) {
      // 전체 새로 생성
      const allItems = Array.from(selectedItems)
        .map((i) => MASTER_CATALOG[i])
        .filter(Boolean)
        .map((item, i) => ({ num: i + 1, name: item.name, ratio: item.ratio }));
      await generatePlanBatched(allItems, []);
    } else if (newItems.length > 0) {
      // 추가분만 생성
      const items = newItems.map((item, i) => ({
        num: existingPlan.length + i + 1,
        name: item.name,
        ratio: item.ratio,
      }));
      await generatePlanBatched(items, existingPlan);
    }
    setPlanGenerating(false);
  }

  async function generatePlanBatched(
    items: Array<{ num: number; name: string; ratio: string }>,
    existingPlan: ProductionPlanItem[]
  ) {
    if (!activeVersion) return;
    const ci = getCiArgs();
    const newPlan: ProductionPlanItem[] = [];
    const totalBatches = Math.ceil(items.length / PLAN_BATCH_SIZE);

    for (let b = 0; b < totalBatches; b++) {
      const batch = items.slice(b * PLAN_BATCH_SIZE, (b + 1) * PLAN_BATCH_SIZE);
      addLog(`제작 계획 생성 중... (${b + 1}/${totalBatches} 배치, ${batch.length}종)`);
      try {
        const plan = await generateProductionPlan(activeVersion.guideline, batch, ci);
        newPlan.push(...plan);
      } catch (err: any) {
        addLog(`제작 계획 배치 ${b + 1} 실패: ${err.message}`, "err");
      }
    }

    if (newPlan.length > 0) {
      const merged = [...existingPlan, ...newPlan];
      setProductionPlan(merged);
      addLog(`제작 계획 완료 — ${merged.length}개 제작물`, "ok");
    }
  }

  // 이미지 생성 (2개씩 순차)
  async function handleGenerateImages() {
    if (!activeVersion || !productionPlan?.length) return;
    setProcessing(true);
    const ci = getCiArgs();
    const masterKvUrl = activeVersion.masterKv?.imageUrl;

    // plan 중 아직 production이 없는 것만 생성
    const existingNames = new Set(productions.map((p) => p.name));
    const toCreate = productionPlan.filter((p) => !existingNames.has(p.name));

    const newProds: Production[] = toCreate.map((planItem, i) => ({
      id: `prod_${Date.now()}_${i}`,
      name: planItem.name,
      ratio: planItem.ratio,
      category: Array.from(selectedItems)
        .map((idx) => MASTER_CATALOG[idx])
        .find((c) => c?.name === planItem.name)?.category || "기타",
      status: "pending" as const,
      headline: planItem.headline,
      subtext: planItem.subtext,
      layoutNote: planItem.layout_note,
      imagePrompt: planItem.image_prompt,
      fullPrompt: "",
    }));

    if (newProds.length > 0) {
      setProductions([...productions, ...newProds]);
    }

    addLog(`${newProds.length}종 이미지 생성 시작 (2개씩)`);

    // 2개씩 배치
    for (let i = 0; i < newProds.length; i += IMAGE_BATCH_SIZE) {
      const batch = newProds.slice(i, i + IMAGE_BATCH_SIZE);
      await Promise.all(
        batch.map(async (prod) => {
          const { updateProduction: up } = useStore.getState();
          up(prod.id, { status: "generating" });
          try {
            const imageUrl = await generateProductionImage(
              activeVersion.guideline, prod, ci, masterKvUrl, refAnalysis || undefined
            );
            up(prod.id, { status: "done", imageUrl });
            addLog(`${prod.name} 완료`, "ok");
          } catch (err: any) {
            up(prod.id, { status: "error", error: err.message });
            addLog(`${prod.name} 실패: ${err.message}`, "err");
          }
        })
      );
    }

    setProcessing(false);
  }

  function handleDeleteProduction(id: string) {
    setProductions(productions.filter((p) => p.id !== id));
    // plan에서도 해당 항목 제거
    const prod = productions.find((p) => p.id === id);
    if (prod && productionPlan) {
      setProductionPlan(productionPlan.filter((p) => p.name !== prod.name));
    }
  }

  if (!activeVersion) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <div className="text-lg">Step 2에서 버전을 확정해주세요</div>
      </div>
    );
  }

  const newItems = getNewItems();
  const hasUngenerated = productionPlan && productionPlan.some(
    (p) => !productions.find((pr) => pr.name === p.name)
  );

  return (
    <div className="space-y-4">
      {/* 계획 생성 버튼 */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleGeneratePlan}
          disabled={selectedItems.size === 0 || planGenerating}
          className="btn bg-gradient-to-t from-indigo-600 to-indigo-500 px-6 py-2.5 text-sm text-white disabled:opacity-50"
        >
          {planGenerating
            ? "제작 계획 생성 중..."
            : productionPlan
              ? newItems.length > 0
                ? `+${newItems.length}종 계획 추가`
                : "계획 재생성"
              : `${selectedItems.size}종 제작 계획 생성`}
        </button>

        {productionPlan && productionPlan.length > 0 && (
          <button
            onClick={handleGenerateImages}
            disabled={isProcessing || !hasUngenerated}
            className="btn bg-gradient-to-t from-emerald-600 to-emerald-500 px-6 py-2.5 text-sm text-white disabled:opacity-50"
          >
            {isProcessing
              ? "이미지 생성 중..."
              : hasUngenerated
                ? `이미지 생성 (${productionPlan.filter((p) => !productions.find((pr) => pr.name === p.name)).length}종)`
                : "이미지 생성 완료"}
          </button>
        )}

        {planGenerating && (
          <span className="animate-pulse text-xs text-indigo-400">계획 생성 중...</span>
        )}
      </div>

      {/* 제작 계획 미리보기 — 아직 이미지 없는 항목 */}
      {productionPlan && productionPlan.length > 0 && (() => {
        const ungenerated = productionPlan.filter(
          (p) => !productions.find((pr) => pr.name === p.name)
        );
        if (ungenerated.length === 0) return null;
        return (
          <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              제작 계획 ({ungenerated.length}종 대기)
            </h4>
            <div className="space-y-2">
              {ungenerated.map((item) => (
                <PlanItemCard key={item.num} item={item} />
              ))}
            </div>
          </div>
        );
      })()}

      {/* 생성된 이미지 그리드 */}
      {productions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {productions.map((prod) => (
            <ProductionCard key={prod.id} prod={prod} onDelete={handleDeleteProduction} />
          ))}
        </div>
      )}
    </div>
  );
}
