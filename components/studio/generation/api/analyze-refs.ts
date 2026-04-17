import { API_BASE } from "../../api";
import { ANALYZE_REFS_URL, isLocal } from "../../config";
import type { ImageData } from "../../types";
import { extractText, toInlineDataParts, type GeminiResponse } from "../gemini-utils";
import { ANALYZE_REFS_SYSTEM } from "../prompts";

/**
 * Analyze a small set of reference images and return a JSON string describing
 * their common design tendencies. In dev we call the Next.js API proxy which
 * already wraps the Gemini call; in prod we hit the Worker directly.
 */
export async function analyzeRefs(images: ImageData[]): Promise<string> {
  if (isLocal()) {
    const resp = await fetch(ANALYZE_REFS_URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
    });
    if (!resp.ok) throw new Error(`분석 실패: ${resp.status}`);
    const data = (await resp.json()) as { analysis: unknown };
    return typeof data.analysis === "object"
      ? JSON.stringify(data.analysis, null, 2)
      : String(data.analysis ?? "");
  }

  const parts = [
    ...toInlineDataParts(images, 8),
    {
      text: `${ANALYZE_REFS_SYSTEM}\n\n${images.length}장의 레퍼런스 이미지를 분석해줘.`,
    },
  ];

  const resp = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.3 },
    }),
  });
  if (!resp.ok) throw new Error(`분석 실패: ${resp.status}`);
  const data = (await resp.json()) as GeminiResponse;
  const text = extractText(data);

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    try {
      return JSON.stringify(JSON.parse(text.substring(start, end + 1)), null, 2);
    } catch {
      // fall through to raw text
    }
  }
  return text;
}
