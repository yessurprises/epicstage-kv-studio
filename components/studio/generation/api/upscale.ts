import { UPSCALE_URL } from "../../config";

export type TopazModel =
  | "Standard V2"
  | "High Fidelity V2"
  | "Low Resolution V2"
  | "CGI"
  | "Text Refine";

export interface UpscaleOptions {
  model?: TopazModel;
  faceEnhance?: boolean;
  sharpen?: number;
  denoise?: number;
  fixCompression?: number;
}

export interface UpscaleResult {
  rawUrl: string; // Topaz 원본 결과 (리사이즈 전)
  finalUrl: string; // 목표 W×H로 맞춘 결과 (기본: 비율 유지 contain 후 정확한 W×H canvas)
}

/**
 * Upscale via Topaz Gigapixel, then produce a pixel-exact W×H preview.
 *
 * Returns both the raw Topaz output (preserved so the user can re-crop later
 * without spending more credits) and a default resized version suited for
 * immediate download. Crop-to-exact is a separate flow triggered from the UI.
 */
export async function upscaleToExactSize(
  imageDataUrl: string,
  targetW: number,
  targetH: number,
  opts?: UpscaleOptions,
): Promise<UpscaleResult> {
  if (!Number.isFinite(targetW) || !Number.isFinite(targetH) || targetW < 1 || targetH < 1) {
    throw new Error("유효하지 않은 목표 크기");
  }

  const resp = await fetch(UPSCALE_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrl: imageDataUrl,
      targetHeight: Math.round(targetH),
      model: opts?.model ?? "Standard V2",
      outputFormat: "png",
      faceEnhance: opts?.faceEnhance ?? false,
      sharpen: opts?.sharpen,
      denoise: opts?.denoise,
      fixCompression: opts?.fixCompression,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`업스케일 실패 (${resp.status}): ${err.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { imageUrl?: string; error?: string };
  if (data.error || !data.imageUrl) {
    throw new Error(data.error ?? "업스케일 결과 없음");
  }

  const rawUrl = data.imageUrl;
  const finalUrl = await resizeToExact(rawUrl, targetW, targetH);
  return { rawUrl, finalUrl };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = src;
  });
}

async function resizeToExact(src: string, w: number, h: number): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context 사용 불가");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export function suggestDimensions(ratio: string, target: "1K" | "2K" | "4K" = "2K"): {
  w: number;
  h: number;
} {
  const parsed = parseRatio(ratio);
  const base = target === "4K" ? 3840 : target === "2K" ? 2048 : 1024;
  if (parsed.w >= parsed.h) {
    return { w: base, h: Math.round((base * parsed.h) / parsed.w) };
  }
  return { w: Math.round((base * parsed.w) / parsed.h), h: base };
}

function parseRatio(ratio: string): { w: number; h: number } {
  const m = ratio.match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
  if (!m) return { w: 1, h: 1 };
  return { w: Number(m[1]), h: Number(m[2]) };
}
