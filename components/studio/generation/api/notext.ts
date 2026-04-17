import { IMAGE_URL, isLocal } from "../../config";
import {
  extractFirstImage,
  splitDataUrl,
  type GeminiResponse,
} from "../gemini-utils";
import { NO_TEXT_PROMPT, NO_TEXT_SYSTEM } from "../prompts";

/**
 * Single-turn text removal (multi-turn `thoughtSignature` approach was
 * unstable for gemini-3.1-flash-image-preview — see docs/kv-first-redesign §8).
 * Accepts a `data:` URL and returns the text-free version as `data:` URL.
 */
export async function generateNoTextVersion(originalImageUrl: string): Promise<string> {
  const split = splitDataUrl(originalImageUrl);
  if (!split) throw new Error("Invalid image data URL");
  const { mime: imgMime, base64: imgData } = split;

  const url = IMAGE_URL();

  if (isLocal()) {
    const resp = await fetch("/api/generate-notext/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalPrompt: NO_TEXT_PROMPT,
        imageMime: imgMime,
        imageBase64: imgData,
        removeTextPrompt: NO_TEXT_PROMPT,
        system: NO_TEXT_SYSTEM,
      }),
    });
    if (!resp.ok) throw new Error(`No-text failed: ${resp.status}`);
    const data = (await resp.json()) as { error?: string; imageUrl: string };
    if (data.error) throw new Error(data.error);
    return data.imageUrl;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.1-flash-image-preview",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: imgMime, data: imgData } },
            { text: NO_TEXT_PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        temperature: 1,
        imageConfig: { imageSize: "2K" },
      },
    }),
  });

  if (!resp.ok) throw new Error(`대지 생성 실패: ${resp.status}`);
  return extractFirstImage((await resp.json()) as GeminiResponse, "대지 이미지 미생성");
}
