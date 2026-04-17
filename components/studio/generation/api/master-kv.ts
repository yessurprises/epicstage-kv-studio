import { IMAGE_URL, isLocal } from "../../config";
import type { Guideline, ImageData } from "../../types";
import { extractDesignSystemForProduction } from "../design-system";
import { extractFirstImage, toInlineDataParts, type GeminiResponse } from "../gemini-utils";
import { PRINT_SPEC_INSTRUCTION, PRODUCTION_SYSTEM } from "../prompts";

/**
 * Generate the master KV — the hero image all 54 production variants derive
 * from. Returns a `data:` URL.
 */
export async function generateMasterKV(
  guideline: Guideline,
  ratio: string,
  kvName: string,
  ciImages?: ImageData[],
  refAnalysis?: string,
): Promise<string> {
  const designSystem = extractDesignSystemForProduction(guideline, "kv");

  const userContent = `Professional event key visual (master KV). Production-ready.
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
${refAnalysis ? `Reference direction: ${refAnalysis}` : ""}

RENDERING:
${PRINT_SPEC_INSTRUCTION}

REQUIREMENTS:
- This is the hero image — highest visual impact
- Render ONLY the text listed above
- Professional print/digital quality`;

  const url = IMAGE_URL();

  if (isLocal()) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userContent,
        system: PRODUCTION_SYSTEM,
        ciImages: ciImages ?? [],
        guideImageUrls: [],
      }),
    });
    if (!resp.ok) throw new Error(`KV 생성 실패: ${resp.status}`);
    const data = (await resp.json()) as { error?: string; imageUrl?: string };
    if (data.error) throw new Error(data.error);
    return data.imageUrl ?? "";
  }

  const parts = [
    ...toInlineDataParts(ciImages ?? [], 3),
    { text: `${PRODUCTION_SYSTEM}\n\n---\n\n${userContent}` },
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

  if (!resp.ok) throw new Error(`KV 생성 실패: ${resp.status}`);
  return extractFirstImage((await resp.json()) as GeminiResponse, "KV 이미지 미포함 응답");
}
