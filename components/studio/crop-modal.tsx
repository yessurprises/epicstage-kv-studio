"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

interface Props {
  open: boolean;
  imageUrl: string;
  targetW: number;
  targetH: number;
  onApply: (croppedDataUrl: string) => void;
  onClose: () => void;
  title?: string;
}

/**
 * Drag-to-crop modal for upscale refinement. Locks the crop box to the target
 * W/H aspect ratio, lets the user pan/zoom, then emits a pixel-exact PNG
 * sized to exactly `targetW × targetH`.
 */
export default function CropModal({
  open,
  imageUrl,
  targetW,
  targetH,
  onApply,
  onClose,
  title,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset transient state whenever a new image/target is loaded in.
  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedArea(null);
      setBusy(false);
    }
  }, [open, imageUrl, targetW, targetH]);

  const onCropComplete = useCallback((_: Area, areaPx: Area) => {
    setCroppedArea(areaPx);
  }, []);

  async function handleApply() {
    if (!croppedArea) return;
    setBusy(true);
    try {
      const out = await cropToDataUrl(imageUrl, croppedArea, targetW, targetH);
      onApply(out);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const aspect = targetW / targetH;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">
            {title ?? `크롭 — ${targetW} × ${targetH} px`}
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-200"
            aria-label="닫기"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="relative h-[60vh] bg-gray-900">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid
            restrictPosition
            objectFit="contain"
          />
        </div>

        <div className="space-y-3 border-t border-gray-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">
              Zoom
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
              aria-label="줌"
            />
            <span className="w-12 text-right font-mono text-[11px] text-gray-400">
              {zoom.toFixed(2)}x
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500">
              드래그로 이동 · 모서리로 크기 조정 (비율 {targetW}:{targetH} 고정)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setCrop({ x: 0, y: 0 });
                  setZoom(1);
                }}
                className="rounded px-3 py-1.5 text-[11px] text-gray-400 hover:text-gray-200"
              >
                리셋
              </button>
              <button
                onClick={onClose}
                className="rounded px-3 py-1.5 text-[11px] text-gray-400 hover:text-gray-200"
              >
                취소
              </button>
              <button
                onClick={handleApply}
                disabled={busy || !croppedArea}
                className="rounded bg-indigo-500 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                {busy ? "적용 중..." : "적용"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = src;
  });
}

async function cropToDataUrl(
  src: string,
  area: Area,
  outW: number,
  outH: number,
): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(outW);
  canvas.height = Math.round(outH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context 사용 불가");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/png");
}
