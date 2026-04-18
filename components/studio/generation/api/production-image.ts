import { IMAGE_URL, isLocal } from "../../config";
import type { Guideline, ImageData } from "../../types";
import { extractDesignSystemForProduction } from "../design-system";
import {
  extractFirstImage,
  splitDataUrl,
  toInlineDataParts,
  type GeminiResponse,
} from "../gemini-utils";
import { PRINT_SPEC_INSTRUCTION, PRODUCTION_SYSTEM } from "../prompts";

export interface ProductionInput {
  name: string;
  ratio: string;
  category: string;
  headline?: string;
  subtext?: string | null;
  layoutNote?: string;
  imagePrompt?: string;
  renderInstruction?: string;
  imageSize?: "1K" | "2K";
  temperature?: number;
  seed?: number;
  overridden?: boolean;
}

const GEMINI_SUPPORTED_RATIOS = new Set([
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
]);

function buildGenerationConfig(prod: ProductionInput): Record<string, unknown> {
  const cfg: Record<string, unknown> = {
    responseModalities: ["TEXT", "IMAGE"],
    temperature: prod.temperature ?? 1,
  };
  if (prod.seed !== undefined) cfg.seed = prod.seed;
  const wantsImageConfig =
    prod.imageSize !== undefined ||
    (prod.overridden === true && GEMINI_SUPPORTED_RATIOS.has(prod.ratio));
  if (wantsImageConfig) {
    const imageConfig: Record<string, unknown> = {};
    if (GEMINI_SUPPORTED_RATIOS.has(prod.ratio)) imageConfig.aspectRatio = prod.ratio;
    if (prod.imageSize) imageConfig.imageSize = prod.imageSize;
    cfg.imageConfig = imageConfig;
  }
  return cfg;
}

/**
 * Generate a production variant image, optionally using the master KV as the
 * first visual reference so Gemini inherits palette/motifs/composition.
 */
export async function generateProductionImage(
  guideline: Guideline,
  prod: ProductionInput,
  ciImages?: ImageData[],
  masterKvUrl?: string,
  refAnalysis?: string,
): Promise<string> {
  const designSystem = extractDesignSystemForProduction(guideline, prod.name);

  const textLines: string[] = [];
  if (prod.headline) textLines.push(`- HEADLINE: "${prod.headline}"`);
  if (prod.subtext) textLines.push(`- SUBTEXT: "${prod.subtext}"`);

  const kvRef = masterKvUrl
    ? `\nMASTER KV REFERENCE (attached image): Extract ALL visual elements — color palette, graphic motifs, background style, typography mood, compositional language — and apply them faithfully to this ${prod.ratio} format. Recompose the layout for the new dimensions. Do NOT invent new design elements beyond what is in the KV.`
    : "";

  const userContent = `Professional event graphic design. Production-ready.
Aspect ratio: ${prod.ratio}.
Type: ${prod.name}
${kvRef}

${designSystem}

=== TEXTS TO RENDER ===
Render ONLY these exact strings as visible text in the image.
Do NOT add, modify, or render any other text beyond this list.
${textLines.length > 0 ? textLines.join("\n") : "(no text — visual only)"}

=== VISUAL STYLE (DO NOT RENDER AS TEXT) ===
The following describes visual mood, composition, and style only.
These words must NEVER appear as readable text in the image.
${prod.imagePrompt || ""}
${prod.layoutNote ? `Layout: ${prod.layoutNote}` : ""}
${refAnalysis ? `Reference direction: ${refAnalysis}` : ""}

RENDERING:
${PRINT_SPEC_INSTRUCTION}${prod.renderInstruction ? "\n" + prod.renderInstruction : ""}

REQUIREMENTS:
- Render ONLY the text listed in TEXTS TO RENDER — nothing else as text
- Text must be legible with proper hierarchy
- Professional print/digital quality
- No placeholder text
- Match the design system and master KV precisely`;

  const url = IMAGE_URL();
  const generationConfig = buildGenerationConfig(prod);

  if (isLocal()) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userContent,
        system: PRODUCTION_SYSTEM,
        ciImages: ciImages ?? [],
        guideImageUrls: masterKvUrl ? [masterKvUrl] : [],
        generationConfig,
      }),
    });
    if (!resp.ok) throw new Error(`이미지 생성 실패: ${resp.status}`);
    const data = (await resp.json()) as { error?: string; imageUrl?: string };
    if (data.error) throw new Error(data.error);
    return data.imageUrl ?? "";
  }

  const parts = [
    ...toInlineDataParts(ciImages ?? [], 2),
    ...(masterKvUrl
      ? (() => {
          const split = splitDataUrl(masterKvUrl);
          return split
            ? [{ inlineData: { mimeType: split.mime, data: split.base64 } }]
            : [];
        })()
      : []),
    { text: `${PRODUCTION_SYSTEM}\n\n---\n\n${userContent}` },
  ];

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts }],
      generationConfig,
    }),
  });

  if (!resp.ok) throw new Error(`이미지 생성 실패: ${resp.status}`);
  return extractFirstImage((await resp.json()) as GeminiResponse);
}
