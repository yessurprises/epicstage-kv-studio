"use client";

// Phase C — 2nd-pass edit overlay. Operator drags rectangles on top of the
// current production image and writes a per-region instruction; on submit
// the parent dispatches a regenerate call with the source image attached as
// the primary reference and the rectangles emitted as text coordinates.
//
// Coordinates collected from the DOM are in DISPLAY pixels; we translate to
// the source image's NATURAL pixels before reporting up so the prompt's
// pixel coordinates match the image the model actually sees.

import { useEffect, useRef, useState } from "react";
import type { EditRegion } from "./types";

interface DraftRegion extends EditRegion {
  id: string;
}

interface Props {
  open: boolean;
  imageUrl: string;
  onCancel: () => void;
  onSubmit: (regions: EditRegion[], globalInstruction: string) => void;
}

export default function EditOverlay({ open, imageUrl, onCancel, onSubmit }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [regions, setRegions] = useState<DraftRegion[]>([]);
  const [drafting, setDrafting] = useState<{
    startX: number;
    startY: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [globalInstruction, setGlobalInstruction] = useState("");

  useEffect(() => {
    if (!open) {
      setRegions([]);
      setDrafting(null);
      setActiveId(null);
      setGlobalInstruction("");
      setNaturalSize(null);
    }
  }, [open]);

  if (!open) return null;

  function displayToNatural(rect: { x: number; y: number; w: number; h: number }) {
    const img = imgRef.current;
    if (!img || !naturalSize) return rect;
    const sx = naturalSize.w / img.clientWidth;
    const sy = naturalSize.h / img.clientHeight;
    return {
      x: rect.x * sx,
      y: rect.y * sy,
      w: rect.w * sx,
      h: rect.h * sy,
    };
  }

  function naturalToDisplay(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const img = imgRef.current;
    if (!img || !naturalSize) return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    const sx = img.clientWidth / naturalSize.w;
    const sy = img.clientHeight / naturalSize.h;
    return {
      x: rect.x * sx,
      y: rect.y * sy,
      w: rect.width * sx,
      h: rect.height * sy,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // Reject drags before the image's natural size is known: displayToNatural
    // would silently return the display-pixel rect, which leaks into the
    // EditRegion as bogus coordinates and tells the model to edit the wrong
    // area of the image.
    if (!naturalSize) return;
    if ((e.target as HTMLElement).closest("[data-region-handle]")) return;
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrafting({ startX: x, startY: y, x, y, w: 0, h: 0 });
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drafting) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const cx = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const cy = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const x = Math.min(drafting.startX, cx);
    const y = Math.min(drafting.startY, cy);
    const w = Math.abs(cx - drafting.startX);
    const h = Math.abs(cy - drafting.startY);
    setDrafting({ ...drafting, x, y, w, h });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    if (!drafting) return;
    if (drafting.w < 8 || drafting.h < 8) {
      setDrafting(null);
      return;
    }
    const nat = displayToNatural(drafting);
    const id = `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const next: DraftRegion = {
      id,
      x: Math.round(nat.x),
      y: Math.round(nat.y),
      width: Math.round(nat.w),
      height: Math.round(nat.h),
      instruction: "",
    };
    setRegions((prev) => [...prev, next]);
    setActiveId(id);
    setDrafting(null);
  }

  function updateInstruction(id: string, value: string) {
    setRegions((prev) =>
      prev.map((r) => (r.id === id ? { ...r, instruction: value } : r)),
    );
  }

  function removeRegion(id: string) {
    setRegions((prev) => prev.filter((r) => r.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function submit() {
    const valid = regions
      .filter((r) => r.instruction.trim().length > 0)
      .map(({ id: _omit, ...rest }) => rest);
    onSubmit(valid, globalInstruction);
  }

  const canSubmit =
    regions.some((r) => r.instruction.trim().length > 0) ||
    globalInstruction.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">2차 수정</div>
            <div className="text-[11px] text-gray-500">
              이미지 위에 드래그로 영역을 그리고, 각 영역마다 수정 지시를 입력하세요. (최소
              8×8 px) 좌표는 원본 해상도 기준 픽셀로 모델에 전달됩니다.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-200"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 overflow-auto p-4 md:grid-cols-[minmax(0,1fr)_320px]">
          <div
            ref={wrapRef}
            className="relative select-none overflow-hidden rounded-lg border border-gray-800 bg-gray-900"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ touchAction: "none" }}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="원본"
              draggable={false}
              onLoad={(e) => {
                const t = e.currentTarget;
                setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
              }}
              className="block w-full"
            />
            {regions.map((r, idx) => {
              const d = naturalToDisplay(r);
              const isActive = activeId === r.id;
              return (
                <div
                  key={r.id}
                  data-region-handle
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setActiveId(r.id);
                  }}
                  className={`absolute box-border border-2 ${
                    isActive
                      ? "border-amber-400 bg-amber-400/15"
                      : "border-indigo-400 bg-indigo-400/10"
                  }`}
                  style={{ left: d.x, top: d.y, width: d.w, height: d.h }}
                >
                  <span
                    className={`absolute -top-5 left-0 rounded px-1.5 text-[10px] font-medium ${
                      isActive
                        ? "bg-amber-400 text-gray-900"
                        : "bg-indigo-500 text-white"
                    }`}
                  >
                    #{idx + 1}
                  </span>
                </div>
              );
            })}
            {drafting && (
              <div
                className="absolute box-border border-2 border-dashed border-emerald-400 bg-emerald-400/10"
                style={{
                  left: drafting.x,
                  top: drafting.y,
                  width: drafting.w,
                  height: drafting.h,
                }}
              />
            )}
            {naturalSize && (
              <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-gray-300">
                {naturalSize.w} × {naturalSize.h}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">
                영역별 수정 ({regions.length})
              </div>
              {regions.length === 0 && (
                <div className="rounded border border-dashed border-gray-800 px-2 py-3 text-center text-[11px] text-gray-600">
                  드래그로 영역 추가
                </div>
              )}
              <div className="space-y-2">
                {regions.map((r, idx) => (
                  <div
                    key={r.id}
                    onMouseEnter={() => setActiveId(r.id)}
                    className={`rounded border p-2 ${
                      activeId === r.id
                        ? "border-amber-500/60 bg-amber-500/5"
                        : "border-gray-800 bg-gray-900/40"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-gray-300">
                        #{idx + 1}
                      </span>
                      <span className="font-mono text-[10px] text-gray-600">
                        {r.x},{r.y} · {r.width}×{r.height}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRegion(r.id)}
                        className="rounded px-1 text-[11px] text-rose-400 hover:bg-rose-500/10"
                        aria-label={`영역 #${idx + 1} 삭제`}
                      >
                        ✕
                      </button>
                    </div>
                    <textarea
                      value={r.instruction}
                      onChange={(e) => updateInstruction(r.id, e.target.value)}
                      rows={2}
                      placeholder="예: 이 영역 글자만 더 크게"
                      className="w-full resize-y rounded bg-gray-950 px-2 py-1 text-[11px] text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">
                전체 지시 (선택)
              </span>
              <textarea
                value={globalInstruction}
                onChange={(e) => setGlobalInstruction(e.target.value)}
                rows={2}
                placeholder="영역 외 전체에 적용할 수정 지시"
                className="w-full resize-y rounded bg-gray-950 px-2 py-1.5 text-[11px] text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
              />
            </label>

            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2 text-[10px] leading-relaxed text-amber-300">
              주의: 좌표·텍스트 기반 수정은 마스크 인페인팅보다 정밀도가 떨어집니다. 영역 외
              부분도 약간 변형될 수 있습니다 — 결과 확인 후 추가 수정을 반복하세요.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-800 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            새 버전 생성
          </button>
        </div>
      </div>
    </div>
  );
}
