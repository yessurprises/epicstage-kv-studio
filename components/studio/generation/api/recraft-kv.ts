import { RECRAFT_KV_URL } from "../../config";
import type { ColorEntry, Guideline, ImageData } from "../../types";

// V4 Vector accepts ratio strings; raster expects pixel dimensions.
const RATIO_TO_RECRAFT_SIZE: Record<string, string> = {
  "16:9": "1344x768",
  "3:4": "896x1216",
  "1:1": "1024x1024",
};

export interface RecraftKvResult {
  imageUrl: string;
  isSvg: boolean;
}

/**
 * Call the Recraft KV endpoint (proxied via Workers) to generate a vector or
 * raster hero visual. Colors are extracted from the guideline palette and the
 * prompt is either the guideline's `recraft_prompt` or a fallback composed
 * from motif/mood/tone.
 */
export async function generateRecraftKV(
  guideline: Guideline,
  ratio: string,
  kvName: string,
  vector: boolean,
  _styleId?: string,
  _refImages?: ImageData[],
  refAnalysis?: string,
): Promise<RecraftKvResult> {
  const colors: Array<{ rgb: [number, number, number] }> = [];
  const palette = guideline.color_palette;
  if (palette) {
    for (const key of ["primary", "secondary", "accent"] as const) {
      const hex = (palette[key] as ColorEntry | undefined)?.hex;
      if (hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        if (!isNaN(r)) colors.push({ rgb: [r, g, b] });
      }
    }
  }

  const recraftPrompt = guideline.recraft_prompt;
  let prompt: string;
  if (recraftPrompt) {
    prompt = recraftPrompt;
  } else {
    const motifs = guideline.graphic_motifs;
    const mood = guideline.mood;
    prompt = [
      kvName ? `Event key visual background for ${kvName}.` : "Event key visual background.",
      motifs?.style ? `${motifs.style}.` : "",
      motifs?.elements?.length ? `${motifs.elements.join(", ")}.` : "",
      motifs?.texture ? `${motifs.texture}.` : "",
      mood?.keywords?.length ? `${mood.keywords.join(", ")}.` : "",
      mood?.tone ? `${mood.tone}.` : "",
      refAnalysis ? `${refAnalysis}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const size = vector ? ratio : RATIO_TO_RECRAFT_SIZE[ratio] || "1344x768";

  const body: Record<string, unknown> = { prompt, vector, size };
  // V4 doesn't support style_id; intentionally omitted.
  if (colors.length) body.colors = colors;

  const resp = await fetch(RECRAFT_KV_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Recraft KV 생성 실패: ${resp.status} ${errText.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { content_type?: string; b64?: string; url?: string };
  const isSvg = data.content_type === "image/svg+xml";
  const mime = isSvg ? "image/svg+xml" : "image/png";
  const imageUrl = data.b64 ? `data:${mime};base64,${data.b64}` : data.url || "";

  return { imageUrl, isSvg };
}
