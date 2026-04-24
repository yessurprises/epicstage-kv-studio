import { IMAGE_URL, isLocal } from "../../config";
import type { Guideline, ImageData, ImageProviderId } from "../../types";
import { extractDesignSystemForProduction } from "../design-system";
import {
  extractFirstImage,
  splitDataUrl,
  toInlineDataParts,
  type GeminiResponse,
  type InlineDataPart,
} from "../gemini-utils";
import { PRINT_SPEC_INSTRUCTION, PRODUCTION_SYSTEM } from "../prompts";
import type { ImageSize } from "../providers";
import {
  buildMasterKvOpenAiPromptString,
  generateMasterKVOpenAI,
} from "./master-kv-openai";

const MAX_GUIDE_IMAGES = 4;

export interface MasterKvOptions {
  provider?: ImageProviderId;
  resolution?: ImageSize;
  /**
   * User-edited prompt override. When present, this exact prompt is sent to
   * the model instead of the auto-built one — applies to both Gemini and
   * OpenAI branches. References (guide images, CI) are unchanged.
   */
  overridePrompt?: { system?: string; user: string };
  /**
   * Text-only CI brief (JSON string from `analyzeCi`). OpenAI branch merges
   * this into the prompt instead of attaching the CI image, preventing the
   * logo from being reproduced by `/images/edits`. Ignored by Gemini branch
   * (Gemini still inlines the CI image parts as before).
   */
  ciBrief?: string;
}

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
 * Build the user-facing prompt for the master KV. Pure function — exposed
 * separately so the UI can preview exactly what will be sent to Gemini.
 */
export function buildMasterKvPrompt(
  guideline: Guideline,
  ratio: string,
  kvName: string,
  refAnalysis?: string,
): { system: string; user: string } {
  const designSystem = extractDesignSystemForProduction(guideline);

  const user = `Professional event key visual (master KV). Production-ready.
Aspect ratio: ${ratio}.
Type: ${kvName}

${designSystem}

=== TEXTS TO RENDER ===
- HEADLINE: "${guideline.event_summary?.name}"
${guideline.event_summary?.date ? `- DATE: "${guideline.event_summary.date}"` : ""}
${guideline.event_summary?.slogan ? `- SLOGAN: "${guideline.event_summary.slogan}"` : ""}

=== VISUAL STYLE ===
This is the MASTER Key Visual. Make it bold, memorable, and visually striking.
All graphic motifs, colors, and mood from the design system must be fully expressed.
Attached guide images (color palette, moodboard, motif board, layout sketches) define the visual direction — extract palette, graphic motifs, and compositional language from them and apply faithfully.
${refAnalysis ? `Reference direction: ${refAnalysis}` : ""}

RENDERING:
${PRINT_SPEC_INSTRUCTION}

REQUIREMENTS:
- This is the hero image — highest visual impact
- Render ONLY the text listed above
- NO LOGOS, brand marks, emblems, wordmarks, or monograms of any kind. Logos are applied manually in post-production — the artwork must be completely logo-free. CI reference images are for palette and visual style only; do not reproduce the logo itself.
- Professional print/digital quality`;

  return { system: PRODUCTION_SYSTEM, user };
}

/**
 * Build the OpenAI (GPT Image 2) prompt for the master KV. Kept as a thin
 * wrapper around `buildMasterKvOpenAiPromptString` (in `master-kv-openai.ts`)
 * so the UI preview uses the same V2 GPT Image 2 template the actual
 * generate call uses — no drift between preview and wire.
 */
export function buildMasterKvOpenAiPrompt(
  guideline: Guideline,
  ratio: string,
  kvName: string,
  refAnalysis: string | undefined,
  guideRefCount: number,
  ciBrief?: string,
): { system: string; user: string } {
  return buildMasterKvOpenAiPromptString({
    guideline,
    ratio,
    kvName,
    refAnalysis,
    guideRefCount,
    ciBrief,
  });
}

const IMAGE_SIZE_TO_GEMINI: Record<ImageSize, string> = {
  "512": "512",
  "1K": "1K",
  "2K": "2K",
  "4K": "4K",
};

/**
 * Generate the master KV — the hero image all 54 production variants derive
 * from. Returns a `data:` URL.
 *
 * `options.provider` chooses between the existing Gemini pipeline (Nano
 * Banana 2) and the OpenAI adapter (GPT Image 2). The prompt body is
 * identical across both so the same `buildMasterKvPrompt` output feeds
 * either backend.
 */
export async function generateMasterKV(
  guideline: Guideline,
  ratio: string,
  kvName: string,
  ciImages?: ImageData[],
  refAnalysis?: string,
  guideImages?: Record<string, string>,
  options?: MasterKvOptions,
): Promise<string> {
  const built = buildMasterKvPrompt(guideline, ratio, kvName, refAnalysis);
  const system = options?.overridePrompt?.system ?? built.system;
  const userContent = options?.overridePrompt?.user ?? built.user;
  const provider = options?.provider ?? "gemini";
  const resolution: ImageSize = options?.resolution ?? "2K";

  if (provider === "openai") {
    return generateMasterKVOpenAI({
      guideline,
      ratio,
      kvName,
      refAnalysis,
      guideImages,
      ciBrief: options?.ciBrief,
      resolution,
      overridePrompt: options?.overridePrompt,
    });
  }

  const url = IMAGE_URL();

  if (isLocal()) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userContent,
        system,
        ciImages: ciImages ?? [],
        guideImageUrls: guideImagesToUrls(guideImages),
      }),
    });
    if (!resp.ok) throw new Error(`KV 생성 실패: ${resp.status}`);
    const data = (await resp.json()) as { error?: string; imageUrl?: string };
    if (data.error) throw new Error(data.error);
    return data.imageUrl ?? "";
  }

  const parts = [
    ...toInlineDataParts(ciImages ?? [], 3),
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
        imageConfig: { imageSize: IMAGE_SIZE_TO_GEMINI[resolution] },
      },
    }),
  });

  if (!resp.ok) throw new Error(`KV 생성 실패: ${resp.status}`);
  return extractFirstImage((await resp.json()) as GeminiResponse, "KV 이미지 미포함 응답");
}
