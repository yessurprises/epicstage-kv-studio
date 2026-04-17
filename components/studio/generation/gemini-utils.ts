import type { ImageData } from "../types";

export interface InlineDataPart {
  inlineData: { mimeType: string; data: string };
}

export interface TextPart {
  text: string;
}

export type GeminiPart = InlineDataPart | TextPart;

export interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}

export interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

/**
 * Build `inlineData` parts from an array of image data, limiting to `max` to
 * avoid blowing past payload limits. Order preserved.
 */
export function toInlineDataParts(images: readonly ImageData[], max = 8): InlineDataPart[] {
  return images.slice(0, max).map((img) => ({
    inlineData: { mimeType: img.mime, data: img.base64 },
  }));
}

/**
 * Extract the first image part from a Gemini response and return a ready-to-use
 * `data:` URL. Throws when no image is present.
 */
export function extractFirstImage(data: GeminiResponse, errorMessage = "이미지 미포함 응답"): string {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p): p is InlineDataPart => "inlineData" in p);
  if (!imagePart) throw new Error(errorMessage);
  const { mimeType, data: b64 } = imagePart.inlineData;
  return `data:${mimeType};base64,${b64}`;
}

/**
 * Extract all text parts joined together. Useful for JSON responses returned
 * as text by Gemini vision calls.
 */
export function extractText(data: GeminiResponse): string {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p): p is TextPart => "text" in p && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

/**
 * Split a `data:<mime>;base64,<payload>` URL into its two components. Returns
 * null when the input is not a data URL.
 */
export function splitDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}
