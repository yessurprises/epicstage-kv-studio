"use client";

import { useState } from "react";
import { MASTER_CATALOG, MULTILINE_FIELD_LABELS } from "./constants";
import type { ArrowDirection, ProductionPlanItem, ProductionUserInput } from "./types";
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

const DIRECTION_OPTIONS: Array<{ value: ArrowDirection; label: string }> = [
  { value: "up", label: "↑ 위" },
  { value: "down", label: "↓ 아래" },
  { value: "left", label: "← 왼쪽" },
  { value: "right", label: "→ 오른쪽" },
  { value: "up-left", label: "↖ 좌상" },
  { value: "up-right", label: "↗ 우상" },
  { value: "down-left", label: "↙ 좌하" },
  { value: "down-right", label: "↘ 우하" },
];

export default function PlanItemCard({ item }: { item: ProductionPlanItem }) {
  const updatePlanItem = useStore((s) => s.updatePlanItem);
  const provider = useStore((s) => {
    const v = s.versions.find((x) => x.id === s.selectedVersionId);
    return v?.provider ?? "gemini";
  });
  const [open, setOpen] = useState(false);

  const catalog = MASTER_CATALOG.find((c) => c.name === item.name);
  const showCatalogWidgets = provider === "openai" && Boolean(catalog);

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

  // Catalog-flag-driven inputs (OpenAI branch only)
  const [hideText, setHideText] = useState<boolean>(
    item.userInput?.hideText ?? false,
  );
  const [showSubtextFlag, setShowSubtextFlag] = useState<boolean>(
    item.userInput?.showSubtext ?? false,
  );
  const [customRatio, setCustomRatio] = useState<string>(
    item.userInput?.customRatio ?? "",
  );
  const [customText, setCustomText] = useState<string>(
    item.userInput?.customText ?? "",
  );
  const [direction, setDirection] = useState<ArrowDirection | "">(
    item.userInput?.direction ?? "",
  );

  const [multilineFields, setMultilineFields] = useState<Record<string, string>>(
    () => ({ ...(item.userInput?.multilineFields ?? {}) }),
  );

  function updateMultiline(key: string, value: string) {
    setMultilineFields((prev) => ({ ...prev, [key]: value }));
  }

  // Phase E — physical size override + safeZone editor
  const defaultPhysical =
    item.userInput?.customSize ??
    catalog?.physicalSizeMm ??
    catalog?.customSize;
  const [sizeWidthMm, setSizeWidthMm] = useState<string>(
    defaultPhysical ? String(defaultPhysical.widthMm) : "",
  );
  const [sizeHeightMm, setSizeHeightMm] = useState<string>(
    defaultPhysical ? String(defaultPhysical.heightMm) : "",
  );
  const sizeOverridden =
    Boolean(catalog?.physicalSizeMm) &&
    defaultPhysical !== undefined &&
    item.userInput?.customSize !== undefined;

  // safeZone 값은 0~1 비율로 저장되지만 UI에서는 운영자 친화적인 0~100 % 단위
  // 로 표시·입력한다 (소수점 두 자리까지). 저장 시 100으로 나눠 비율로 환원.
  const defaultSafeZone =
    item.userInput?.safeZone ?? catalog?.safeZone ?? [];
  const [safeZones, setSafeZones] = useState<
    Array<{ x: string; y: string; width: string; height: string }>
  >(
    defaultSafeZone.map((z) => ({
      x: fractionToPercentInput(z.x),
      y: fractionToPercentInput(z.y),
      width: fractionToPercentInput(z.width),
      height: fractionToPercentInput(z.height),
    })),
  );

  function updateSafeZone(
    idx: number,
    key: "x" | "y" | "width" | "height",
    value: string,
  ) {
    setSafeZones((prev) => {
      const next = [...prev];
      // 숫자·소수점만 허용. 100을 넘는 입력도 저장 직전 clamp되니 입력 단계에서는
      // 막지 않는다 (백스페이스 중간 상태 호환).
      next[idx] = { ...next[idx], [key]: value.replace(/[^0-9.]/g, "") };
      return next;
    });
  }

  function addSafeZone() {
    setSafeZones((prev) => [
      ...prev,
      { x: "0", y: "0", width: "100", height: "100" },
    ]);
  }

  function removeSafeZone(idx: number) {
    setSafeZones((prev) => prev.filter((_, i) => i !== idx));
  }

  const ratioOptions = RATIO_OPTIONS.includes(item.ratio)
    ? RATIO_OPTIONS
    : [item.ratio, ...RATIO_OPTIONS];

  function save() {
    // physical size: persist only if user actually changed it from the catalog default
    let customSize: { widthMm: number; heightMm: number } | undefined;
    const w = Number(sizeWidthMm);
    const h = Number(sizeHeightMm);
    if (w > 0 && h > 0) {
      const catalogDefault = catalog?.physicalSizeMm ?? catalog?.customSize;
      const matchesDefault =
        catalogDefault &&
        catalogDefault.widthMm === w &&
        catalogDefault.heightMm === h;
      if (!matchesDefault) customSize = { widthMm: w, heightMm: h };
    }

    // safeZone: UI는 0~100 %, 저장은 0~1 비율로 환원. catalog 기본값과 동일하면
    // 저장하지 않아 catalog 변경이 자동 반영되도록 한다.
    const cleanedZones = safeZones
      .map((z) => ({
        x: percentInputToFraction(z.x),
        y: percentInputToFraction(z.y),
        width: percentInputToFraction(z.width),
        height: percentInputToFraction(z.height),
      }))
      .filter(
        (z) =>
          Number.isFinite(z.x) &&
          Number.isFinite(z.y) &&
          z.width > 0 &&
          z.height > 0,
      );
    const catalogZones = catalog?.safeZone ?? [];
    const eq = (a: number, b: number) => Math.abs(a - b) < 1e-4;
    const safeZoneSame =
      cleanedZones.length === catalogZones.length &&
      cleanedZones.every(
        (z, i) =>
          eq(z.x, catalogZones[i].x) &&
          eq(z.y, catalogZones[i].y) &&
          eq(z.width, catalogZones[i].width) &&
          eq(z.height, catalogZones[i].height),
      );
    const safeZoneOverride = safeZoneSame ? undefined : cleanedZones;

    let multilineOut: Record<string, string> | undefined;
    if (catalog?.multilineTextUI?.length) {
      const cleaned: Record<string, string> = {};
      for (const key of catalog.multilineTextUI) {
        const v = multilineFields[key]?.trim();
        if (v) cleaned[key] = v;
      }
      if (Object.keys(cleaned).length > 0) multilineOut = cleaned;
    }

    const userInput: ProductionUserInput | undefined = showCatalogWidgets
      ? {
          ...(catalog?.textToggleable && hideText ? { hideText: true } : {}),
          ...(catalog?.subtextToggleable && showSubtextFlag
            ? { showSubtext: true }
            : {}),
          ...(catalog?.customRatio && customRatio.trim()
            ? { customRatio: customRatio.trim() }
            : {}),
          ...(catalog?.customTextUI && customText.trim()
            ? { customText: customText.trim() }
            : {}),
          ...(catalog?.directionSelector && direction
            ? { direction: direction as ArrowDirection }
            : {}),
          ...(customSize ? { customSize } : {}),
          ...(safeZoneOverride && safeZoneOverride.length > 0
            ? { safeZone: safeZoneOverride }
            : {}),
          ...(multilineOut ? { multilineFields: multilineOut } : {}),
        }
      : undefined;

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
      userInput:
        userInput && Object.keys(userInput).length > 0 ? userInput : undefined,
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
    setHideText(item.userInput?.hideText ?? false);
    setShowSubtextFlag(item.userInput?.showSubtext ?? false);
    setCustomRatio(item.userInput?.customRatio ?? "");
    setCustomText(item.userInput?.customText ?? "");
    setDirection(item.userInput?.direction ?? "");
    const phys =
      item.userInput?.customSize ??
      catalog?.physicalSizeMm ??
      catalog?.customSize;
    setSizeWidthMm(phys ? String(phys.widthMm) : "");
    setSizeHeightMm(phys ? String(phys.heightMm) : "");
    const zones = item.userInput?.safeZone ?? catalog?.safeZone ?? [];
    setSafeZones(
      zones.map((z) => ({
        x: fractionToPercentInput(z.x),
        y: fractionToPercentInput(z.y),
        width: fractionToPercentInput(z.width),
        height: fractionToPercentInput(z.height),
      })),
    );
    setMultilineFields({ ...(item.userInput?.multilineFields ?? {}) });
  }

  const hasOverrides = item.overridden === true;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-gray-900/60"
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
        <span className="ml-auto flex items-center gap-1 rounded border border-gray-700 bg-gray-800/50 px-2 py-0.5 text-[11px] text-gray-300 group-hover:border-indigo-500 group-hover:text-indigo-300">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3 w-3"
          >
            <path d="M17.414 2.586a2 2 0 0 0-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 0 0 0-2.828ZM2 17a1 1 0 0 0 1 1h14a1 1 0 1 0 0-2H3a1 1 0 0 0-1 1Z" />
          </svg>
          {open ? "닫기 ▾" : "편집 ▸"}
        </span>
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

          {showCatalogWidgets && (
            <div className="space-y-3 rounded border border-gray-800 bg-gray-950/40 p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">
                카탈로그 옵션 (OpenAI 전용)
              </div>

              {catalog?.textToggleable && (
                <label className="flex items-center gap-2 text-gray-300">
                  <input
                    type="checkbox"
                    checked={!hideText}
                    onChange={(e) => setHideText(!e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span>텍스트 표시 (끄면 패턴/모티프만)</span>
                </label>
              )}

              {catalog?.subtextToggleable && (
                <label className="flex items-center gap-2 text-gray-300">
                  <input
                    type="checkbox"
                    checked={showSubtextFlag}
                    onChange={(e) => setShowSubtextFlag(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span>서브텍스트 포함</span>
                </label>
              )}

              {catalog?.customRatio && (
                <Field label="비율 직접 지정 (예: 16:9, 1:2.5)">
                  <input
                    value={customRatio}
                    onChange={(e) => setCustomRatio(e.target.value)}
                    placeholder={`기본 ${item.ratio}`}
                    className="w-full rounded bg-gray-950 px-2 py-1.5 font-mono text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
                  />
                </Field>
              )}

              {catalog?.customTextUI && (
                <Field label="커스텀 텍스트 (이미지에 추가 노출)">
                  <textarea
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    rows={2}
                    placeholder="(비우면 사용 안 함)"
                    className="w-full resize-y rounded bg-gray-950 px-2 py-1.5 text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
                  />
                </Field>
              )}

              {catalog?.directionSelector && (
                <Field label="방향 표시">
                  <select
                    value={direction}
                    onChange={(e) =>
                      setDirection(e.target.value as ArrowDirection | "")
                    }
                    className="w-full rounded bg-gray-950 px-2 py-1.5 text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
                  >
                    <option value="">(없음)</option>
                    {DIRECTION_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {catalog?.multilineTextUI?.map((key) => (
                <Field
                  key={key}
                  label={MULTILINE_FIELD_LABELS[key] ?? key}
                >
                  <textarea
                    value={multilineFields[key] ?? ""}
                    onChange={(e) => updateMultiline(key, e.target.value)}
                    rows={key === "overview" ? 3 : 5}
                    placeholder={
                      key === "timeline"
                        ? "09:00 등록 및 명찰 수령\n09:30 개회사\n10:00 키노트 — 홍길동 (가나회사)"
                        : key === "speakers"
                          ? "홍길동 — 가나회사 CTO\n김철수 — 다라연구소 책임연구원"
                          : "행사 개요를 자유롭게 작성"
                    }
                    className="w-full resize-y rounded bg-gray-950 px-2 py-1.5 font-mono text-[11px] text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
                  />
                </Field>
              ))}

              {(catalog?.physicalSizeMm || catalog?.customSize) && (
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label={`가로 (mm)${
                      catalog?.physicalSizeMm
                        ? ` · 표준 ${catalog.physicalSizeMm.widthMm}`
                        : ""
                    }`}
                  >
                    <input
                      value={sizeWidthMm}
                      onChange={(e) =>
                        setSizeWidthMm(e.target.value.replace(/[^0-9.]/g, ""))
                      }
                      placeholder="mm"
                      className="w-full rounded bg-gray-950 px-2 py-1.5 font-mono text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
                    />
                  </Field>
                  <Field
                    label={`세로 (mm)${
                      catalog?.physicalSizeMm
                        ? ` · 표준 ${catalog.physicalSizeMm.heightMm}`
                        : ""
                    }`}
                  >
                    <input
                      value={sizeHeightMm}
                      onChange={(e) =>
                        setSizeHeightMm(e.target.value.replace(/[^0-9.]/g, ""))
                      }
                      placeholder="mm"
                      className="w-full rounded bg-gray-950 px-2 py-1.5 font-mono text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
                    />
                  </Field>
                  {sizeOverridden && (
                    <span className="col-span-2 text-[10px] text-amber-400">
                      표준 규격을 덮어쓰는 값입니다 — 인쇄 케이스 호환 확인 필요
                    </span>
                  )}
                </div>
              )}

              {(catalog?.safeZoneRequired || catalog?.safeZone?.length) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500">
                      safeZone (오버레이가 얹힐 빈 영역, % of canvas)
                    </span>
                    <button
                      type="button"
                      onClick={addSafeZone}
                      className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-300 hover:border-indigo-500 hover:text-indigo-300"
                    >
                      + 영역 추가
                    </button>
                  </div>
                  {safeZones.length === 0 && (
                    <div className="rounded border border-dashed border-gray-800 px-2 py-3 text-center text-[10px] text-gray-600">
                      영역 없음 — &quot;+ 영역 추가&quot; 클릭
                    </div>
                  )}
                  {safeZones.map((z, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-end gap-2 rounded border border-gray-800 bg-gray-900/40 p-2"
                    >
                      <SafeZoneField
                        label="x %"
                        value={z.x}
                        onChange={(v) => updateSafeZone(i, "x", v)}
                      />
                      <SafeZoneField
                        label="y %"
                        value={z.y}
                        onChange={(v) => updateSafeZone(i, "y", v)}
                      />
                      <SafeZoneField
                        label="W %"
                        value={z.width}
                        onChange={(v) => updateSafeZone(i, "width", v)}
                      />
                      <SafeZoneField
                        label="H %"
                        value={z.height}
                        onChange={(v) => updateSafeZone(i, "height", v)}
                      />
                      <button
                        type="button"
                        onClick={() => removeSafeZone(i)}
                        className="rounded px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-500/10"
                        aria-label="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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

function SafeZoneField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="w-full rounded bg-gray-950 px-1.5 py-1 font-mono text-[11px] text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
      />
    </label>
  );
}

function fractionToPercentInput(frac: number): string {
  if (!Number.isFinite(frac)) return "";
  const pct = frac * 100;
  // Trim trailing zeros for clean display (0.125 → "12.5", 0.5 → "50").
  return Number(pct.toFixed(2)).toString();
}

function percentInputToFraction(input: string): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return Number.NaN;
  // Clamp to [0, 100] then convert to fraction.
  return Math.max(0, Math.min(100, n)) / 100;
}
