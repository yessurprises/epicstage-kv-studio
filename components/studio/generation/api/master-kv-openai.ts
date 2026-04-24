// Step 3 (master KV) generation for the OpenAI GPT Image 2 branch.
//
// Extracted from `master-kv.ts` so Step 3 and Step 4 share the same
// GPT Image 2 prompt convention (`buildMasterKvPromptOpenAI` /
// `buildProductionPromptOpenAI` in `prompts-openai.ts`). The Gemini branch
// stays in `master-kv.ts` and dispatches here when `provider === "openai"`.

import type { Guideline, ImageData } from "../../types";
import { extractDesignSystemForOpenAI } from "../design-system-openai";
import { splitDataUrl } from "../gemini-utils";
import {
  buildMasterKvPromptOpenAI,
  PRODUCTION_SYSTEM_OPENAI,
  type OpenAiPromptText,
  type OpenAiRefRole,
} from "../prompts-openai";
import { getProvider, resolveRatio, type ImageSize } from "../providers";

const MAX_GUIDE_IMAGES = 4;

function detectScript(value: string): string {
  if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(value)) return "Korean";
  if (/[\u3040-\u30FF]/.test(value)) return "Japanese";
  if (/[\u4E00-\u9FFF]/.test(value)) return "CJK";
  return "Latin";
}

function guideImagesToImageData(
  guideImages?: Record<string, string>,
): ImageData[] {
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

export interface GenerateMasterKvOpenAiArgs {
  guideline: Guideline;
  ratio: string;
  kvName: string;
  refAnalysis?: string;
  guideImages?: Record<string, string>;
  ciBrief?: string;
  resolution?: ImageSize;
  /**
   * When present, the exact user prompt is sent to OpenAI instead of the
   * auto-built one. Reference images are unchanged.
   */
  overridePrompt?: { system?: string; user: string };
}

/**
 * Build the OpenAI Master KV prompt. Pure — exposed so the UI can preview
 * exactly what will be sent to OpenAI.
 */
export function buildMasterKvOpenAiPromptString(args: {
  guideline: Guideline;
  ratio: string;
  kvName: string;
  refAnalysis?: string;
  guideRefCount: number;
  ciBrief?: string;
}): { system: string; user: string } {
  const { guideline, ratio, kvName, refAnalysis, guideRefCount, ciBrief } = args;
  const designSystem = extractDesignSystemForOpenAI(guideline);

  const texts: OpenAiPromptText[] = [];
  const ev = guideline.event_summary;
  if (ev?.name) {
    texts.push({
      role: "HEADLINE",
      script: detectScript(ev.name),
      value: ev.name,
      hint: "largest, primary focal point",
    });
  }
  if (ev?.date) {
    texts.push({
      role: "DATE",
      script: detectScript(ev.date),
      value: ev.date,
      hint: "secondary, clearly legible",
    });
  }
  if (ev?.slogan) {
    texts.push({
      role: "SLOGAN",
      script: detectScript(ev.slogan),
      value: ev.slogan,
      hint: "tertiary, supporting hierarchy",
    });
  }

  const refRoles: OpenAiRefRole[] = Array.from({ length: guideRefCount }, (_, i) => ({
    identity: `Guide sheet ${i + 1}`,
    interaction:
      "Extract palette, graphic motifs, and compositional language; apply them faithfully to this master KV.",
  }));

  const subjectParts = [
    `Master Key Visual (${kvName}) — hero image all 54 production variants will derive from.`,
    refAnalysis ? `Reference direction: ${refAnalysis}` : "",
  ].filter(Boolean);

  const user = buildMasterKvPromptOpenAI({
    kvLabel: `Master Key Visual — ${kvName}`,
    useCase: `Korean event master key visual, aspect ratio ${ratio}. Highest visual impact — flat graphic artwork, print/digital ready.`,
    scene:
      "Bold, memorable atmosphere expressing the full graphic motif language of the design system.",
    subject: subjectParts.join(" "),
    designSystem,
    texts,
    layout:
      "Strong focal hierarchy with intentional negative space. Composition must feel authored, not templated.",
    refRoles,
    ciBrief,
  });

  return { system: PRODUCTION_SYSTEM_OPENAI, user };
}

/**
 * Generate the Step 3 master KV using GPT Image 2.
 *
 * CI images are NEVER attached — `/v1/images/edits` reproduces attached
 * logos regardless of prompt constraints. Only guide sheets (palette/motif/
 * mood boards) are attached; CI palette/tone travels via `ciBrief` text.
 */
export async function generateMasterKVOpenAI(
  args: GenerateMasterKvOpenAiArgs,
): Promise<string> {
  const {
    guideline,
    ratio,
    kvName,
    refAnalysis,
    guideImages,
    ciBrief,
    resolution = "2K",
    overridePrompt,
  } = args;

  const openai = getProvider("openai");
  if (!openai) throw new Error("OpenAI provider not available");

  const resolved = resolveRatio(ratio, resolution);
  if (resolved.clamped && typeof console !== "undefined") {
    console.warn(
      `[master-kv-openai] aspect clamped: ${ratio} → ${resolved.effectiveRatio} (API limit 1:3..3:1)`,
    );
  }

  const guideRefs = guideImagesToImageData(guideImages);
  const refs: ImageData[] = [...guideRefs];

  const { system, user } = overridePrompt
    ? {
        system: overridePrompt.system ?? PRODUCTION_SYSTEM_OPENAI,
        user: overridePrompt.user,
      }
    : buildMasterKvOpenAiPromptString({
        guideline,
        ratio: resolved.effectiveRatio,
        kvName,
        refAnalysis,
        guideRefCount: guideRefs.length,
        ciBrief,
      });

  return openai.generate({
    prompt: user,
    system,
    ratio: resolved.effectiveRatio,
    size: resolution,
    refs,
  });
}
