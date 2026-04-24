// Step 4 (production variant) generation for the OpenAI GPT Image 2 branch.
//
// Extracted from `production-image.ts` so the OpenAI prompt can evolve without
// touching the Gemini path. The Gemini branch stays in `production-image.ts`
// and calls into here via a 1-line dispatch when `provider === "openai"`.
//
// As of the 84-item catalog spec consolidation (`docs/gpt-image-2-catalog-spec.md`),
// each `CatalogItem` carries a flag set (displayDistance, safeZoneRequired,
// repeatPattern, logoCentric, customTextUI, etc.) that drives per-item prompt
// shape. This module is the single place those flags translate into prompt
// fragments — keep flag handling here, not scattered across the UI.

import type {
  ArrowDirection,
  CatalogItem,
  EditRegion,
  Guideline,
  ImageData,
  ProductionUserInput,
  SafeZoneBox,
} from "../../types";
import { extractDesignSystemForOpenAI } from "../design-system-openai";
import { buildEditInstructionsBlock } from "../edit-instructions";
import { splitDataUrl } from "../gemini-utils";
import {
  buildProductionPromptOpenAI,
  PRODUCTION_SYSTEM_OPENAI,
  type OpenAiPromptText,
  type OpenAiRefRole,
} from "../prompts-openai";
import { getProvider, resolveRatio, type ImageSize } from "../providers";

export interface ProductionOpenAiInput {
  name: string;
  ratio: string;
  category: string;
  headline?: string;
  subtext?: string | null;
  layoutNote?: string;
  imagePrompt?: string;
  renderInstruction?: string;
  imageSize?: ImageSize;
  /**
   * Catalog entry that produced this item — its flags drive prompt shape
   * (display distance, safe zones, logo allowance, repeat pattern, etc.).
   * Optional for back-compat with callers that pre-date the catalog rebuild.
   */
  catalog?: CatalogItem;
  /** UI-supplied per-generation input (custom text, safezone bbox, direction, …). */
  userInput?: ProductionUserInput;
}

/**
 * Detect script so GPT Image 2 can pick correct hierarchy and avoid filler
 * glyph substitution. Anything containing Hangul is labeled "Korean";
 * CJK-only strings would be labeled similarly if we had them. Defaults to
 * "Latin" for ASCII/Latin-extended.
 */
function detectScript(value: string): string {
  if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(value)) return "Korean";
  if (/[\u3040-\u30FF]/.test(value)) return "Japanese";
  if (/[\u4E00-\u9FFF]/.test(value)) return "CJK";
  return "Latin";
}

const ARROW_DIRECTION_LABEL: Record<ArrowDirection, string> = {
  up: "upward",
  down: "downward",
  left: "left",
  right: "right",
  "up-left": "upper-left diagonal",
  "up-right": "upper-right diagonal",
  "down-left": "lower-left diagonal",
  "down-right": "lower-right diagonal",
};

const DISPLAY_DISTANCE_CONSTRAINT: Record<
  NonNullable<CatalogItem["displayDistance"]>,
  string
> = {
  near: "viewing distance is close — readable detail and refined typography are appropriate",
  mid: "viewing distance is moderate — keep typography clear at conversation distance",
  far: "viewing distance is far — oversized typography, very high contrast, simplified detail; the headline must read at a glance from across a hall",
};

/**
 * Build the script-labeled text array based on catalog flags + user input.
 * Order of precedence:
 *   1. `textToggleable` + `userInput.hideText` → no text at all
 *   2. Otherwise → headline always; subtext only when present and not gated
 *      by `subtextToggleable` (which defaults OFF — must be explicitly opted in)
 *   3. `customText` (free-form, from `customTextUI`) is appended as a CALLOUT
 */
function buildTexts(
  prod: ProductionOpenAiInput,
): OpenAiPromptText[] {
  const { catalog, userInput } = prod;
  const texts: OpenAiPromptText[] = [];

  if (catalog?.textToggleable && userInput?.hideText) {
    return texts;
  }

  if (prod.headline) {
    texts.push({
      role: "HEADLINE",
      script: detectScript(prod.headline),
      value: prod.headline,
      hint: "largest, primary focal point",
    });
  }
  const subtextAllowed = catalog?.subtextToggleable
    ? Boolean(userInput?.showSubtext)
    : true;
  if (prod.subtext && subtextAllowed) {
    texts.push({
      role: "SUBTEXT",
      script: detectScript(prod.subtext),
      value: prod.subtext,
      hint: "secondary hierarchy, smaller than headline",
    });
  }

  const customText = userInput?.customText?.trim();
  if (customText) {
    texts.push({
      role: "CALLOUT",
      script: detectScript(customText),
      value: customText,
      hint: "additional copy supplied by the operator",
    });
  }

  // Phase D — multiline text blocks (브로셔 overview/timeline/speakers).
  // The catalog determines order; the value is rendered verbatim, with
  // hints nudging the model toward table/list layouts where appropriate.
  if (catalog?.multilineTextUI && userInput?.multilineFields) {
    for (const key of catalog.multilineTextUI) {
      const raw = userInput.multilineFields[key]?.trim();
      if (!raw) continue;
      texts.push({
        role: key.toUpperCase(),
        script: detectScript(raw),
        value: raw,
        hint: MULTILINE_HINTS[key] ?? "render verbatim, preserve line breaks",
      });
    }
  }

  return texts;
}

const MULTILINE_HINTS: Record<string, string> = {
  overview:
    "render as a short paragraph or 2-column intro block, preserve line breaks",
  timeline:
    "render as a 2-column aligned table or list — time on the left, session name on the right, preserve every line as a separate row",
  speakers:
    "render as a card grid or vertical list, one entry per line, preserve line breaks",
};

/**
 * Translate the catalog's flag set into the constraint bullets the prompt
 * builder appends after the baseline. Only flags that actually affect the
 * rendered output emit a constraint here — UI-only flags (`customRatio`,
 * `customTextUI`) don't produce text since their effect is upstream.
 */
function buildExtraConstraints(prod: ProductionOpenAiInput): string[] {
  const { catalog, userInput } = prod;
  const out: string[] = [];

  if (catalog?.displayDistance) {
    out.push(DISPLAY_DISTANCE_CONSTRAINT[catalog.displayDistance]);
  }

  if (catalog?.repeatPattern) {
    out.push(
      "render the headline / subtext as a tiled, repeating pattern across the entire surface so any cropped region still shows branding — not a single hero placement",
    );
  }

  if (catalog?.textToggleable && userInput?.hideText) {
    out.push(
      "render no text at all — decorative pattern / motif only, no lettering anywhere in the image",
    );
  }

  if (catalog?.directionSelector && userInput?.direction) {
    const label = ARROW_DIRECTION_LABEL[userInput.direction];
    out.push(
      `include a single bold arrow pointing ${label}, large and legible at a glance — the arrow is the primary subject`,
    );
  }

  if (catalog?.logoCentric) {
    out.push(
      "this artifact is logo-centric: render the brand logo from the attached CI reference prominently at the focal center, with minimal surrounding decoration",
    );
  }

  // userInput overrides catalog defaults so operators can ship 비표준
  // 명찰/명패 sizes when a venue's case is non-standard.
  const physical =
    userInput?.customSize ?? catalog?.physicalSizeMm ?? catalog?.customSize;
  if (physical) {
    out.push(
      `designed for print at exactly ${physical.widthMm}mm × ${physical.heightMm}mm — maintain that aspect precisely`,
    );
  }

  if (catalog?.extraConstraints?.length) {
    out.push(...catalog.extraConstraints);
  }

  if (prod.renderInstruction) {
    out.push(prod.renderInstruction);
  }

  return out;
}

/**
 * Pick safeZones to send (0~1 fractions). Operator override wins; otherwise
 * fall back to the catalog default for `safeZoneRequired` items.
 */
function resolveSafeZones(
  prod: ProductionOpenAiInput,
): SafeZoneBox[] | undefined {
  const userZones = prod.userInput?.safeZone;
  if (userZones && userZones.length > 0) return userZones;
  if (prod.catalog?.safeZoneRequired && prod.catalog.safeZone?.length) {
    return prod.catalog.safeZone;
  }
  return undefined;
}

export interface GenerateProductionImageOpenAiArgs {
  guideline: Guideline;
  prod: ProductionOpenAiInput;
  masterKvUrl?: string;
  /**
   * Interpretation of `masterKvUrl`. Defaults to "kv". With "previous-slide"
   * the prompt enforces strict layout/color preservation (used by cardnews
   * series chaining).
   */
  referenceMode?: "kv" | "previous-slide";
  refAnalysis?: string;
  ciBrief?: string;
  /**
   * CI reference image. Attached only when `prod.catalog?.logoCentric` is set
   * (e.g. company-specific 휘장) — otherwise the "no logo image attached"
   * guarantee holds and the prompt's NO LOGOS baseline does the rest.
   */
  ciReferenceImage?: ImageData;
  /**
   * Phase C — when set, the source image is attached as the FIRST ref so
   * `/v1/images/edits` rewrites it, and an EDIT INSTRUCTIONS block is
   * appended to the prompt listing each rectangle + per-region instruction.
   * Master KV is dropped because the source image already encodes layout.
   */
  editRequest?: {
    sourceImageUrl: string;
    regions: EditRegion[];
    globalInstruction?: string;
  };
}

/**
 * Generate a Step 4 production variant using GPT Image 2.
 *
 * References: only the master KV (if provided) is attached by default. CI
 * images are NEVER attached for general items — `/v1/images/edits` reproduces
 * attached logos regardless of prompt constraints. The narrow exception is
 * `logoCentric` items (e.g. company-specific 휘장), where the logo IS the
 * subject and `ciReferenceImage` is attached on purpose.
 */
export async function generateProductionImageOpenAI(
  args: GenerateProductionImageOpenAiArgs,
): Promise<string> {
  const {
    guideline,
    prod,
    masterKvUrl,
    referenceMode = "kv",
    refAnalysis,
    ciBrief,
    ciReferenceImage,
    editRequest,
  } = args;

  const openai = getProvider("openai");
  if (!openai) throw new Error("OpenAI provider not available");

  const bucket: ImageSize = prod.imageSize ?? "2K";
  const effectiveRatio = prod.userInput?.customRatio?.trim() || prod.ratio;
  const resolved = resolveRatio(effectiveRatio, bucket);
  if (resolved.clamped && typeof console !== "undefined") {
    console.warn(
      `[production-image-openai] aspect clamped: ${effectiveRatio} → ${resolved.effectiveRatio} (API limit 1:3..3:1) [${prod.name}]`,
    );
  }

  const designSystem = extractDesignSystemForOpenAI(guideline);
  const texts = buildTexts(prod);
  const extraConstraints = buildExtraConstraints(prod);
  const safeZones = resolveSafeZones(prod);

  if (editRequest && editRequest.regions.length > 0) {
    extraConstraints.push(
      buildEditInstructionsBlock(editRequest.regions, editRequest.globalInstruction),
    );
  }

  const refs: ImageData[] = [];
  const refRoles: OpenAiRefRole[] = [];
  if (editRequest) {
    // 2nd-pass: the source image IS the canvas being edited.
    const split = splitDataUrl(editRequest.sourceImageUrl);
    if (split) {
      refs.push({ mime: split.mime, base64: split.base64 });
      refRoles.push({
        identity: "Source artwork (current version)",
        interaction:
          "This is the artwork to modify. Apply ONLY the listed EDIT INSTRUCTIONS to the matching rectangular regions and preserve everything else pixel-for-pixel where possible. Output the full image at the same dimensions and aspect.",
      });
    }
  } else if (masterKvUrl) {
    const split = splitDataUrl(masterKvUrl);
    if (split) {
      refs.push({ mime: split.mime, base64: split.base64 });
      if (referenceMode === "previous-slide") {
        refRoles.push({
          identity: "Previous slide in the same cardnews series",
          interaction:
            "Preserve the EXACT layout grid, color palette, typography hierarchy, and compositional language from this previous slide. Render the next slide in the series — change ONLY the text content (HEADLINE/SUBTEXT) and the per-slide visual details described below. Do NOT invent a new layout, do NOT shift the color scheme.",
        });
      } else {
        refRoles.push({
          identity: "Master KV",
          interaction: `Apply its palette, graphic motifs, and typography mood to this ${prod.name}. Recompose the layout for the new aspect ${resolved.effectiveRatio}. Do not introduce visual elements beyond what exists in the Master KV.`,
        });
      }
    }
  }
  if (!editRequest && prod.catalog?.logoCentric && ciReferenceImage) {
    refs.push(ciReferenceImage);
    refRoles.push({
      identity: "Brand CI reference",
      interaction:
        "This is the brand identity reference — render its logo, wordmark, and color treatment faithfully at the focal center of the artifact. Strictly follow this CI; do not invent alternative marks.",
    });
  }

  const scene = editRequest
    ? "Modify the attached source artwork according to the EDIT INSTRUCTIONS listed below — change only the specified regions."
    : masterKvUrl
      ? referenceMode === "previous-slide"
        ? "Next slide in a coherent cardnews series — preserve the attached previous slide's layout grid, palette, and typography hierarchy verbatim, swap only text and the per-slide visual details."
        : "Variant derived from the attached master KV, inheriting its atmosphere and motif language."
      : "Coherent atmosphere drawn from the provided design system.";

  const subject = [
    `${prod.name} — flat graphic artwork for print/digital delivery.`,
    prod.imagePrompt ? `Visual direction: ${prod.imagePrompt}` : "",
    refAnalysis ? `Reference direction: ${refAnalysis}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const layoutParts = [
    prod.layoutNote,
    "compose for the target aspect — negative space and focal hierarchy appropriate for the artifact type",
  ].filter(Boolean) as string[];

  const prompt = buildProductionPromptOpenAI({
    artifact: prod.name,
    useCase: `${prod.category || prod.name}, aspect ratio ${resolved.effectiveRatio}. Production-ready Korean event ${prod.category || "artwork"}.`,
    scene,
    subject,
    designSystem,
    texts,
    layout: layoutParts.join(". "),
    refRoles,
    ciBrief,
    extraConstraints,
    allowLogos: Boolean(prod.catalog?.logoCentric),
    safeZones,
  });

  return openai.generate({
    prompt,
    system: PRODUCTION_SYSTEM_OPENAI,
    ratio: resolved.effectiveRatio,
    size: bucket,
    refs,
  });
}
