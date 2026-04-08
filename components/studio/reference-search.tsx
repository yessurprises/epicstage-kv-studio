"use client";

import { useRef, useState } from "react";
import { useStore } from "./use-store";
import { EVENT_TYPES } from "./constants";
import { analyzeRefs } from "./guideline-generator";
import { isLocal, SEARCH_URL } from "./config";

interface RefResult {
  title: string;
  url: string;
  thumbnail: string;
  width?: string;
  height?: string;
  source: string;
}

function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(",");
      const mime = header.match(/data:(.*);base64/)?.[1] || file.type;
      resolve({ base64, mime });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ReferenceSearch({
  selectedRefs,
  onSelectRef,
}: {
  selectedRefs: string[];
  onSelectRef: (url: string) => void;
}) {
  const { refFiles, addRefFile, removeRefFile, refAnalysis, setRefAnalysis } = useStore();
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("");
  const [results, setResults] = useState<RefResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"search" | "upload">("search");
  const fileRef = useRef<HTMLInputElement>(null);

  const totalSelected = selectedRefs.length + refFiles.length;

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const searchQuery = eventType ? `${eventType} ${query}` : query;
      const body = isLocal()
        ? { query: searchQuery, limit: 30 }
        : { event_type: eventType || undefined, theme_keywords: searchQuery.split(/\s+/).filter(Boolean), count: 30 };
      const resp = await fetch(SEARCH_URL(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`검색 실패: ${resp.status}`);
      const data = await resp.json();
      const items = (data.results || []).filter((r: RefResult) => r.thumbnail);
      setResults(items);
      if (items.length === 0) setError("검색 결과가 없습니다.");
    } catch (e: any) {
      setError(e.message);
      setResults([]);
    }
    setLoading(false);
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files) return;
    const remaining = 8 - refFiles.length;
    const toProcess = Array.from(files).slice(0, remaining);
    for (const file of toProcess) {
      const { base64, mime } = await fileToBase64(file);
      addRefFile({
        id: "ref_" + Date.now() + "_" + Math.random().toString(36).slice(2),
        name: file.name,
        mime,
        base64,
      });
    }
  }

  async function handleAnalyze() {
    if (refFiles.length === 0) return;
    setAnalyzing(true);
    setError("");
    try {
      const analysis = await analyzeRefs(
        refFiles.map((f) => ({ mime: f.mime, base64: f.base64 }))
      );
      setRefAnalysis(analysis);
    } catch (e: any) {
      setError(e.message);
    }
    setAnalyzing(false);
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h3 className="font-nacelle text-sm font-semibold text-white">
          레퍼런스 이미지
          {totalSelected > 0 && (
            <span className="ml-2 text-xs font-normal text-indigo-400">{totalSelected}장 선택</span>
          )}
        </h3>
        {refFiles.length > 0 && (
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {analyzing ? "분석 중..." : "Gemini 분석"}
          </button>
        )}
      </div>

      {/* Selected images — unified strip */}
      {totalSelected > 0 && (
        <div className="border-b border-gray-800 px-4 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {/* Uploaded files */}
            {refFiles.map((f) => (
              <div key={f.id} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-indigo-500/40">
                <img
                  src={`data:${f.mime};base64,${f.base64}`}
                  alt={f.name}
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={() => removeRefFile(f.id)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <span className="text-lg leading-none">×</span>
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-indigo-600/80 py-px text-center text-[8px] text-white">파일</div>
              </div>
            ))}
            {/* Search-selected thumbnails */}
            {selectedRefs.map((url, i) => (
              <div key={i} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-indigo-500/40">
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <button
                  onClick={() => onSelectRef(url)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <span className="text-lg leading-none">×</span>
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gray-600/80 py-px text-center text-[8px] text-white">검색</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setTab("search")}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
            tab === "search"
              ? "border-b-2 border-indigo-500 text-indigo-400"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          검색
        </button>
        <button
          onClick={() => setTab("upload")}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
            tab === "upload"
              ? "border-b-2 border-indigo-500 text-indigo-400"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          직접 업로드 ({refFiles.length}/8)
        </button>
      </div>

      <div className="p-4">
        {/* Search tab */}
        {tab === "search" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="예: 기업 세미나 포토월 모던"
                className="min-w-0 flex-1 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500/50 focus:outline-none"
              />
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="hidden rounded-lg border border-gray-800 bg-gray-950 px-2 py-2 text-xs text-gray-400 sm:block"
              >
                <option value="">전체</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                onClick={handleSearch}
                disabled={loading}
                className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {loading ? "..." : "검색"}
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-6 text-sm text-gray-500">검색 중...</div>
            )}

            {error && !loading && (
              <div className="text-xs text-red-400">{error}</div>
            )}

            {!loading && results.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {results.map((r, i) => {
                  const isSelected = selectedRefs.includes(r.url);
                  return (
                    <button
                      key={i}
                      onClick={() => onSelectRef(r.url)}
                      title={r.title}
                      className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                        isSelected
                          ? "border-indigo-500 shadow-lg shadow-indigo-500/20"
                          : "border-transparent hover:border-gray-700"
                      }`}
                    >
                      <img
                        src={r.thumbnail}
                        alt={r.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-indigo-600/30">
                          <svg className="h-5 w-5 fill-white" viewBox="0 0 16 16">
                            <path d="M14.3.3c.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4l-8 8c-.2.2-.4.3-.7.3-.3 0-.5-.1-.7-.3l-4-4c-.4-.4-.4-1 0-1.4.4-.4 1-.4 1.4 0L7 7.6 14.3.3z" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Upload tab */}
        {tab === "upload" && (
          <div className="space-y-3">
            <label
              className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-950/50 px-4 py-4 text-sm text-gray-500 transition-colors hover:border-indigo-500/50 hover:text-gray-400"
              onDrop={(e) => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              클릭하거나 드롭 (최대 8장)
            </label>

            {refFiles.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {refFiles.map((f) => (
                  <div key={f.id} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-800">
                    <img
                      src={`data:${f.mime};base64,${f.base64}`}
                      alt={f.name}
                      className="h-full w-full object-cover"
                    />
                    <button
                      onClick={() => removeRefFile(f.id)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Analysis result — always visible */}
      {refAnalysis && (
        <div className="border-t border-gray-800 p-4">
          <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">Gemini 분석 결과</span>
              <button onClick={() => setRefAnalysis("")} className="text-[10px] text-gray-600 hover:text-gray-400">지우기</button>
            </div>
            <pre className="whitespace-pre-wrap text-[10px] leading-relaxed text-gray-400">{refAnalysis}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
