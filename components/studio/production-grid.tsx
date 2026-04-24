"use client";

import { useEffect, useState } from "react";
import { MASTER_CATALOG } from "./constants";
import {
  generateProductionImage,
  generateProductionPlan,
} from "./generation";
import PlanItemCard from "./plan-item-card";
import ProductionCard from "./production-card";
import { useToast } from "./toast";
import type { Production, ProductionPlanItem } from "./types";
import { useStore } from "./use-store";

const PLAN_BATCH_SIZE = 10;
const IMAGE_BATCH_SIZE = 2;

export default function ProductionGrid() {
  const {
    productions,
    setProductions,
    selectedItems,
    isProcessing,
    setProcessing,
    addLog,
    ciImages,
    ciBrief,
    refAnalysis,
    productionPlan,
    setProductionPlan,
  } = useStore();
  const activeVersion = useStore((s) =>
    s.versions.find((v) => v.id === s.selectedVersionId),
  );
  const toast = useToast();
  const [planGenerating, setPlanGenerating] = useState(false);

  // Pruning: if the catalog selection shrinks, drop any plan/production rows
  // whose name is no longer selected.
  useEffect(() => {
    const selectedNames = new Set<string>(
      Array.from(selectedItems)
        .map((i) => MASTER_CATALOG[i]?.name as string | undefined)
        .filter((name): name is string => Boolean(name)),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems]);

  function getCiArgs() {
    return ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));
  }

  function getNewItems() {
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

  async function generatePlanBatched(
    items: Array<{ num: number; name: string; ratio: string }>,
    existingPlan: ProductionPlanItem[],
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
      } catch (err) {
        addLog(
          `제작 계획 배치 ${b + 1} 실패: ${err instanceof Error ? err.message : String(err)}`,
          "err",
        );
      }
    }

    if (newPlan.length > 0) {
      const merged = [...existingPlan, ...newPlan];
      setProductionPlan(merged);
      addLog(`제작 계획 완료 — ${merged.length}개 제작물`, "ok");
    }
  }

  async function handleGeneratePlan() {
    if (!activeVersion || selectedItems.size === 0) return;
    setPlanGenerating(true);

    const existingPlan = productionPlan || [];
    const newItems = getNewItems();
    if (newItems.length === 0 && existingPlan.length === 0) {
      const allItems = Array.from(selectedItems)
        .map((i) => MASTER_CATALOG[i])
        .filter(Boolean)
        .map((item, i) => ({ num: i + 1, name: item.name, ratio: item.ratio }));
      await generatePlanBatched(allItems, []);
    } else if (newItems.length > 0) {
      const items = newItems.map((item, i) => ({
        num: existingPlan.length + i + 1,
        name: item.name,
        ratio: item.ratio,
      }));
      await generatePlanBatched(items, existingPlan);
    }
    setPlanGenerating(false);
  }

  async function handleGenerateImages() {
    if (!activeVersion || !productionPlan?.length) return;
    setProcessing(true);
    const ci = getCiArgs();
    const masterKvUrl = activeVersion.masterKv?.imageUrl;

    const existingNames = new Set(productions.map((p) => p.name));
    const toCreate = productionPlan.filter((p) => !existingNames.has(p.name));

    const newProds: Production[] = toCreate.map((planItem, i) => ({
      id: `prod_${Date.now()}_${i}`,
      name: planItem.name,
      ratio: planItem.ratio,
      category:
        Array.from(selectedItems)
          .map((idx) => MASTER_CATALOG[idx])
          .find((c) => c?.name === planItem.name)?.category || "기타",
      status: "pending" as const,
      headline: planItem.headline,
      subtext: planItem.subtext,
      layoutNote: planItem.layout_note,
      imagePrompt: planItem.image_prompt,
      imageSize: planItem.image_size,
      temperature: planItem.temperature,
      seed: planItem.seed,
      overridden: planItem.overridden,
      userInput: planItem.userInput,
      fullPrompt: "",
    }));

    if (newProds.length > 0) {
      setProductions([...productions, ...newProds]);
    }

    const catalogByName = new Map(MASTER_CATALOG.map((c) => [c.name, c]));

    addLog(`${newProds.length}종 이미지 생성 시작 (2개씩)`);

    const controller = new AbortController();
    const total = newProds.length;
    let completed = 0;
    let cancelled = false;

    const toastId = toast.show({
      kind: "progress",
      title: `이미지 생성 중 (0 / ${total})`,
      description: "AI가 순차적으로 렌더링합니다",
      progress: 0,
      duration: null,
      action: {
        label: "중단",
        onClick: () => {
          cancelled = true;
          controller.abort();
        },
      },
    });

    for (let i = 0; i < newProds.length; i += IMAGE_BATCH_SIZE) {
      if (controller.signal.aborted) break;
      const batch = newProds.slice(i, i + IMAGE_BATCH_SIZE);
      await Promise.all(
        batch.map(async (prod) => {
          if (controller.signal.aborted) return;
          const { updateProduction: up } = useStore.getState();
          up(prod.id, { status: "generating" });
          try {
            const catalog = catalogByName.get(prod.name);
            const ciReferenceImage =
              catalog?.logoCentric && ci[0] ? ci[0] : undefined;
            const imageUrl = await generateProductionImage(
              activeVersion.guideline,
              { ...prod, catalog, userInput: prod.userInput },
              ci,
              masterKvUrl,
              refAnalysis || undefined,
              {
                provider: activeVersion.provider ?? "gemini",
                ciBrief: ciBrief || undefined,
                ciReferenceImage,
              },
            );
            up(prod.id, { status: "done", imageUrl });
            addLog(`${prod.name} 완료`, "ok");
          } catch (err) {
            if (controller.signal.aborted) return;
            const message = err instanceof Error ? err.message : String(err);
            up(prod.id, { status: "error", error: message });
            addLog(`${prod.name} 실패: ${message}`, "err");
          } finally {
            if (!controller.signal.aborted) {
              completed += 1;
              toast.update(toastId, {
                title: `이미지 생성 중 (${completed} / ${total})`,
                progress: total > 0 ? completed / total : 1,
              });
            }
          }
        }),
      );
    }

    if (cancelled) {
      toast.update(toastId, {
        kind: "info",
        title: `생성 중단됨 (${completed} / ${total} 완료)`,
        description: "진행 중인 항목만 취소됐고 완료본은 유지됩니다",
        progress: undefined,
        action: undefined,
        duration: 4000,
      });
    } else {
      toast.update(toastId, {
        kind: "success",
        title: `생성 완료 (${completed} / ${total})`,
        description: undefined,
        progress: 1,
        action: undefined,
        duration: 3000,
      });
    }

    setProcessing(false);
  }

  function handleDeleteProduction(id: string) {
    setProductions(productions.filter((p) => p.id !== id));
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
  const hasUngenerated =
    productionPlan && productionPlan.some((p) => !productions.find((pr) => pr.name === p.name));
  const ungeneratedPlan =
    productionPlan?.filter((p) => !productions.find((pr) => pr.name === p.name)) ?? [];

  return (
    <div className="space-y-4">
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
                ? `이미지 생성 (${ungeneratedPlan.length}종)`
                : "이미지 생성 완료"}
          </button>
        )}

        {planGenerating && (
          <span className="animate-pulse text-xs text-indigo-400">계획 생성 중...</span>
        )}
      </div>

      {ungeneratedPlan.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              제작 계획 ({ungeneratedPlan.length}종 대기)
            </h4>
            <span className="text-[11px] text-gray-500">
              카드를 클릭하면 프롬프트 · 비율 · 해상도 · temperature · seed를 개별로 편집할 수 있습니다
            </span>
          </div>
          <div className="space-y-2">
            {ungeneratedPlan.map((item) => (
              <PlanItemCard key={item.num} item={item} />
            ))}
          </div>
        </div>
      )}

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
