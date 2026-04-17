"use client";

import { useState } from "react";
import { generateGuideImage } from "./generation";
import { SECTION_DEFAULTS, SECTION_IMAGE_ID } from "./guide-sections";
import type { Version } from "./types";
import { useStore } from "./use-store";

interface Props {
  version: Version;
  sectionKey: string;
  autoGenerating?: boolean;
}

export default function GuideImageCard({ version, sectionKey, autoGenerating }: Props) {
  const { setGuideImage, refAnalysis } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const itemId = SECTION_IMAGE_ID[sectionKey];
  const item =
    version.guideline?.guide_items_to_visualize?.find((i) => i.id === itemId) ||
    SECTION_DEFAULTS[sectionKey];
  const imageUrl = version.guideImages?.[itemId];
  const isLoading = loading || (autoGenerating && !imageUrl);

  if (!item) return null;

  async function handleGenerate() {
    if (!item) return;
    setLoading(true);
    setError("");
    try {
      const { ciImages } = useStore.getState();
      const ci = ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));
      const url = await generateGuideImage(
        version.guideline,
        item,
        refAnalysis || undefined,
        ci,
      );
      setGuideImage(version.id, itemId, url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  return (
    <div className="mt-4 rounded-lg border border-gray-800 overflow-hidden">
      {imageUrl ? (
        <>
          <img src={imageUrl} alt={item.label} className="block w-full" />
          <div className="flex items-center justify-between bg-gray-900/60 px-4 py-2">
            <span className="text-xs text-gray-500">{item.label}</span>
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="rounded border border-gray-700 px-3 py-1 text-xs text-gray-400 hover:border-indigo-500/50 hover:text-indigo-400 disabled:opacity-50"
            >
              {isLoading ? "재생성 중..." : "재생성"}
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between bg-gray-900/60 px-4 py-3">
          <span className="text-xs text-gray-500">{item.label}</span>
          {isLoading ? (
            <div className="flex items-center gap-2">
              <svg
                className="h-3.5 w-3.5 animate-spin text-indigo-400"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
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
          {error && (
            <span className="ml-2 text-[10px] text-red-400" role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
