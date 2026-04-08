"use client";

import { useStore } from "./use-store";
import { generateGuideline, createVersion, analyzeRefs } from "./guideline-generator";
import { generateGuidelinePdf, downloadAsZip } from "./export-utils";
import TierSelector from "./tier-selector";
import EventInput from "./event-input";
import ReferenceSearch from "./reference-search";
import ChatPanel from "./chat-panel";
import GuidelineViewer from "./guideline-viewer";
import CatalogSelector from "./catalog-selector";
import ProductionGrid from "./production-grid";
import { useState } from "react";

export default function StudioApp() {
  const {
    step, setStep, tier, setTier,
    eventInfo, setEventInfo, styleOverride,
    selectedRefs, toggleRef,
    versions, activeVersionId, selectedVersionId,
    addVersion, setActiveVersion, selectVersionForStep3,
    isProcessing, setProcessing, addLog,
    refAnalysis,
  } = useStore();

  const [generateError, setGenerateError] = useState("");

  const activeVersion = versions.find((v) => v.id === activeVersionId);
  const confirmedVersion = versions.find((v) => v.id === selectedVersionId);

  async function handleGenerate() {
    if (!eventInfo.trim()) return;
    setProcessing(true);
    setGenerateError("");
    addLog(`Ver.${versions.length + 1} 가이드라인 생성 중...`);

    try {
      // 레퍼런스 분석 (업로드 이미지 있고 아직 분석 안 됐으면 자동 실행)
      const { ciImages, refFiles, refAnalysis: currentAnalysis, setRefAnalysis } = useStore.getState();
      let analysis = currentAnalysis;
      if (refFiles.length > 0 && !analysis) {
        addLog("레퍼런스 이미지 분석 중...");
        try {
          analysis = await analyzeRefs(refFiles.map((f) => ({ mime: f.mime, base64: f.base64 })));
          setRefAnalysis(analysis);
          addLog("레퍼런스 분석 완료", "ok");
        } catch (e: any) {
          addLog(`레퍼런스 분석 실패: ${e.message}`, "err");
        }
      }

      const existingTones = versions.map((v) => v.guideline?.mood?.tone).filter(Boolean);
      const ci = ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));
      const { ciDocs } = useStore.getState();
      const docs = ciDocs.map((d) => ({ mime: d.mime, base64: d.base64, name: d.name }));
      const guideline = await generateGuideline(eventInfo, styleOverride, existingTones, analysis || undefined, ci, docs);
      const version = createVersion(versions.length + 1, guideline);
      addVersion(version);
      addLog(`Ver.${version.num} 생성 완료 — "${guideline.event_summary.name}"`, "ok");
      setStep(2);
    } catch (err: any) {
      const msg = err.message || "알 수 없는 오류";
      setGenerateError(msg);
      addLog(`생성 실패: ${msg}`, "err");
    }

    setProcessing(false);
  }

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-1 sm:gap-2">
        {([1, 2, 3] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              step === s
                ? "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/30"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 text-xs font-bold">
              {s}
            </span>
            <span className="hidden sm:inline">
              {s === 1 && "입력 & 가이드라인"}
              {s === 2 && "가이드 산출물"}
              {s === 3 && "제작물 이미지"}
            </span>
          </button>
        ))}
      </div>

      {/* Step 1: Input */}
      {step === 1 && (
        <div className="space-y-5">
          <TierSelector selected={tier} onSelect={setTier} />

          <div className="grid gap-5 lg:grid-cols-2">
            <EventInput value={eventInfo} onChange={setEventInfo} />
            <ReferenceSearch selectedRefs={selectedRefs} onSelectRef={toggleRef} />
          </div>

          {/* Generate button — full width, bottom */}
          <button
            onClick={handleGenerate}
            disabled={isProcessing || !eventInfo.trim()}
            className="btn group w-full rounded-xl bg-gradient-to-t from-indigo-600 to-indigo-500 bg-[length:100%_100%] bg-[bottom] py-4 text-base font-semibold text-white shadow-[inset_0px_1px_0px_0px_theme(colors.white/.16)] hover:bg-[length:100%_150%] disabled:opacity-50 sm:py-5 sm:text-lg"
          >
            <span className="relative inline-flex items-center">
              {isProcessing ? (
                "가이드라인 생성 중..."
              ) : versions.length === 0 ? (
                <>가이드라인 생성 <span className="ml-2 text-white/50">&rarr;</span></>
              ) : (
                <>새 버전 생성 <span className="ml-2 text-white/50">+</span></>
              )}
            </span>
          </button>
          {generateError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {generateError}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Guideline viewer */}
      {step === 2 && (
        <div className="space-y-6">
          {versions.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <p>Step 1에서 가이드라인을 생성해주세요</p>
              <button onClick={() => setStep(1)} className="mt-4 text-indigo-400 hover:underline">
                ← Step 1
              </button>
            </div>
          ) : (
            <>
              {/* Version tabs */}
              <div className="flex flex-wrap gap-2">
                {versions.map((ver) => (
                  <button
                    key={ver.id}
                    onClick={() => setActiveVersion(ver.id)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
                      ver.id === activeVersionId
                        ? "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/30"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {ver.label}
                    <div className="flex gap-0.5">
                      {ver.preview.colors.map((c, i) => (
                        <span key={i} className="inline-block h-3 w-3 rounded-full" style={{ background: c }} />
                      ))}
                    </div>
                    {ver.id === selectedVersionId && (
                      <span className="text-[10px] text-emerald-400">✓확정</span>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => { setStep(1); }}
                  className="rounded-full px-4 py-2 text-sm text-gray-600 hover:text-gray-400"
                >
                  + 새 버전
                </button>
              </div>

              {/* Active version viewer */}
              {activeVersion && (
                <div className="space-y-6">
                  {/* 상단 액션 바 */}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => selectVersionForStep3(activeVersion.id)}
                      className={`rounded-xl border px-5 py-2.5 text-sm font-medium transition-all ${
                        selectedVersionId === activeVersion.id
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                          : "border-gray-800 text-gray-400 hover:border-indigo-500/50 hover:text-indigo-400"
                      }`}
                    >
                      {selectedVersionId === activeVersion.id ? "✓ Step 3 확정됨" : "이 버전으로 Step 3 확정"}
                    </button>
                    {selectedVersionId && (
                      <button
                        onClick={() => setStep(3)}
                        className="btn bg-gradient-to-t from-indigo-600 to-indigo-500 px-6 py-2.5 text-sm text-white"
                      >
                        Step 3: 제작물 생성 →
                      </button>
                    )}
                    <button
                      onClick={() => generateGuidelinePdf(
                        activeVersion.guideline,
                        activeVersion.guideline.event_summary?.name || "가이드라인",
                        activeVersion.guideImages
                      )}
                      className="rounded-xl border border-gray-800 px-5 py-2.5 text-sm text-gray-400 hover:border-gray-700 hover:text-gray-300"
                    >
                      PDF 내보내기
                    </button>
                  </div>

                  {/* 가이드라인 뷰어 — 전체 너비 */}
                  <GuidelineViewer version={activeVersion} />

                  {/* AI 어시스턴트 */}
                  <ChatPanel guideline={activeVersion.guideline} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 3: Production */}
      {step === 3 && (
        <div className="space-y-6">
          <CatalogSelector />
          <ProductionGrid />

          {/* ZIP download */}
          {useStore.getState().productions.filter(p => p.status === "done").length > 0 && (
            <div className="flex justify-center">
              <button
                onClick={async () => {
                  const prods = useStore.getState().productions.filter(p => p.status === "done" && p.imageUrl);
                  if (!prods.length) return;
                  const items = prods.map(p => ({
                    name: `${p.name.replace(/[/\\]/g, "_")}.png`,
                    data: p.imageUrl!,
                  }));
                  const name = confirmedVersion?.guideline?.event_summary?.name || "epic-studio";
                  await downloadAsZip(items, `${name}-제작물.zip`);
                }}
                className="rounded-lg bg-gradient-to-t from-indigo-600 to-indigo-500 px-8 py-3 text-sm font-medium text-white shadow-[inset_0px_1px_0px_0px_theme(colors.white/.16)]"
              >
                ZIP 다운로드 ({useStore.getState().productions.filter(p => p.status === "done").length}개)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
