// ZIP download utility (uses JSZip from CDN or dynamic import)

export async function downloadAsZip(
  items: Array<{ name: string; data: string | Blob }>,
  filename: string
) {
  // Dynamic import JSZip
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const item of items) {
    if (typeof item.data === "string") {
      // base64 data URL
      const base64 = item.data.split(",")[1] || item.data;
      zip.file(item.name, base64, { base64: true });
    } else {
      zip.file(item.name, item.data);
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── 대지(no-text) PNG 다운로드 — 벡터화 전 중간 단계 ────────────────────────

/**
 * generateNoTextVersion()으로 텍스트 제거 후 PNG로 바로 다운로드.
 * 배경 제거나 벡터화 없음.
 */
export async function downloadNoTextPng(
  imageDataUrl: string,
  filename: string = "kv-notext.png"
) {
  const { generateNoTextVersion } = await import("./guideline-generator");
  const noTextUrl = await generateNoTextVersion(imageDataUrl);
  const blob = await (await fetch(noTextUrl)).blob();
  triggerDownload(blob, filename);
}

// ─── 투명 PNG (대지→배경 제거) 다운로드 ──────────────────────────────────────

/**
 * 1. generateNoTextVersion()으로 텍스트 제거 (대지 버전)
 * 2. @imgly/background-removal로 배경 제거
 * 3. 투명 PNG 다운로드
 *
 * onProgress: "notext" | "rembg" — 현재 단계 콜백
 */
export async function downloadTransparentPng(
  imageDataUrl: string,
  filename: string = "kv-transparent.png",
  onProgress?: (stage: "notext" | "rembg") => void
) {
  // Step 1: 대지(no-text) 버전 생성
  onProgress?.("notext");
  const { generateNoTextVersion } = await import("./guideline-generator");
  const noTextUrl = await generateNoTextVersion(imageDataUrl);

  // Step 2: 배경 제거 (Web Worker)
  onProgress?.("rembg");
  const { removeBackgroundOffMain } = await import("./rembg");
  const res = await fetch(noTextUrl);
  const inputBlob = await res.blob();
  const resultBlob = await removeBackgroundOffMain(inputBlob);

  // Step 3: 다운로드
  triggerDownload(resultBlob, filename);
}

// ─── SVG 벡터 변환 다운로드 ────────────────────────────────────────────────

import { vectorizeImage, type VectorizeProvider } from "./vectorize-service";

/**
 * 원본 이미지 → SVG 벡터화 다운로드
 */
export async function downloadAsSvg(
  imageDataUrl: string,
  filename: string = "kv-vector.svg",
  provider: VectorizeProvider = "vectorizer"
) {
  const svgString = await vectorizeImage(imageDataUrl, provider);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  triggerDownload(blob, filename);
}

/**
 * 대지화(텍스트 제거) → SVG 벡터화 다운로드
 */
export async function downloadNoTextSvg(
  imageDataUrl: string,
  filename: string = "kv-notext-vector.svg",
  provider: VectorizeProvider = "vectorizer",
  onProgress?: (stage: "notext" | "vectorize") => void
) {
  onProgress?.("notext");
  const { generateNoTextVersion } = await import("./guideline-generator");
  const noTextUrl = await generateNoTextVersion(imageDataUrl);

  onProgress?.("vectorize");
  const svgString = await vectorizeImage(noTextUrl, provider);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  triggerDownload(blob, filename);
}

/**
 * 대지화 → 배경 제거 → 투명 PNG → SVG 벡터화 다운로드
 */
export async function downloadTransparentSvg(
  imageDataUrl: string,
  filename: string = "kv-transparent-vector.svg",
  provider: VectorizeProvider = "vectorizer",
  onProgress?: (stage: "notext" | "rembg" | "vectorize") => void
) {
  // Step 1: 대지
  onProgress?.("notext");
  const { generateNoTextVersion } = await import("./guideline-generator");
  const noTextUrl = await generateNoTextVersion(imageDataUrl);

  // Step 2: 배경 제거 (Web Worker)
  onProgress?.("rembg");
  const { removeBackgroundOffMain } = await import("./rembg");
  const inputBlob = await (await fetch(noTextUrl)).blob();
  const transparentBlob = await removeBackgroundOffMain(inputBlob);

  // Step 3: 투명 PNG → data URL → SVG
  onProgress?.("vectorize");
  const transparentDataUrl = await blobToDataUrl(transparentBlob);
  const svgString = await vectorizeImage(transparentDataUrl, provider);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  triggerDownload(blob, filename);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Simple PDF generation (guideline summary + guide images)
export function generateGuidelinePdf(
  guideline: any,
  eventName: string,
  guideImages?: Record<string, string>
) {
  const w = window.open("", "_blank");
  if (!w) return;

  // ─── 컬러 팔레트 ───
  const colors = Object.entries(guideline.color_palette || {})
    .map(([k, v]: [string, any]) => `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><div style="width:24px;height:24px;border-radius:4px;background:${v.hex}"></div><span style="font-family:monospace;font-size:12px">${k}: ${v.hex}</span><span style="color:#888;font-size:11px">${v.usage}</span></div>`)
    .join("");

  // ─── 무드 ───
  const mood = (guideline.mood?.keywords || []).map((k: string) => `<span style="display:inline-block;padding:2px 10px;border-radius:100px;background:#f0f0f0;font-size:11px;margin:2px">${k}</span>`).join("");

  // ─── 그래픽 모티프 (UI와 동일한 텍스트 형태) ───
  const gm = guideline.graphic_motifs;
  const motifHtml = gm ? [
    gm.style ? `<div>스타일: ${gm.style}</div>` : "",
    gm.texture ? `<div>텍스처: ${gm.texture}</div>` : "",
    gm.icon_style ? `<div>아이콘: ${gm.icon_style}</div>` : "",
    gm.elements?.length ? `<div style="margin-top:4px">${gm.elements.map((el: string) => `<span style="display:inline-block;padding:1px 8px;border-radius:4px;background:#f0f0f0;font-size:11px;margin:2px">${el}</span>`).join("")}</div>` : "",
  ].filter(Boolean).join("") : "";

  // ─── 레이아웃 가이드 (UI와 동일한 key-value 형태) ───
  const layoutHtml = guideline.layout_guide
    ? Object.entries(guideline.layout_guide)
        .filter(([, v]) => v)
        .map(([k, v]) => `<div style="display:flex;gap:8px;margin:2px 0"><span style="font-family:monospace;font-size:10px;color:#999;text-transform:uppercase;flex-shrink:0">${k}</span><span>${v}</span></div>`)
        .join("")
    : "";

  // 가이드 이미지 섹션 HTML
  function guideImg(sectionId: string): string {
    const url = guideImages?.[sectionId];
    if (!url) return "";
    return `<div style="margin-top:12px"><img src="${url}" style="max-width:100%;border-radius:8px;border:1px solid #eee" /></div>`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${eventName} — 디자인 가이드라인</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#222}
h1{font-size:24px;margin-bottom:4px}
h2{font-size:16px;color:#666;margin-top:32px;border-bottom:1px solid #eee;padding-bottom:8px}
.meta{color:#888;font-size:13px;margin-bottom:24px}
.section-text{font-size:13px;color:#444;line-height:1.6}
img{page-break-inside:avoid}
@media print{body{margin:20px auto}img{max-height:400px;object-fit:contain}}
</style></head>
<body>
<h1>${guideline.event_summary?.name || eventName}</h1>
<div class="meta">${[guideline.event_summary?.date, guideline.event_summary?.venue, guideline.event_summary?.organizer].filter(Boolean).join(" · ")}</div>
${guideline.event_summary?.slogan ? `<p style="font-style:italic;color:#555">"${guideline.event_summary.slogan}"</p>` : ""}

<h2>컬러 팔레트</h2>${colors}${guideImg("color_palette_sheet")}

<h2>무드</h2><div>${mood}</div>${guideline.mood?.tone ? `<div style="margin-top:8px;color:#666;font-size:13px">톤: ${guideline.mood.tone}</div>` : ""}${guideImg("mood_board")}

<h2>그래픽 모티프</h2><div class="section-text">${motifHtml}</div>${guideImg("motif_board")}

${guideline.layout_guide ? `<h2>레이아웃 가이드</h2><div class="section-text">${layoutHtml}</div>${guideImg("layout_sketches")}` : ""}

</body></html>`;

  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}
