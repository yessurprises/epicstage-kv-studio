"use client";

// Phase H — EDM 초청장 모달. 운영자가 CTA 라벨/URL/제목/일시/장소를 입력하면
// 즉시 좌(라이트)/우(다크) 미리보기를 srcDoc iframe에 렌더링한다. 다운로드는
// 단일 .html (이미지가 dataURL로 인라인되어 첨부 없이 동작).

import { useEffect, useMemo, useState } from "react";
import { buildEdmHtml, type EdmFields } from "./edm-html";
import { toAsciiSafeName } from "../safe-filename";
import type { CatalogItem, Production, SafeZoneBox } from "../types";

interface Props {
  open: boolean;
  prod: Production;
  catalog: CatalogItem;
  effectiveSafeZone?: SafeZoneBox;
  onClose: () => void;
}

export default function EdmModal({
  open,
  prod,
  catalog,
  effectiveSafeZone,
  onClose,
}: Props) {
  const [fields, setFields] = useState<EdmFields>({
    title: prod.headline ?? prod.name,
    date: "",
    venue: "",
    ctaLabel: "지금 등록하기",
    ctaUrl: "https://",
    preheader: "",
  });
  const [greeting, setGreeting] = useState("{{name}}님께");
  const [error, setError] = useState<string | null>(null);

  const safeZone = effectiveSafeZone ?? catalog.safeZone?.[0] ?? null;

  useEffect(() => {
    if (!open) return;
    setFields((f) => ({ ...f, title: prod.headline ?? prod.name }));
    setError(null);
  }, [open, prod.headline, prod.name]);

  const html = useMemo(() => {
    if (!prod.imageUrl || !safeZone) return null;
    return buildEdmHtml({
      imageDataUrl: prod.imageUrl,
      ctaSafeZone: safeZone,
      fields,
      greeting: greeting.trim() || undefined,
    });
  }, [prod.imageUrl, safeZone, fields, greeting]);

  function patch(patch: Partial<EdmFields>) {
    setFields((f) => ({ ...f, ...patch }));
  }

  function handleDownload() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${toAsciiSafeName(prod.name, "edm")}-EDM.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleCopy() {
    if (!html) return;
    try {
      await navigator.clipboard.writeText(html);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-xl border border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">EDM 초청장 — {prod.name}</div>
            <div className="text-[11px] text-gray-500">
              하이브리드 이메일: 배경은 생성 이미지, CTA·정보는 HTML. 다크모드 자동 대응.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-200"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-3 overflow-auto p-4 md:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            {!safeZone && (
              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                CTA 영역(safeZone)이 정의되지 않았습니다. plan 편집기에서 영역을 먼저
                지정해 주세요.
              </div>
            )}
            <Field label="제목" value={fields.title} onChange={(v) => patch({ title: v })} />
            <Field label="일시" value={fields.date} onChange={(v) => patch({ date: v })}
              placeholder="2026.05.10 (토) 14:00" />
            <Field label="장소" value={fields.venue} onChange={(v) => patch({ venue: v })}
              placeholder="서울 코엑스 그랜드볼룸" />
            <Field label="CTA 라벨" value={fields.ctaLabel} onChange={(v) => patch({ ctaLabel: v })} />
            <Field label="CTA URL" value={fields.ctaUrl} onChange={(v) => patch({ ctaUrl: v })} />
            <Field
              label="프리헤더 (선택)"
              value={fields.preheader ?? ""}
              onChange={(v) => patch({ preheader: v })}
              placeholder="받은편지함 미리보기에 노출됩니다"
            />
            <Field
              label="개인화 머리말 (선택)"
              value={greeting}
              onChange={setGreeting}
              placeholder="{{name}}님께 — Phase F 머지 인프라와 호환"
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!html}
                className="flex-1 rounded bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                .html 다운로드
              </button>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!html}
                className="rounded bg-gray-800 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                title="HTML 소스를 클립보드에 복사"
              >
                복사
              </button>
            </div>
            {error && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">
                {error}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <PreviewPane label="라이트 모드" html={html} colorScheme="light" />
            <PreviewPane label="다크 모드" html={html} colorScheme="dark" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded bg-gray-950 px-2 py-1.5 text-[12px] text-gray-200 outline-none ring-1 ring-gray-800 focus:ring-indigo-500"
      />
    </label>
  );
}

/**
 * Preview pane — renders the HTML inside a sandboxed iframe with srcDoc plus
 * a wrapper that forces the OS-level color scheme via the iframe's
 * `style="color-scheme"` so `prefers-color-scheme` media queries inside the
 * EDM HTML actually fire on demand.
 */
function PreviewPane({
  label,
  html,
  colorScheme,
}: {
  label: string;
  html: string | null;
  colorScheme: "light" | "dark";
}) {
  // We can't toggle prefers-color-scheme per iframe directly. Instead, wrap
  // the EDM HTML with a wrapper that sets data attributes the EDM CSS can
  // also key off. Simplest reliable approach: inject a small style override
  // that mimics the dark-mode block when colorScheme=dark.
  const wrappedHtml = useMemo(() => {
    if (!html) return null;
    if (colorScheme === "light") return html;
    return html.replace(
      "</head>",
      `<style>
        body, .container { background: #0b0b0e !important; color: #e8e8ea !important; }
        .info p { color: #c8c8cc !important; }
        .info h2 { color: #ffffff !important; }
        .cta-btn { background: #ffffff !important; color: #111 !important; }
        .footer { color: #6a6a72 !important; }
      </style></head>`,
    );
  }, [html, colorScheme]);

  return (
    <div className="flex flex-col rounded-lg border border-gray-800 bg-gray-900/50">
      <div className="border-b border-gray-800 px-3 py-1.5 text-[11px] text-gray-400">
        {label}
      </div>
      <div className="flex-1 overflow-hidden bg-gray-950">
        {wrappedHtml ? (
          <iframe
            title={`EDM ${label}`}
            srcDoc={wrappedHtml}
            sandbox=""
            className="h-[640px] w-full"
            style={{ colorScheme }}
          />
        ) : (
          <div className="flex h-[640px] items-center justify-center text-[11px] text-gray-600">
            이미지 또는 safeZone 준비 대기…
          </div>
        )}
      </div>
    </div>
  );
}
