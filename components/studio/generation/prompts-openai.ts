// OpenAI GPT Image 2-specific prompt builders.
//
// Kept separate from `prompts.ts` (which targets Gemini/Nano Banana 2) so each
// branch can evolve independently without regressing the other. The structure
// here follows the OpenAI Cookbook "Image Generation Models Prompting Guide":
//
//   Artifact → Use case → Scene → Subject → Design system →
//   Text (verbatim) → Layout → Constraints
//
// Key differences from the Gemini branch:
//   - Design system is a structured object, not prose
//   - Text entries carry an explicit script label (Korean / Latin) so the
//     model picks correct hierarchy and doesn't invent filler glyphs
//   - Constraints are bulletized — no single `PRINT_SPEC_INSTRUCTION` paragraph
//   - Reference image roles state INTERACTION, not just identity
//     ("Image 1: Master KV. Apply palette/motif; recompose for new aspect.")

import type { SafeZoneBox } from "../types";
import {
  formatOpenAiDesignSystem,
  type OpenAiDesignSystem,
} from "./design-system-openai";

export const PRODUCTION_SYSTEM_OPENAI =
  "You are a professional event graphic designer. Render flat, production-ready artwork. Output only the image. Follow the provided specification precisely — do not invent text, logos, or visual elements beyond what is specified.";

/**
 * Text to render inside the image, with explicit script so GPT Image 2 picks
 * correct size/weight and does not substitute or invent characters.
 */
export interface OpenAiPromptText {
  /** Semantic role — HEADLINE / SUBTEXT / DATE / SLOGAN / CALLOUT. */
  role: string;
  /** Script label — "Korean", "Latin", "Mixed", etc. */
  script: string;
  /** Verbatim string to render. */
  value: string;
  /** Optional hint on placement/weight (e.g. "largest, top-third"). */
  hint?: string;
}

/**
 * Reference image role descriptor. Index is assigned positionally — entries
 * should be in the same order as the `refs` array passed to the provider.
 */
export interface OpenAiRefRole {
  /** What the reference IS. */
  identity: string;
  /** How the model should USE it in this generation. */
  interaction: string;
}

export interface OpenAiProductionPromptInput {
  /** Artifact type — e.g. "Horizontal banner", "Name card". */
  artifact: string;
  /** Use case — e.g. "Korean event key visual, outdoor print". */
  useCase: string;
  /** Scene/atmosphere — visual facts only, no mood adjectives. */
  scene: string;
  /** Hero subject. */
  subject: string;
  /** Design system object from `extractDesignSystemForOpenAI`. */
  designSystem: OpenAiDesignSystem;
  /** Exact text strings to render. Script-labeled. */
  texts: OpenAiPromptText[];
  /** Composition direction — focus, hierarchy, negative space. NOT aspect ratio. */
  layout?: string;
  /** Reference image roles, positional. */
  refRoles?: OpenAiRefRole[];
  /**
   * Text-only CI brief (from `analyzeCi`). Merged into the design system block
   * rather than attached as a reference image — `/images/edits` reliably
   * reproduces attached logos.
   */
  ciBrief?: string;
  /** Extra per-variant constraints beyond the baseline. */
  extraConstraints?: string[];
  /**
   * When true, the "NO LOGOS" baseline constraint is dropped. Used for
   * `logoCentric` catalog items (e.g. company-specific banner with provided CI).
   */
  allowLogos?: boolean;
  /**
   * Fractional bounding boxes (0~1) that must remain visually empty — overlay
   * content (PPT, live video, CSV-driven name overlays) is composited on top.
   * Rendered as an explicit constraint block in percent-of-canvas units.
   */
  safeZones?: SafeZoneBox[];
}

export interface OpenAiMasterKvPromptInput
  extends Omit<OpenAiProductionPromptInput, "artifact"> {
  /** Master KV label — e.g. "Master Key Visual (Poster 1:1)". */
  kvLabel: string;
}

/**
 * Baseline constraints applied to every GPT Image 2 call. Kept short so the
 * constraint section stays scannable. Per-call additions go through
 * `extraConstraints`.
 */
export const BASELINE_CONSTRAINTS_OPENAI: string[] = [
  "render ONLY the text listed above, verbatim — no additional characters in any script",
  "do not invent Korean, English, or any filler text in empty areas",
  "no duplicate text, no repeated headlines, no misspellings",
  "NO LOGOS, wordmarks, emblems, monograms, shields, or identifying marks of any kind — logos are composited in post-production",
  "no watermark, no URLs, no hashtags, no captions",
  "flat artwork only — no 3D mockup perspective, no environmental scene, no photographed context",
  "output is the final printed/digital artwork itself, not a mockup of it",
];

function formatTexts(texts: OpenAiPromptText[]): string {
  if (texts.length === 0) {
    return "Text: (none — visual only, no readable text in the image)";
  }
  const lines = texts.map((t) => {
    const hint = t.hint ? ` [${t.hint}]` : "";
    return `  - ${t.role} (${t.script}): "${t.value}"${hint}`;
  });
  return `Text (render EXACTLY and ONLY these, verbatim):\n${lines.join("\n")}`;
}

function formatRefRoles(refRoles: OpenAiRefRole[] | undefined): string | null {
  if (!refRoles || refRoles.length === 0) return null;
  const lines = refRoles.map(
    (r, i) => `  - Image ${i + 1}: ${r.identity}. ${r.interaction}`,
  );
  return `Reference images (in attached order):\n${lines.join("\n")}`;
}

function formatCiBrief(ciBrief?: string): string | null {
  const trimmed = ciBrief?.trim();
  if (!trimmed) return null;
  return `Brand CI cues (text-only — no logo is attached):\n${trimmed}\nUse these palette/tone/graphic-character hints only. DO NOT draw, invent, or render any logo, wordmark, or identifying mark.`;
}

/**
 * Render safeZone bounding boxes as a strict reservation block. Coordinates are
 * fractions (0~1) of the rendered canvas, emitted as percentages so the model
 * can reason about placement regardless of the chosen image-size bucket.
 */
function formatSafeZones(zones: SafeZoneBox[] | undefined): string | null {
  if (!zones || zones.length === 0) return null;
  const pct = (v: number) => (v * 100).toFixed(1);
  const lines = zones.map(
    (z, i) =>
      `  - Zone ${i + 1}: rectangular region from ${pct(z.x)}%/${pct(z.y)}% (left/top) spanning ${pct(z.width)}%×${pct(z.height)}% of the canvas — leave completely empty, no graphics or text inside`,
  );
  return `Reserved empty zones (overlay content will be composited here in post):\n${lines.join("\n")}`;
}

/**
 * Build the Step 4 (production variant) prompt. Pure — exposed so the UI can
 * preview the exact string sent to OpenAI.
 */
export function buildProductionPromptOpenAI(
  input: OpenAiProductionPromptInput,
): string {
  const sections: string[] = [];

  sections.push(`Artifact: ${input.artifact.trim()}`);
  sections.push(`Use case: ${input.useCase.trim()}`);

  const refBlock = formatRefRoles(input.refRoles);
  if (refBlock) sections.push(refBlock);

  sections.push(`Scene: ${input.scene.trim()}`);
  sections.push(`Subject: ${input.subject.trim()}`);
  sections.push(formatOpenAiDesignSystem(input.designSystem));

  const ciBlock = formatCiBrief(input.ciBrief);
  if (ciBlock) sections.push(ciBlock);

  sections.push(formatTexts(input.texts));

  const safeZoneBlock = formatSafeZones(input.safeZones);
  if (safeZoneBlock) sections.push(safeZoneBlock);

  if (input.layout?.trim()) {
    sections.push(`Layout: ${input.layout.trim()}`);
  }

  const baseline = input.allowLogos
    ? BASELINE_CONSTRAINTS_OPENAI.filter((c) => !c.includes("NO LOGOS"))
    : BASELINE_CONSTRAINTS_OPENAI;
  const constraints = [...baseline, ...(input.extraConstraints ?? [])];
  sections.push(
    `Constraints:\n${constraints.map((c) => `  - ${c}`).join("\n")}`,
  );

  return sections.join("\n\n");
}

/**
 * Build the Step 3 (master KV) prompt. Same template as production but with a
 * hero-framing subject and no per-variant artifact label.
 */
export function buildMasterKvPromptOpenAI(
  input: OpenAiMasterKvPromptInput,
): string {
  const productionInput: OpenAiProductionPromptInput = {
    artifact: input.kvLabel,
    useCase: input.useCase,
    scene: input.scene,
    subject: input.subject,
    designSystem: input.designSystem,
    texts: input.texts,
    layout: input.layout,
    refRoles: input.refRoles,
    ciBrief: input.ciBrief,
    allowLogos: input.allowLogos,
    safeZones: input.safeZones,
    extraConstraints: [
      "this is the hero master key visual — highest visual impact",
      "all production variants will be derived from this image, so motifs and palette must be fully expressed",
      ...(input.extraConstraints ?? []),
    ],
  };
  return buildProductionPromptOpenAI(productionInput);
}
