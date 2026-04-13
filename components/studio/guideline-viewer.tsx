"use client";

import { useState, useEffect, useRef } from "react";
import { useStore } from "./use-store";
import { generateGuideImage } from "./guideline-generator";
import type { Version } from "./use-store";

// 섹션별 guide item id + 기본 label/description 매핑
const SECTION_IMAGE_ID: Record<string, string> = {
  color_palette: "color_palette_sheet",
  typography: "typography_sheet",
  mood: "mood_board",
  graphic_motifs: "motif_board",
  layout_guide: "layout_sketches",
  logo_usage: "logo_usage_sheet",
};

const SECTION_DEFAULTS: Record<string, { id: string; label: string; description: string }> = {
  color_palette: { id: "color_palette_sheet", label: "컬러 팔레트 시트", description: "컬러 팔레트 예시 이미지" },
  typography: { id: "typography_sheet", label: "타이포그래피 가이드 시트", description: "폰트 패밀리 + 사이즈 시스템" },
  mood: { id: "mood_board", label: "무드보드", description: "무드보드 예시 이미지" },
  graphic_motifs: { id: "motif_board", label: "모티프 보드", description: "그래픽 모티프 예시 이미지" },
  layout_guide: { id: "layout_sketches", label: "레이아웃 스케치", description: "레이아웃 가이드 예시 이미지" },
  logo_usage: { id: "logo_usage_sheet", label: "로고 사용 가이드", description: "배치·최소 크기·여백 규정" },
};

function InlineGuideImage({
  version,
  sectionKey,
  autoGenerating,
}: {
  version: Version;
  sectionKey: string;
  autoGenerating?: boolean;
}) {
  const { setGuideImage, refAnalysis } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const itemId = SECTION_IMAGE_ID[sectionKey];
  const item = version.guideline?.guide_items_to_visualize?.find((i) => i.id === itemId)
    || SECTION_DEFAULTS[sectionKey];
  const imageUrl = version.guideImages?.[itemId];
  const isLoading = loading || (autoGenerating && !imageUrl);

  if (!item) return null;

  async function handleGenerate() {
    setLoading(true);
    setError("");
    try {
      const { ciImages } = useStore.getState();
      const ci = ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));
      const url = await generateGuideImage(version.guideline, item!, refAnalysis || undefined, ci);
      setGuideImage(version.id, itemId, url);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div className="mt-4 rounded-lg border border-gray-800 overflow-hidden">
      {imageUrl ? (
        <div className="relative group">
          <img src={imageUrl} alt={item.label} className="w-full" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/60 transition-opacity">
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isLoading ? "재생성 중..." : "재생성"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-gray-900/60 px-4 py-3">
          <span className="text-xs text-gray-500">{item.label}</span>
          {isLoading ? (
            <div className="flex items-center gap-2">
              <svg className="h-3.5 w-3.5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs text-indigo-400">생성 중...</span>
            </div>
          ) : (
            <button
              onClick={handleGenerate}
              className="rounded border border-gray-700 px-3 py-1 text-xs text-gray-400 hover:border-indigo-500/50 hover:text-indigo-400"
            >
              예시 이미지 생성
            </button>
          )}
          {error && <span className="ml-2 text-[10px] text-red-400">{error}</span>}
        </div>
      )}
    </div>
  );
}

function ColorSwatch({
  label, hex, usage, onChangeHex, onDelete,
}: {
  label: string; hex: string; usage: string;
  onChangeHex: (hex: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-3">
      <label className="relative h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-gray-700" style={{ background: hex }}>
        <input
          type="color"
          value={hex}
          onChange={(e) => onChangeHex(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-300">{label}</span>
          <input
            type="text"
            value={hex}
            onChange={(e) => {
              let v = e.target.value;
              if (v && !v.startsWith("#")) v = "#" + v;
              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChangeHex(v);
            }}
            className="w-20 rounded border border-gray-800 bg-gray-950 px-1.5 py-0.5 font-mono text-[10px] text-indigo-400 focus:border-indigo-500/50 focus:outline-none"
          />
        </div>
        <div className="text-[10px] text-gray-500">{usage}</div>
      </div>
      <button
        onClick={onDelete}
        className="rounded p-0.5 text-gray-700 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
        title="삭제"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  );
}

function ColorPaletteEditor({ version, autoGenerating }: { version: Version; autoGenerating?: boolean }) {
  const { updateColorPalette } = useStore();
  const palette = version.guideline?.color_palette;
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newHex, setNewHex] = useState("#000000");

  if (!palette) return null;

  const entries = Object.entries(palette);

  function handleChangeHex(key: string, hex: string) {
    const next = { ...palette, [key]: { ...palette[key], hex } };
    updateColorPalette(version.id, next);
  }

  function handleDelete(key: string) {
    const next = { ...palette };
    delete next[key];
    updateColorPalette(version.id, next);
  }

  function handleAdd() {
    if (!newLabel.trim() || !newHex) return;
    const key = newLabel.trim().toLowerCase().replace(/\s+/g, "_");
    const next = { ...palette, [key]: { hex: newHex, usage: "" } };
    updateColorPalette(version.id, next);
    setNewLabel("");
    setNewHex("#000000");
    setAdding(false);
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">컬러 팔레트</h4>
        <button
          onClick={() => setAdding(!adding)}
          className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-500 hover:border-indigo-500/50 hover:text-indigo-400"
        >
          {adding ? "취소" : "+ 컬러 추가"}
        </button>
      </div>

      {adding && (
        <div className="mb-4 flex items-end gap-2 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <div className="flex-1">
            <label className="mb-1 block text-[10px] text-gray-600">이름</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="예: accent_gold"
              className="w-full rounded border border-gray-800 bg-gray-950 px-2 py-1 text-xs text-gray-300 focus:border-indigo-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-gray-600">색상</label>
            <div className="flex items-center gap-1.5">
              <label className="relative h-7 w-7 cursor-pointer rounded border border-gray-700" style={{ background: newHex }}>
                <input type="color" value={newHex} onChange={(e) => setNewHex(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </label>
              <input
                value={newHex}
                onChange={(e) => {
                  let v = e.target.value;
                  if (v && !v.startsWith("#")) v = "#" + v;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setNewHex(v);
                }}
                className="w-20 rounded border border-gray-800 bg-gray-950 px-1.5 py-1 font-mono text-[10px] text-indigo-400 focus:border-indigo-500/50 focus:outline-none"
              />
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={!newLabel.trim()}
            className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            추가
          </button>
        </div>
      )}

      <div className="space-y-3">
        {entries.map(([key, { hex, usage }]) => (
          <ColorSwatch
            key={key}
            label={key}
            hex={hex}
            usage={usage}
            onChangeHex={(h) => handleChangeHex(key, h)}
            onDelete={() => handleDelete(key)}
          />
        ))}
      </div>

      <InlineGuideImage version={version} sectionKey="color_palette" autoGenerating={autoGenerating} />
    </div>
  );
}

const SECTION_KEYS = Object.keys(SECTION_IMAGE_ID);

export default function GuidelineViewer({ version }: { version: Version }) {
  const g = version.guideline;
  const autoGenRef = useRef<string | null>(null);
  const [autoGenerating, setAutoGenerating] = useState(false);

  // 자동 생성: 버전이 바뀌면 아직 없는 가이드 이미지를 전부 순차 생성
  useEffect(() => {
    if (!g) return;
    if (autoGenRef.current === version.id) return;
    autoGenRef.current = version.id;

    (async () => {
      const items = g.guide_items_to_visualize || [];
      const missing = SECTION_KEYS.filter((sk) => {
        const itemId = SECTION_IMAGE_ID[sk];
        return !version.guideImages?.[itemId];
      });
      if (missing.length === 0) return;

      setAutoGenerating(true);
      const { ciImages, refAnalysis } = useStore.getState();
      const ci = ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));

      for (const sk of missing) {
        const itemId = SECTION_IMAGE_ID[sk];
        const item = items.find((i) => i.id === itemId) || SECTION_DEFAULTS[sk];
        if (!item) continue;
        // 생성 중 다른 버전으로 바뀌었으면 중단
        if (useStore.getState().activeVersionId !== version.id) break;
        try {
          const url = await generateGuideImage(g, item, refAnalysis || undefined, ci);
          useStore.getState().setGuideImage(version.id, itemId, url);
        } catch {
          // 실패해도 다음 진행
        }
      }
      setAutoGenerating(false);
    })();
  }, [version.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!g) return null;

  return (
    <div className="space-y-5">
      {/* Event summary */}
      <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-5">
        <h4 className="mb-2 font-nacelle text-base font-semibold text-white">
          {g.event_summary.name}
        </h4>
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-400">
          {g.event_summary.date && <div>날짜: {g.event_summary.date}</div>}
          {g.event_summary.venue && <div>장소: {g.event_summary.venue}</div>}
          {g.event_summary.organizer && <div>주최: {g.event_summary.organizer}</div>}
          {g.event_summary.theme && <div>테마: {g.event_summary.theme}</div>}
        </div>
        {g.event_summary.slogan && (
          <div className="mt-3 text-sm italic text-indigo-300">"{g.event_summary.slogan}"</div>
        )}
      </div>

      {/* Color palette — editable */}
      <ColorPaletteEditor version={version} autoGenerating={autoGenerating} />

      {/* Mood */}
      <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-5">
        <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">무드</h4>
        <div className="flex flex-wrap gap-2">
          {g.mood.keywords?.map((kw) => (
            <span key={kw} className="rounded-full bg-indigo-500/10 px-3 py-1 text-sm text-indigo-400 ring-1 ring-indigo-500/20">
              {kw}
            </span>
          ))}
        </div>
        {g.mood.tone && <div className="mt-2 text-sm text-gray-500">톤: {g.mood.tone}</div>}
        <InlineGuideImage version={version} sectionKey="mood" autoGenerating={autoGenerating} />
      </div>

      {/* Graphic motifs */}
      <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-5">
        <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">그래픽 모티프</h4>
        <div className="space-y-1.5 text-sm text-gray-400">
          <div>스타일: {g.graphic_motifs?.style}</div>
          <div>텍스처: {g.graphic_motifs?.texture}</div>
          <div>아이콘: {g.graphic_motifs?.icon_style}</div>
          <div className="flex flex-wrap gap-1 pt-1">
            {g.graphic_motifs?.elements?.map((el) => (
              <span key={el} className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{el}</span>
            ))}
          </div>
        </div>
        <InlineGuideImage version={version} sectionKey="graphic_motifs" autoGenerating={autoGenerating} />
      </div>

      {/* Layout guide */}
      {g.layout_guide && (
        <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-5">
          <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">레이아웃 가이드</h4>
          <div className="space-y-1.5 text-sm text-gray-400">
            {Object.entries(g.layout_guide).map(([key, val]) => val && (
              <div key={key} className="flex gap-2">
                <span className="shrink-0 font-mono text-[10px] text-gray-600 uppercase">{key}</span>
                <span>{val as string}</span>
              </div>
            ))}
          </div>
          <InlineGuideImage version={version} sectionKey="layout_guide" autoGenerating={autoGenerating} />
        </div>
      )}

    </div>
  );
}
