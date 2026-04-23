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
import {
  PRINT_SPEC_INSTRUCTION,
  PRODUCTION_SYSTEM,
  buildOpenAiPrompt,
} from "../prompts";
import { getProvider, type ImageSize } from "../providers";

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
  const designSystem = extractDesignSystemForProduction(guideline, "kv");

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
 * Build the OpenAI (GPT Image 2) 5-section prompt for the master KV. Pure
 * function — exposed so the UI can preview exactly what will be sent to
 * OpenAI when the active version's provider is "openai". Ref counts are
 * passed in so the reference-role label block matches what the request
 * will actually attach.
 */
export function buildMasterKvOpenAiPrompt(
  guideline: Guideline,
  ratio: string,
  kvName: string,
  refAnalysis: string | undefined,
  guideRefCount: number,
  ciRefCount: number,
): { system: string; user: string } {
  const designSystem = extractDesignSystemForProduction(guideline, "kv");
  const texts: Array<{ label: string; value: string; hint?: string }> = [];
  if (guideline.event_summary?.name)
    texts.push({ label: "HEADLINE", value: guideline.event_summary.name });
  if (guideline.event_summary?.date)
    texts.push({ label: "DATE", value: guideline.event_summary.date });
  if (guideline.event_summary?.slogan)
    texts.push({ label: "SLOGAN", value: guideline.event_summary.slogan });
  const refRoles = [
    ...Array(guideRefCount).fill(
      "Guide sheet — palette, graphic motifs, compositional language",
    ),
    ...Array(ciRefCount).fill(
      "Brand CI — reference ONLY for color palette and visual style. DO NOT draw, trace, or recreate the logo in the output. Artwork must be logo-free.",
    ),
  ];
  const user = buildOpenAiPrompt({
    scene:
      "Professional event key visual with bold, memorable atmosphere. Full graphic-motif expression drawn from the attached guide sheets.",
    subject: `Master Key Visual (${kvName}) — hero image all production variants derive from.`,
    details: [
      designSystem,
      refAnalysis ? `Reference direction: ${refAnalysis}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    useCase: `Master Key Visual, aspect ratio ${ratio}. Highest visual impact — flat graphic artwork, print/digital ready.`,
    texts,
    refRoles,
    extraConstraints: [PRINT_SPEC_INSTRUCTION],
  });
  return { system: PRODUCTION_SYSTEM, user };
}

function guideImagesToImageData(guideImages?: Record<string, string>): ImageData[] {
  if (!guideImages) return [];
  const out: ImageData[] = [];
  for (const url of Object.values(guideImages)) {
    if (!url) continue;
    const split = splitDataUrl(url);
    if (!split) continue;
    out.push({ mime: split.mime, base64: split.base64 });
    if (out.length >= MAX_GUIDE_IMAGES) break;
  }
  return out;
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
    const openai = getProvider("openai");
    if (!openai) throw new Error("OpenAI provider not available");
    const guideRefs = guideImagesToImageData(guideImages);
    const ciRefs = (ciImages ?? []).slice(0, 3);
    const refs: ImageData[] = [...guideRefs, ...ciRefs];
    let oaSystem: string;
    let oaPrompt: string;
    if (options?.overridePrompt) {
      oaSystem = options.overridePrompt.system ?? PRODUCTION_SYSTEM;
      oaPrompt = options.overridePrompt.user;
    } else {
      ({ system: oaSystem, user: oaPrompt } = buildMasterKvOpenAiPrompt(
        guideline,
        ratio,
        kvName,
        refAnalysis,
        guideRefs.length,
        ciRefs.length,
      ));
    }
    return openai.generate({
      prompt: oaPrompt,
      system: oaSystem,
      ratio,
      size: resolution,
      refs,
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
