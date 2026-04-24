"use client";

// Phase G — 카드뉴스 모달. 운영자가 슬라이드별 헤드라인/서브텍스트/프롬프트를
// 입력하고 "전체 생성"을 누르면, 첫 슬라이드는 master KV 기반으로, 두 번째
// 이후는 직전 슬라이드를 reference로 체이닝하여 일관된 비주얼로 생성된다.

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { generateCardNewsSeries, type CardNewsSlide } from "./cardnews-image";
import { toAsciiSafeName } from "../safe-filename";
import type { CatalogItem, Production } from "../types";
import { useStore } from "../use-store";

interface Props {
  open: boolean;
  prod: Production;
  catalog: CatalogItem;
  defaultSlideCount: number;
  onClose: () => void;
}

interface SlideDraft {
  headline: string;
  subtext: string;
  imagePrompt: string;
}

function makeBlankDraft(seedHeadline: string, seedPrompt?: string): SlideDraft {
  return {
    headline: seedHeadline,
    subtext: "",
    imagePrompt: seedPrompt ?? "",
  };
}

export default function CardNewsModal({
  open,
  prod,
  catalog,
  defaultSlideCount,
  onClose,
}: Props) {
  const activeVersion = useStore((s) =>
    s.versions.find((v) => v.id === s.selectedVersionId),
  );
  const [drafts, setDrafts] = useState<SlideDraft[]>([]);
  const [count, setCount] = useState(defaultSlideCount);
  const [results, setResults] = useState<Record<number, { imageUrl?: string; error?: string }>>(
    {},
  );
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDrafts([]);
      setResults({});
      setProgress(0);
      setError(null);
      setGenerating(false);
      return;
    }
    setDrafts(
      Array.from({ length: defaultSlideCount }, (_, i) =>
        makeBlankDraft(
          i === 0 ? prod.headline ?? "" : "",
          i === 0 ? prod.imagePrompt : undefined,
        ),
      ),
    );
    setCount(defaultSlideCount);
  }, [open, defaultSlideCount, prod.headline, prod.imagePrompt]);

  function setSlideCount(n: number) {
    const clamped = Math.max(1, Math.min(10, n));
    setCount(clamped);
    setDrafts((prev) => {
      const next = prev.slice(0, clamped);
      while (next.length < clamped) {
        next.push(makeBlankDraft(""));
      }
      return next;
    });
  }

  function patchSlide(i: number, patch: Partial<SlideDraft>) {
    setDrafts((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  const canGenerate = useMemo(
    () => activeVersion !== undefined && drafts.length > 0 && !generating,
    [activeVersion, drafts.length, generating],
  );

  async function handleGenerateAll() {
    if (!activeVersion) return;
    setError(null);
    setResults({});
    setProgress(0);
    setGenerating(true);

    // 슬라이드 N의 인덱스(i)는 ZIP 파일명·정렬 키로 사용되므로 비어있는
    // 슬라이드를 건너뛸 때도 원래 인덱스를 유지한 채 필터링한다 — 두 번째
    // 슬라이드가 비어 있으면 [1번, 3번, …]이 그대로 인덱스로 보존됨.
    const slides: CardNewsSlide[] = drafts
      .map((d, i) => ({
        index: i,
        headline: d.headline.trim() || undefined,
        subtext: d.subtext.trim() || undefined,
        imagePrompt: d.imagePrompt.trim() || undefined,
        layoutNote: prod.layoutNote,
      }))
      .filter(
        (s) => s.headline || s.subtext || s.imagePrompt,
      );

    if (slides.length === 0) {
      setError("슬라이드가 모두 비어 있습니다 — 최소 한 슬라이드에 내용을 입력하세요");
      setGenerating(false);
      return;
    }

    const { ciImages, ciBrief, refAnalysis } = useStore.getState();

    try {
      await generateCardNewsSeries({
        guideline: activeVersion.guideline,
        baseProduction: {
          name: prod.name,
          ratio: prod.ratio,
          category: prod.category,
          renderInstruction: prod.renderInstruction,
          imageSize: prod.imageSize,
          temperature: prod.temperature,
          catalog,
          userInput: prod.userInput,
        },
        slides,
        masterKvUrl: activeVersion.masterKv?.imageUrl,
        ciImages,
        ciBrief: ciBrief || undefined,
        refAnalysis: refAnalysis || undefined,
        provider: activeVersion.provider ?? "gemini",
        onSlideDone: ({ index, imageUrl }) => {
          setResults((r) => ({ ...r, [index]: { imageUrl } }));
          setProgress((p) => p + 1);
        },
        onSlideError: ({ index, error: msg }) => {
          setResults((r) => ({ ...r, [index]: { error: msg } }));
          setProgress((p) => p + 1);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadZip() {
    // Object.entries는 정렬 순서를 보장하지 않으므로 슬라이드 인덱스 오름차순
    // 정렬을 명시 — 운영자가 ZIP을 풀었을 때 1번 슬라이드부터 순서대로 보임.
    const entries = Object.entries(results)
      .map(([k, v]) => ({ idx: Number(k), imageUrl: v.imageUrl }))
      .filter((e): e is { idx: number; imageUrl: string } => Boolean(e.imageUrl))
      .sort((a, b) => a.idx - b.idx);
    if (entries.length === 0) return;
    const slug = toAsciiSafeName(prod.name, "cardnews");
    const zip = new JSZip();
    for (const e of entries) {
      const base64 = e.imageUrl.split(",")[1];
      if (!base64) continue;
      const filename = `${slug}-slide-${String(e.idx + 1).padStart(2, "0")}.png`;
      zip.file(filename, base64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-cardnews-${entries.length}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  const completedCount = Object.values(results).filter((r) => r.imageUrl).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">카드뉴스 — {prod.name}</div>
            <div className="text-[11px] text-gray-500">
              슬라이드 1은 마스터 KV를, 2번째 이후는 직전 슬라이드를 reference로 체이닝합니다.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-gray-400">슬라이드 수</label>
            <input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => setSlideCount(Number(e.target.value) || 1)}
              disabled={generating}
              className="w-14 rounded border border-gray-800 bg-gray-950 px-2 py-1 text-right text-[11px] text-gray-200"
            />
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-200"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-3 overflow-auto p-4">
          {drafts.map((draft, i) => {
            const result = results[i];
            return (
              <div
                key={i}
                className="rounded-lg border border-gray-800 bg-gray-900/50 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-indigo-300">
                    슬라이드 {i + 1} / {drafts.length}
                  </span>
                  {result?.imageUrl && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                      완료
                    </span>
                  )}
                  {result?.error && (
                    <span className="text-[10px] text-rose-300" role="alert">
                      실패: {result.error.slice(0, 60)}
                    </span>
                  )}
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_140px]">
                  <div className="space-y-2">
                    <label className="block">
                      <span className="block text-[10px] uppercase tracking-wider text-gray-500">
                        헤드라인
                      </span>
                      <input
                        value={draft.headline}
                        onChange={(e) => patchSlide(i, { headline: e.target.value })}
                        disabled={generating}
                        className="w-full rounded bg-gray-950 px-2 py-1 text-[12px] text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] uppercase tracking-wider text-gray-500">
                        서브텍스트
                      </span>
                      <input
                        value={draft.subtext}
                        onChange={(e) => patchSlide(i, { subtext: e.target.value })}
                        disabled={generating}
                        className="w-full rounded bg-gray-950 px-2 py-1 text-[12px] text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] uppercase tracking-wider text-gray-500">
                        비주얼 프롬프트 (선택)
                      </span>
                      <textarea
                        value={draft.imagePrompt}
                        onChange={(e) => patchSlide(i, { imagePrompt: e.target.value })}
                        disabled={generating}
                        rows={2}
                        className="w-full resize-y rounded bg-gray-950 px-2 py-1 text-[11px] text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-center rounded bg-gray-950 p-1">
                    {result?.imageUrl ? (
                      <img
                        src={result.imageUrl}
                        alt={`슬라이드 ${i + 1}`}
                        className="max-h-32 w-auto rounded"
                      />
                    ) : generating && progress <= i ? (
                      <div className="text-[10px] text-gray-500">대기…</div>
                    ) : (
                      <div className="text-[10px] text-gray-700">미생성</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {error && (
            <div
              className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300"
              role="alert"
            >
              {error}
            </div>
          )}

          {generating && (
            <div className="rounded border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[11px] text-indigo-300">
              생성 중… {progress} / {drafts.length}
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
          <button
            type="button"
            onClick={handleGenerateAll}
            disabled={!canGenerate}
            className="rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {generating ? "생성 중…" : `전체 ${drafts.length}장 생성`}
          </button>
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={completedCount === 0 || generating}
            className="rounded bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-400 disabled:opacity-50"
          >
            ZIP 다운로드 ({completedCount}장)
          </button>
        </div>
      </div>
    </div>
  );
}
