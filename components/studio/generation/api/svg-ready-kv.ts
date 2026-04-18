import { IMAGE_URL, isLocal } from "../../config";
import type { Guideline } from "../../types";
import { extractDesignSystemForProduction } from "../design-system";
import {
  extractFirstImage,
  splitDataUrl,
  type GeminiResponse,
  type InlineDataPart,
} from "../gemini-utils";
import { PRINT_SPEC_INSTRUCTION, PRODUCTION_SYSTEM } from "../prompts";

const MAX_GUIDE_IMAGES = 4;
const DEFAULT_BATCH_SIZE = 2;

function guideImagesToParts(guideImages?: Record<string, string>): InlineDataPart[] {
  if (!guideImages) return [];
  const parts: InlineDataPart[] = [];
  for (const url of Object.values(guideImages)) {
    if (!url) continue;
    const split = splitDataUrl(url);
    if (!split) continue;
    parts.push({ inlineData: { mimeType: split.mime, data: split.base64 } });
    if (parts.length >= MAX_GUIDE_IMAGES) break;
  }
  return parts;
}

function guideImagesToUrls(guideImages?: Record<string, string>): string[] {
  if (!guideImages) return [];
  return Object.values(guideImages).filter(Boolean).slice(0, MAX_GUIDE_IMAGES);
}

/**
 * Build the prompt for an SVG-ready KV candidate. The output is intended to be
 * fed into a vectorizer (Arrow / Recraft trace), so the prompt aggressively
 * constrains Gemini to flat, traceable imagery with no text.
 */
export function buildSvgReadyKvPrompt(
  guideline: Guideline,
  ratio: string,
  kvName: string,
  refAnalysis?: string,
): { system: string; user: string } {
  const designSystem = extractDesignSystemForProduction(guideline, "kv");

  const user = `Professional event key visual — FLAT VECTOR, SVG-ready.
Aspect ratio: ${ratio}. Type: ${kvName}.

${designSystem}

=== NO TEXT (CRITICAL) ===
ZERO text, letters, numerals, or glyphs anywhere in the image.
Do NOT render the event name, date, slogan, or any typography.
Leave clean, uncluttered areas where external text can be overlaid later.

=== STYLE — FLAT VECTOR (MANDATORY) ===
Editorial flat illustration. Every region is a solid color fill.
No photography, no 3D render, no painterly textures.

=== VECTORIZATION CONSTRAINTS (HARD) ===
- Solid color fills only — no gradient, no tonal shading within a shape, no color mixing
- Crisp high-contrast edges — no feathering, no soft shadows, no glow
- Forbidden effects: gradient, blur, noise, grain, bokeh, depth-of-field, atmospheric haze, drop-shadow-with-blur
- Shapes: geometric primitives or bold silhouettes — avoid detail smaller than ~3% of canvas
- Background: single solid color, full-bleed, no vignette

=== REFERENCES ===
Guide sheets attached (color palette, moodboard, motif board, layout sketches).
Extract palette and motif language, REBUILD in flat vector style.
${refAnalysis ? `Reference direction: ${refAnalysis}` : ""}

RENDERING:
${PRINT_SPEC_INSTRUCTION}

REQUIREMENTS:
- Hero-level composition, fully traceable to clean SVG paths
- Absolutely no text anywhere
- Reserve visual breathing room for external typography overlay`;

  return { system: PRODUCTION_SYSTEM, user };
}

/**
 * Generate a single SVG-ready KV candidate via Gemini. Unlike `generateMasterKV`,
 * this path deliberately omits CI images — CI logos are raster-noisy and tend to
 * push Gemini back toward photographic style. Guide images still go through.
 */
export async function generateSvgReadyKV(
  guideline: Guideline,
  ratio: string,
  kvName: string,
  guideImages?: Record<string, string>,
  refAnalysis?: string,
): Promise<string> {
  const { system, user: userContent } = buildSvgReadyKvPrompt(guideline, ratio, kvName, refAnalysis);

  const url = IMAGE_URL();

  if (isLocal()) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userContent,
        system,
        ciImages: [],
        guideImageUrls: guideImagesToUrls(guideImages),
      }),
    });
    if (!resp.ok) throw new Error(`SVG용 KV 생성 실패: ${resp.status}`);
    const data = (await resp.json()) as { error?: string; imageUrl?: string };
    if (data.error) throw new Error(data.error);
    return data.imageUrl ?? "";
  }

  const parts = [
    ...guideImagesToParts(guideImages),
    { text: `${system}\n\n---\n\n${userContent}` },
  ];

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        temperature: 1,
        imageConfig: { imageSize: "2K" },
      },
    }),
  });

  if (!resp.ok) throw new Error(`SVG용 KV 생성 실패: ${resp.status}`);
  return extractFirstImage((await resp.json()) as GeminiResponse, "SVG용 KV 이미지 미포함 응답");
}

/**
 * Generate `count` candidates in parallel. Each call is independent — failures
 * for one do not cancel the others. Returns the array of successfully generated
 * data URLs in completion order (failures throw aggregate error).
 */
export async function generateSvgReadyKvBatch(
  guideline: Guideline,
  ratio: string,
  kvName: string,
  guideImages?: Record<string, string>,
  refAnalysis?: string,
  count: number = DEFAULT_BATCH_SIZE,
): Promise<string[]> {
  const results = await Promise.allSettled(
    Array.from({ length: count }, () =>
      generateSvgReadyKV(guideline, ratio, kvName, guideImages, refAnalysis),
    ),
  );
  const urls: string[] = [];
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") urls.push(r.value);
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
  }
  if (urls.length === 0) {
    throw new Error(`SVG용 KV 배치 전부 실패: ${errors.join("; ")}`);
  }
  return urls;
}
