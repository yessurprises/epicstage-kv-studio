"use client";

import { useState } from "react";
import type { ProductionPlanItem } from "./types";
import { useStore } from "./use-store";

const RATIO_OPTIONS = [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "21:9",
  "9:21",
];

export default function PlanItemCard({ item }: { item: ProductionPlanItem }) {
  const updatePlanItem = useStore((s) => s.updatePlanItem);
  const [open, setOpen] = useState(false);

  const [headline, setHeadline] = useState(item.headline);
  const [subtext, setSubtext] = useState(item.subtext ?? "");
  const [layoutNote, setLayoutNote] = useState(item.layout_note);
  const [imagePrompt, setImagePrompt] = useState(item.image_prompt);
  const [ratio, setRatio] = useState(item.ratio);
  const [imageSize, setImageSize] = useState<"" | "512" | "1K" | "2K" | "4K">(
    item.image_size ?? "",
  );
  const [temperature, setTemperature] = useState<number>(item.temperature ?? 1);
  const [seed, setSeed] = useState<string>(
    item.seed !== undefined ? String(item.seed) : "",
  );

  const ratioOptions = RATIO_OPTIONS.includes(item.ratio)
    ? RATIO_OPTIONS
    : [item.ratio, ...RATIO_OPTIONS];

  function save() {
    const patch: Partial<ProductionPlanItem> = {
      headline,
      subtext: subtext.trim() === "" ? null : subtext,
      layout_note: layoutNote,
      image_prompt: imagePrompt,
      ratio,
      image_size: imageSize === "" ? undefined : imageSize,
      temperature: temperature === 1 ? undefined : temperature,
      seed: seed.trim() === "" ? undefined : Number(seed),
      overridden: true,
    };
    updatePlanItem(item.num, patch);
    setOpen(false);
  }

  function reset() {
    setHeadline(item.headline);
    setSubtext(item.subtext ?? "");
    setLayoutNote(item.layout_note);
    setImagePrompt(item.image_prompt);
    setRatio(item.ratio);
    setImageSize(item.image_size ?? "");
    setTemperature(item.temperature ?? 1);
    setSeed(item.seed !== undefined ? String(item.seed) : "");
  }

  const hasOverrides = item.overridden === true;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-gray-900/60"
      >
        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 font-medium text-indigo-400">
          #{item.num}
        </span>
        <span className="font-medium text-gray-300">{item.name}</span>
        <span className="font-mono text-gray-600">{item.ratio}</span>
        {hasOverrides && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
            custom
          </span>
        )}
        <span className="ml-auto text-gray-600">{open ? "▾" : "▸"}</span>
      </button>

      {!open && (item.headline || item.subtext || item.layout_note) && (
        <div className="space-y-1 px-4 pb-3 pt-0">
          {item.headline && (
            <div className="text-gray-400">
              <span className="text-gray-600">카피:</span> {item.headline}
            </div>
          )}
          {item.subtext && (
            <div className="text-gray-500">
              <span className="text-gray-600">서브:</span> {item.subtext}
            </div>
          )}
          {item.layout_note && (
            <div className="text-gray-500">
              <span className="text-gray-600">레이아웃:</span> {item.layout_note}
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="space-y-3 border-t border-gray-800 px-4 py-3">
          <Field label="헤드라인">
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full rounded bg-gray-950 px-2 py-1.5 text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
            />
          </Field>

          <Field label="서브">
            <input
              value={subtext}
              onChange={(e) => setSubtext(e.target.value)}
              placeholder="(없음)"
              className="w-full rounded bg-gray-950 px-2 py-1.5 text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
            />
          </Field>

          <Field label="레이아웃">
            <textarea
              value={layoutNote}
              onChange={(e) => setLayoutNote(e.target.value)}
              rows={2}
              className="w-full resize-y rounded bg-gray-950 px-2 py-1.5 text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
            />
          </Field>

          <Field label="이미지 프롬프트">
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              rows={4}
              className="w-full resize-y rounded bg-gray-950 px-2 py-1.5 font-mono text-[11px] text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="비율 (aspect ratio)">
              <select
                value={ratio}
                onChange={(e) => setRatio(e.target.value)}
                className="w-full rounded bg-gray-950 px-2 py-1.5 text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
              >
                {ratioOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                    {r === item.ratio ? " (기본)" : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="해상도 (imageSize)">
              <select
                value={imageSize}
                onChange={(e) =>
                  setImageSize(e.target.value as "" | "512" | "1K" | "2K" | "4K")
                }
                className="w-full rounded bg-gray-950 px-2 py-1.5 text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
              >
                <option value="">기본 (1K)</option>
                <option value="512">512</option>
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </Field>

            <Field label={`temperature (${temperature.toFixed(2)})`}>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full"
              />
            </Field>

            <Field label="seed (선택)">
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value.replace(/[^0-9-]/g, ""))}
                placeholder="빈값=랜덤"
                className="w-full rounded bg-gray-950 px-2 py-1.5 text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={reset}
              className="rounded px-3 py-1.5 text-gray-400 hover:text-gray-200"
            >
              되돌리기
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded bg-indigo-500 px-3 py-1.5 font-medium text-white hover:bg-indigo-400"
            >
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      {children}
    </label>
  );
}
