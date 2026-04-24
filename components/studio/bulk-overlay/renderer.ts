// Phase F — Canvas-based name overlay. The catalog supplies a safeZone
// rectangle as fractions (0~1) of the source image; we multiply by the loaded
// image's natural width/height and draw each CSV field as a stacked, centered
// text line within that rectangle. Font sizing scales to the safeZone height
// so output matches across badge formats and resolution buckets.

import { toAsciiSafeName } from "../safe-filename";
import type { SafeZoneBox } from "../types";

export interface OverlayField {
  /** Schema key — used to look up the value on each row. */
  key: string;
  /** Relative font weight per line. Larger = bigger. The renderer normalizes. */
  weight?: number;
}

export interface RenderJobInput {
  templateUrl: string;
  safeZone: SafeZoneBox;
  fields: OverlayField[];
  rows: Array<Record<string, string>>;
  /** Filename pattern. {row}, {name}, {n} tokens supported. */
  filenamePattern?: string;
  /**
   * Index offset added to {n}/{row} tokens. Required when the caller chunks
   * rows across multiple `renderOverlayBatch` calls — without it every chunk
   * starts at 1 and you get duplicate filenames in the ZIP.
   */
  startIndex?: number;
}

export interface RenderedRow {
  filename: string;
  dataUrl: string;
}

const KOREAN_FONT_STACK =
  "'Pretendard', 'Pretendard Variable', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("템플릿 이미지 로드 실패"));
    img.src = url;
  });
}

function fillFilename(pattern: string, idx: number, row: Record<string, string>) {
  return pattern
    .replace(/\{n\}/g, String(idx + 1).padStart(3, "0"))
    .replace(/\{row\}/g, String(idx + 1))
    .replace(/\{(\w+)\}/g, (_, key) => toAsciiSafeName(row[key] ?? "", `r${idx + 1}`));
}

export async function renderOverlayBatch(
  input: RenderJobInput,
): Promise<RenderedRow[]> {
  const { templateUrl, safeZone, fields, rows } = input;
  const pattern = input.filenamePattern ?? "{n}-{name}.png";
  const startIndex = input.startIndex ?? 0;
  const img = await loadImage(templateUrl);

  // Each row is rendered onto its own canvas using a single shared template
  // image. We can't share the canvas because data URLs are extracted between
  // each row.
  const totalWeight =
    fields.reduce((acc, f) => acc + (f.weight ?? 1), 0) || fields.length || 1;
  const out: RenderedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context 생성 실패");
    ctx.drawImage(img, 0, 0);

    // Layout each field as an evenly weighted band inside the safeZone.
    // safeZone fields are 0~1 fractions; multiply by natural pixel dims.
    const baseTop = safeZone.y * img.naturalHeight;
    const baseLeft = safeZone.x * img.naturalWidth;
    const totalH = safeZone.height * img.naturalHeight;
    const totalW = safeZone.width * img.naturalWidth;

    let cursorY = baseTop;
    for (const f of fields) {
      const value = row[f.key]?.trim();
      const bandH = (totalH * (f.weight ?? 1)) / totalWeight;
      if (!value) {
        cursorY += bandH;
        continue;
      }
      // Font size: take 60% of the band height as a starting target, then
      // shrink-to-fit if the rendered width exceeds the safeZone width.
      let fontPx = Math.max(12, Math.floor(bandH * 0.6));
      ctx.font = `600 ${fontPx}px ${KOREAN_FONT_STACK}`;
      while (ctx.measureText(value).width > totalW * 0.95 && fontPx > 12) {
        fontPx -= 2;
        ctx.font = `600 ${fontPx}px ${KOREAN_FONT_STACK}`;
      }
      ctx.fillStyle = "#0b0b0b";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        value,
        baseLeft + totalW / 2,
        cursorY + bandH / 2,
        totalW * 0.95,
      );
      cursorY += bandH;
    }

    const dataUrl = canvas.toDataURL("image/png");
    out.push({ filename: fillFilename(pattern, startIndex + i, row), dataUrl });
  }

  return out;
}
