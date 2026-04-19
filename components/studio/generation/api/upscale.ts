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

/**
 * Upscale via Topaz Gigapixel, then resize to exact W×H in the browser.
 *
 * Topaz accepts `output_height` natively but does not accept exact width +
 * height together — width is always derived from the aspect ratio. We pass
 * `targetHeight` as a hint so Topaz upscales close to the target, then
 * canvas-resize to the exact W×H (covers aspect-ratio drift and gives us
 * pixel-exact output regardless of the source).
 */
export async function upscaleToExactSize(
  imageDataUrl: string,
  targetW: number,
  targetH: number,
  opts?: UpscaleOptions,
): Promise<string> {
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

  return resizeToExact(data.imageUrl, targetW, targetH);
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
