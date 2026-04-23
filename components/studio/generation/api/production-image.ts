import { IMAGE_URL, isLocal } from "../../config";
import type { Guideline, ImageData, ImageProviderId } from "../../types";
import { extractDesignSystemForProduction } from "../design-system";
import {
  extractFirstImage,
  splitDataUrl,
  toInlineDataParts,
  type GeminiResponse,
} from "../gemini-utils";
import {
  PRINT_SPEC_INSTRUCTION,
  PRODUCTION_SYSTEM,
  buildOpenAiPrompt,
} from "../prompts";
import { getProvider, type ImageSize } from "../providers";

export interface ProductionInput {
  name: string;
  ratio: string;
  category: string;
  headline?: string;
  subtext?: string | null;
  layoutNote?: string;
  imagePrompt?: string;
  renderInstruction?: string;
  imageSize?: "512" | "1K" | "2K" | "4K";
  temperature?: number;
  seed?: number;
  overridden?: boolean;
}

export interface ProductionOptions {
  provider?: ImageProviderId;
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
 * first visual reference so the model inherits palette/motifs/composition.
 *
 * `options.provider` routes the call to either the existing Gemini pipeline
 * (Nano Banana 2) or the OpenAI adapter (GPT Image 2). Both paths receive
 * the identical prompt body — only the transport and payload differ.
 */
export async function generateProductionImage(
  guideline: Guideline,
  prod: ProductionInput,
  ciImages?: ImageData[],
  masterKvUrl?: string,
  refAnalysis?: string,
  options?: ProductionOptions,
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
- NO LOGOS, brand marks, emblems, wordmarks, or monograms of any kind. Logos are applied manually in post-production — the artwork must be completely logo-free. CI reference images are for palette and visual style only; do not reproduce the logo itself.
- Professional print/digital quality
- No placeholder text
- Match the design system and master KV precisely`;

  const provider = options?.provider ?? "gemini";

  if (provider === "openai") {
    const openai = getProvider("openai");
    if (!openai) throw new Error("OpenAI provider not available");
    const refs: ImageData[] = [];
    const refRoles: string[] = [];
    if (masterKvUrl) {
      const split = splitDataUrl(masterKvUrl);
      if (split) {
        refs.push({ mime: split.mime, base64: split.base64 });
        refRoles.push(
          "Master KV — preserve palette, graphic motifs, typography mood; recompose for this aspect ratio",
        );
      }
    }
    const ciSlice = (ciImages ?? []).slice(0, 2);
    refs.push(...ciSlice);
    ciSlice.forEach(() =>
      refRoles.push(
        "Brand CI — reference ONLY for color palette and visual style. DO NOT draw, trace, or recreate the logo in the output. Artwork must be logo-free.",
      ),
    );
    const texts: Array<{ label: string; value: string; hint?: string }> = [];
    if (prod.headline) texts.push({ label: "HEADLINE", value: prod.headline });
    if (prod.subtext) texts.push({ label: "SUBTEXT", value: prod.subtext });
    const detailBlocks = [
      designSystem,
      prod.imagePrompt ? `Visual direction: ${prod.imagePrompt}` : "",
      prod.layoutNote ? `Layout: ${prod.layoutNote}` : "",
      refAnalysis ? `Reference direction: ${refAnalysis}` : "",
    ].filter(Boolean);
    const extraConstraints = [PRINT_SPEC_INSTRUCTION];
    if (prod.renderInstruction) extraConstraints.push(prod.renderInstruction);
    const prompt = buildOpenAiPrompt({
      scene: masterKvUrl
        ? "Professional event graphic derived from the attached master KV — inherit its atmosphere, palette, and motif language."
        : "Professional event graphic with coherent atmosphere drawn from the design system.",
      subject: `${prod.name} — production-ready flat graphic artwork.`,
      details: detailBlocks.join("\n\n"),
      useCase: `${prod.name}, aspect ratio ${prod.ratio}. Production-ready print/digital output.`,
      texts,
      refRoles,
      extraConstraints,
    });
    return openai.generate({
      prompt,
      system: PRODUCTION_SYSTEM,
      ratio: prod.ratio,
      size: (prod.imageSize as ImageSize) ?? "2K",
      refs,
    });
  }

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
