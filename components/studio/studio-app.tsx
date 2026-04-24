"use client";

import { useState } from "react";
import AutosaveBanner from "./autosave-banner";
import CatalogSelector from "./catalog-selector";
import ChatPanel from "./chat-panel";
import EventInput from "./event-input";
import { analyzeCi, analyzeRefs, createVersion, generateGuideline } from "./generation";
import GuidelineViewer from "./guideline-viewer";
import KvGenerator from "./kv-generator";
import ProductionGrid from "./production-grid";
import ReferenceSearch from "./reference-search";
import { downloadAsZip, generateGuidelinePdf } from "./export-utils";
import { useAutosave, useRestorableAutosave } from "./use-autosave";
import { useStore } from "./use-store";

export default function StudioApp() {
  const {
    step, setStep,
    eventInfo, setEventInfo, styleOverride,
    selectedRefs, toggleRef,
    versions, activeVersionId, selectedVersionId,
    addVersion, setActiveVersion, selectVersionForStep3,
    isProcessing, setProcessing, addLog,
    pendingProvider, setPendingProvider,
  } = useStore();

  const [generateError, setGenerateError] = useState("");
  const { pending: pendingAutosave, restore, discard } = useRestorableAutosave();
  useAutosave(true);

  const activeVersion = versions.find((v) => v.id === activeVersionId);
  const confirmedVersion = versions.find((v) => v.id === selectedVersionId);

  async function handleGenerate() {
    if (!eventInfo.trim()) return;
    setProcessing(true);
    setGenerateError("");
    addLog(`Ver.${versions.length + 1} 가이드라인 생성 중...`);

    try {
      // 레퍼런스 분석 (업로드 이미지 있고 아직 분석 안 됐으면 자동 실행)
      const {
        ciImages,
        refFiles,
        refAnalysis: currentAnalysis,
        setRefAnalysis,
        ciBrief: currentCiBrief,
        setCiBrief,
      } = useStore.getState();
      let analysis = currentAnalysis;
      if (refFiles.length > 0 && !analysis) {
        addLog("레퍼런스 이미지 분석 중...");
        try {
          analysis = await analyzeRefs(refFiles.map((f) => ({ mime: f.mime, base64: f.base64 })));
          setRefAnalysis(analysis);
          addLog("레퍼런스 분석 완료", "ok");
        } catch (e) {
          addLog(
            `레퍼런스 분석 실패: ${e instanceof Error ? e.message : String(e)}`,
            "err",
          );
        }
      }

      const ci = ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));

      // CI 분석 — OpenAI 분기에서 로고 픽셀 대신 텍스트 브리프로 주입하려고 미리 뽑음.
      // ciImages가 바뀌면 store가 ciBrief를 ""로 invalidate하므로 여기서만 재실행된다.
      if (ci.length > 0 && !currentCiBrief) {
        addLog("CI 자료 분석 중...");
        try {
          const brief = await analyzeCi(ci);
          setCiBrief(brief);
          addLog("CI 분석 완료", "ok");
        } catch (e) {
          addLog(
            `CI 분석 실패: ${e instanceof Error ? e.message : String(e)}`,
            "err",
          );
        }
      }

      const existingTones = versions.map((v) => v.guideline?.mood?.tone).filter(Boolean);
      const { ciDocs } = useStore.getState();
      const docs = ciDocs.map((d) => ({ mime: d.mime, base64: d.base64, name: d.name }));
      const guideline = await generateGuideline(eventInfo, styleOverride, existingTones, analysis || undefined, ci, docs);
      const version = createVersion(versions.length + 1, guideline, pendingProvider);
      addVersion(version);
      const providerLabel = pendingProvider === "openai" ? "GPT Image 2" : "Nano Banana 2";
      addLog(`Ver.${version.num} 생성 완료 — "${guideline.event_summary.name}" (${providerLabel})`, "ok");
      setStep(2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      setGenerateError(msg);
      addLog(`생성 실패: ${msg}`, "err");
    }

    setProcessing(false);
  }

  return (
    <div>
      {pendingAutosave && (
        <AutosaveBanner
          pending={pendingAutosave}
          onRestore={() => {
            void restore();
          }}
          onDiscard={() => {
            void discard();
          }}
        />
      )}
      {/* Step indicator */}
      <div className="mb-10 flex items-center justify-center">
        {([1, 2, 3, 4] as const).map((s, idx) => {
          const isDone = step > s;
          const isActive = step === s;
          const labels = ["입력 & 레퍼런스", "가이드라인 확인", "마스터 KV", "바리에이션 생성"];
          return (
            <div key={s} className="flex items-center">
              <button
                onClick={() => setStep(s)}
                className="flex flex-col items-center gap-1.5 group"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all duration-200 ${
                    isDone
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                      : isActive
                      ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/40 ring-4 ring-indigo-500/20"
                      : "bg-gray-800 text-gray-500 group-hover:bg-gray-700 group-hover:text-gray-300"
                  }`}
                >
                  {isDone ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : s}
                </span>
                <span className={`hidden text-xs font-medium sm:block transition-colors ${
                  isActive ? "text-indigo-400" : isDone ? "text-gray-400" : "text-gray-600 group-hover:text-gray-400"
                }`}>
                  {labels[idx]}
                </span>
              </button>
              {idx < 3 && (
                <div className={`mx-2 mb-5 h-px w-12 sm:w-20 transition-colors ${step > s ? "bg-indigo-600" : "bg-gray-800"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Input */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <EventInput value={eventInfo} onChange={setEventInfo} />
            <ReferenceSearch selectedRefs={selectedRefs} onSelectRef={toggleRef} />
          </div>

          {/* Image-generation model selector */}
          <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="font-nacelle text-sm font-semibold text-white">이미지 생성 모델</h3>
              <span className="text-[10px] text-gray-600">
                Step 2 가이드 이미지, Step 3 마스터 KV, Step 4 바리에이션에 적용
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                {
                  id: "gemini" as const,
                  title: "Nano Banana 2",
                  sub: "Google Gemini 3.1 Flash Image",
                },
                {
                  id: "openai" as const,
                  title: "GPT Image 2",
                  sub: "OpenAI · 2K · 텍스트 렌더 강화",
                },
              ]).map((opt) => (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-all ${
                    pendingProvider === opt.id
                      ? "border-indigo-500/60 bg-indigo-500/10"
                      : "border-gray-800 hover:border-gray-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value={opt.id}
                    checked={pendingProvider === opt.id}
                    onChange={() => setPendingProvider(opt.id)}
                    className="mt-1 h-4 w-4 accent-indigo-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{opt.title}</div>
                    <div className="text-[11px] text-gray-500">{opt.sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Generate button — full width, bottom */}
          <div className="relative">
            {/* Glow effect */}
            {eventInfo.trim() && !isProcessing && (
              <div className="pointer-events-none absolute inset-0 rounded-xl bg-indigo-500/20 blur-xl" />
            )}
            <button
              onClick={handleGenerate}
              disabled={isProcessing || !eventInfo.trim()}
              className="btn group relative w-full rounded-xl bg-gradient-to-t from-indigo-600 to-indigo-500 bg-[length:100%_100%] bg-[bottom] py-4 text-base font-semibold text-white shadow-[inset_0px_1px_0px_0px_theme(colors.white/.16)] transition-all hover:bg-[length:100%_150%] hover:shadow-lg hover:shadow-indigo-500/25 disabled:opacity-40 sm:py-5 sm:text-lg"
            >
              <span className="relative inline-flex items-center gap-3">
                {isProcessing ? (
                  <>
                    <svg className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    가이드라인 생성 중...
                  </>
                ) : versions.length === 0 ? (
                  <>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    가이드라인 생성하기
                    <svg className="h-4 w-4 text-white/60 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    새 버전 생성
                  </>
                )}
              </span>
            </button>
          </div>
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
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-gray-800 bg-gray-900/30 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800">
                <svg className="h-7 w-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-400">아직 생성된 가이드라인이 없습니다</p>
                <p className="mt-1 text-xs text-gray-600">Step 1에서 행사 정보를 입력하고 가이드라인을 생성하세요</p>
              </div>
              <button
                onClick={() => setStep(1)}
                className="mt-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-5 py-2 text-sm text-indigo-400 transition-colors hover:bg-indigo-500/20"
              >
                ← Step 1로 이동
              </button>
            </div>
          ) : (
            <>
              {/* Version tabs */}
              <div className="flex flex-wrap items-center gap-2">
                {versions.map((ver) => (
                  <button
                    key={ver.id}
                    onClick={() => setActiveVersion(ver.id)}
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${
                      ver.id === activeVersionId
                        ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-400"
                        : "border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                    }`}
                  >
                    <span className="font-medium">{ver.label}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${
                        (ver.provider ?? "gemini") === "openai"
                          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                          : "bg-sky-500/10 text-sky-300 ring-sky-500/30"
                      }`}
                      title={
                        (ver.provider ?? "gemini") === "openai"
                          ? "이 버전은 GPT Image 2로 생성"
                          : "이 버전은 Gemini로 생성"
                      }
                    >
                      {(ver.provider ?? "gemini") === "openai" ? "GPT" : "GEM"}
                    </span>
                    <div className="flex gap-0.5">
                      {ver.preview.colors.map((c, i) => (
                        <span key={i} className="inline-block h-3 w-3 rounded-full ring-1 ring-black/20" style={{ background: c }} />
                      ))}
                    </div>
                    {ver.id === selectedVersionId && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                        <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 16 16">
                          <path d="M14.3.3c.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4l-8 8c-.2.2-.4.3-.7.3-.3 0-.5-.1-.7-.3l-4-4c-.4-.4-.4-1 0-1.4.4-.4 1-.4 1.4 0L7 7.6 14.3.3z" />
                        </svg>
                        확정
                      </span>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => { setStep(1); }}
                  className="flex items-center gap-1 rounded-full border border-dashed border-gray-700 px-4 py-2 text-sm text-gray-600 transition-colors hover:border-gray-600 hover:text-gray-400"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  새 버전
                </button>
              </div>

              {/* Active version viewer */}
              {activeVersion && (
                <div className="space-y-6">
                  {/* 상단 액션 바 */}
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-800/60 bg-gray-900/30 p-3">
                    <button
                      onClick={() => selectVersionForStep3(activeVersion.id)}
                      className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                        selectedVersionId === activeVersion.id
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                          : "border-gray-700 text-gray-400 hover:border-indigo-500/50 hover:bg-indigo-500/5 hover:text-indigo-400"
                      }`}
                    >
                      {selectedVersionId === activeVersion.id ? (
                        <>
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M14.3.3c.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4l-8 8c-.2.2-.4.3-.7.3-.3 0-.5-.1-.7-.3l-4-4c-.4-.4-.4-1 0-1.4.4-.4 1-.4 1.4 0L7 7.6 14.3.3z" />
                          </svg>
                          가이드라인 확정됨
                        </>
                      ) : "이 버전으로 가이드라인 확정"}
                    </button>
                    {selectedVersionId && (
                      <button
                        onClick={() => setStep(3)}
                        className="flex items-center gap-2 rounded-lg bg-gradient-to-t from-indigo-600 to-indigo-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-indigo-500/30"
                      >
                        마스터 KV 생성
                        <svg className="h-4 w-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                    <div className="ml-auto">
                      <button
                        onClick={() => generateGuidelinePdf(
                          activeVersion.guideline,
                          activeVersion.guideline.event_summary?.name || "가이드라인",
                          activeVersion.guideImages
                        )}
                        className="flex items-center gap-2 rounded-lg border border-gray-800 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-300"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        PDF 내보내기
                      </button>
                    </div>
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

      {/* Step 3: 마스터 KV */}
      {step === 3 && (
        <div className="space-y-6">
          {/* 상단 정보 바 */}
          <div className="flex items-center justify-between rounded-xl border border-gray-800/60 bg-gray-900/30 px-4 py-3">
            <div>
              <span className="text-sm font-medium text-gray-300">마스터 KV 생성</span>
              <span className="ml-2 text-xs text-gray-600">
                {confirmedVersion?.guideline?.event_summary?.name || ""}
              </span>
            </div>
            <button
              onClick={() => setStep(2)}
              className="text-xs text-gray-600 transition-colors hover:text-gray-400"
            >
              ← 가이드라인으로
            </button>
          </div>

          <KvGenerator onConfirm={() => setStep(4)} />
        </div>
      )}

      {/* Step 4: 바리에이션 생성 */}
      {step === 4 && (
        <div className="space-y-6">
          {/* 상단 정보 바 */}
          <div className="flex items-center justify-between rounded-xl border border-gray-800/60 bg-gray-900/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-300">바리에이션 생성</span>
              {confirmedVersion?.masterKv?.imageUrl && (
                <img
                  src={confirmedVersion.masterKv.imageUrl}
                  alt="마스터 KV 썸네일"
                  className="h-8 w-14 rounded object-cover ring-1 ring-indigo-500/30"
                />
              )}
            </div>
            <button
              onClick={() => setStep(3)}
              className="text-xs text-gray-600 transition-colors hover:text-gray-400"
            >
              ← 마스터 KV
            </button>
          </div>

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
