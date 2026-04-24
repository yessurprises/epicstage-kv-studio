import { IMAGE_URL, isLocal } from "../../config";
import type {
  CatalogItem,
  EditRegion,
  Guideline,
  ImageData,
  ImageProviderId,
  ProductionUserInput,
} from "../../types";
import { extractDesignSystemForProduction } from "../design-system";
import { buildEditInstructionsBlock } from "../edit-instructions";
import {
  extractFirstImage,
  splitDataUrl,
  toInlineDataParts,
  type GeminiResponse,
} from "../gemini-utils";
import { PRINT_SPEC_INSTRUCTION, PRODUCTION_SYSTEM } from "../prompts";
import type { ImageSize } from "../providers";
import { generateProductionImageOpenAI } from "./production-image-openai";

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
  /**
   * Catalog entry that produced this item. Currently consumed only by the
   * OpenAI branch — its flag set drives prompt shape (display distance, safe
   * zones, repeat pattern, logo allowance, etc.). Gemini path ignores it.
   */
  catalog?: CatalogItem;
  /** UI-supplied per-generation input (custom text, safe zone, direction, …). */
  userInput?: ProductionUserInput;
}

export interface ProductionOptions {
  provider?: ImageProviderId;
  /**
   * How to interpret `masterKvUrl` when present:
   * - `"kv"` (default) — treat the attached image as the master KV. The model
   *   pulls palette/motifs/typography mood and recomposes for a new artifact.
   * - `"previous-slide"` — used by cardnews chaining. The attached image is
   *   the previous slide in the same series; the model must preserve the same
   *   layout/grid/color and only swap text/details to the new slide content.
   *   Forbids the "recompose for new aspect" KV instruction.
   */
  referenceMode?: "kv" | "previous-slide";
  /**
   * Text-only CI brief (from `analyzeCi`). OpenAI branch merges this into
   * the prompt instead of attaching the CI image — prevents `/images/edits`
   * from reproducing the logo in variants. Gemini branch ignores this.
   */
  ciBrief?: string;
  /**
   * CI reference image. Attached to the OpenAI call only when the catalog
   * item is `logoCentric` (e.g. company 휘장). Other items deliberately do NOT
   * receive a logo image — see the rationale in `production-image-openai.ts`.
   */
  ciReferenceImage?: ImageData;
  /**
   * Phase C — when set, the call is a 2nd-pass edit. The source image is
   * attached as the primary reference and an EDIT INSTRUCTIONS block listing
   * each rectangle + per-region instruction is appended to the prompt. Master
   * KV is dropped (the source image carries the layout) but design system /
   * texts are still emitted for context.
   */
  editRequest?: {
    sourceImageUrl: string;
    regions: EditRegion[];
    globalInstruction?: string;
  };
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
  const designSystem = extractDesignSystemForProduction(guideline);

  const textLines: string[] = [];
  if (prod.headline) textLines.push(`- HEADLINE: "${prod.headline}"`);
  if (prod.subtext) textLines.push(`- SUBTEXT: "${prod.subtext}"`);

  const editRequest = options?.editRequest;

  // 2nd-pass edit: the source image is the canvas; do NOT also describe the
  // master KV as an attached reference — it isn't attached in edit mode (see
  // `guideImageUrls` below) and the KV brief would mis-direct the model away
  // from preserving the source.
  const referenceMode = options?.referenceMode ?? "kv";
  let kvRef = "";
  if (!editRequest && masterKvUrl) {
    kvRef =
      referenceMode === "previous-slide"
        ? `\nPREVIOUS SLIDE REFERENCE (attached image): This is the previous slide in the SAME cardnews series. Preserve its EXACT layout grid, color palette, typography hierarchy, and compositional language. Render this as the next slide in the series — change ONLY the text content (HEADLINE/SUBTEXT) and the per-slide visual details listed below. Do NOT invent a new layout, do NOT shift the color scheme, do NOT change typography weights or background treatment.`
        : `\nMASTER KV REFERENCE (attached image): Extract ALL visual elements — color palette, graphic motifs, background style, typography mood, compositional language — and apply them faithfully to this ${prod.ratio} format. Recompose the layout for the new dimensions. Do NOT invent new design elements beyond what is in the KV.`;
  }

  const editBlock = editRequest
    ? "\n\n" +
      buildEditInstructionsBlock(editRequest.regions, editRequest.globalInstruction)
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
- Match the design system and master KV precisely${editBlock}`;

  const provider = options?.provider ?? "gemini";

  if (provider === "openai") {
    return generateProductionImageOpenAI({
      guideline,
      prod: {
        name: prod.name,
        ratio: prod.ratio,
        category: prod.category,
        headline: prod.headline,
        subtext: prod.subtext,
        layoutNote: prod.layoutNote,
        imagePrompt: prod.imagePrompt,
        renderInstruction: prod.renderInstruction,
        imageSize: (prod.imageSize as ImageSize) ?? "2K",
        catalog: prod.catalog,
        userInput: prod.userInput,
      },
      masterKvUrl,
      referenceMode,
      refAnalysis,
      ciBrief: options?.ciBrief,
      ciReferenceImage: options?.ciReferenceImage,
      editRequest,
    });
  }

  const url = IMAGE_URL();
  const generationConfig = buildGenerationConfig(prod);

  // Phase C — when an edit request is present, the source image is the
  // primary reference. Master KV is dropped because the source already
  // encodes the layout we want to preserve.
  const guideImageUrls = editRequest
    ? [editRequest.sourceImageUrl]
    : masterKvUrl
      ? [masterKvUrl]
      : [];

  if (isLocal()) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userContent,
        system: PRODUCTION_SYSTEM,
        ciImages: editRequest ? [] : (ciImages ?? []),
        guideImageUrls,
        generationConfig,
      }),
    });
    if (!resp.ok) throw new Error(`이미지 생성 실패: ${resp.status}`);
    const data = (await resp.json()) as { error?: string; imageUrl?: string };
    if (data.error) throw new Error(data.error);
    return data.imageUrl ?? "";
  }

  const parts = [
    ...(editRequest ? [] : toInlineDataParts(ciImages ?? [], 2)),
    ...(guideImageUrls
      .map((u) => splitDataUrl(u))
      .filter((s): s is NonNullable<ReturnType<typeof splitDataUrl>> => Boolean(s))
      .map((s) => ({ inlineData: { mimeType: s.mime, data: s.base64 } }))),
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
